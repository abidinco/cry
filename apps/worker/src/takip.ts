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
  kosuDurmaSebebi,
  VARSAYILAN_ESIKLER,
  type AtifKurali,
  type DurmaSebebi,
  type Esikler,
  type Hareket,
  type IzliGiris,
} from "@cry/motor";
import { adresIndeksle } from "./indeksle";
import { yakmaAdresiMi, type ChainId } from "@cry/chain";

type Parametreler = {
  maxHop?: number;
  maxDugum?: number;
  dallanmaEsigi?: number;
  minTutar?: string;
  pencereSaat?: number;
  /** Tohum bir işlemse yalnızca o işlem takip edilir. */
  tohumTx?: string;
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

/** Başlarken eski bir iptal bayrağı ya da ilerleme kalmışsa silinir. */
async function durumuTemizle(traceRunId: bigint): Promise<void> {
  await prisma.$executeRaw`
    update trace_runs set stats = coalesce(stats, '{}'::jsonb) - 'iptal' - 'ilerleme' where id = ${traceRunId}`;
}

export async function takipKos(traceRunId: bigint): Promise<Ozet> {
  const kosu = await prisma.traceRun.findUniqueOrThrow({ where: { id: traceRunId } });
  const p = (kosu.params ?? {}) as Parametreler;

  await prisma.traceRun.update({
    where: { id: traceRunId },
    data: { status: "calisiyor", startedAt: new Date() },
  });

  const tohum = await tohumGirisleri(kosu.chain, kosu.rootAddress, p.tohumTx);
  await durumuTemizle(traceRunId);
  const sonuc = await yuru({
    traceRunId,
    zincir: kosu.chain,
    kural: kosu.taintRule as AtifKurali,
    pencereSaat: p.pencereSaat,
    esikler: esikleriOku(p),
    gorulen: new Set<string>([kosu.rootAddress]),
    sira: [{ adres: kosu.rootAddress, hop: 0, girisler: tohum }],
  });

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
      stats: {
        dugum,
        kenar,
        durma,
        ...(devamlar.length ? { devamlar } : {}),
        ...(eskiStats.devamHatalari ? { devamHatalari: eskiStats.devamHatalari } : {}),
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
};

/** İlerleme ve iptal en çok bu sıklıkta yoklanır: her düğümde sorgu atmamak için. */
const ILERLEME_ARALIGI_MS = 1000;

async function yuru(y: Yuruyus): Promise<{ iptal: boolean; kalan: number }> {
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
        if (await iptalIstendiMi(traceRunId)) return { iptal: true, kalan };
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
      if (!bilgi.indekslendiMi && !yakmaAdresiMi(dugum.adres) && gorulen.size <= esikler.maxDugum) {
        await adresIndeksle(zincir as ChainId, dugum.adres, { maxSayfa: 10 }).catch(() => {});
      }

      const guncel = await dugumBilgisi(zincir, dugum.adres);
      // Varlık başına ayrı toplam: TRX ile USDT toplanmaz. Tek varlık varsa
      // düğüme yazılır, birden çok varlık varsa YAZILMAZ — çünkü karşılığı
      // olmayan bir sayı, okuyanı yanlış bir büyüklüğe inandırır.
      const varlikToplami = new Map<string, bigint>();
      for (const g of dugum.girisler) {
        const pay = (g.tutar * BigInt(Math.round(g.pay * 1e6))) / 1_000_000n;
        varlikToplami.set(g.varlik, (varlikToplami.get(g.varlik) ?? 0n) + pay);
      }
      // Durma ölçütündeki tutar eşiği için: en büyük tek varlık tutarı.
      const izliToplam = [...varlikToplami.values()].reduce(
        (en, v) => (v > en ? v : en),
        0n,
      );

      const sebep =
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
        if (gorulen.size >= esikler.maxDugum) break;
        gorulen.add(hedef);
        sonraki.push({ adres: hedef, hop: dugum.hop + 1, girisler });
      }
    }

    sira = sonraki;
  }
  return { iptal: false, kalan: 0 };
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
