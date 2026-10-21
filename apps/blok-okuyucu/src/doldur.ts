/**
 * Geçmiş doldurucu (B3) — kesinleşmiş uçtan GERİYE doğru, birden çok ücretsiz kaynaktan, disk dolana kadar.
 *
 *   node --env-file=.env --env-file=apps/web/.env.local --import tsx apps/blok-okuyucu/src/doldur.ts \
 *     [--uygula] [--ust=<blok>] [--taban=1] [--parca=10000] [--kaynaklar=publicnode,tronstack,trongrid] \
 *     [--minBosGB=50] [--disk=D:\][--capraz=500] [--ilerlemeSn=10] [--<kaynak>Ms=…] [--<kaynak>Es=…] [--<kaynak>Toplu=20]
 *
 * Karar (kullanıcı, 2026-09-17; bekleyen-kararlar §8'in cevabı): ücretsiz kaynaklar, geriye doğru, dolan
 * disk durdurur. Ölçümler yol haritası → B3.
 *
 * - Varsayılan KURU. Yeniden başlatılabilir: kapsamı olan blok atlanır (`blok_okundu`, B2 kuralı).
 * - Kaynaklar: publicnode yalnızca son ~92 gününü tutar; sınırı açılışta ikili aramayla bulunur ve
 *   altındaki bloğa HİÇ sorulmaz (sorulursa HTTP 200 + boş cevap verir). tronstack ve TronGrid tam geçmiş.
 * - Bir kaynakta hata veren blok başka bir kaynağa gider; hepsi denediyse boşluk olarak kalır.
 *   20 ardışık hata veren kaynak 60 sn bekletilir (kota ya da kesinti).
 * - **TronGrid ÖNCELİKSİZDİR:** kota adres taramasıyla paylaşılıyor (worker 10 istek/sn, tavan ~12,5).
 *   Worker'ın kuyruklarında (indeks, takip) iş varken TronGrid'e istek atılmaz — vaka > indeks.
 * - Çapraz denetim: her `capraz`. başarılı blok ikinci bir kaynaktan da okunur ve satır satır
 *   karşılaştırılır. Uyuşmazsa hangisinin doğru olduğu bilinemez: blok YAZILMAZ, boşluk kalır.
 * - Disk: her parçadan önce `disk` sürücüsünün boş alanı ölçülür; `minBosGB` altında DURUR (çıkış 3).
 * - Parça bitince boşluklar kapsamdan hesaplanıp `block_cursors.missing_ranges`e yazılır.
 * - **Toplu blok:** her işçi kendi kaynağından ARDIŞIK en çok `<kaynak>Toplu` blok alır, blokları tek istekte
 *   (`getblockbylimitnext`), işlem bilgisini blok blok çeker: istek blok başına ~2'den ~1'e iner (2026-09-18).
 *   Toplu istek düşerse dizinin blokları tek tek başka kaynağa gider; dönmeyen blok tekli istekle okunur.
 *   `--<kaynak>Toplu=1` eski davranıştır.
 *   Ölçüm (blok 69.998.601–70.000.000, tronstack, kuru): toplu 1 × 2 eşzaman 2,44 blok/sn, 1.601 istek · toplu 20 × 2
 *   2,92 blok/sn, 841 istek (satırlar AYNI, 224.772) · toplu 20 × 4 **4,61**, hatasız · × 6 4,71 ve 1 hata (200 ms kapı sınırı).
 *   Varsayılan: tronstack ve publicnode 4, TronGrid 2 eşzaman (kota worker'la paylaşılıyor).
 */
import { statfsSync } from "node:fs";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import {
  ayarOku, sorgu, bloktanSatirlar, aralikBoyu, eksikAraliklar, eksikleriGuncelle, eksikListesiOku,
  geriyeParcalar, kaynakUygunMu, satirIzi, bloktanSatirlarLogla, loglariBloklaraBol, logsuzAraliksupheli, type RpcLog, SEMALAR, KAPSAM_TABLO, type Aralik, type AyristirmaSonucu, type KaynakSiniri,
} from "@cry/blok-indeks";
import { prisma } from "@cry/db";
import { KUYRUK, KUYRUK_ONEKI } from "@cry/kuyruk";
import { KAYNAKLAR, TronBlokKaynagi } from "./kaynak.js";
import { Yazici, geciciyseTekrarla, ts } from "./yazici.js";

