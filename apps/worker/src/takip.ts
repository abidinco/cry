/**
 * Takip koşusu — grafı yürüten katman.
 *
 * Atıf kuralı ve durma ölçütleri SAF katmanda (@cry/motor) ve testli; burada
 * yalnızca veri okunur, sıra kurulur ve sonuç yazılır.
 *
 * Tohum kuralı: kök adrese GİREN paralar takip edilen paradır ("bu adrese
 * gelen para nereye gitti"). Kullanıcı bir işlemden başlatırsa tohum yalnızca
 * o işlemdir. İkisi de kaydın parametrelerinde yazılı kalır.
 */
import { prisma } from "@cry/db";
import {
  dagit,
  durmaSebebi,
  devamEdilebilir,
  devamEsikleri,
  kokEtiketiDurdurmaz,
  kosuDurmaSebebi,
  VARSAYILAN_ESIKLER,
  type AtifKurali,
  type DurmaSebebi,
  type Esikler,
  type Hareket,
  type IzliGiris,
  yerelYenidenTara,
} from "@cry/motor";
import { adresIndeksle } from "./indeksle";
import { surumuOku } from "./surum";
import { yakmaAdresiMi, type ChainId } from "@cry/chain";
import { ayarOku, pencereOku } from "@cry/blok-indeks";

type Parametreler = {
  maxHop?: number;
  maxDugum?: number;
  dallanmaEsigi?: number;
  minTutar?: string;
  pencereSaat?: number;
  /** Tohum bir işlemse yalnızca o işlem takip edilir. */
  tohumTx?: string;
  /**
   * YALNIZCA YEREL: koşu kaynağa (TronGrid) HİÇ gitmez, yalnızca blok indeksinin
   * penceresinden okur (kullanıcı kararı 2026-10-06). Cevap pencereyle sınırlıdır ve
   * bunu kendisi söyler: pencere öncesine uzanan her düğüm `pencere_oncesi` notuyla
   * işaretlenir, sayısı `stats.yalnizYerel`de durur.
   */
  yalnizYerel?: boolean;
};

/** Bir düğümün işlenmek üzere bekleyen hâli. */
type Sira = { adres: string; hop: number; girisler: IzliGiris[] };

type Ozet = { dugum: number; kenar: number; durma: Record<string, number> };

function esikleriOku(p: Parametreler): Esikler {
  return {
    maxHop: p.maxHop ?? VARSAYILAN_ESIKLER.maxHop,
    maxDugum: p.maxDugum ?? VARSAYILAN_ESIKLER.maxDugum,
    dallanmaEsigi: p.dallanmaEsigi ?? VARSAYILAN_ESIKLER.dallanmaEsigi,
    minTutar: p.minTutar ? BigInt(p.minTutar) : VARSAYILAN_ESIKLER.minTutar,
  };
}

/**
 * Koşu kaydına tek bir alan yazar, ÖTEKİLERİNE DOKUNMADAN. Prisma'nın Json
 * güncellemesi alanın tamamını değiştirir; süren bir koşuda `devamlar` gibi
 * kayıtları ezmemek için `jsonb_set` kullanılır.
 */
async function durumYaz(traceRunId: bigint, anahtar: string, deger: unknown): Promise<void> {
  await prisma.$executeRaw`
    update trace_runs
       set stats = jsonb_set(coalesce(stats, '{}'::jsonb), ${[anahtar]}::text[], ${JSON.stringify(deger)}::jsonb)
     where id = ${traceRunId}`;
}

/** Kullanıcı "durdur" dedi mi? (`/api/takip/[id]/durdur` bayrağı koyar.) */
async function iptalIstendiMi(traceRunId: bigint): Promise<boolean> {
  const satir = await prisma.$queryRaw<{ iptal: boolean | null }[]>`
    select (stats->>'iptal')::boolean as iptal from trace_runs where id = ${traceRunId}`;
  return satir[0]?.iptal === true;
}

/**
 * Bir taramayı İPTALE DUYARLI koşturur: bayrak tarama SÜRERKEN yoklanır ve gelen iptal, aradaki
 * HTTP isteğini de geri çekilme uykusunu da keser (`chain/http.ts` → `uyu` iptal edilebilir).
 *
 * Eskiden bayrak yalnızca ADRESLER ARASINDA sorulurdu: tek bir büyük adresin 10 sayfası bitene
 * kadar "durdur" bekliyordu ve hız sınırına takılmış bir turda bu, geri çekilme süresi kadar daha
 * uzuyordu (`Retry-After` 60 sn'ye kadar). Kullanıcı düğmeye bastıktan sonra geçen süre, düğmenin
 * ne kadar doğru söylediğinin ölçüsüdür.
 */
