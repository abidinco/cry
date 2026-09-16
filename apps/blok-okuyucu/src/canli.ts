/**
 * Canlı uç okuyucu (B4) — kesinleşen her yeni bloğu yazar; sürekli çalışır, konteynerde `cry-blok-okuyucu`.
 *
 *   node --env-file=.env --env-file=apps/web/.env.local --import tsx apps/blok-okuyucu/src/canli.ts \
 *     [--uygula] [--baslangic=<blok>] [--yoklamaMs=3000] [--eszaman=4] [--ilerlemeSn=60] [--nabiz=<dosya>]
 *
 * Ölçüm kapısı (scripts/olcum/b4-kapi.mts, 2026-09-17, 10 dk / 188 blok):
 * - publicnode'un kesinleşmiş ucu hiç GERİ gitmedi, TronGrid'in 1–2 blok önünde; okunan 188 blok TronGrid'le
 *   satır satır AYNI. TronGrid kotasına dokunmadığı için birincil kaynak o, TronGrid yedek.
 * - Yeni kesinleşen blokta işlem bilgisi 188'in 4'ünde EKSİK geldi ve 3–13 sn içinde tamamlandı. Eşleşme
 *   kuralı bunu yakalar; okuyucu bloğu atlamaz, bekleyip yeniden okur.
 * - tronstack uçta işe yaramıyor (178/178 blok 30 sn sonra da eksik) — kullanılmaz.
 * - Zincire gecikme: blok zaman damgasından ~55 sn (19 blokluk kesinleşme).
 *
 * Kurallar:
 * - Kursör (`block_cursors.last_final_block`) yalnızca KESİNTİSİZ okunmuş bloklar kadar ilerler; okunamayan
 *   blok atlanmaz, ilerleme orada durur ve gecikme büyür (günlükte görünür). Boşlukla ilerlemek, "canlı uç
 *   boşluksuz" iddiasını sessizce bozardı.
 * - İlk açılış: kursör boşsa kapsam tablosundaki en yüksek bloktan devam eder (B3 doldurucusu uçtan başlayıp
 *   geriye indiği için bu, onun başladığı yerdir); o da yoksa kesinleşmiş uçtan.
 * - Durdurma (docker stop → SIGTERM): eldeki bloklar yazılır, kursör kaydedilir, 0 ile çıkılır.
 * - Nabız: her başarılı yoklamada `--nabiz` dosyasına zaman yazılır; konteynerin sağlık denetimi ona bakar.
 * - ClickHouse/Postgres yeniden başlarken (her deploy'da oluyor) yazıcı ve kursör yazımı bekleyip yeniden dener.
 */
import { writeFileSync } from "node:fs";
import { ayarOku, sorgu, bloktanSatirlar, bitisikKursor, SEMALAR, KAPSAM_TABLO, type AyristirmaSonucu } from "@cry/blok-indeks";
import { prisma } from "@cry/db";
import { KAYNAKLAR, TronBlokKaynagi } from "./kaynak.js";
import { Yazici, geciciyseTekrarla } from "./yazici.js";

const deger = (ad: string) => process.argv.find((x) => x.startsWith(`--${ad}=`))?.split("=").slice(1).join("=");
const sayi = (ad: string, vars: number) => {
  const d = deger(ad);
  if (d === undefined) return vars;
  const n = Number(d);
  if (!Number.isFinite(n)) { console.error(`--${ad} sayı değil: ${d}`); process.exit(2); }
  return n;
};
const UYGULA = process.argv.includes("--uygula");
const YOKLAMA = sayi("yoklamaMs", 3_000);
const ESZAMAN = sayi("eszaman", 4);
const NABIZ = deger("nabiz") ?? (process.platform === "win32" ? "" : "/tmp/canli-nabiz");
/** Bir turda en çok bu kadar blok okunur (geride kalınca yakalama), sonra yazılıp kursör kaydedilir. */
const TUR_BLOK = 200;
/** Kursör Postgres'e en sık bu aralıkla yazılır (uçta her 3 sn'de bir yazmaya gerek yok). */
const KURSOR_MS = 30_000;
/** Yeni kesinleşen blokta bilgi eksik gelebiliyor (ölçüldü: 3–13 sn): yedeğe geçmeden önce birincil kaç kez beklenir. */
const BIRINCIL_DENEME = 5;
const uyu = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString().slice(0, 19).replace("T", " ");