const deger = (ad: string) => process.argv.find((x) => x.startsWith(`--${ad}=`))?.split("=").slice(1).join("=");
const sayi = (ad: string, vars: number) => {
  const d = deger(ad);
  if (d === undefined) return vars;
  const n = Number(d);
  if (!Number.isFinite(n)) { console.error(`--${ad} sayı değil: ${d}`); process.exit(2); }
  return n;
};
const UYGULA = process.argv.includes("--uygula");
const TABAN = sayi("taban", 1);
const PARCA = sayi("parca", 10_000);
const MIN_BOS = sayi("minBosGB", 50) * 2 ** 30;
const DISK = deger("disk") ?? "D:\\";
const CAPRAZ = sayi("capraz", 500);
/**
 * Log yolu (yalnızca TronGrid): işlem bilgisi blok blok DEĞİL, blok aralığı için `eth_getLogs` ile tek istekte
 * (packages/blok-indeks/src/log-yolu.ts). İstek/blok ~1,05 → ~0,03. Log yoluyla okunan blokların her
 * `logCapraz`.sü aynı kaynaktan ESKİ yolla yeniden okunup satır satır karşılaştırılır.
 */
const LOG_YOLU = process.argv.includes("--logYolu");
const LOG_CAPRAZ = sayi("logCapraz", 500);
/**
 * TronGrid'in ek anahtarları: `TRONGRID_API_KEY_2`, `_3`… doluysa her biri AYRI bir kaynak olur (`trongrid2`, `trongrid3`):
 * kendi bütçesi, eşzamanı, 429 geri çekilmesi. Kota anahtar başınaysa hız katlanır; hesap başınaysa ek anahtar kazandırmaz
 * (günlük istek sayacı kaynak başına günlükte görünür, orada ölçülür).
 */
const EK_ANAHTARLAR = [2, 3, 4, 5].filter((n) => (process.env[`TRONGRID_API_KEY_${n}`] ?? "").trim() !== "").map((n) => `trongrid${n}`);
const SECILEN = (deger("kaynaklar") ?? ["publicnode", "tronstack", "trongrid", ...EK_ANAHTARLAR].join(",")).split(",").map((x) => x.trim()).filter(Boolean);
/** "trongrid2" → "trongrid": komut satırı ayarları (`--trongridEs` …) ek anahtarlara da uygulanır, kaynağa özel olan ezer. */
const tabanAd = (ad: string) => ad.replace(/\d+$/, "");
const ayar = (ad: string, ek: string, vars: number) => sayi(`${ad}${ek}`, sayi(`${tabanAd(ad)}${ek}`, vars));
/** Parçada okunamayan blok oranı bunu aşarsa kaynaklar okuyamıyor demektir: geçmişi boşlukla doldurmak yerine DUR. */
const HATA_ORANI_SINIRI = 0.01;
const uyu = (ms: number) => new Promise((r) => setTimeout(r, ms));

const a = ayarOku();
const tg = new TronBlokKaynagi({ apiKey: process.env.TRONGRID_API_KEY });
const kesin = await tg.kesinlesmisBlok();
const UST = sayi("ust", kesin);
if (UST > kesin) { console.error(`--ust ${UST} kesinleşmiş ucun (${kesin}) üstünde; yeniden düzenlenebilir blok yazılmaz.`); process.exit(2); }
if (TABAN > UST) { console.error(`--taban ${TABAN} > --ust ${UST}`); process.exit(2); }