async function iptaleDuyarli<T>(
  traceRunId: bigint,
  is: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const kontrol = new AbortController();
  let soruluyor = false;
  const yoklama = setInterval(() => {
    // Üst üste binmesin: yavaş bir sorgu ikinci bir sorgu doğurmamalı.
    if (soruluyor || kontrol.signal.aborted) return;
    soruluyor = true;
    iptalIstendiMi(traceRunId)
      .then((iptal) => { if (iptal) kontrol.abort(); })
      .catch(() => {}) // Yoklama hatası taramayı DÜŞÜRMEZ; iptal bir sonraki turda yakalanır.
      .finally(() => { soruluyor = false; });
  }, ILERLEME_ARALIGI_MS);
  try {
    return await is(kontrol.signal);
  } finally {
    clearInterval(yoklama);
  }
}

/** Başlarken eski bir iptal bayrağı ya da ilerleme kalmışsa silinir. */
async function durumuTemizle(traceRunId: bigint): Promise<void> {
  await prisma.$executeRaw`
    update trace_runs set stats = coalesce(stats, '{}'::jsonb) - 'iptal' - 'ilerleme' where id = ${traceRunId}`;
}

/**
 * Kökü tohumdan ÖNCE indeksler — yalnızca hiç taranmamışsa.
 *
 * `kismi`/`tam` bir kökte yeniden taramaz: yürüyüş zaten delta çekiyor ve koşunun başına
 * gereksiz dakikalar eklemek, kullanıcının beklediği süreyi uzatır.
 *
 * Tarama başarısız olursa koşu DURMAZ ama sessiz de kalmaz: sebep `stats.kokTaramasi`na yazılır.
 * Boş bir graf "iz yok" diye okunur; oysa cevap "köke bakılamadı" olabilir ("yok" ≠ "bakılamadı").
 */
async function kokuHazirla(
  traceRunId: bigint,
  zincir: string,
  kok: string,
  yalnizYerel: boolean,
): Promise<void> {
  const kayit = await prisma.address.findUnique({
    where: { chain_address: { chain: zincir, address: kok } },
    select: { indexState: true, indexNote: true },
  });
  // Kaynaklı kipte "bilinmiyor değilse dokunma" kuralı kotayı korur. Yerelde tarama bir
  // ClickHouse sorgusu, ve o kural kaynağın bıraktığı hasarı kalıcı yapıyordu (ölçüldü).
  const atla = yalnizYerel
    ? kayit && !yerelYenidenTara(kayit.indexState, kayit.indexNote)
    : kayit && kayit.indexState !== "bilinmiyor";
  if (atla) return;

  try {
    const s = await iptaleDuyarli(traceRunId, (signal) =>
      adresIndeksle(zincir as ChainId, kok, { maxSayfa: 10, signal, yalnizYerel }));
    await durumYaz(traceRunId, "kokTaramasi", {
      yeniHareket: s.yeniHareket,
      tamamlandi: s.tamamlandi,
      kaynak: s.hareketKaynagi ?? null,
      atlanmaSebebi: s.atlanmaSebebi ?? null,
      // KÖK pencere öncesine uzanıyorsa koşu BAŞLAR ama uyarır (kullanıcı kararı):
      // kökün geçmişi kesilmişse grafın tamamı o kesikten etkilenir, ve bunu
      // söylemeyen bir graf "para buradan başladı" diye okunur.
      pencereDisi: s.pencereDisiKaldi ?? false,
      pencere: s.pencere ?? null,
    });
  } catch (e) {
    await durumYaz(traceRunId, "kokTaramasi", { hata: (e as Error).message.slice(0, 200) });
  }
}

