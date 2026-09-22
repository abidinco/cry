// Blok indeksindeki BOŞLUKLARI kapatır.
//
// Neden ayrı bir iş: doldurucu, iki kaynak aynı bloğa farklı satır verdiğinde ya da bir blok
// okunamadığında o bloğu YAZMAZ ve boşluk bırakır (CLAUDE.md → B3). Bu bilerek konmuş bir kuraldır:
// hangi kaynağın doğru olduğu bilinemez. Ama boşluk KALICIDIR ve bedeli büyüktür:
//
//   **Pencere, kapsam tablosunun BOŞLUKSUZ son aralığıdır.** Tam geçmiş yüklendikten sonra
//   84.000.000'daki tek bir boşluk, altındaki 84 milyon bloğu motora kapatır — veri diskte
//   dursa bile. Boşluk "biraz eksik veri" değil, o noktanın ALTINDAKİ HER ŞEYİN kaybıdır.
//
// Doldurucuyla ÇAKIŞMAZ: farklı blokları okur ve süreç adı `doldur.ts` içermediği için bekçi onu
// ikinci bir doldurucu sanmaz. Yine de kota paylaşıldığı için küçük partiler hâlinde ve kapılı gider.
//
// Çalıştır (önce KURU, ne yapacağını görün):
//   node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/blok-indeks-bosluk-doldur.mts
//   ... --uygula [--taban=80000000] [--enFazla=500] [--kaynaklar=tronstack,trongrid]
import { ayarOku, sorgu, bloktanSatirlar } from "@cry/blok-indeks";
import { KAYNAKLAR, TronBlokKaynagi } from "../apps/blok-okuyucu/src/kaynak.ts";
import { Yazici, ts } from "../apps/blok-okuyucu/src/yazici.ts";

const a = ayarOku();
const deger = (ad: string) => process.argv.find((x) => x.startsWith(`--${ad}=`))?.split("=").slice(1).join("=");
const sayi = (ad: string, v: number) => Number(deger(ad) ?? v);
const UYGULA = process.argv.includes("--uygula");
const TABAN = sayi("taban", 0);
const EN_FAZLA = sayi("enFazla", 500);
/**
 * Bundan BÜYÜK aralıklar boşluk SAYILMAZ. Kapsam tablosunda hiç okunmamış koca bölgeler var
 * (B0'ın 30.000.000 civarındaki örnek blokları ile asıl bölge arasında milyonlarca blok);
 * onlar "kapatılacak boşluk" değil, "henüz gelinmemiş geçmiş"tir ve doldurucunun işidir.
 * Gerçek boşluklar bir kaynağın o an cevap verememesinden kalıyor ve onlarca blok oluyor.
 */
const EN_BUYUK_BOSLUK = sayi("enBuyukBosluk", 1000);
/**
 * Doldurucunun CEPHESİNE bu kadar yaklaşılmaz. Cephedeki "boşluk" çoğu zaman boşluk değil,
 * doldurucunun o an UÇUŞTA olan bloğudur: eşzamanlı okuduğu ama kapsam satırını henüz yazmadığı
 * blok. Ölçüldü: cephenin hemen üstünde 205 bloğun 27'si "boşluk" göründü, oysa oran bütün koşuda
 * yüz binde 3. İkisi aynı bloğu okursa kota iki kez harcanır.
 */
const EMNIYET = sayi("emniyet", 50_000);
const KAYNAK_ADLARI = (deger("kaynaklar") ?? "tronstack,trongrid").split(",").filter(Boolean);

const tsv = async (sql: string) =>
  (await sorgu(a, `${sql} FORMAT TSV`)).trim().split("\n").filter(Boolean).map((l) => l.split("\t"));

// Boşluk = kapsam tablosunda ardışık iki bloğun arasında kalan aralık. `blok_indeks`e bakmak
// YETMEZ: 0 transferli bir blok orada zaten satır bırakmaz ("yok" ile "bakılmadı" ayrı sorular).
const tumBosluklar = (await tsv(`
  SELECT bas, son, son - bas + 1 AS adet FROM (
    SELECT blok + 1 AS bas,
           leadInFrame(blok) OVER (ORDER BY blok ROWS BETWEEN CURRENT ROW AND 1 FOLLOWING) - 1 AS son
    FROM (SELECT DISTINCT blok FROM blok_okundu WHERE blok >= ${TABAN}))
  WHERE son >= bas ORDER BY bas DESC`)).map((r) => ({ bas: Number(r[0]), son: Number(r[1]), adet: Number(r[2]) }));

