// M1 ölçüm kapısı (2026-09-21): takip motoru hareketleri blok indeksinden okuyabilir mi?
//
// Hedef (kullanıcı): "Kendi motorumuzdan istediğimiz takip koşularını yapalım. TronGrid'e ihtiyacımız
// kalmasın." Bugünkü kural İKİ KATMAN: blok indeksi ADAY üretir, hüküm adres taramasınındır. Bu kuralı
// değiştirmenin şartı, indeksin TronGrid'in verdiğini BİREBİR verdiğini ÖLÇMEK. Kapı dört soru sorar:
//
//   A) Pencere: indeksin boşluksuz kapsadığı aralık ve genişliği.
//   B) Kapsama: arşivdeki gerçek koşuların hareketlerinin yüzde kaçı bugün pencerenin içinde?
//      (Bugün küçük olması beklenir; soru "indeks doğru mu" değil, "ne kadarını karşılıyor".)
//   C) Doğruluk — KAPININ ASIL SORUSU: pencerede hareketi olan adreslerde indeksin verdiği hareket
//      kümesi TronGrid'inkiyle aynı mı? Karşılaştırma (tx, kimden, kime, varlık, tutar) üzerinden
//      yapılır; `index`/`idx` ANAHTARA GİRMEZ çünkü iki tarafın sıra numarası farklı şeyler sayıyor:
//      indekste TRC20 idx'i işlemin OLAY dizisindeki konum, TronGrid adaptöründe aynı adresin o
//      işlemdeki kaçıncı kaydı. İkisi karıştırılırsa aynı hareket iki ayrı hareket sanılır.
//   D) Hız: aynı adres için indeks kaç ms, TronGrid kaç ms.
//
// Çalıştır:
//   node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/m1-kapi.mts [--adres=N]
import { ayarOku, sorgu, TABLO, KAPSAM_TABLO, GIDEN_TABLO, USDT_TRC20_HEX } from "@cry/blok-indeks";
import { TronAdapter, hexToBase58, base58ToHex, type Transfer } from "@cry/chain";
import { prisma } from "@cry/db";

const a = ayarOku();
const ADRES_SAYISI = Number(process.argv.find((x) => x.startsWith("--adres="))?.split("=")[1] ?? 6);
const tsv = async (sql: string) =>
  (await sorgu(a, `${sql} FORMAT TSV`)).trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
const zamanla = async <T,>(fn: () => Promise<T>): Promise<[T, number]> => {
  const t = performance.now();
  const r = await fn();
  return [r, Math.round(performance.now() - t)];
};
const b58 = (hex: string) => hexToBase58("41" + hex);
const iso = (sn: number) => new Date(sn * 1000).toISOString();
const govde = (adres: string) => base58ToHex(adres).replace(/^41/, "").toLowerCase();

// ---------- A) Pencere ----------
const [[enBuyuk]] = (await tsv(`SELECT max(blok) FROM ${KAPSAM_TABLO}`)) as [[string]];
const [[sonBosluk]] = (await tsv(`
  SELECT max(sonraki) FROM (
    SELECT blok, leadInFrame(blok) OVER (ORDER BY blok ROWS BETWEEN CURRENT ROW AND 1 FOLLOWING) AS sonraki
    FROM (SELECT DISTINCT blok FROM ${KAPSAM_TABLO}))
  WHERE sonraki > blok + 1`)) as [[string]];
const bas = Number(sonBosluk), son = Number(enBuyuk);
const [[zb, zs]] = (await tsv(
  `SELECT toUnixTimestamp(min(zaman)), toUnixTimestamp(max(zaman)) FROM ${KAPSAM_TABLO} WHERE blok IN (${bas}, ${son})`,
)) as [[string, string]];
const zamanBas = Number(zb), zamanSon = Number(zs);
console.log(`A) pencere ${bas}-${son} (${son - bas + 1} blok) - ${iso(zamanBas)} -> ${iso(zamanSon)} - ${((zamanSon - zamanBas) / 86400).toFixed(2)} gün`);