export async function takipKos(traceRunId: bigint): Promise<Ozet> {
  const kosu = await prisma.traceRun.findUniqueOrThrow({ where: { id: traceRunId } });
  const p = (kosu.params ?? {}) as Parametreler;

  await prisma.traceRun.update({
    where: { id: traceRunId },
    data: { status: "calisiyor", startedAt: new Date() },
  });

  await durumuTemizle(traceRunId);
  // Grafı ÜRETEN kodun sürümü, grafın yanında durur (öneri 14). Damgayı web
  // değil WORKER yazar: koşuyu koşturan kod burasıdır ve kuyrukta bekleyen bir
  // iş, araya giren bir deploy'dan SONRA işlenebilir.
  await durumYaz(traceRunId, "surum", surumuOku());
  // Tohum, kökE GİREN paradır ve Postgres'ten okunur. Kök hiç taranmamışsa orada satır yoktur:
  // tohum boş çıkar, yürüyüş ilk düğümde biter ve koşu "bitti" görünür. Ölçüldü (M4, 2026-09-22):
  // taze bir adreste koşu 10,9 sn sürdü ve 0 kenar verdi — hata vermeden, boş bir graf olarak.
  // Yürüyüş kökü zaten indeksliyor ama tohum ONDAN ÖNCE hesaplanıyor; sıra bu yüzden burada.
  const yalnizYerel = p.yalnizYerel === true;
  await kokuHazirla(traceRunId, kosu.chain, kosu.rootAddress, yalnizYerel);
  const tohum = await tohumGirisleri(kosu.chain, kosu.rootAddress, p.tohumTx);
  // Tek bir İŞLEMDEN başlatılan koşuda tohumun boş çıkması sessiz kalmamalı: graf "1 düğüm · bitti"
  // görünür ve "para hareket etmemiş" diye okunur. En sık sebebi YÖNdür — tohum köke GİREN paradır,
  // kök o işlemde gönderen taraf olabilir. Kararı saf katman veriyor (`tohumSorunu`), burası ölçümü
  // yazıyor. Adresin bütün girişlerinden başlayan koşuda yazılmaz: orada boş tohum ayrı bir şey
  // söyler (adrese hiç para girmemiş) ve zaten `kokTaramasi` konuşur.
  if (p.tohumTx) await durumYaz(traceRunId, "tohum", { tohumTx: p.tohumTx, bulunan: tohum.length });
  const sonuc = await yuru({
    traceRunId,
    zincir: kosu.chain,
    kural: kosu.taintRule as AtifKurali,
    pencereSaat: p.pencereSaat,
    esikler: esikleriOku(p),
    gorulen: new Set<string>([kosu.rootAddress]),
    sira: [{ adres: kosu.rootAddress, hop: 0, girisler: tohum }],
    yalnizYerel,
    kok: kosu.rootAddress,
  });

  // Kipin bedeli KOŞUNUN KENDİSİNDE yazılı olmalı: rapor "bu cevap şu aralığa bakarak verildi"
  // diyebilsin. Kip kapalıyken alan hiç yazılmaz — boş bir nesne "yerel koştu" diye okunurdu.
  if (yalnizYerel) {
    // Sayı BU koşuda taranan düğümlerden değil, grafın BÜTÜN düğümlerinin kayıtlı
    // kapsamından okunur. Ölçüldü (koşu 33): ikinci kez koşulduğunda düğümler zaten
    // taranmış olduğu için sayaç 0 diyordu — "saymadım"ı "yok" diye raporlamak, bu
    // projenin kaçındığı kusurun ta kendisi.
    const [{ sayi } = { sayi: 0n }] = await prisma.$queryRaw<{ sayi: bigint }[]>`
      select count(*)::bigint as sayi
        from trace_nodes n
        join addresses a on a.chain = n.chain and a.address = n.address
       where n.trace_run_id = ${traceRunId}
         and a.index_note = 'pencere_oncesi'`;
    // Pencere, taranan düğüm olmasa da yazılır: ikinci kez koşulan bir grafta hiçbir adres
    // yeniden taranmıyor ve "hangi aralığa bakıldı" sorusu cevapsız kalıyordu (ölçüldü: koşu 34).
    let pencere = sonuc.kapsam.pencere;
    if (!pencere) {
      try {
        const p0 = await pencereOku(ayarOku());
        if (p0) {
          pencere = {
            bas: new Date(p0.zamanBas * 1000).toISOString(),
            son: new Date(p0.zamanSon * 1000).toISOString(),
          };
        }
      } catch {
        // Motora ulaşılamadı: pencere "bilinmiyor" kalır ve ekran bunu SÖYLER.
      }
    }
    await durumYaz(traceRunId, "yalnizYerel", {
      acik: true,
      pencere,
      pencereDisiDugum: Number(sayi),
    });
  }

  return kosuyuKapat(traceRunId, undefined, sonuc.iptal ? { kalan: sonuc.kalan } : undefined);
}

