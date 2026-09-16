/**
 * Blok okuyucu (B2) — tek bir kesinleşmiş aralığı TronGrid'den okuyup ClickHouse'a yazar.
 *
 *   node --env-file=.env --env-file=apps/web/.env.local --import tsx apps/blok-okuyucu/src/oku.ts \
 *     --aralik=86000000-86000999 [--uygula] [--yeniden] [--eszaman=4] [--aralikMs=120]
 *
 * - Varsayılan KURU: bloklar okunur ve sayılır, hiçbir şey yazılmaz.
 * - Yeniden başlatılabilir: `blok_okundu`da kaydı olan blok atlanır (`--yeniden` hepsini yazar;
 *   tekillik bunu zararsız kılar). Kapsam satırı transfer satırlarından SONRA yazılır.
 * - Durdurma: Ctrl+C / SIGTERM → eldeki bloklar yazılır, kapsam kaydedilir, çıkılır. İkinci
 *   sinyal beklemeden çıkar (yazılmamış bloklar "okunmadı" kalır, boşluk listesine düşer).
 * - İlerleme saniyede bir satır.
 * - Tur sonunda boşluklar `blok_okundu`dan HESAPLANIR ve Postgres'teki `block_cursors.missing_ranges`e
 *   yazılır. `last_final_block` bu komutta DEĞİŞMEZ: o canlı ucun (B4) yüksek su işaretidir ve
 *   rastgele bir geçmiş aralığı onu ilerletemez.
 */
import {
  ayarOku, sorgu, bloktanSatirlar, araligiCoz, aralikBoyu, eksikAraliklar,
  eksikleriGuncelle, eksikListesiOku, SEMALAR, KAPSAM_TABLO, type Ayar,
} from "@cry/blok-indeks";
import { prisma } from "@cry/db";
import { TronBlokKaynagi } from "./kaynak.js";
import { Yazici } from "./yazici.js";

const deger = (ad: string) => process.argv.find((a) => a.startsWith(`--${ad}=`))?.split("=")[1];
const bayrak = (ad: string) => process.argv.includes(`--${ad}`);

const aralikMetni = deger("aralik");
if (!aralikMetni) {
  console.error("kullanım: oku.ts --aralik=BAS-SON [--uygula] [--yeniden] [--eszaman=4] [--aralikMs=120]");
  process.exit(2);
}
const ARALIK = araligiCoz(aralikMetni);
const UYGULA = bayrak("uygula");
const YENIDEN = bayrak("yeniden");
const ESZAMAN = Number(deger("eszaman") ?? 4);

const a: Ayar = ayarOku();
const kaynak = new TronBlokKaynagi({ apiKey: process.env.TRONGRID_API_KEY, aralikMs: Number(deger("aralikMs") ?? 120) });

const kesin = await kaynak.kesinlesmisBlok();
if (ARALIK.son > kesin) {
  console.error(`aralık kesinleşmemiş bölgeye taşıyor: son ${ARALIK.son} > kesinleşmiş ${kesin}. Yeniden düzenlenebilir blok yazılmaz.`);
  process.exit(2);
}

if (UYGULA) for (const sql of SEMALAR) await sorgu(a, sql);

async function okunanlar(): Promise<Set<number>> {
  const var_ = (await sorgu(a, `EXISTS TABLE ${KAPSAM_TABLO} FORMAT TSV`)).trim() === "1";
  if (!var_) return new Set();
  const tsv = await sorgu(a, `SELECT blok FROM ${KAPSAM_TABLO} WHERE blok BETWEEN ${ARALIK.bas} AND ${ARALIK.son} FORMAT TSV`);
  return new Set(tsv.split("\n").filter(Boolean).map(Number));
}

const oncedenOkunan = await okunanlar();
const bekleyen: number[] = [];
for (let b = ARALIK.bas; b <= ARALIK.son; b++) if (YENIDEN || !oncedenOkunan.has(b)) bekleyen.push(b);
const toplam = bekleyen.length;

console.log(
  `aralık ${ARALIK.bas}–${ARALIK.son} (${aralikBoyu(ARALIK)} blok) · kesinleşmiş uç ${kesin} · ` +
  `önceden okunmuş ${oncedenOkunan.size} · okunacak ${toplam} · ${UYGULA ? "YAZILIYOR" : "KURU (yazılmaz; --uygula)"}${YENIDEN ? " · --yeniden" : ""}`,
);

// ---- durdurma ----
let durdur = false;
let sinyal = 0;
const sinyalde = () => {
  sinyal++;
  if (sinyal > 1) { console.error("\nikinci sinyal: beklemeden çıkılıyor"); process.exit(130); }
  durdur = true;
  console.error("\ndurduruluyor — eldeki bloklar yazılıp çıkılacak (beklemeden çıkmak için tekrar)");
};
process.on("SIGINT", sinyalde);
process.on("SIGTERM", sinyalde);

// ---- sayaçlar ----
const s = { okunan: 0, satir: 0, trx: 0, usdt: 0, islem: 0, basarisiz: 0, transferOlmayan: 0, kapsamDisi: 0, hataliBlok: 0 };
const hatalar: string[] = [];
const t0 = Date.now();

