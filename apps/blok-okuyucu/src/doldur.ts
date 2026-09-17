/**
 * Geçmiş doldurucu (B3) — kesinleşmiş uçtan GERİYE doğru, birden çok ücretsiz kaynaktan, disk dolana kadar.
 *
 *   node --env-file=.env --env-file=apps/web/.env.local --import tsx apps/blok-okuyucu/src/doldur.ts \
 *     [--uygula] [--ust=<blok>] [--taban=1] [--parca=10000] [--kaynaklar=publicnode,tronstack,trongrid] \
 *     [--minBosGB=50] [--disk=D:\][--capraz=500] [--ilerlemeSn=10] [--<kaynak>Ms=…] [--<kaynak>Es=…]
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
 */
import { statfsSync } from "node:fs";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import {
  ayarOku, sorgu, bloktanSatirlar, aralikBoyu, eksikAraliklar, eksikleriGuncelle, eksikListesiOku,
  geriyeParcalar, kaynakUygunMu, satirIzi, SEMALAR, KAPSAM_TABLO, type Aralik, type AyristirmaSonucu, type KaynakSiniri,
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
const SECILEN = (deger("kaynaklar") ?? "publicnode,tronstack,trongrid").split(",").map((x) => x.trim()).filter(Boolean);
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
  oncelikli: boolean;
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
  else if (ad === "trongrid") kaynak = new TronBlokKaynagi(KAYNAKLAR.trongrid(process.env.TRONGRID_API_KEY, sayi("trongridMs", 120)));
  else { console.error(`bilinmeyen kaynak: ${ad}`); process.exit(2); }
  let enEski: number | null = null;
  if (ad !== "trongrid") {
    try {
      enEski = await kaynak.enEskiBlok(kesin);
      // Sınır zamanla İLERLİYOR (publicnode ~92 günü tutuyor): bir günlük pay.
      if (enEski !== null) enEski += 28_800;
    } catch (e) { console.error(`${ad} yoklanamadı, kullanılmıyor: ${(e as Error).message}`); continue; }
  }
  aktifler.push({ kaynak, sinir: { ad, enEski }, eszaman: sayi(`${ad}Es`, ad === "publicnode" ? 4 : 2), oncelikli: ad === "trongrid", basarili: 0, hata: 0, ardisikHata: 0, bekleyeKadar: 0 });
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
  console.log(`  kaynak ${k.sinir.ad}: ${k.sinir.enEski === null ? "tam geçmiş" : `en eski ${k.sinir.enEski}`} · ${k.eszaman} eşzaman${k.oncelikli ? " · worker kuyruğu boşken" : ""}`);
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
const s = { okunan: 0, atlanan: 0, satir: 0, hataliBlok: 0, caprazDenetim: 0, caprazUyusmaz: 0, caprazAtlanan: 0, parca: 0 };
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
    return `${k.sinir.ad} ${k.basarili}/${k.hata}h${not}`;
  }).join(" · ");
  console.log(
    `${ts()} parça ${simdikiParca ? `${simdikiParca.son}→${simdikiParca.bas}` : "-"} · okunan ${s.okunan.toLocaleString("tr")} · ` +
    `yazılan ${yazici.yazilan.toLocaleString("tr")} · ${hiz.toFixed(2)} blok/sn · ${s.satir.toLocaleString("tr")} satır · ${kaynakDurumu}` +
    (s.hataliBlok ? ` · BOŞLUK ${s.hataliBlok}` : "") + (s.caprazUyusmaz ? ` · ÇAPRAZ UYUŞMAZ ${s.caprazUyusmaz}` : "") +
    ` · disk ${(diskBos() / 2 ** 30).toFixed(0)} GiB boş · aşağısı ~${hiz > 0 ? (kalanBlok / hiz / 86_400).toFixed(1) : "?"} gün`,
  );
}, sayi("ilerlemeSn", 10) * 1_000);

// ---- bir parça ----
type Is = { no: number; denenen: Set<string> };
const musait = (k: Aktif) => k.bekleyeKadar <= Date.now() && !(k.oncelikli && mesgul);

async function caprazDenetle(k: Aktif, no: number, r: AyristirmaSonucu): Promise<void> {
  const diger = aktifler.find((x) => x !== k && musait(x) && kaynakUygunMu(x.sinir, no));
  if (!diger) { s.caprazAtlanan++; return; }
  let r2: AyristirmaSonucu;
  try {
    const { blok, bilgi } = await diger.kaynak.blok(no);
    r2 = bloktanSatirlar(blok as never, bilgi as never);
  } catch { s.caprazAtlanan++; return; }
  s.caprazDenetim++;
  if (satirIzi(r2) !== satirIzi(r)) {
    s.caprazUyusmaz++;
    throw Object.assign(new Error(`çapraz denetim uyuşmadı: ${k.sinir.ad} ${r.satirlar.length} satır, ${diger.sinir.ad} ${r2.satirlar.length} satır`), { kesin: true });
  }
}