/**
 * Durmuş bir düğümden takibe DEVAM eder (kullanıcı kararı 2026-09-14).
 *
 * Yeni bir koşu açılmaz: devam aynı koşunun grafına eklenir, çünkü kullanıcı
 * "oradan nereye gitti" sorusunu AYNI resimde soruyor. Ama bu bir insan
 * kararıdır ve rapor bunu bilmelidir: düğümün eski durma sebebi, kimin ve ne
 * zaman devam ettirdiği `stats.devamlar`a yazılır.
 *
 * Tohum, o düğüme BU koşuda izlenerek gelen paradır (kenarların izli
 * tutarı) — adrese giren bütün para değil. Aksi hâlde başka kaynaklardan
 * gelen para bu dosyanın parası sayılırdı.
 */
export async function takipDevam(
  traceRunId: bigint,
  adres: string,
  ekHop: number,
  kullaniciId: number | null,
): Promise<Ozet> {
  const kosu = await prisma.traceRun.findUniqueOrThrow({ where: { id: traceRunId } });
  const p = (kosu.params ?? {}) as Parametreler;
  const dugum = await prisma.traceNode.findUniqueOrThrow({
    where: { traceRunId_chain_address: { traceRunId, chain: kosu.chain, address: adres } },
  });

  const karar = devamEdilebilir(dugum.terminalReason, adres);
  if (!karar.olur) throw new Error(`devam edilemez: ${karar.neden}`);

  const mevcut = await prisma.traceNode.findMany({
    where: { traceRunId },
    select: { address: true },
  });
  const esikler = devamEsikleri(esikleriOku(p), dugum.hop, mevcut.length, ekHop);

  const gelen = await prisma.traceEdge.findMany({
    where: { traceRunId, toAddress: adres },
    orderBy: [{ ts: "asc" }, { txIndex: "asc" }],
  });
  const varlikId = new Map<string, number | null>();
  const girisler: IzliGiris[] = [];
  for (const k of gelen) {
    const sozlesme = k.assetContract ?? "";
    if (!varlikId.has(sozlesme)) {
      const v = await prisma.asset.findUnique({
        where: { chain_contract: { chain: kosu.chain, contract: sozlesme } },
        select: { id: true },
      });
      varlikId.set(sozlesme, v?.id ?? null);
    }
    const id = varlikId.get(sozlesme);
    // Varlığı çözülemeyen kenar tohuma girmez: yanlış varlığa atfedilen para
    // yanlış bir çıkışla eşleşir.
    if (id == null) continue;
    girisler.push({
      varlik: String(id),
      tutar: BigInt(k.amountRaw),
      ts: k.ts.getTime(),
      pay: 1,
      kaynakTx: k.txHash,
    });
  }

  const devamKaydi = {
    adres,
    oncekiSebep: dugum.terminalReason,
    hop: dugum.hop,
    ekHop: esikler.maxHop - dugum.hop,
    kullaniciId,
    zaman: new Date().toISOString(),
    // Devam HAFTALAR sonra gelebilir ve o günün kodu başka olabilir: tek bir
    // koşu kaydı birden çok sürümün ürünü olur. Damga devamın kendi satırında.
    surum: surumuOku(),
  };

  await prisma.$transaction([
    prisma.traceRun.update({ where: { id: traceRunId }, data: { status: "calisiyor" } }),
    // Düğüm artık bir durma noktası değil; eski sebep devam kaydında yaşar.
    prisma.traceNode.update({
      where: { id: dugum.id },
      data: { isTerminal: false, terminalReason: null },
    }),
  ]);

  await durumuTemizle(traceRunId);
  const sonuc = await yuru({
    traceRunId,
    zincir: kosu.chain,
    kural: kosu.taintRule as AtifKurali,
    pencereSaat: p.pencereSaat,
    esikler,
    gorulen: new Set(mevcut.map((d) => d.address)),
    sira: [{ adres, hop: dugum.hop, girisler }],
    zorlaDevam: adres,
    // Devam AYNI koşunun grafına ekleniyor; kipi de aynı olmalı. Yerel koşuya
    // kaynaktan beslenen bir devam eklemek, tek grafta iki ayrı kapsam demekti.
    yalnizYerel: p.yalnizYerel === true,
  });

  return kosuyuKapat(
    traceRunId,
    sonuc.iptal ? { ...devamKaydi, yarim: true } : devamKaydi,
    sonuc.iptal ? { kalan: sonuc.kalan, devamAdres: adres } : undefined,
  );
}