// ---------- B) Arşiv kapsaması ----------
const kapsama = await prisma.$queryRaw<{ toplam: bigint; icinde: bigint; enEski: Date | null; enYeni: Date | null }[]>`
  select count(*) as toplam,
         count(*) filter (where ts >= to_timestamp(${zamanBas}) and ts <= to_timestamp(${zamanSon})) as icinde,
         min(ts) as "enEski", max(ts) as "enYeni"
  from transfers where chain = 'tron'`;
const kap = kapsama[0]!;
const yuzde = (Number(kap.icinde) * 100) / Math.max(1, Number(kap.toplam));
console.log(`B) arşiv TRON hareketi ${kap.toplam} - pencerede ${kap.icinde} (%${yuzde.toFixed(2)}) - arşiv aralığı ${kap.enEski?.toISOString()} -> ${kap.enYeni?.toISOString()}`);

// ---------- C) Doğruluk ----------
// Kenar etkisini dışarıda bırak: pencerenin iki ucundan 5'er dakika içeri girilir. TRC20 ucu blok
// numarası VERMİYOR (adaptörde "uydurulmaz" diye yazılı), o yüzden karşılaştırma ZAMAN üzerinden
// yapılıyor ve blok/zaman sınırı birebir örtüşmüyor; pay bırakılmazsa uçtaki hareketler sahte fark verir.
const kBas = zamanBas + 300, kSon = zamanSon - 300;
const W = `zaman BETWEEN ${kBas} AND ${kSon}`;

// Yoğunluk bandı geniş tutulur: tek bir yoğun adres kapıyı temsil etmez.
// `--cokKayitli` E ölçümünün ZOR halini seçer: aynı işlemde bu adrese ait 3+ kaydı olan adresler.
// Aday SEÇİMİ pencerenin son gününden yapılır (95 günün tamamında `GROUP BY kime, tx` ClickHouse'u
// zaman aşımına düşürüyor); KARŞILAŞTIRMA yine pencerenin tamamında.
// `index` alanının yeniden numaralanması ancak orada sınanır; tek kayıtlı işlemde her kural 0 verir.
const COK_KAYITLI = process.argv.includes("--cokKayitli");
const adaySql = COK_KAYITLI
  ? `SELECT lower(hex(a)), sum(n) AS t FROM (
       SELECT kime AS a, tx, count() AS n FROM ${TABLO} FINAL
       WHERE zaman BETWEEN ${kSon - 86400} AND ${kSon} GROUP BY kime, tx HAVING n >= 3)
     GROUP BY a HAVING t BETWEEN 3 AND 400 ORDER BY cityHash64(a) LIMIT ${ADRES_SAYISI}`
  : `SELECT lower(hex(kime)), count() AS n FROM ${TABLO} FINAL WHERE ${W}
     GROUP BY kime HAVING n BETWEEN 3 AND 400 ORDER BY cityHash64(kime) LIMIT ${ADRES_SAYISI}`;
const adayHex = (await tsv(adaySql)).map((r) => [r[0]!, Number(r[1])] as const);
console.log(`C) ${adayHex.length} adres seçildi (pencere içi gelen hareket: ${adayHex.map(([, n]) => n).join(", ")})`);

const adapter = new TronAdapter({ apiKey: process.env.TRONGRID_API_KEY });

/** Karşılaştırma anahtarı: idx/index GİRMEZ (iki taraf farklı şey sayıyor). Aynı anahtarın tekrarı sayılır. */
const anahtar = (tx: string, kimden: string, kime: string, varlik: string, tutar: string) =>
  `${tx.toLowerCase()}|${kimden}|${kime}|${varlik}|${tutar}`;
const coklukKur = (l: string[]) => l.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());
const fark = (x: Map<string, number>, y: Map<string, number>) => {
  const d: string[] = [];
  for (const [kk, n] of x) { const e = n - (y.get(kk) ?? 0); for (let i = 0; i < e; i++) d.push(kk); }
  return d;
};
const say = (m: Map<string, number>) => [...m.values()].reduce((x, y) => x + y, 0);