const a = ayarOku();
const birincil = new TronBlokKaynagi(KAYNAKLAR.publicnode(sayi("publicnodeMs", 60)));
const yedek = new TronBlokKaynagi(KAYNAKLAR.trongrid(process.env.TRONGRID_API_KEY, sayi("trongridMs", 120)));

// ---- durdurma ----
let durdur = false;
const sinyalde = (ad: string) => {
  if (durdur) { console.error(`${ad} (ikinci): beklemeden çıkılıyor`); process.exit(130); }
  durdur = true;
  console.log(`${ts()} ${ad}: durduruluyor — eldeki bloklar yazılıp kursör kaydedilecek`);
  // docker stop 30 sn bekliyor; takılan bir istek yüzünden SIGKILL yemektense 25 sn'de kendimiz çıkarız.
  // Kapsam kuralı sayesinde bu da güvenli: yazılmamış blok "okunmadı" kalır ve yeniden okunur.
  setTimeout(() => { console.error(`${ts()} 25 sn'de kapanamadı, çıkılıyor`); process.exit(1); }, 25_000).unref();
};
process.on("SIGINT", () => sinyalde("SIGINT"));
process.on("SIGTERM", () => sinyalde("SIGTERM"));

// ---- uç ----
async function ucOku(): Promise<number> {
  try { return await birincil.kesinlesmisBlok(); }
  catch (e) {
    console.log(`${ts()} ${birincil.ad} ucu okunamadı, ${yedek.ad} soruluyor: ${(e as Error).message.slice(0, 100)}`);
    return yedek.kesinlesmisBlok();
  }
}

// ---- başlangıç ----
if (UYGULA) for (const sql of SEMALAR) await geciciyseTekrarla("şema", () => sorgu(a, sql));
const kayit = await geciciyseTekrarla("kursör", () => prisma.blockCursor.findUnique({ where: { chain: "tron" } }));
let kursor: number;
let nereden: string;
const baslangic = deger("baslangic");
if (baslangic !== undefined) { kursor = sayi("baslangic", 0) - 1; nereden = "--baslangic"; }
else if (kayit?.lastFinalBlock != null) { kursor = kayit.lastFinalBlock; nereden = "block_cursors.last_final_block"; }
else {
  const enYuksek = Number((await geciciyseTekrarla("kapsam", () => sorgu(a, `SELECT max(blok) FROM ${KAPSAM_TABLO} FORMAT TSV`))).trim());
  if (enYuksek > 0) { kursor = enYuksek; nereden = "kapsam tablosunun en yüksek bloğu"; }
  else { kursor = (await ucOku()) - 1; nereden = "kesinleşmiş uç (kapsam boş)"; }
}
console.log(`${ts()} canlı uç · kursör ${kursor} (${nereden}) · ${UYGULA ? "YAZILIYOR" : "KURU (yazılmaz; --uygula)"} · birincil ${birincil.ad}, yedek ${yedek.ad} · yoklama ${YOKLAMA} ms`);

const yazici = new Yazici(a, UYGULA, () => { durdur = true; });
const s = { blok: 0, satir: 0, birincil: 0, yedek: 0, eksikBilgiBekleme: 0, inatci: 0, sonUc: 0, sonZaman: 0, sonKursorYazimi: 0 };

// ---- bir bloğu, okunana kadar ----
async function blokOku(no: number): Promise<AyristirmaSonucu | null> {
  for (let tur = 0; !durdur; tur++) {
    for (let i = 0; i < BIRINCIL_DENEME && !durdur; i++) {
      try {
        const { blok, bilgi } = await birincil.blok(no);
        const r = bloktanSatirlar(blok as never, bilgi as never);
        s.birincil++;
        return r;
      } catch (e) {
        if (/işlem bilgisi/.test((e as Error).message)) s.eksikBilgiBekleme++;
        await uyu(3_000);
      }
    }
    if (durdur) break;
    try {
      const { blok, bilgi } = await yedek.blok(no);
      const r = bloktanSatirlar(blok as never, bilgi as never);
      s.yedek++;
      return r;
    } catch (e) {
      s.inatci++;
      const bekle = Math.min(60_000, 5_000 * 2 ** tur);
      console.log(`${ts()} blok ${no} iki kaynaktan da okunamadı (tur ${tur + 1}), ${bekle / 1000} sn sonra yeniden — kursör burada bekliyor: ${(e as Error).message.slice(0, 120)}`);
      await uyu(bekle);
    }
  }
  return null;
}