/**
 * Koşunun özetini VERİTABANINDAN yeniden sayar. Devamlarla koşu parça parça
 * büyüdüğü için bellekteki sayaç tek bir yürüyüşü bilir, koşunun tamamını değil.
 */
async function kosuyuKapat(
  traceRunId: bigint,
  devam?: Record<string, unknown>,
  durdurma?: { kalan: number; devamAdres?: string },
): Promise<Ozet> {
  const [dugum, kenar, sebepler, onceki] = await Promise.all([
    prisma.traceNode.count({ where: { traceRunId } }),
    prisma.traceEdge.count({ where: { traceRunId } }),
    prisma.traceNode.groupBy({
      by: ["terminalReason"],
      where: { traceRunId, terminalReason: { not: null } },
      _count: true,
    }),
    prisma.traceRun.findUniqueOrThrow({ where: { id: traceRunId }, select: { stats: true } }),
  ]);
  const durma: Record<string, number> = {};
  for (const s of sebepler) if (s.terminalReason) durma[s.terminalReason] = s._count;
  const eskiStats = (onceki.stats ?? {}) as {
    devamlar?: unknown[];
    devamHatalari?: unknown[];
    durdurmalar?: unknown[];
  };
  const devamlar = [...(eskiStats.devamlar ?? []), ...(devam ? [devam] : [])];
  // Durdurulan koşu EKSİKTİR ve bunu söylemeli: sırada kalan adres sayısı
  // kayda geçer. "bitti" görünen yarım bir graf, tam sanılır.
  const durdurmalar = [
    ...(eskiStats.durdurmalar ?? []),
    ...(durdurma ? [{ ...durdurma, zaman: new Date().toISOString() }] : []),
  ];

  await prisma.traceRun.update({
    where: { id: traceRunId },
    data: {
      status: durdurma ? "durduruldu" : "bitti",
      finishedAt: new Date(),
      stopReason: kosuDurmaSebebi(durma),
      // Eski `stats` KORUNUR, beyaz listeye alınmaz. Önceden yalnızca devamlar/devamHatalari/
      // durdurmalar taşınıyordu ve koşu sırasında yazılan başka her anahtar sessizce düşüyordu —
      // `kokTaramasi` eklendiğinde tam bu yaşandı: kayıt yazıldı, kapanışta yok oldu. Bir listeye
      // eklemeyi unutmak, bilginin kaybolması demek; varsayılan KORUMAK olmalı.
      // Geçici olan iki anahtar bilerek atılır: `iptal` bayrağı ve `ilerleme` yoklaması.
      stats: {
        ...(() => {
          const { iptal: _iptal, ilerleme: _ilerleme, ...kalan } = eskiStats as Record<string, unknown>;
          return kalan;
        })(),
        dugum,
        kenar,
        durma,
        ...(devamlar.length ? { devamlar } : {}),
        ...(durdurmalar.length ? { durdurmalar } : {}),
      } as object,
    },
  });
  return { dugum, kenar, durma };
}

type Yuruyus = {
  traceRunId: bigint;
  zincir: string;
  kural: AtifKurali;
  pencereSaat?: number;
  esikler: Esikler;
  gorulen: Set<string>;
  sira: Sira[];
  /** Kullanıcının devam ettirdiği düğüm: durma ölçütü ona SORULMAZ. */
  zorlaDevam?: string;
  /** Kaynağa hiç gidilmez; cevap blok indeksinin penceresiyle sınırlıdır. */
  yalnizYerel?: boolean;
  /** Koşunun KÖKÜ: borsa etiketi onu durdurmaz, çünkü o adresi insan seçti. */
  kok?: string;
};

/**
 * Yürüyüşün KAPSAM defteri: kaç düğümde pencere öncesine bakılamadı ve hangi aralık okundu.
 * Koşu bittiğinde `stats.yalnizYerel`e yazılır — sayılmayan eksik, yok sayılan eksiktir.
 */
type Kapsam = { pencereDisiDugum: number; pencere: { bas: string; son: string } | null };

/** İlerleme ve iptal en çok bu sıklıkta yoklanır: her düğümde sorgu atmamak için. */
const ILERLEME_ARALIGI_MS = 1000;