// ---- yazma: seri, tamponlu (yazici.ts) ----
const yazici = new Yazici(a, UYGULA, () => { durdur = true; });

// ---- ilerleme ----
const ilerleme = setInterval(() => {
  const sn = (Date.now() - t0) / 1000;
  const hiz = s.okunan / Math.max(sn, 0.001);
  const kalan = hiz > 0 ? Math.round((toplam - s.okunan) / hiz) : NaN;
  console.log(
    `  ${s.okunan}/${toplam} blok · ${UYGULA ? `yazılan ${yazici.yazilan} · ` : ""}${s.satir.toLocaleString("tr")} satır · ` +
    `${hiz.toFixed(2)} blok/sn · kalan ~${Number.isFinite(kalan) ? kalan : "?"} sn · istek ${kaynak.sayac.istek}` +
    (kaynak.sayac.sekilHatasi ? ` · şekil hatası ${kaynak.sayac.sekilHatasi}` : "") + (s.hataliBlok ? ` · HATALI BLOK ${s.hataliBlok}` : ""),
  );
}, 1_000);

// ---- okuma ----
let sira = 0;
await Promise.all(Array.from({ length: Math.max(1, ESZAMAN) }, async () => {
  while (!durdur) {
    const no = bekleyen[sira++];
    if (no === undefined) return;
    try {
      const { blok, bilgi } = await kaynak.blok(no);
      const r = bloktanSatirlar(blok as never, bilgi as never);
      s.okunan++;
      s.satir += r.satirlar.length;
      for (const x of r.satirlar) x.varlik === "TRX" ? s.trx++ : s.usdt++;
      s.islem += r.sayac.islem;
      s.basarisiz += r.sayac.basarisizIslem;
      s.transferOlmayan += r.sayac.transferOlmayanOlay;
      s.kapsamDisi += r.sayac.kapsamDisiToken;
      yazici.ekle(r);
    } catch (e) {
      // Tek bir bloğun hatası turu düşürmez; blok kapsam kaydı ALMAZ ve boşluk listesine düşer.
      s.hataliBlok++;
      if (hatalar.length < 20) hatalar.push(`${no}: ${(e as Error).message.slice(0, 200)}`);
    }
  }
}));
await yazici.kapat();
clearInterval(ilerleme);
const yazmaHatasi = yazici.hata;

const sure = (Date.now() - t0) / 1000;
console.log(
  `\nokunan ${s.okunan}/${toplam} blok · ${sure.toFixed(1)} sn · ${(s.okunan / Math.max(sure, 0.001)).toFixed(2)} blok/sn · ` +
  `istek ${kaynak.sayac.istek} · şekil hatası ${kaynak.sayac.sekilHatasi}`,
);
console.log(
  `satır ${s.satir.toLocaleString("tr")} (TRX ${s.trx.toLocaleString("tr")} · USDT ${s.usdt.toLocaleString("tr")}) · ` +
  `blok başına ${(s.satir / Math.max(s.okunan, 1)).toFixed(1)} · işlem ${s.islem.toLocaleString("tr")}`,
);
console.log(`elenen: başarısız işlem ${s.basarisiz} · Transfer olmayan olay ${s.transferOlmayan} · USDT dışı token ${s.kapsamDisi}`);
if (hatalar.length) console.log(`hatalı bloklar (${s.hataliBlok}):\n  ${hatalar.join("\n  ")}`);
if (yazmaHatasi) console.error(`YAZMA HATASI — tur durduruldu: ${(yazmaHatasi as Error).message}`);

let cikis = durdur || s.hataliBlok || yazmaHatasi ? 1 : 0;

if (UYGULA) {
  // Boşluklar yazılana bakılarak HESAPLANIR — sayaçlara güvenilmez.
  const eksik = eksikAraliklar(ARALIK, await okunanlar());
  const eksikBlok = eksik.reduce((t, r) => t + aralikBoyu(r), 0);
  const onceki = await prisma.blockCursor.findUnique({ where: { chain: "tron" } });
  const yeniListe = eksikleriGuncelle(onceki ? eksikListesiOku(onceki.missingRanges) : [], ARALIK, eksik);
  const sonHata = yazmaHatasi ? `yazma: ${(yazmaHatasi as Error).message}` : hatalar[0] ?? (durdur ? "durduruldu" : null);
  await prisma.blockCursor.upsert({
    where: { chain: "tron" },
    create: { chain: "tron", missingRanges: yeniListe, lastError: sonHata, lastRunAt: new Date() },
    update: { missingRanges: yeniListe, lastError: sonHata, lastRunAt: new Date() },
  });
  console.log(
    `kapsam: aralıkta ${aralikBoyu(ARALIK) - eksikBlok}/${aralikBoyu(ARALIK)} blok okunmuş · boşluk ${eksik.length} öbek / ${eksikBlok} blok` +
    ` · kursörün eksik listesi ${yeniListe.length} öbek`,
  );
  if (eksikBlok) cikis = 1;
}
await prisma.$disconnect();
process.exit(cikis);