// ---- kaynaklar ----
type Aktif = {
  kaynak: TronBlokKaynagi;
  sinir: KaynakSiniri;
  eszaman: number;
  /** Bir işçinin tek seferde aldığı ardışık blok sayısı (toplu blok isteği). */
  toplu: number;
  oncelikli: boolean;
  /** Bu kaynakta işlem bilgisi `eth_getLogs` aralığıyla alınır. */
  logYolu: boolean;
  /**
   * UTC günü başına en çok bu kadar istek (0 = sınırsız). TronGrid anahtarının kotası günlük 100.000 ve
   * worker'la PAYLAŞILIYOR; dolunca anahtar 24 saat boyunca saniyede 1 isteğe düşüyor (ölçüldü 2026-10-19:
   * "Exceed the user daily usage (100000)"). Bütçe dolunca kaynak ertesi UTC gününe kadar bekler.
   */
  gunlukButce: number;
  gun: string;
  gunBasiIstek: number;
  butceUyarisi?: boolean;
  basarili: number;
  hata: number;
  ardisikHata: number;
  bekleyeKadar: number;
  sonHata?: string;
};
const aktifler: Aktif[] = [];
for (const ad of SECILEN) {
  let kaynak: TronBlokKaynagi;
  if (ad === "publicnode") kaynak = new TronBlokKaynagi(KAYNAKLAR.publicnode(sayi("publicnodeMs", 60)));
  else if (ad === "tronstack") kaynak = new TronBlokKaynagi(KAYNAKLAR.tronstack(sayi("tronstackMs", 200)));
  else if (tabanAd(ad) === "trongrid") {
    const no = ad.slice("trongrid".length);
    const anahtar = (no === "" ? process.env.TRONGRID_API_KEY : process.env[`TRONGRID_API_KEY_${no}`])?.trim();
    if (no !== "" && !anahtar) { console.error(`${ad}: TRONGRID_API_KEY_${no} boş, kullanılmıyor`); continue; }
    kaynak = new TronBlokKaynagi(KAYNAKLAR.trongrid(anahtar, ayar(ad, "Ms", 120)));
  }
  else { console.error(`bilinmeyen kaynak: ${ad}`); process.exit(2); }
  let enEski: number | null = null;
  const trongridMi = tabanAd(ad) === "trongrid";
  if (!trongridMi) {
    try {
      enEski = await kaynak.enEskiBlok(kesin);
      // Sınır zamanla İLERLİYOR (publicnode ~92 günü tutuyor): bir günlük pay.
      if (enEski !== null) enEski += 28_800;
    } catch (e) { console.error(`${ad} yoklanamadı, kullanılmıyor: ${(e as Error).message}`); continue; }
  }
  const logYolu = LOG_YOLU && trongridMi;
  aktifler.push({ kaynak, sinir: { ad, enEski }, eszaman: ayar(ad, "Es", trongridMi ? 2 : 4), toplu: Math.max(1, Math.min(100, ayar(ad, "Toplu", logYolu ? 50 : 20))), oncelikli: trongridMi, logYolu, gunlukButce: trongridMi ? ayar(ad, "GunlukButce", 0) : 0, gun: "", gunBasiIstek: 0, basarili: 0, hata: 0, ardisikHata: 0, bekleyeKadar: 0 });
}
if (aktifler.length === 0) { console.error("kullanılabilir kaynak yok"); process.exit(2); }

// ---- öncelik: worker'ın kuyruklarında iş varken TronGrid kullanılmaz ----
let mesgul = true;
let kuyruklar: Queue[] = [];
let redis: IORedis | null = null;
async function oncelikYokla() {
  try {
    const sayilar = await Promise.race([
      Promise.all(kuyruklar.map((q) => q.getJobCounts("active", "waiting", "prioritized"))),
      uyu(5_000).then(() => { throw new Error("5 sn'de cevap yok"); }),
    ]);
    const n = sayilar.reduce((t, c) => t + Object.values(c).reduce((x, y) => x + y, 0), 0);
    if ((n > 0) !== mesgul) console.log(`${ts()} TronGrid ${n > 0 ? `BEKLETİLİYOR — worker kuyruğunda ${n} iş` : "serbest — worker kuyrukları boş"}`);
    mesgul = n > 0;
  } catch (e) {
    // Kuyruğu göremiyorsak worker'ın meşgul OLMADIĞINI bilemeyiz: TronGrid kullanılmaz.
    if (!mesgul) console.log(`${ts()} TronGrid BEKLETİLİYOR — kuyruk okunamadı: ${(e as Error).message}`);
    mesgul = true;
  }
}
let oncelikZamanlayici: NodeJS.Timeout | null = null;
if (aktifler.some((k) => k.oncelikli)) {
  redis = new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:16379", { maxRetriesPerRequest: 1, lazyConnect: false });
  redis.on("error", () => {}); // hata oncelikYokla'da görünür; süreç düşmesin
  kuyruklar = [KUYRUK.indeks, KUYRUK.takip].map((ad) => new Queue(ad, { connection: redis!, prefix: KUYRUK_ONEKI }));
  await oncelikYokla();
  oncelikZamanlayici = setInterval(() => void oncelikYokla(), 10_000);
}