async function yuru(y: Yuruyus): Promise<{ iptal: boolean; kalan: number; kapsam: Kapsam }> {
  const yalnizYerel = y.yalnizYerel === true;
  const kapsam: Kapsam = { pencereDisiDugum: 0, pencere: null };
  const { traceRunId, zincir, kural, esikler, gorulen } = y;
  let sira = y.sira;
  let islenen = 0;
  let sonYoklama = 0;

  while (sira.length > 0) {
    const sonraki: Sira[] = [];

    for (const [sirasi, dugum] of sira.entries()) {
      if (Date.now() - sonYoklama >= ILERLEME_ARALIGI_MS) {
        sonYoklama = Date.now();
        const kalan = sira.length - sirasi + sonraki.length;
        if (await iptalIstendiMi(traceRunId)) return { iptal: true, kalan, kapsam };
        await durumYaz(traceRunId, "ilerleme", {
          islenen,
          hop: dugum.hop,
          sirada: kalan,
          adres: dugum.adres,
          zaman: new Date().toISOString(),
        });
      }
      islenen++;

      const bilgi = await dugumBilgisi(zincir, dugum.adres);

      // Yakma adresi TARANMAZ: milyonlarca hareketi var ve hiçbiri bu paranın
      // devamı değil. Taranmamış düğüm KENDİLİĞİNDEN taranır: atlanırsa graf kısa kalır ve
      // "iz burada bitti" sanılır.
      const taransinMi = yalnizYerel
        ? yerelYenidenTara(bilgi.indexState, bilgi.indexNote)
        : !bilgi.indekslendiMi;
      if (taransinMi && !yakmaAdresiMi(dugum.adres) && gorulen.size <= esikler.maxDugum) {
        await iptaleDuyarli(traceRunId, (signal) =>
          adresIndeksle(zincir as ChainId, dugum.adres, { maxSayfa: 10, signal, yalnizYerel }))
          .then((s) => {
            // Pencere dışı kalan düğüm SAYILIR: "kaç düğümde eksik baktık" sorusunun
            // cevabı koşunun kendisinde durmalı, yoksa graf tam sanılır.
            if (s.pencereDisiKaldi) kapsam.pencereDisiDugum += 1;
            if (s.pencere) kapsam.pencere = s.pencere;
          })
          .catch(() => {});
      }

      const guncel = await dugumBilgisi(zincir, dugum.adres);
      const varlikToplami = varlikToplamlari(dugum.girisler);
      // Durma ölçütündeki tutar eşiği için: en büyük tek varlık tutarı.
      const izliToplam = [...varlikToplami.values()].reduce(
        (en, v) => (v > en ? v : en),
        0n,
      );

      const hamSebep =
        dugum.adres === y.zorlaDevam
          ? null
          : durmaSebebi(
              {
                adres: dugum.adres,
                hop: dugum.hop,
                cikisSayisi: guncel.cikisSayisi,
                izliTutar: izliToplam,
                borsaMi: guncel.borsaMi,
                borsaEtiketiDogrulanmisMi: guncel.borsaEtiketiDogrulanmisMi,
                sozlesmeMi: guncel.sozlesmeMi,
                indekslendiMi: guncel.indekslendiMi,
                yakmaMi: yakmaAdresiMi(dugum.adres),
              },
              esikler,
              gorulen.size,
            );

      // Kökte borsa etiketi durdurmaz; ama SESSİZ de geçilmez — sebep koşuya yazılır,
      // yoksa "bu adres bir servis cüzdanı adayı" bilgisi rapordan silinirdi.
      const kokteEtiket = dugum.adres === y.kok && kokEtiketiDurdurmaz(hamSebep);
      if (kokteEtiket) {
        await durumYaz(traceRunId, "kokEtiketi", {
          sebep: hamSebep,
          etiketler: guncel.etiketler.map((e) => e.title),
          not: "kök bir borsa/servis etiketi taşıyor; koşu yine de başlatıldı (adresi insan seçti)",
        });
      }
      const sebep = kokteEtiket ? null : hamSebep;

      await dugumYaz(traceRunId, zincir, dugum, varlikToplami, sebep, guncel.etiketler);
      if (sebep) continue;

      const hareketler = await hareketleriOku(zincir, dugum.adres);
      const sonuc = dagit(hareketler, dugum.girisler, { kural, pencereSaat: y.pencereSaat });

      const hedefler = new Map<string, IzliGiris[]>();
      for (const c of sonuc.cikislar) {
        await kenarYaz(traceRunId, zincir, dugum, c);
        const liste = hedefler.get(c.hedef) ?? [];
        liste.push({ varlik: c.varlik, tutar: c.izliTutar, ts: c.ts, pay: 1, kaynakTx: c.txHash });
        hedefler.set(c.hedef, liste);
      }

      for (const [hedef, girisler] of hedefler) {
        if (gorulen.has(hedef)) continue; // döngü: aynı düğüm iki kez açılmaz
        // Düğüm sınırı: kenar ZATEN yazıldı (para gerçekten çıktı), o yüzden hedef de bir SINIR
        // düğümü olarak yazılır. Eskiden burada `break` vardı ve kenarın ucu boşta kalıyordu:
        // koşu 9'da 1.342 kenarın 10'u grafta olmayan bir adrese gidiyordu, başlık "1.342 hareket"
        // defter "1.332 hareket" diyordu ve fark hiçbir yerde açıklanmıyordu. Sınır düğümü
        // TARANMAZ; yalnızca "buraya kadar geldik, sebebi budu" der.
        if (gorulen.size >= esikler.maxDugum) {
          const sinir = { adres: hedef, hop: dugum.hop + 1, girisler };
          const etiketler = (await dugumBilgisi(zincir, hedef)).etiketler;
          await dugumYaz(traceRunId, zincir, sinir, varlikToplamlari(girisler), "dugum_siniri", etiketler);
          continue;
        }
        gorulen.add(hedef);
        sonraki.push({ adres: hedef, hop: dugum.hop + 1, girisler });
      }
    }

    sira = sonraki;
  }
  return { iptal: false, kalan: 0, kapsam };
}

