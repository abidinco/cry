// M1 — sarmalayıcının GERÇEK VERİYLE doğrulaması (2026-09-21).
//
// M1 kapısı ham sorguları karşılaştırmıştı; bu betik motorun gerçekten kullandığı yolu sınıyor:
// `BlokIndeksliAdaptor.listTransfers` ⟷ `TronAdapter.listTransfers`, sayfalama dahil, aynı adres ve
// aynı zaman aralığında. Karşılaştırma KİMLİK üzerinden: (txHash, from, to, sözleşme, tutar,
// occurrence). Bu altılı Postgres'teki tekillik anahtarının ta kendisi — uyuşmazsa aynı para iki
// satır olur (CLAUDE.md → M1-E).
//
// "Kodu okuyarak değil ÇALIŞTIRARAK doğrula" (CLAUDE.md): tip kontrolü bu sınıfın yanlış sayfaya
// atlamasını ya da imleci yanlış kodlamasını görmez.
//
// Çalıştır:
//   node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/m1-adaptor-dogrula.mts [--adres=N]
import { ayarOku, sorgu, TABLO, KAPSAM_TABLO, USDT_TRC20_HEX, pencereOku } from "@cry/blok-indeks";
import { TronAdapter, hexToBase58, base58ToHex, type Transfer } from "@cry/chain";
import { BlokIndeksliAdaptor } from "../../apps/worker/src/blok-indeksli-adaptor.ts";

const a = ayarOku();
const ADRES_SAYISI = Number(process.argv.find((x) => x.startsWith("--adres="))?.split("=")[1] ?? 5);
const tsv = async (sql: string) =>
  (await sorgu(a, `${sql} FORMAT TSV`)).trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
const zamanla = async <T,>(fn: () => Promise<T>): Promise<[T, number]> => {
  const t = performance.now();
  const r = await fn();
  return [r, Math.round(performance.now() - t)];
};
const iso = (sn: number) => new Date(sn * 1000).toISOString();
const govde = (x: string) => base58ToHex(x).replace(/^41/, "").toLowerCase();
const uyu = (ms: number) => new Promise((r) => setTimeout(r, ms));

const p = await pencereOku(a);
if (!p) throw new Error("pencere yok");
console.log(`pencere ${p.bas}-${p.son} - ${iso(p.zamanBas)} -> ${iso(p.zamanSon)} - ${((p.zamanSon - p.zamanBas) / 86400).toFixed(2)} gün`);

// Uçlardan 5'er dakika içeri: TRC20 ucu blok numarası vermiyor, karşılaştırma ZAMAN üzerinden ve
// blok/zaman sınırı birebir örtüşmüyor. Pay bırakılmazsa uçtaki hareket sahte fark verir.
const kBas = p.zamanBas + 300, kSon = p.zamanSon - 300;

// `--cokKayitli` ZOR hali seçer: aynı işlemde bu adrese 3+ kaydı olan adresler. `occurrence`
// ancak orada sınanır — tek kayıtlı işlemde her kural 0 verir. Aday SEÇİMİ pencerenin son
// gününden yapılır (96 günün tamamında `GROUP BY kime, tx` ClickHouse'u zaman aşımına düşürüyor).
const adaySql = process.argv.includes("--cokKayitli")
  ? `SELECT lower(hex(x)), sum(n) FROM (
       SELECT kime AS x, tx, count() AS n FROM ${TABLO} FINAL
       WHERE zaman BETWEEN ${kSon - 86400} AND ${kSon} GROUP BY kime, tx HAVING n >= 3)
     GROUP BY x HAVING sum(n) BETWEEN 3 AND 400 ORDER BY cityHash64(x) LIMIT ${ADRES_SAYISI}`
  : `SELECT lower(hex(kime)), count() AS n FROM ${TABLO} FINAL WHERE zaman BETWEEN ${kBas} AND ${kSon}
     GROUP BY kime HAVING n BETWEEN 3 AND 400 ORDER BY cityHash64(kime) LIMIT ${ADRES_SAYISI}`;
const adayHex = (await tsv(adaySql)).map((r) => r[0]!);

const ham = new TronAdapter({ apiKey: process.env.TRONGRID_API_KEY });
const sarmal = new BlokIndeksliAdaptor(ham, a);