console.log(
  `${ts()} doldurma ${UST} → ${TABAN} (${(UST - TABAN + 1).toLocaleString("tr")} blok, parça ${PARCA}) · kesinleşmiş uç ${kesin} · ` +
  `${UYGULA ? "YAZILIYOR" : "KURU (yazılmaz; --uygula)"} · disk ${DISK} en az ${MIN_BOS / 2 ** 30} GiB boş · çapraz her ${CAPRAZ || "—"}`,
);
for (const k of aktifler) {
  console.log(`  kaynak ${k.sinir.ad}: ${k.sinir.enEski === null ? "tam geçmiş" : `en eski ${k.sinir.enEski}`} · ${k.eszaman} eşzaman · toplu ${k.toplu}${k.oncelikli ? " · worker kuyruğu boşken" : ""}${k.logYolu ? " · LOG YOLU" : ""}`);
}

// ---- durdurma ----
let durdur = false;
let sinyal = 0;
const sinyalde = () => {
  if (++sinyal > 1) { console.error("\nikinci sinyal: beklemeden çıkılıyor"); process.exit(130); }
  durdur = true;
  console.error("\ndurduruluyor — eldeki bloklar yazılıp çıkılacak (beklemeden çıkmak için tekrar)");
};
process.on("SIGINT", sinyalde);
process.on("SIGTERM", sinyalde);

if (UYGULA) for (const sql of SEMALAR) await sorgu(a, sql);
const yazici = new Yazici(a, UYGULA, () => { durdur = true; });

// ---- sayaçlar ----
const s = { logYoluBlok: 0, logYedek: 0, logCapraz: 0, okunan: 0, atlanan: 0, satir: 0, hataliBlok: 0, caprazDenetim: 0, caprazUyusmaz: 0, caprazAtlanan: 0, parca: 0 };
const hatalar: string[] = [];
const t0 = Date.now();
let simdikiParca: Aralik | null = null;
let durmaSebebi: "taban" | "disk" | "sinyal" | "yazma" | "kaynak" = "taban";

const diskBos = () => { const d = statfsSync(DISK); return d.bavail * d.bsize; };

async function okunanlar(r: Aralik): Promise<Set<number>> {
  return geciciyseTekrarla("kapsam sorgusu", async () => {
    if ((await sorgu(a, `EXISTS TABLE ${KAPSAM_TABLO} FORMAT TSV`)).trim() !== "1") return new Set<number>();
    const tsv = await sorgu(a, `SELECT blok FROM ${KAPSAM_TABLO} WHERE blok BETWEEN ${r.bas} AND ${r.son} FORMAT TSV`);
    return new Set(tsv.split("\n").filter(Boolean).map(Number));
  });
}

const ilerleme = setInterval(() => {
  const sn = (Date.now() - t0) / 1000;
  const hiz = s.okunan / Math.max(sn, 0.001);
  const kalanBlok = simdikiParca ? simdikiParca.bas - TABAN : 0;
  const kaynakDurumu = aktifler.map((k) => {
    const not = k.bekleyeKadar > Date.now() ? " bekletiliyor" : k.oncelikli && mesgul ? " kuyruk" : "";
    // `i` = kaynağa atılan mantıksal istek (günlük kota ölçümü için); 429 sonrası getJson yeniden denemeleri dahil DEĞİL.
    return `${k.sinir.ad} ${k.basarili}/${k.hata}h ${k.kaynak.sayac.istek}i${not}`;
  }).join(" · ");
  console.log(
    `${ts()} parça ${simdikiParca ? `${simdikiParca.son}→${simdikiParca.bas}` : "-"} · okunan ${s.okunan.toLocaleString("tr")} · ` +
    `yazılan ${yazici.yazilan.toLocaleString("tr")} · ${hiz.toFixed(2)} blok/sn · ${s.satir.toLocaleString("tr")} satır · ${kaynakDurumu}` +
    (s.hataliBlok ? ` · BOŞLUK ${s.hataliBlok}` : "") + (s.caprazUyusmaz ? ` · ÇAPRAZ UYUŞMAZ ${s.caprazUyusmaz}` : "") +
    ` · disk ${(diskBos() / 2 ** 30).toFixed(0)} GiB boş · aşağısı ~${hiz > 0 ? (kalanBlok / hiz / 86_400).toFixed(1) : "?"} gün`,
  );
}, sayi("ilerlemeSn", 10) * 1_000);