let toplamIndeks = 0, toplamGrid = 0, toplamEksik = 0, toplamFazla = 0, uyusmayanAdres = 0, olculemeyen = 0;
// E) `index` ALANI: Postgres'te (chain, txHash, index) TEKİL ve yazma `skipDuplicates`. İki yol aynı
// harekete farklı `index` verirse aynı para iki satır olur (CLAUDE.md: "201 mükerrer öbek" olayı).
// Sınanan kural: TRX'te indeksin `idx`'i doğrudan kullanılır (ikisi de sözleşmenin işlem içindeki sırası);
// USDT'de TronGrid adaptörü ADRESE ÖZGÜ sıra veriyor, o yüzden aynı tx'in bu adresi ilgilendiren
// satırları `idx`'e göre sıralanıp 0'dan yeniden numaralanır.
let toplamIndeksAlani = 0, uyusmayanKural1 = 0, uyusmayanKural2 = 0;
const gecikmeIndeks: number[] = [], gecikmeGrid: number[] = [];

const uyu = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SEC = `SELECT lower(hex(tx)), lower(hex(kimden)), lower(hex(kime)), toString(varlik), toString(tutar), idx FROM ${TABLO} FINAL WHERE ${W}`;
const msGelenler: number[] = [], msGidenler: number[] = [], msAynalar: number[] = [];

