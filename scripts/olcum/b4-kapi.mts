// B4 ölçüm kapısı (2026-09-17): canlı uç okuyucusunun üç varsayımı.
//   A) Kesinleşmiş uç (/walletsolidity/getnowblock) kaynak başına: GERİ gidiyor mu (yük dengeleyici arkasında
//      farklı düğümler), kaynaklar arası fark kaç blok, uç ne sıklıkla ilerliyor?
//   B) Uç ilerler ilerlemez yeni bloğu AYNI kaynaktan okumak: işlem bilgisi tam mı (eşleşme kuralı),
//      TronGrid'in okuduğuyla satır satır aynı mı? Tam değilse kaç sn sonra tamamlanıyor?
//   C) Gecikme: bloğun zaman damgasından kesinleşmiş uçta görünmesine kadar geçen süre.
// Çalıştır:
//   node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/b4-kapi.mts [--dakika=10] [--yoklamaMs=3000]
import { bloktanSatirlar, satirIzi } from "@cry/blok-indeks";

const arg = (ad: string, vars: number) => Number(process.argv.find((a) => a.startsWith(`--${ad}=`))?.split("=")[1] ?? vars);
const DAKIKA = arg("dakika", 10), YOKLAMA = arg("yoklamaMs", 3000);
const K = process.env.TRONGRID_API_KEY ?? "";
type Kaynak = { ad: string; url: string; h: Record<string, string> };
const KAYNAKLAR: Kaynak[] = [
  { ad: "trongrid", url: "https://api.trongrid.io", h: K ? { "TRON-PRO-API-KEY": K } : {} },
  { ad: "publicnode", url: "https://tron-rpc.publicnode.com", h: {} },
  { ad: "tronstack", url: "https://api.tronstack.io", h: {} },
];
const uyu = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function post(k: Kaynak, yol: string, govde: unknown): Promise<any> {
  const r = await fetch(k.url + yol, { method: "POST", headers: { "Content-Type": "application/json", ...k.h }, body: JSON.stringify(govde), signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function oku(k: Kaynak, no: number) {
  const [blok, bilgi] = await Promise.all([post(k, "/wallet/getblockbynum", { num: no }), post(k, "/wallet/gettransactioninfobyblocknum", { num: no })]);
  if (typeof blok?.block_header?.raw_data?.number !== "number" || !Array.isArray(bilgi)) throw new Error(`şekil bozuk (blok ${JSON.stringify(blok).slice(0, 40)})`);
  return bloktanSatirlar(blok, bilgi);
}

type Durum = {
  yoklama: number; hata: number; geri: number; enBuyukGeri: number; enYuksek: number; ilerleme: number[];
  ilkOkumaTamam: number; ilkOkumaEksik: number; sonraTamam: number; sonraEksik: number; tamamlanmaSn: number[];
  tgIleAyni: number; tgIleFarkli: number; gecikmeSn: number[]; farkTG: number[];
};
const d = new Map<string, Durum>(KAYNAKLAR.map((k) => [k.ad, { yoklama: 0, hata: 0, geri: 0, enBuyukGeri: 0, enYuksek: 0, ilerleme: [], ilkOkumaTamam: 0, ilkOkumaEksik: 0, sonraTamam: 0, sonraEksik: 0, tamamlanmaSn: [], tgIleAyni: 0, tgIleFarkli: 0, gecikmeSn: [], farkTG: [] }]));
const sonUc = new Map<string, number>();
const tgIzleri = new Map<number, string>();
const bekleyenIsler: Promise<void>[] = [];
const bitis = Date.now() + DAKIKA * 60_000;
let tur = 0;

console.log(`${DAKIKA} dk · yoklama ${YOKLAMA} ms · kaynaklar ${KAYNAKLAR.map((k) => k.ad).join(", ")}`);
while (Date.now() < bitis) {
  const t0 = Date.now();
  const uclar = await Promise.all(KAYNAKLAR.map(async (k) => {
    const s = d.get(k.ad)!;
    s.yoklama++;
    try {
      const j = await post(k, "/walletsolidity/getnowblock", {});
      const no = j?.block_header?.raw_data?.number;
      if (typeof no !== "number") throw new Error("şekil");
      return { k, no, zaman: j.block_header.raw_data.timestamp as number };
    } catch { s.hata++; return null; }
  }));
  const tg = uclar[0]?.no;
  for (const u of uclar) {
    if (!u) continue;
    const s = d.get(u.k.ad)!;
    if (tg !== undefined) s.farkTG.push(u.no - tg);
    if (u.no < s.enYuksek) { s.geri++; s.enBuyukGeri = Math.max(s.enBuyukGeri, s.enYuksek - u.no); continue; }
    const onceki = sonUc.get(u.k.ad);
    if (onceki !== undefined && u.no > onceki) {
      s.ilerleme.push(u.no - onceki);
      s.gecikmeSn.push((Date.now() - u.zaman) / 1000);
      const no = u.no;
      // B) Yeni kesinleşen bloğu hemen, aynı kaynaktan oku. TronGrid'de her bloğu, diğerlerinde de her bloğu
      // (uç hızı 1 blok/3 sn — istek sayısı küçük).
      bekleyenIsler.push((async () => {
        const basla = Date.now();
        let iz: string | null = null;
        try { iz = satirIzi(await oku(u.k, no)); s.ilkOkumaTamam++; } catch { s.ilkOkumaEksik++; }
        if (iz === null) {
          for (let i = 0; i < 10 && iz === null; i++) {
            await uyu(3_000);
            try { iz = satirIzi(await oku(u.k, no)); s.tamamlanmaSn.push((Date.now() - basla) / 1000); } catch { /* sürer */ }
          }
          iz === null ? s.sonraEksik++ : s.sonraTamam++;
        }
        if (iz === null) return;
        if (u.k.ad === "trongrid") { tgIzleri.set(no, iz); return; }
        // TronGrid'in izi 30 sn içinde gelmezse kendimiz okuruz.
        for (let i = 0; i < 10 && !tgIzleri.has(no); i++) await uyu(3_000);
        let ref = tgIzleri.get(no);
        if (ref === undefined) { try { ref = satirIzi(await oku(KAYNAKLAR[0]!, no)); } catch { return; } }
        ref === iz ? s.tgIleAyni++ : s.tgIleFarkli++;
      })());
    }
    if (onceki === undefined || u.no > onceki) sonUc.set(u.k.ad, u.no);
    s.enYuksek = Math.max(s.enYuksek, u.no);
  }
  if (++tur % 20 === 0) console.log(`  ${new Date().toISOString().slice(11, 19)} uç: ${uclar.map((u) => (u ? `${u.k.ad} ${u.no}` : "?")).join(" · ")}`);
  await uyu(Math.max(0, YOKLAMA - (Date.now() - t0)));
}
await Promise.all(bekleyenIsler);

const ort = (x: number[]) => (x.length ? (x.reduce((a, b) => a + b, 0) / x.length).toFixed(2) : "-");
const aralik = (x: number[]) => (x.length ? `${Math.min(...x)}…${Math.max(...x)}` : "-");
const yuzdelik = (x: number[], p: number) => { if (!x.length) return "-"; const s = [...x].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]!.toFixed(1); };
console.log("\nkaynak     | yoklama/hata | GERİ (en büyük) | uç−TronGrid ort (aralık) | ilerleme adımı ort (aralık) | gecikme sn p50/p95 | ilk okuma tam/eksik | sonra tamam/eksik (sn) | TronGrid'le aynı/FARKLI");
for (const k of KAYNAKLAR) {
  const s = d.get(k.ad)!;
  console.log(
    `${k.ad.padEnd(10)} | ${s.yoklama}/${s.hata} | ${s.geri} (${s.enBuyukGeri}) | ${ort(s.farkTG)} (${aralik(s.farkTG)}) | ${ort(s.ilerleme)} (${aralik(s.ilerleme)}) | ` +
    `${yuzdelik(s.gecikmeSn, 0.5)}/${yuzdelik(s.gecikmeSn, 0.95)} | ${s.ilkOkumaTamam}/${s.ilkOkumaEksik} | ${s.sonraTamam}/${s.sonraEksik} (${aralik(s.tamamlanmaSn.map((x) => Math.round(x)))}) | ` +
    `${k.ad === "trongrid" ? "referans" : `${s.tgIleAyni}/${s.tgIleFarkli}`}`,
  );
}