// ---- bir parça ----
/** `tekrar`: kaynak başına geçici hata sayısı; `sonra`: bundan önce yeniden verilmez (geri çekilme). */
type Is = { no: number; denenen: Set<string>; tekrar?: Map<string, number>; sonra?: number };
/** Aynı kaynakta, geçici hatadan sonra bir bloğa en çok bu kadar kez daha bakılır; sonra başka kaynağa geçer. */
const AYNI_KAYNAK_TEKRAR = sayi("ayniKaynakTekrar", 2);
/** Toplu blok isteği (tek istek, `toplu` blok) geçici hatada yerinde bu kadar kez daha denenir. */
const TOPLU_TEKRAR = sayi("topluTekrar", 3);
/** Log aralığı sorgusu eski yola düşmeden önce bu kadar kez daha denenir. */
const LOG_TEKRAR = sayi("logTekrar", 4);
/** UTC gününün bütçesi dolduysa kaynak ertesi güne kadar kullanılamaz. */
function butceVar(k: Aktif): boolean {
  if (!k.gunlukButce) return true;
  const gun = new Date().toISOString().slice(0, 10);
  if (k.gun !== gun) { k.gun = gun; k.gunBasiIstek = k.kaynak.sayac.istek; }
  const harcanan = k.kaynak.sayac.istek - k.gunBasiIstek;
  if (harcanan < k.gunlukButce) { k.butceUyarisi = false; return true; }
  if (!k.butceUyarisi) { k.butceUyarisi = true; console.log(`${ts()} ${k.sinir.ad} günlük bütçe doldu (${harcanan}/${k.gunlukButce} istek) — 00:00 UTC'ye kadar bekletiliyor`); }
  return false;
}
const musait = (k: Aktif) => k.bekleyeKadar <= Date.now() && !(k.oncelikli && mesgul) && butceVar(k);

async function caprazDenetle(k: Aktif, no: number, r: AyristirmaSonucu, kendisiyle = false): Promise<void> {
  // Log yolu satırı, AYNI kaynağın eski yoluyla karşılaştırılır (tronstack kapanıyor ve hız sınırlı; ayrıca
  // iki yolun idx'i birebir aynı olmak zorunda).
  const diger = kendisiyle ? k : aktifler.find((x) => x !== k && musait(x) && kaynakUygunMu(x.sinir, no));
  if (!diger) { s.caprazAtlanan++; return; }
  let r2: AyristirmaSonucu;
  try {
    const { blok, bilgi } = await diger.kaynak.blok(no);
    r2 = bloktanSatirlar(blok as never, bilgi as never);
  } catch { s.caprazAtlanan++; return; }
  s.caprazDenetim++;
  if (satirIzi(r2) !== satirIzi(r)) {
    s.caprazUyusmaz++;
    throw Object.assign(new Error(`çapraz denetim uyuşmadı: ${k.sinir.ad}${kendisiyle ? " (log yolu)" : ""} ${r.satirlar.length} satır, ${diger.sinir.ad}${kendisiyle ? " (eski yol)" : ""} ${r2.satirlar.length} satır`), { kesin: true });
  }
}