for (const [hex] of adayHex) {
  const adres = b58(hex);
  // Yön yön ölçülür: `kime OR kimden` tek sorguda birincil anahtarı (kime, zaman, tx, idx) TAMAMEN
  // devre dışı bırakıyor ve 596 Mn satır taranıyor. Motor bu yüzden iki ayrı sorgu atmak zorunda.
  const [gelen, msGelen] = await zamanla(() => tsv(`${SEC} AND kime = unhex('${hex}')`));
  const [giden, msGiden] = await zamanla(() => tsv(`${SEC} AND kimden = unhex('${hex}')`));
  // Motorun KULLANACAĞI yol: ana tabloda `kimden` sıralamada olmadığı için tam tarama yapıyor.
  // Doğrusu üç adım: (1) gelen ana tablodan (kime ön eki), (2) giden AYNADAN (kimden ön eki),
  // (3) aynadaki satırların gerçek tx'i ana tablodan (kime, zaman) ÇİFTİYLE nokta okunarak.
  // JOIN ile yazılmamalı: `INNER JOIN blok_indeks FINAL` sağ tablonun TAMAMINI belleğe alıyor ve
  // aynı iş 26 sn sürüyor (ölçüldü). Ön ek okuması 15–98 ms.
  const [aynaGiden, msAyna] = await zamanla(() => tsv(`
    SELECT lower(hex(kime)), toUnixTimestamp(zaman), idx, toString(varlik), toString(tutar)
    FROM ${GIDEN_TABLO} FINAL WHERE kimden = unhex('${hex}') AND zaman BETWEEN ${kBas} AND ${kSon}`));
  const ciftler = [...new Set(aynaGiden.map((r) => `(unhex('${r[0]}'), ${r[1]})`))].join(",");
  const [aynaTx, msAynaTx] = ciftler.length
    ? await zamanla(() => tsv(`
        SELECT lower(hex(tx)) FROM ${TABLO} FINAL
        WHERE (kime, toUnixTimestamp(zaman)) IN (${ciftler}) AND kimden = unhex('${hex}')`))
    : [[] as string[][], 0] as [string[][], number];
  if (aynaTx.length !== aynaGiden.length) console.log(`      UYARI ayna ${aynaGiden.length} satır, tx çözümü ${aynaTx.length}`);
  msGelenler.push(msGelen); msGidenler.push(msGiden); msAynalar.push(msAyna + msAynaTx);
  const msIndeks = msGelen + msAyna + msAynaTx; // motorun gerçekte atacağı üç sorgu
  gecikmeIndeks.push(msIndeks);
  const ham = [...gelen, ...giden.filter((r) => r[2] !== hex)]; // kendine gönderim iki kez sayılmasın
  const indeks = coklukKur(ham.map((r) => anahtar(r[0]!, r[1]!, r[2]!, r[3]!, r[4]!)));

  // TronGrid kotası canlı worker'la PAYLAŞILIYOR (CLAUDE.md: vaka > indeks). 429 kapıyı düşürmemeli:
  // sayfa yeniden denenir, denemeler tükenirse o adres ÖLÇÜLEMEDİ diye sayılır — "uyuştu" sayılmaz.
  let gridHam: Transfer[] | null = null;
  let msGrid = 0;
  try {
    [gridHam, msGrid] = await zamanla(async () => {
      const hepsi: Transfer[] = [];
      let imlec: string | null = null;
      for (let sayfa = 0; sayfa < 40; sayfa++) {
        let s: { items: Transfer[]; nextCursor: string | null } | null = null;
        for (let deneme = 0; deneme < 5 && !s; deneme++) {
          try {
            s = await adapter.listTransfers(adres, { cursor: imlec, limit: 200, fromTs: iso(kBas), toTs: iso(kSon) });
          } catch (e) {
            if (deneme === 4) throw e;
            await uyu(5_000 * 2 ** deneme);
          }
        }
        hepsi.push(...s!.items);
        imlec = s!.nextCursor;
        if (!imlec) break;
      }
      return hepsi;
    });
  } catch (e) {
    olculemeyen++;
    console.log(`   ${adres} - TronGrid ÖLÇÜLEMEDİ: ${(e as Error).message.slice(0, 90)}`);
    await uyu(20_000);
    continue;
  }
  gecikmeGrid.push(msGrid);

  // İndeksin kapsamı: başarılı işlem, TRX (native ve TRC10 DEĞİL) ve yalnızca USDT sözleşmesi.
  const grid = coklukKur(
    gridHam
      .filter((t) => t.success)
      .filter((t) => (t.kind === "native" && t.asset.contract === null) ||
                     (t.kind === "token" && !!t.asset.contract && govde(t.asset.contract) === USDT_TRC20_HEX))
      .filter((t) => { const sn = Date.parse(t.ts) / 1000; return sn >= kBas && sn <= kSon; })
      .map((t) => anahtar(
        t.txHash,
        t.from ? govde(t.from) : "",
        t.to ? govde(t.to) : "",
        t.asset.contract === null ? "TRX" : "USDT",
        t.amountRaw,
      )),
  );

  // E) `index` alanı: iki aday kural yan yana sınanır.
  //   KURAL-1 (bugünkü şema) TronGrid'in verdiği sıra: adresin o işlemdeki kaçıncı kaydı. Blok
  //     indeksinden yeniden üretilmeye çalışılır (TRX'te `idx`, USDT'de 0'dan yeniden numaralama).
  //   KURAL-2 (aday şema) İŞLEM İÇİNDE AYNI (kimden, kime, varlık, tutar) dörtlüsünün kaçıncı
  //     TEKRARI. İçerik tek başına anahtar olamaz (aynı tx'te 20 özdeş Transfer ölçüldü), ama
  //     içerik + tekrar sırası olur — ve iki kaynak da onu görebildiği için KAYNAKTAN BAĞIMSIZ.
  type Sat = { tx: string; idx: number; varlik: string; kimden: string; kime: string; tutar: string };
  const satirlar: Sat[] = ham.map((r) => ({ tx: r[0]!, kimden: r[1]!, kime: r[2]!, varlik: r[3]!, tutar: r[4]!, idx: Number(r[5] ?? 0) }));
  const usdtSira = new Map<string, number>();
  const kural1 = coklukKur(
    [...satirlar].sort((x, y) => x.tx.localeCompare(y.tx) || x.idx - y.idx).map((r) => {
      if (r.varlik === "TRX") return `${r.tx}|${r.idx}`;
      const n = usdtSira.get(r.tx) ?? 0;
      usdtSira.set(r.tx, n + 1);
      return `${r.tx}|${n}`;
    }),
  );
  const tekrarNo = (l: { tx: string; kimden: string; kime: string; varlik: string; tutar: string }[]) => {
    const sayac = new Map<string, number>();
    return l.map((r) => {
      const t = `${r.tx}|${r.kimden}|${r.kime}|${r.varlik}|${r.tutar}`;
      const n = sayac.get(t) ?? 0;
      sayac.set(t, n + 1);
      return `${t}#${n}`;
    });
  };
  const kural2 = coklukKur(tekrarNo([...satirlar].sort((x, y) => x.tx.localeCompare(y.tx) || x.idx - y.idx)));

  const gridSuzulmus = gridHam
    .filter((t) => t.success)
    .filter((t) => (t.kind === "native" && t.asset.contract === null) ||
                   (t.kind === "token" && !!t.asset.contract && govde(t.asset.contract) === USDT_TRC20_HEX))
    .filter((t) => { const sn = Date.parse(t.ts) / 1000; return sn >= kBas && sn <= kSon; });
  const gridKural1 = coklukKur(gridSuzulmus.map((t) => `${t.txHash.toLowerCase()}|${t.index}`));
  const gridKural2 = coklukKur(tekrarNo(gridSuzulmus.map((t) => ({
    tx: t.txHash.toLowerCase(),
    kimden: t.from ? govde(t.from) : "",
    kime: t.to ? govde(t.to) : "",
    varlik: t.asset.contract === null ? "TRX" : "USDT",
    tutar: t.amountRaw,
  }))));

  const s1 = fark(gridKural1, kural1).length + fark(kural1, gridKural1).length;
  const s2 = fark(gridKural2, kural2).length + fark(kural2, gridKural2).length;
  toplamIndeksAlani += say(gridKural1);
  uyusmayanKural1 += s1;
  uyusmayanKural2 += s2;
  if (s1 || s2) console.log(`      index alanı: kural-1 uyuşmayan ${s1} - kural-2 uyuşmayan ${s2}`);

  const eksik = fark(grid, indeks);   // TronGrid'de var, indekste YOK -> indeks kör
  const fazla = fark(indeks, grid);   // indekste var, TronGrid'de yok -> kaynak eksik ya da indeks uyduruyor
  toplamIndeks += ham.length;
  toplamGrid += say(grid);
  toplamEksik += eksik.length;
  toplamFazla += fazla.length;
  if (eksik.length || fazla.length) uyusmayanAdres++;
  console.log(`   ${adres} - indeks ${ham.length} (gelen ${msGelen} + ayna ${msAyna} + tx ${msAynaTx} = ${msIndeks} ms; ana tabloda kimden taraması ${msGiden} ms) - grid ${say(grid)} (${msGrid} ms) - eksik ${eksik.length} - fazla ${fazla.length}`);
  for (const e of eksik.slice(0, 3)) console.log(`      EKSİK ${e}`);
  for (const f of fazla.slice(0, 3)) console.log(`      FAZLA ${f}`);
  await uyu(1_500); // TronGrid kotası canlı worker'la PAYLAŞILIYOR (CLAUDE.md: vaka > indeks).
}

