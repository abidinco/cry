// M2 ölçüm kapısı (2026-09-22): İLK TARAMA da blok indeksinden yapılabilir mi?
//
// Sorun: takip koşusu YENİ adresler keşfediyor; onların `indexedThroughTs`'i boş, yani soru "bütün
// geçmiş" ve M1'in yönlendirme kuralı onu TronGrid'e gönderiyor. Bugünkü hızlanma bu yüzden takip
// koşusuna hiç yansımıyor (ölçüldü: M1 uygulaması).
//
// Fikir: adresin bütün ömrü pencerenin içindeyse "bütün geçmiş" sorusunu da indeks karşılar. Ömrün
// başlangıcı için elimizde TronGrid'in `create_time`'ı var (adaptörde `firstSeen`).
//
// SINANAN VARSAYIM: `create_time` <= adresin EN ESKİ hareketi. Şüphe sebebi gerçek: TRON'da TRC20
// bakiyesi sözleşmenin deposunda tutuluyor, yani aktive EDİLMEMİŞ bir adrese USDT gönderilebilir.
// Öyleyse `create_time` ilk hareketten SONRA olur ve ona güvenen bir kural, adresin daha eski
// hareketlerini "yok" sayar — bakılmamış bir yeri temiz göstermenin ta kendisi.
//
// Ölçüm ucuz: `listTransfers` zaten block_timestamp ASC sıralı, yani İLK SAYFANIN ilk kaydı adresin
// en eski hareketidir. Adres başına iki istek.
//
// Çalıştır:
//   node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/m2-kapi.mts [--adres=N]
import { ayarOku, sorgu, TABLO, pencereOku } from "@cry/blok-indeks";
import { TronAdapter, hexToBase58 } from "@cry/chain";

const a = ayarOku();
const ADRES_SAYISI = Number(process.argv.find((x) => x.startsWith("--adres="))?.split("=")[1] ?? 12);
const tsv = async (sql: string) =>
  (await sorgu(a, `${sql} FORMAT TSV`)).trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
const uyu = (ms: number) => new Promise((r) => setTimeout(r, ms));

const p = await pencereOku(a);
if (!p) throw new Error("pencere yok");
console.log(`pencere ${new Date(p.zamanBas * 1000).toISOString()} -> ${new Date(p.zamanSon * 1000).toISOString()} (${((p.zamanSon - p.zamanBas) / 86400).toFixed(1)} gün)`);

const adayHex = (await tsv(`
  SELECT lower(hex(kime)), count() AS n FROM ${TABLO} FINAL
  WHERE zaman BETWEEN ${p.zamanBas + 300} AND ${p.zamanSon - 300}
  GROUP BY kime HAVING n BETWEEN 2 AND 60 ORDER BY cityHash64(kime) LIMIT ${ADRES_SAYISI}`)).map((r) => r[0]!);

const ad = new TronAdapter({ apiKey: process.env.TRONGRID_API_KEY });

let uyan = 0, ihlal = 0, firstSeenYok = 0, olculemeyen = 0, omruPencerede = 0;

for (const hex of adayHex) {
  const adres = hexToBase58("41" + hex);
  try {
    const ozet = await ad.getAddressSummary(adres);
    await uyu(300);
    // ASC sıralı ilk sayfa: ilk kayıt adresin en eski hareketidir.
    const ilk = await ad.listTransfers(adres, { limit: 20 });
    const enEski = ilk.items[0]?.ts ?? null;
    if (!ozet.firstSeen) {
      firstSeenYok++;
      console.log(`   ${adres} - create_time YOK, en eski hareket ${enEski ?? "-"}`);
    } else if (!enEski) {
      console.log(`   ${adres} - hiç hareket dönmedi, atlandı`);
    } else {
      const ct = Date.parse(ozet.firstSeen), eh = Date.parse(enEski);
      const tamam = ct <= eh;
      tamam ? uyan++ : ihlal++;
      if (ct >= p.zamanBas * 1000) omruPencerede++;
      console.log(`   ${adres} - create_time ${ozet.firstSeen} ${tamam ? "<=" : "> !!"} en eski hareket ${enEski}${ct >= p.zamanBas * 1000 ? " - ÖMRÜ PENCEREDE" : ""}`);
    }
  } catch (e) {
    olculemeyen++;
    console.log(`   ${adres} - ÖLÇÜLEMEDİ: ${(e as Error).message.slice(0, 70)}`);
    await uyu(10_000);
  }
  await uyu(1_200); // TronGrid kotası canlı worker'la paylaşılıyor (vaka > indeks).
}

console.log(`\nSONUÇ: uyan ${uyan} - İHLAL ${ihlal} - create_time yok ${firstSeenYok} - ölçülemeyen ${olculemeyen}`);
console.log(`ömrü pencerede olan adres: ${omruPencerede}/${uyan + ihlal} — ilk taraması indeksten yapılabilecek olanlar`);
console.log(ihlal === 0 && firstSeenYok === 0
  ? "KAPI AÇIK: create_time bir ALT SINIR olarak kullanılabilir."
  : "KAPI KAPALI: create_time ilk hareketten sonra olabiliyor; ona dayanan kural eski hareketleri 'yok' sayar.");