async function parcaOku(bekleyen: number[]): Promise<number> {
  const ana: Is[] = bekleyen.map((no) => ({ no, denenen: new Set() }));
  const geri: Is[] = [];
  let anaSira = 0;
  let ucusta = 0;
  let hatali = 0;
  let caprazSayac = 0;
  /** Bu parçada hata sebepleri (kaynak: sebep → kaç kez) ve yeniden deneme sayaçları; parça sonunda yazılır. */
  const sebepler = new Map<string, number>();
  let topluYeniden = 0, ayniKaynakYeniden = 0, baskaKaynagaGecen = 0, logYeniden = 0;
  const logYedek0 = s.logYedek;
  const sebepSay = (ad: string, e: unknown) => {
    const m = (e as Error).message.replace(/\d{5,}/g, "N").replace(/https?:\/\/\S+/g, (u) => { try { return new URL(u).pathname; } catch { return u; } }).slice(0, 110);
    const key = `${ad}: ${m}`;
    sebepler.set(key, (sebepler.get(key) ?? 0) + 1);
  };


  /** Geri dönen iş varsa tek başına o; yoksa ana kuyruktan ARDIŞIK (azalan) en çok `k.toplu` blok. */
  const alDizi = (k: Aktif): Is[] => {
    const simdi = Date.now();
    const gi = geri.findIndex((i) => !i.denenen.has(k.sinir.ad) && (i.sonra ?? 0) <= simdi && kaynakUygunMu(k.sinir, i.no));
    if (gi >= 0) return [geri.splice(gi, 1)[0]!];
    const dizi: Is[] = [];
    while (dizi.length < k.toplu) {
      const i = ana[anaSira];
      if (!i || !kaynakUygunMu(k.sinir, i.no)) break;
      if (dizi.length && i.no !== dizi[dizi.length - 1]!.no - 1) break; // önceden okunmuş blokta dizi kesilir
      dizi.push(i);
      anaSira++;
    }
    return dizi;
  };
  /** Bir bloğun hatası. Toplu istek düşünce dizinin yalnızca İLKİ ardışık hata sayılır: bir istek, bir hata. */
  const hataIsle = (k: Aktif, is: Is, e: unknown, say = true) => {
    const mesaj = (e as Error).message.slice(0, 200);
    if (say) {
      k.hata++;
      k.sonHata = mesaj;
      if (++k.ardisikHata >= 20) {
        k.bekleyeKadar = Date.now() + 60_000;
        k.ardisikHata = 0;
        console.log(`${ts()} ${k.sinir.ad} 20 ardışık hata — 60 sn bekletiliyor. Son: ${mesaj}`);
      }
    }
    if (say) sebepSay(k.sinir.ad, e);
    const gecici = !(e as { kesin?: boolean }).kesin;
    // Geçici hatada (429, ağ) aynı kaynağa geri çekilmeyle yeniden bakılır: tek çıkış olarak ölmekte olan bir
    // kaynağa (tronstack) bırakılan blok 25 dk'lık kuyruk yaratıyordu.
    const tekrar = (is.tekrar ??= new Map());
    const n = tekrar.get(k.sinir.ad) ?? 0;
    if (gecici && n < AYNI_KAYNAK_TEKRAR) {
      tekrar.set(k.sinir.ad, n + 1);
      is.sonra = Date.now() + 3_000 * 2 ** n + Math.floor(Math.random() * 1_000);
      ayniKaynakYeniden++;
      geri.push(is);
      return;
    }
    is.denenen.add(k.sinir.ad);
    baskaKaynagaGecen++;
    const baskaKaynak = !(e as { kesin?: boolean }).kesin && aktifler.some((x) => !is.denenen.has(x.sinir.ad) && kaynakUygunMu(x.sinir, is.no));
    if (baskaKaynak) geri.push(is);
    else { hatali++; if (hatalar.length < 50) hatalar.push(`${is.no}: ${mesaj}`); }
  };
  // Parça bitti: yeni iş yok, uçuşta iş yok, geri dönenlerin hiçbiri ŞU AN kullanılabilir bir kaynağa gidemiyor.
  // (Ana kuyrukta iş kaldıysa, onu alabilecek kaynak bekletiliyor olsa da parça BİTMEZ — beklenir.)
  const bitti = () => anaSira >= ana.length && ucusta === 0 &&
    geri.every((i) => !aktifler.some((k) => musait(k) && !i.denenen.has(k.sinir.ad) && kaynakUygunMu(k.sinir, i.no)));

  const isci = async (k: Aktif) => {
    for (;;) {
      if (durdur) return;
      const dizi = musait(k) ? alDizi(k) : [];
      if (dizi.length === 0) { if (bitti()) return; await uyu(200); continue; }
      ucusta += dizi.length;
      // Dizi azalan: blokları tek istekte [en küçük, en büyük].
      let hazir = new Map<number, unknown>();
      if (dizi.length > 1) {
        let sonHata: unknown = null;
        for (let d = 0; d <= TOPLU_TEKRAR && !durdur; d++) {
          try {
            hazir = await k.kaynak.bloklar(dizi[dizi.length - 1]!.no, dizi[0]!.no);
            sonHata = null;
            break;
          } catch (e) {
            sonHata = e;
            sebepSay(k.sinir.ad, e);
            if ((e as { kesin?: boolean }).kesin || d === TOPLU_TEKRAR) break;
            topluYeniden++;
            await uyu(2_000 * 2 ** d + Math.floor(Math.random() * 1_000));
          }
        }
        if (sonHata) {
          dizi.forEach((is, i) => hataIsle(k, is, sonHata, i === 0));
          ucusta -= dizi.length;
          continue;
        }
      }
      // Log yolu: aralığın olayları TEK istekte. Şüpheli ya da okunamayan aralık eski yola düşer (blok başına bilgi).
      let loglar: Map<number, RpcLog[]> | null = null;
      if (k.logYolu && dizi.length > 1 && hazir.size === dizi.length) {
        try {
          const lo = dizi[dizi.length - 1]!.no, hi = dizi[0]!.no;
          // 429/ağ hatasında eski yola (blok başına bir istek) DÜŞMEDEN önce aralık sorgusu geri çekilmeyle yeniden denenir:
          // düşen her aralık ~100 tekil işlem-bilgisi isteği demekti (parça sonu özetinde 129 hata).
          let tum: RpcLog[] | null = null;
          for (let d = 0; tum === null; d++) {
            try { tum = await k.kaynak.loglar(lo, hi); }
            catch (e) {
              if (d >= LOG_TEKRAR || durdur) throw e;
              logYeniden++;
              await uyu(2_000 * 2 ** d + Math.floor(Math.random() * 1_000));
            }
          }
          if (logsuzAraliksupheli([...hazir.values()] as never[], tum.length)) throw new Error(`şüpheli aralık [${lo}, ${hi}]: sözleşme çağrısı var, olay yok`);
          loglar = loglariBloklaraBol(tum, lo, hi);
        } catch (e) {
          s.logYedek += dizi.length;
          if (hatalar.length < 50) hatalar.push(`log yolu → eski yol: ${(e as Error).message.slice(0, 160)}`);
        }
      }
      for (const is of dizi) {
        try {
          const onceden = hazir.get(is.no);
          const logluMu = loglar !== null && onceden !== undefined;
          const r = logluMu
            ? bloktanSatirlarLogla(onceden as never, loglar!.get(is.no) ?? [])
            : (({ blok, bilgi }) => bloktanSatirlar(blok as never, bilgi as never))(
                onceden !== undefined ? { blok: onceden, bilgi: await k.kaynak.bilgi(is.no) } : await k.kaynak.blok(is.no));
          if (logluMu) {
            s.logYoluBlok++;
            if (LOG_CAPRAZ > 0 && ++s.logCapraz % LOG_CAPRAZ === 0) await caprazDenetle(k, is.no, r, true);
          }
          if (CAPRAZ > 0 && ++caprazSayac % CAPRAZ === 0) await caprazDenetle(k, is.no, r);
          k.basarili++;
          k.ardisikHata = 0;
          s.okunan++;
          s.satir += r.satirlar.length;
          yazici.ekle(r);
        } catch (e) {
          hataIsle(k, is, e);
        } finally {
          ucusta--;
        }
      }
    }
  };

  await Promise.all(aktifler.flatMap((k) => Array.from({ length: k.eszaman }, () => isci(k))));
  // Bitişte kaynağı bekletildiği için geri kalanlar da boşluktur (bir sonraki koşu kapsamdan yeniden okur).
  hatali += geri.length;
  for (const i of geri) if (hatalar.length < 50) hatalar.push(`${i.no}: denenen ${[...i.denenen].join(",")}; kalan kaynak şu an kullanılamıyor`);
  if (sebepler.size || topluYeniden || ayniKaynakYeniden || logYeniden || s.logYedek > logYedek0) {
    const ilk = [...sebepler].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([m, n]) => `${n}× ${m}`).join(" | ");
    console.log(`${ts()} parça hata özeti: toplu yeniden ${topluYeniden} · log yeniden ${logYeniden} · eski yola düşen ${s.logYedek - logYedek0} · aynı kaynakta yeniden ${ayniKaynakYeniden} · başka kaynağa geçen ${baskaKaynagaGecen} · boşluk ${hatali}${ilk ? ` · ${ilk}` : ""}`);
  }
  return hatali;
}