const ort = (l: number[]) => Math.round(l.reduce((x, y) => x + y, 0) / Math.max(1, l.length));
console.log(`\nC) SONUÇ: ${adayHex.length} adres - indeks ${toplamIndeks} hareket - TronGrid ${toplamGrid} - eksik ${toplamEksik} - fazla ${toplamFazla} - uyuşmayan adres ${uyusmayanAdres} - ölçülemeyen ${olculemeyen}`);
console.log(`E) index alanı: ${toplamIndeksAlani} hareket - KURAL-1 (TronGrid sırası) uyuşmayan ${uyusmayanKural1} - KURAL-2 (içerik+tekrar) uyuşmayan ${uyusmayanKural2}`);
console.log(`D) hız (ortalama): gelen ${ort(msGelenler)} ms - ayna+tx ${ort(msAynalar)} ms - TronGrid ${ort(gecikmeGrid)} ms - (ana tabloda kimden taraması ${ort(msGidenler)} ms, KULLANILMAZ)`);
console.log(`   indeks toplam ${ort(gecikmeIndeks)} ms - TronGrid ${ort(gecikmeGrid)} ms - oran ${(ort(gecikmeGrid) / Math.max(1, ort(gecikmeIndeks))).toFixed(1)}x`);
await prisma.$disconnect();
