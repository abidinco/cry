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
const adayHex = (await tsv(`
  SELECT lower(hex(kime)), count() AS n FROM ${TABLO} FINAL WHERE ${W}
  GROUP BY kime HAVING n BETWEEN 3 AND 400 ORDER BY cityHash64(kime) LIMIT ${ADRES_SAYISI}`))
  .map((r) => [r[0]!, Number(r[1])] as const);
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
const gecikmeIndeks: number[] = [], gecikmeGrid: number[] = [];

const uyu = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SEC = `SELECT lower(hex(tx)), lower(hex(kimden)), lower(hex(kime)), toString(varlik), toString(tutar) FROM ${TABLO} FINAL WHERE ${W}`;
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
console.log(`D) hız (ortalama): gelen ${ort(msGelenler)} ms - ayna+tx ${ort(msAynalar)} ms - TronGrid ${ort(gecikmeGrid)} ms - (ana tabloda kimden taraması ${ort(msGidenler)} ms, KULLANILMAZ)`);
console.log(`   indeks toplam ${ort(gecikmeIndeks)} ms - TronGrid ${ort(gecikmeGrid)} ms - oran ${(ort(gecikmeGrid) / Math.max(1, ort(gecikmeIndeks))).toFixed(1)}x`);
await prisma.$disconnect();