// ---- ana döngü ----
for (const parca of geriyeParcalar(UST, TABAN, PARCA)) {
  if (durdur) { durmaSebebi = yazici.hata ? "yazma" : "sinyal"; break; }
  const bos = diskBos();
  if (bos < MIN_BOS) {
    console.log(`${ts()} DİSK DURDURDU: ${DISK} ${(bos / 2 ** 30).toFixed(1)} GiB boş < ${MIN_BOS / 2 ** 30} GiB. Son tamamlanan parçanın altı okunmadı.`);
    durmaSebebi = "disk";
    break;
  }
  simdikiParca = parca;
  const onceden = await okunanlar(parca);
  const bekleyen: number[] = [];
  for (let b = parca.son; b >= parca.bas; b--) if (!onceden.has(b)) bekleyen.push(b);
  s.atlanan += aralikBoyu(parca) - bekleyen.length;
  if (bekleyen.length === 0) continue;

  const hatali = await parcaOku(bekleyen);
  s.hataliBlok += hatali;
  s.parca++;
  await yazici.bosalt();
  if (yazici.hata) { durdur = true; durmaSebebi = "yazma"; }

  if (UYGULA && !yazici.hata) {
    const eksik = eksikAraliklar(parca, await okunanlar(parca));
    await geciciyseTekrarla("kursör", async () => {
      const onceki = await prisma.blockCursor.findUnique({ where: { chain: "tron" } });
      const liste = eksikleriGuncelle(onceki ? eksikListesiOku(onceki.missingRanges) : [], parca, eksik);
      await prisma.blockCursor.upsert({
        where: { chain: "tron" },
        create: { chain: "tron", missingRanges: liste, lastError: hatalar.at(-1) ?? null, lastRunAt: new Date() },
        update: { missingRanges: liste, lastError: eksik.length ? hatalar.at(-1) ?? null : undefined, lastRunAt: new Date() },
      });
    });
  }
  if (hatali > 10 && hatali / bekleyen.length > HATA_ORANI_SINIRI) {
    console.log(`${ts()} KAYNAKLAR OKUYAMIYOR: parça ${parca.son}→${parca.bas}'da ${hatali}/${bekleyen.length} blok okunamadı. Boşlukla ilerlemek yerine duruluyor.`);
    durmaSebebi = "kaynak";
    break;
  }
}
if (durdur && durmaSebebi === "taban") durmaSebebi = yazici.hata ? "yazma" : "sinyal";