/* ---------------- veri okuma ---------------- */

/** Kök tohumu: adrese giren paralar ya da yalnızca seçilen işlem. */
async function tohumGirisleri(
  zincir: string,
  kok: string,
  tohumTx?: string,
): Promise<IzliGiris[]> {
  const kayit = await prisma.address.findUnique({
    where: { chain_address: { chain: zincir, address: kok } },
    select: { id: true },
  });
  if (!kayit) return [];

  const girisler = await prisma.transfer.findMany({
    where: { toAddressId: kayit.id, success: true, ...(tohumTx ? { txHash: tohumTx } : {}) },
    select: { amountRaw: true, ts: true, txHash: true, asset: { select: { id: true } } },
    orderBy: { ts: "asc" },
  });

  return girisler.map((g) => ({
    varlik: String(g.asset.id),
    tutar: BigInt(g.amountRaw),
    ts: g.ts.getTime(),
    pay: 1,
    kaynakTx: g.txHash,
  }));
}

type DugumBilgisi = {
  cikisSayisi: number;
  borsaMi: boolean;
  borsaEtiketiDogrulanmisMi: boolean;
  sozlesmeMi: boolean;
  indekslendiMi: boolean;
  /** Ham durum ve sebep: yerel kipte "yeniden bakılsın mı" kararı bunlara bakıyor. */
  indexState: string;
  indexNote: string | null;
  etiketler: {
    title: string;
    category: string;
    exchange: string | null;
    /** Etiket doğrulandı mı — dondurulan görüntüde de durmalı. */
    dogrulandi: boolean;
  }[];
};

async function dugumBilgisi(zincir: string, adres: string): Promise<DugumBilgisi> {
  const kayit = await prisma.address.findUnique({
    where: { chain_address: { chain: zincir, address: adres } },
    select: {
      id: true,
      isContract: true,
      indexState: true,
      indexNote: true,
      labels: {
        select: { title: true, category: true, exchange: true, verifiedAt: true },
      },
    },
  });
  if (!kayit) {
    return {
      cikisSayisi: 0,
      borsaMi: false,
      borsaEtiketiDogrulanmisMi: false,
      sozlesmeMi: false,
      indekslendiMi: false,
      indexState: "bilinmiyor",
      indexNote: null,
      etiketler: [],
    };
  }

  // Dallanma ölçüsü: kaç FARKLI adrese çıkış yapılmış.
  const hedefler = await prisma.transfer.groupBy({
    by: ["toAddressId"],
    where: { fromAddressId: kayit.id },
  });

  const borsaEtiketleri = kayit.labels.filter((e) => e.category.startsWith("exchange"));

  return {
    cikisSayisi: hedefler.length,
    borsaMi: borsaEtiketleri.length > 0,
    // Bir tane bile DOĞRULANMIŞ borsa etiketi varsa iddia güçlüdür; hepsi
    // adaysa durma sebebi bunu söyler.
    borsaEtiketiDogrulanmisMi: borsaEtiketleri.some((e) => e.verifiedAt !== null),
    sozlesmeMi: kayit.isContract === true,
    indekslendiMi: kayit.indexState !== "bilinmiyor",
    indexState: kayit.indexState,
    indexNote: kayit.indexNote,
    etiketler: kayit.labels.map((e) => ({
      title: e.title,
      category: e.category,
      exchange: e.exchange,
      dogrulandi: e.verifiedAt !== null,
    })),
  };
}

