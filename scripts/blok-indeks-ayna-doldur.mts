// Giden yön aynasını (blok_indeks_giden) kurar ve MV'den ÖNCE yazılmış satırları bölüm bölüm aynaya kopyalar.
//   node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/blok-indeks-ayna-doldur.mts [--uygula]
//
// Sıra: önce tablo + MV (bundan sonraki her INSERT aynaya da gider), SONRA geçmiş kopyası. Tersi sırada
// kopya ile MV arasında yazılan satırlar aynada hiç olmazdı. Bu sırada aynı satır iki kez gelebilir
// (MV + kopya); ReplacingMergeTree + FINAL onu tekiller, o yüzden komutu yeniden çalıştırmak zararsız.
// Doğrulama bölüm başına: ana tablo ile aynanın `FINAL` sayıları eşit olmalı (canlı uç yazarken son bölümde
// birkaç saniyelik fark olabilir; komut o bölümü bir kez daha sayar).
import { ayarOku, sorgu, SEMALAR, TABLO, GIDEN_TABLO, GIDEN_SECIM_SQL } from "@cry/blok-indeks";

const UYGULA = process.argv.includes("--uygula");
const a = ayarOku();
const tsv = async (sql: string) => (await sorgu(a, `${sql} FORMAT TSV`)).trim().split("\n").filter(Boolean).map((l) => l.split("\t"));

const bolumler = (await tsv(`SELECT DISTINCT partition FROM system.parts WHERE active AND database = currentDatabase() AND table = '${TABLO}' ORDER BY partition`)).map((r) => r[0]!);
console.log(`ana tablo bölümleri: ${bolumler.join(", ")}`);
if (!UYGULA) { console.log("kuru koşu — kurmak ve kopyalamak için --uygula"); process.exit(0); }

for (const sql of SEMALAR) await sorgu(a, sql);
console.log("şema + MV kuruldu");

const say = async (tablo: string, b: string) => Number((await tsv(`SELECT count() FROM ${tablo} FINAL WHERE toYYYYMM(zaman) = ${b}`))[0]![0]);
let hata = false;
for (const b of bolumler) {
  const t0 = performance.now();
  await sorgu(a, `INSERT INTO ${GIDEN_TABLO} ${GIDEN_SECIM_SQL} WHERE toYYYYMM(zaman) = ${b}`);
  let ana = await say(TABLO, b), ayna = await say(GIDEN_TABLO, b);
  if (ana !== ayna) { await new Promise((r) => setTimeout(r, 5000)); ana = await say(TABLO, b); ayna = await say(GIDEN_TABLO, b); }
  const esit = ana === ayna;
  hata ||= !esit;
  console.log(`${b}: ${Math.round(performance.now() - t0)} ms · ana FINAL ${ana} · ayna FINAL ${ayna} · ${esit ? "EŞİT" : "FARKLI"}`);
}
const [[bayt, satir]] = await tsv(`SELECT sum(bytes_on_disk), sum(rows) FROM system.parts WHERE active AND database = currentDatabase() AND table = '${GIDEN_TABLO}'`);
console.log(`ayna diskte ${(Number(bayt) / 2 ** 30).toFixed(2)} GiB · ${satir} ham satır (birleşme öncesi)`);
process.exit(hata ? 1 : 0);