await yazici.kapat();
clearInterval(ilerleme);
if (oncelikZamanlayici) clearInterval(oncelikZamanlayici);
await Promise.all(kuyruklar.map((q) => q.close()));
redis?.disconnect();

const sure = (Date.now() - t0) / 1000;
console.log(
  `\n${ts()} bitti: ${durmaSebebi} · ${sure.toFixed(0)} sn · okunan ${s.okunan.toLocaleString("tr")} blok (${(s.okunan / Math.max(sure, 0.001)).toFixed(2)} blok/sn) · ` +
  `önceden okunmuş ${s.atlanan.toLocaleString("tr")} · ${s.satir.toLocaleString("tr")} satır · boşluk ${s.hataliBlok}`,
);
if (LOG_YOLU) console.log(`log yolu: ${s.logYoluBlok} blok · ${s.logYedek} blok eski yola düştü`);
console.log(`çapraz denetim: ${s.caprazDenetim} karşılaştırıldı · ${s.caprazUyusmaz} UYUŞMAZ · ${s.caprazAtlanan} atlandı (ikinci kaynak yoktu ya da okuyamadı)`);
for (const k of aktifler) console.log(`  ${k.sinir.ad}: ${k.basarili} blok · ${k.hata} hata · ${k.kaynak.sayac.istek} istek${k.sonHata ? ` · son hata: ${k.sonHata}` : ""}`);
if (hatalar.length) console.log(`boşluk örnekleri:\n  ${hatalar.slice(0, 20).join("\n  ")}`);
if (yazici.hata) console.error(`YAZMA HATASI: ${(yazici.hata as Error).message}`);
await prisma.$disconnect();
process.exit(durmaSebebi === "disk" ? 3 : durmaSebebi === "taban" && s.hataliBlok === 0 ? 0 : 1);