/** Bütün sayfaları toplar — imleç mantığı da böylece sınanmış olur. */
async function hepsi(ad: { listTransfers: TronAdapter["listTransfers"] }, adres: string): Promise<Transfer[]> {
  const l: Transfer[] = [];
  let imlec: string | null = null;
  for (let s = 0; s < 60; s++) {
    const sayfa = await ad.listTransfers(adres, { cursor: imlec, limit: 200, fromTs: iso(kBas), toTs: iso(kSon) });
    l.push(...sayfa.items);
    imlec = sayfa.nextCursor;
    if (!imlec) break;
  }
  return l;
}

/** Postgres'teki tekillik anahtarının aynısı. */
const kimlik = (t: Transfer) =>
  `${t.txHash.toLowerCase()}|${t.from ? govde(t.from) : ""}|${t.to ? govde(t.to) : ""}|${t.asset.contract ? govde(t.asset.contract) : "TRX"}|${t.amountRaw}|#${t.occurrence}`;
const coklukKur = (l: string[]) => l.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());
const fark = (x: Map<string, number>, y: Map<string, number>) => {
  const d: string[] = [];
  for (const [k, n] of x) { const e = n - (y.get(k) ?? 0); for (let i = 0; i < e; i++) d.push(k); }
  return d;
};

// İndeksin kapsamı: başarılı işlem, TRX (TRC10 değil) ve yalnızca USDT sözleşmesi.
const kapsamda = (t: Transfer) =>
  t.success &&
  ((t.kind === "native" && t.asset.contract === null) ||
    (t.kind === "token" && !!t.asset.contract && govde(t.asset.contract) === USDT_TRC20_HEX));

let toplamEksik = 0, toplamFazla = 0, toplamHareket = 0, olculemeyen = 0;
const msIndeks: number[] = [], msGrid: number[] = [];

for (const hex of adayHex) {
  const adres = hexToBase58("41" + hex);
  const [indeks, mi] = await zamanla(() => hepsi(sarmal, adres));
  const yol = sarmal.sonKullanim;
  if (yol.kaynak !== "blok-indeksi") {
    console.log(`   ${adres} - ATLANDI, sarmalayıcı kaynağa gitti: ${yol.sebep}`);
    continue;
  }
  let grid: Transfer[];
  let mg = 0;
  try {
    [grid, mg] = await zamanla(() => hepsi(ham, adres));
  } catch (e) {
    olculemeyen++;
    console.log(`   ${adres} - TronGrid ÖLÇÜLEMEDİ: ${(e as Error).message.slice(0, 80)}`);
    await uyu(15_000);
    continue;
  }
  msIndeks.push(mi); msGrid.push(mg);

  const i = coklukKur(indeks.filter(kapsamda).map(kimlik));
  const g = coklukKur(grid.filter(kapsamda).map(kimlik));
  const eksik = fark(g, i), fazla = fark(i, g);
  toplamHareket += [...g.values()].reduce((x, y) => x + y, 0);
  toplamEksik += eksik.length; toplamFazla += fazla.length;
  console.log(`   ${adres} - indeks ${indeks.length} (${mi} ms) - grid ${grid.filter(kapsamda).length} (${mg} ms) - eksik ${eksik.length} - fazla ${fazla.length}`);
  for (const x of eksik.slice(0, 3)) console.log(`      EKSİK ${x}`);
  for (const x of fazla.slice(0, 3)) console.log(`      FAZLA ${x}`);
  await uyu(1_500); // TronGrid kotası canlı worker'la paylaşılıyor (vaka > indeks).
}

// Yönlendirme kararı: `fromTs` yoksa soru "bütün geçmiş"tir ve pencere onu karşılamaz.
const denekAdres = hexToBase58("41" + adayHex[0]!);
await sarmal.listTransfers(denekAdres, { limit: 1 });
console.log(`\nyönlendirme (fromTs YOK): ${sarmal.sonKullanim.kaynak} - ${sarmal.sonKullanim.sebep}`);
await sarmal.listTransfers(denekAdres, { limit: 1, fromTs: new Date((p.zamanBas - 86400) * 1000).toISOString() });
console.log(`yönlendirme (pencere ÖNCESİ): ${sarmal.sonKullanim.kaynak} - ${sarmal.sonKullanim.sebep}`);

const ort = (l: number[]) => Math.round(l.reduce((x, y) => x + y, 0) / Math.max(1, l.length));
console.log(`\nSONUÇ: ${msIndeks.length} adres - ${toplamHareket} hareket - eksik ${toplamEksik} - fazla ${toplamFazla} - ölçülemeyen ${olculemeyen}`);
console.log(`hız: sarmalayıcı ${ort(msIndeks)} ms - TronGrid ${ort(msGrid)} ms - oran ${(ort(msGrid) / Math.max(1, ort(msIndeks))).toFixed(1)}x`);