async function hareketleriOku(zincir: string, adres: string): Promise<Hareket[]> {
  const kayit = await prisma.address.findUnique({
    where: { chain_address: { chain: zincir, address: adres } },
    select: { id: true },
  });
  if (!kayit) return [];

  const satirlar = await prisma.transfer.findMany({
    where: {
      success: true,
      OR: [{ fromAddressId: kayit.id }, { toAddressId: kayit.id }],
    },
    orderBy: [{ ts: "asc" }, { index: "asc" }],
    select: {
      txHash: true,
      index: true,
      ts: true,
      amountRaw: true,
      assetId: true,
      fromAddressId: true,
      fromAddress: { select: { address: true } },
      toAddress: { select: { address: true } },
    },
  });

  return satirlar.map((s) => {
    const giden = s.fromAddressId === kayit.id;
    return {
      txHash: s.txHash,
      index: s.index,
      ts: s.ts.getTime(),
      yon: giden ? ("giden" as const) : ("gelen" as const),
      karsiTaraf: (giden ? s.toAddress?.address : s.fromAddress?.address) ?? null,
      varlik: String(s.assetId),
      tutar: BigInt(s.amountRaw),
    };
  });
}

/* ---------------- yazma ---------------- */

/**
 * Varlık başına ayrı toplam: TRX ile USDT toplanmaz. Tek varlık varsa düğüme yazılır, birden
 * çoksa YAZILMAZ — karşılığı olmayan bir sayı okuyanı yanlış bir büyüklüğe inandırır.
 */
function varlikToplamlari(girisler: readonly IzliGiris[]): Map<string, bigint> {
  const toplam = new Map<string, bigint>();
  for (const g of girisler) {
    const pay = (g.tutar * BigInt(Math.round(g.pay * 1e6))) / 1_000_000n;
    toplam.set(g.varlik, (toplam.get(g.varlik) ?? 0n) + pay);
  }
  return toplam;
}

async function dugumYaz(
  traceRunId: bigint,
  zincir: string,
  dugum: Sira,
  varlikToplami: Map<string, bigint>,
  sebep: DurmaSebebi | null,
  etiketler: DugumBilgisi["etiketler"],
) {
  // Tek varlık varsa tutar yazılır; birden çoksa null — toplamı ekrana basmak
  // "1 TRX + 1 USDT = 2" demek olurdu.
  const tekVarlik = varlikToplami.size === 1 ? [...varlikToplami.values()][0] : null;
  await prisma.traceNode.upsert({
    where: {
      traceRunId_chain_address: { traceRunId, chain: zincir, address: dugum.adres },
    },
    update: {},
    create: {
      traceRunId,
      chain: zincir,
      address: dugum.adres,
      hop: dugum.hop,
      amountRaw: tekVarlik?.toString() ?? null,
      isTerminal: sebep !== null,
      terminalReason: sebep,
      // Etiket görüntüsü DONDURULUR: rapor alındıktan sonra etiket değişse
      // bile o rapordaki hüküm değişmemeli.
      labelSnapshot: { etiketler },
    },
  });
}

async function kenarYaz(
  traceRunId: bigint,
  zincir: string,
  dugum: Sira,
  c: { txHash: string; index: number; ts: number; hedef: string; varlik: string; izliTutar: bigint; toplamTutar: bigint },
) {
  const varlik = await prisma.asset.findUnique({
    where: { id: Number(c.varlik) },
    select: { symbol: true, decimals: true, contract: true },
  });

  await prisma.traceEdge.create({
    data: {
      traceRunId,
      chain: zincir,
      txHash: c.txHash,
      txIndex: c.index,
      fromAddress: dugum.adres,
      toAddress: c.hedef,
      assetSymbol: varlik?.symbol ?? "?",
      assetContract: varlik?.contract || null,
      decimals: varlik?.decimals ?? 0,
      amountRaw: c.izliTutar.toString(),
      ts: new Date(c.ts),
      hop: dugum.hop + 1,
      // Bu kenarın taşıdığı atıf oranı: çıkışın ne kadarı ize ait.
      taintShare: c.toplamTutar === 0n ? 0 : Number(c.izliTutar) / Number(c.toplamTutar),
    },
  });
}