async function kursoruYaz(zorla = false) {
  if (!UYGULA) return;
  if (!zorla && Date.now() - s.sonKursorYazimi < KURSOR_MS) return;
  await geciciyseTekrarla("kursör", () => prisma.blockCursor.upsert({
    where: { chain: "tron" },
    create: { chain: "tron", lastFinalBlock: kursor, lastRunAt: new Date() },
    update: { lastFinalBlock: kursor, lastRunAt: new Date() },
  }));
  s.sonKursorYazimi = Date.now();
}

const ilerleme = setInterval(() => {
  const geride = s.sonUc - kursor;
  const gecikme = s.sonZaman ? Math.round(Date.now() / 1000 - s.sonZaman) : NaN;
  console.log(
    `${ts()} uç ${s.sonUc} · kursör ${kursor} · geride ${geride} blok · zincire gecikme ${Number.isFinite(gecikme) ? `${gecikme} sn` : "?"} · ` +
    `yazılan ${yazici.yazilan} blok / ${s.satir.toLocaleString("tr")} satır · ${birincil.ad} ${s.birincil} · ${yedek.ad} ${s.yedek}` +
    (s.eksikBilgiBekleme ? ` · eksik bilgi beklemesi ${s.eksikBilgiBekleme}` : "") + (s.inatci ? ` · İKİ KAYNAKTAN DA OKUNAMAYAN deneme ${s.inatci}` : ""),
  );
}, sayi("ilerlemeSn", 60) * 1_000);

// ---- ana döngü ----
while (!durdur) {
  let uc: number;
  try { uc = await ucOku(); }
  catch (e) {
    console.log(`${ts()} uç hiçbir kaynaktan okunamadı: ${(e as Error).message.slice(0, 120)}`);
    await uyu(YOKLAMA * 5);
    continue;
  }
  s.sonUc = Math.max(s.sonUc, uc);
  if (NABIZ) { try { writeFileSync(NABIZ, String(Date.now())); } catch { /* nabız sağlığı etkilemez */ } }
  if (uc <= kursor) { await kursoruYaz(); await uyu(YOKLAMA); continue; }

  const hedef = Math.min(uc, kursor + TUR_BLOK);
  const bloklar = Array.from({ length: hedef - kursor }, (_, i) => kursor + 1 + i);
  const okunan = new Map<number, AyristirmaSonucu>();
  let sira = 0;
  await Promise.all(Array.from({ length: Math.min(ESZAMAN, bloklar.length) }, async () => {
    while (!durdur) {
      const no = bloklar[sira++];
      if (no === undefined) return;
      const r = await blokOku(no);
      if (r) okunan.set(no, r);
    }
  }));
  // Sırayla ekle: yazıcı partileri sıralı yazsın (kapsam sırası tekillik için şart değil, günlük okunur olsun).
  for (const no of [...okunan.keys()].sort((x, y) => x - y)) {
    const r = okunan.get(no)!;
    yazici.ekle(r);
    s.satir += r.satirlar.length;
  }
  await yazici.bosalt();
  if (yazici.hata) break;
  const yeni = bitisikKursor(kursor, new Set(okunan.keys()));
  if (yeni > kursor) s.sonZaman = okunan.get(yeni)!.zaman;
  kursor = yeni;
  s.blok += okunan.size;
  await kursoruYaz(durdur);
}

await yazici.kapat();
clearInterval(ilerleme);
if (!yazici.hata) await kursoruYaz(true).catch((e) => console.error(`kursör yazılamadı: ${(e as Error).message}`));
console.log(`${ts()} çıkış · kursör ${kursor} · bu oturumda ${s.blok} blok · ${yazici.hata ? `YAZMA HATASI: ${(yazici.hata as Error).message}` : "temiz"}`);
await prisma.$disconnect();
process.exit(yazici.hata ? 1 : 0);