async function parcaOku(bekleyen: number[]): Promise<number> {
  const ana: Is[] = bekleyen.map((no) => ({ no, denenen: new Set() }));
  const geri: Is[] = [];
  let anaSira = 0;
  let ucusta = 0;
  let hatali = 0;
  let caprazSayac = 0;

  const al = (k: Aktif): Is | undefined => {
    const gi = geri.findIndex((i) => !i.denenen.has(k.sinir.ad) && kaynakUygunMu(k.sinir, i.no));
    if (gi >= 0) return geri.splice(gi, 1)[0];
    const i = ana[anaSira];
    if (i && kaynakUygunMu(k.sinir, i.no)) { anaSira++; return i; }
    return undefined;
  };
  // Parça bitti: yeni iş yok, uçuşta iş yok, geri dönenlerin hiçbiri ŞU AN kullanılabilir bir kaynağa gidemiyor.
  // (Ana kuyrukta iş kaldıysa, onu alabilecek kaynak bekletiliyor olsa da parça BİTMEZ — beklenir.)
  const bitti = () => anaSira >= ana.length && ucusta === 0 &&
    geri.every((i) => !aktifler.some((k) => musait(k) && !i.denenen.has(k.sinir.ad) && kaynakUygunMu(k.sinir, i.no)));

  const isci = async (k: Aktif) => {
    for (;;) {
      if (durdur) return;
      const is = musait(k) ? al(k) : undefined;
      if (!is) { if (bitti()) return; await uyu(200); continue; }
      ucusta++;
      try {
        const { blok, bilgi } = await k.kaynak.blok(is.no);
        const r = bloktanSatirlar(blok as never, bilgi as never);
        if (CAPRAZ > 0 && ++caprazSayac % CAPRAZ === 0) await caprazDenetle(k, is.no, r);
        k.basarili++;
        k.ardisikHata = 0;
        s.okunan++;
        s.satir += r.satirlar.length;
        yazici.ekle(r);
      } catch (e) {
        const mesaj = (e as Error).message.slice(0, 200);
        k.hata++;
        k.sonHata = mesaj;
        if (++k.ardisikHata >= 20) {
          k.bekleyeKadar = Date.now() + 60_000;
          k.ardisikHata = 0;
          console.log(`${ts()} ${k.sinir.ad} 20 ardışık hata — 60 sn bekletiliyor. Son: ${mesaj}`);
        }
        is.denenen.add(k.sinir.ad);
        const baskaKaynak = !(e as { kesin?: boolean }).kesin && aktifler.some((x) => !is.denenen.has(x.sinir.ad) && kaynakUygunMu(x.sinir, is.no));
        if (baskaKaynak) geri.push(is);
        else { hatali++; if (hatalar.length < 50) hatalar.push(`${is.no}: ${mesaj}`); }
      } finally {
        ucusta--;
      }
    }
  };

  await Promise.all(aktifler.flatMap((k) => Array.from({ length: k.eszaman }, () => isci(k))));
  // Bitişte kaynağı bekletildiği için geri kalanlar da boşluktur (bir sonraki koşu kapsamdan yeniden okur).
  hatali += geri.length;
  for (const i of geri) if (hatalar.length < 50) hatalar.push(`${i.no}: denenen ${[...i.denenen].join(",")}; kalan kaynak şu an kullanılamıyor`);
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
console.log(`çapraz denetim: ${s.caprazDenetim} karşılaştırıldı · ${s.caprazUyusmaz} UYUŞMAZ · ${s.caprazAtlanan} atlandı (ikinci kaynak yoktu ya da okuyamadı)`);
for (const k of aktifler) console.log(`  ${k.sinir.ad}: ${k.basarili} blok · ${k.hata} hata · ${k.kaynak.sayac.istek} istek${k.sonHata ? ` · son hata: ${k.sonHata}` : ""}`);
if (hatalar.length) console.log(`boşluk örnekleri:\n  ${hatalar.slice(0, 20).join("\n  ")}`);
if (yazici.hata) console.error(`YAZMA HATASI: ${(yazici.hata as Error).message}`);
await prisma.$disconnect();
process.exit(durmaSebebi === "disk" ? 3 : durmaSebebi === "taban" && s.hataliBlok === 0 ? 0 : 1);