// Kütlenin TABANI: en yüksek BÜYÜK aralığın üstü. Büyük aralık boşluk değil, "henüz gelinmemiş
// geçmiş"tir (B0'ın 30.000.000 civarındaki örnek blokları ile asıl bölge arasındaki milyonlar).
const buyukler = tumBosluklar.filter((b) => b.adet > EN_BUYUK_BOSLUK);
const [[enDusuk]] = (await tsv(`SELECT min(blok) FROM blok_okundu WHERE blok >= ${TABAN}`)) as [[string]];
const kutleTabani = buyukler.length ? Math.max(...buyukler.map((b) => b.son)) + 1 : Number(enDusuk);
const cephe = kutleTabani + EMNIYET;
console.log(`${ts()} kütle tabanı ${kutleTabani} · emniyet ${EMNIYET} → ${cephe} altındaki boşluklara dokunulmaz`);

const bosluklar = tumBosluklar.filter((b) => b.adet <= EN_BUYUK_BOSLUK && b.bas >= cephe);

const toplam = bosluklar.reduce((x, b) => x + b.adet, 0);
console.log(`${ts()} ${bosluklar.length} boşluk, toplam ${toplam} blok (taban ${TABAN}, en büyük boşluk ${EN_BUYUK_BOSLUK})`);
for (const b of bosluklar.slice(0, 20)) console.log(`   ${b.bas}–${b.son} (${b.adet})`);
if (bosluklar.length > 20) console.log(`   … ve ${bosluklar.length - 20} boşluk daha`);

// En ÜSTTEKİ boşluk pencereyi kapatan boşluktur; sıra ondan başlar (liste zaten azalan).
const hedefler: number[] = [];
for (const b of bosluklar) {
  for (let n = b.bas; n <= b.son && hedefler.length < EN_FAZLA; n++) hedefler.push(n);
  if (hedefler.length >= EN_FAZLA) break;
}
// `process.exit()` KULLANILMIYOR: ClickHouse istemcisinin açık tutamaçları varken süreç
// zorla kapanınca libuv "Assertion failed" basıyor ve zamanlanmış görevin günlüğü
// sağlıklı bir turu hatalı gösteriyor (ölçüldü).
if (hedefler.length === 0) {
  console.log(`${ts()} kapatılacak boşluk yok`);
} else {
console.log(`${ts()} bu turda ${hedefler.length} blok denenecek · ${UYGULA ? "YAZILIYOR" : "KURU (yazılmaz; --uygula)"}`);

const kaynaklar = KAYNAK_ADLARI.map((ad) => {
  if (ad === "trongrid") return new TronBlokKaynagi(KAYNAKLAR.trongrid(process.env.TRONGRID_API_KEY));
  if (ad === "tronstack") return new TronBlokKaynagi(KAYNAKLAR.tronstack());
  if (ad === "publicnode") return new TronBlokKaynagi(KAYNAKLAR.publicnode());
  throw new Error(`bilinmeyen kaynak: ${ad}`);
});

const yazici = new Yazici(a, UYGULA, (e) => { console.error(`${ts()} YAZMA HATASI: ${(e as Error).message}`); process.exit(1); });

let kapanan = 0, kapanmayan = 0;
const sebepler = new Map<string, number>();

for (const no of hedefler) {
  // Kaynaklar SIRAYLA denenir. Bir boşluk çoğu zaman tek bir kaynağın o an cevap verememesinden
  // kalıyor; ikinci kaynak çoğunu kapatıyor. Hiçbiri veremezse boşluk KALIR ve sebebi sayılır —
  // sessizce "0 transferli blok" yazmak, bakılmamış bir bloğu bakılmış göstermek olurdu.
  let yazildi = false;
  for (const k of kaynaklar) {
    try {
      const { blok, bilgi } = await k.blok(no);
      const r = bloktanSatirlar(blok as never, bilgi as never);
      yazici.ekle(r);
      yazildi = true;
      break;
    } catch (e) {
      const m = `${k.ad}: ${(e as Error).message.slice(0, 60)}`;
      sebepler.set(m, (sebepler.get(m) ?? 0) + 1);
    }
  }
  yazildi ? kapanan++ : kapanmayan++;
  if ((kapanan + kapanmayan) % 50 === 0) console.log(`${ts()} ${kapanan + kapanmayan}/${hedefler.length} · kapanan ${kapanan} · kalan boşluk ${kapanmayan}`);
}

await yazici.kapat();
console.log(`${ts()} bitti: ${kapanan} blok kapatıldı, ${kapanmayan} kapanmadı${UYGULA ? "" : " (KURU — hiçbir şey yazılmadı)"}`);
for (const [m, n] of [...sebepler.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8)) console.log(`   ${n}× ${m}`);

if (UYGULA) {
  const [[bas, son]] = (await tsv(`
    SELECT (SELECT max(blok) FROM (
      SELECT blok, lagInFrame(blok) OVER (ORDER BY blok ROWS BETWEEN 1 PRECEDING AND CURRENT ROW) AS onceki
      FROM blok_okundu) WHERE blok > onceki + 1), (SELECT max(blok) FROM blok_okundu)`)) as [[string, string]];
  console.log(`${ts()} pencere şimdi ${bas}–${son} (${Number(son) - Number(bas) + 1} blok)`);
}
}
