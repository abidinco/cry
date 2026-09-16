// Blok indeksinin ClickHouse şemasını kurar ve YAZMA YOLUNU gerçek veriyle sınar.
// Tekrar çalıştırmak zararsız: tablo IF NOT EXISTS, deneme satırları sonunda silinir.
//
// "Dry-run temiz" bir kanıt değildir (CLAUDE.md): şema kurulduktan sonra buradaki duman testi
// gerçekten yazar, geri okur ve sayıyı karşılaştırır.
//
// Çalıştır:
//   node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/blok-indeks-sema-kur.mts [--duman-testi-yok]
import { readFileSync } from "node:fs";
import { ayarOku, ekle, sorgu, bloktanSatirlar, satirDizisi, SEMA_SQL, EKLE_SQL, TABLO } from "@cry/blok-indeks";

const a = ayarOku();
console.log(`ClickHouse: ${a.url} · veritabanı ${a.veritabani} · kullanıcı ${a.kullanici}`);
console.log((await sorgu(a, "SELECT version(), currentUser(), currentDatabase() FORMAT TSV")).trim());

await sorgu(a, SEMA_SQL);
console.log(`şema kuruldu: ${TABLO}`);
console.log((await sorgu(a, `DESCRIBE TABLE ${TABLO} FORMAT TSV`)).trim().split("\n").map((s) => "  " + s.split("\t").slice(0, 2).join(" ")).join("\n"));
const oncekiSatir = Number((await sorgu(a, `SELECT count() FROM ${TABLO} FORMAT TSV`)).trim());
console.log(`tablodaki satır: ${oncekiSatir.toLocaleString("tr")}`);

if (process.argv.includes("--duman-testi-yok")) process.exit(0);

// Duman testi: fixture'daki GERÇEK bloklar yazılır, geri okunur, sonra silinir.
const fixture = JSON.parse(readFileSync("tests/fixtures/tron-bloklar.json", "utf8")) as { bloklar: { blok: unknown; bilgi: unknown[] }[] };
const satirlar = fixture.bloklar.flatMap((b) => bloktanSatirlar(b.blok as never, b.bilgi as never).satirlar);
const bloklar = [...new Set(satirlar.map((s) => s.blok))];
await ekle(a, EKLE_SQL, satirlar.map(satirDizisi));

const geri = (await sorgu(a, `
  SELECT count(), sum(tutar), lower(hex(any(kime)))
  FROM ${TABLO} WHERE blok IN (${bloklar.join(",")}) FORMAT TSV`)).trim().split("\t");
const beklenenTutar = satirlar.reduce((t, s) => t + s.tutar, 0n);
const tamam = Number(geri[0]) === satirlar.length && geri[1] === beklenenTutar.toString();
console.log(`duman testi: ${satirlar.length} satır yazıldı, ${geri[0]} okundu · tutar ${geri[1]} (beklenen ${beklenenTutar}) · ${tamam ? "TAMAM" : "UYUŞMUYOR"}`);

// Aynı satırları ikinci kez yazmak zararsız olmalı: ReplacingMergeTree + OPTIMIZE FINAL.
await ekle(a, EKLE_SQL, satirlar.map(satirDizisi));
await sorgu(a, `OPTIMIZE TABLE ${TABLO} FINAL`);
const ikinci = Number((await sorgu(a, `SELECT count() FROM ${TABLO} WHERE blok IN (${bloklar.join(",")}) FORMAT TSV`)).trim());
console.log(`ikinci yazma sonrası: ${ikinci} satır · ${ikinci === satirlar.length ? "TEKİLLİK TUTTU" : "MÜKERRER VAR"}`);

await sorgu(a, `DELETE FROM ${TABLO} WHERE blok IN (${bloklar.join(",")})`);
const kalan = Number((await sorgu(a, `SELECT count() FROM ${TABLO} FORMAT TSV`)).trim());
console.log(`deneme satırları silindi; tablodaki satır: ${kalan.toLocaleString("tr")}`);
if (!tamam || ikinci !== satirlar.length || kalan !== oncekiSatir) process.exit(1);
