// B3 ölçüm kapısı (2026-09-16): tam geçmişi doldurmanın dört sorusu.
//   A) Geçmiş boyunca blok başına satır — toplam satır ve disk tahmini; eski bloklar ayrıştırıcıdan geçiyor mu;
//      `gettransactioninfobyblocknum` her işlem için bir kayıt veriyor mu (tutarlılık ölçütü olabilir mi)?
//   B) Anahtarsız diğer TRON düğümleri TronGrid'le AYNI cevabı veriyor mu (sessiz boş cevap var mı)?
//   C) Kaynak başına kapısız hız: blok/sn ve 429 oranı.
//   D) ClickHouse'ta bugünkü gerçek bayt/satır.
// Çalıştır:
//   node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/b3-kapi.mts [--nokta=60] [--ardisik=3] [--hizBlok=40]
import { bloktanSatirlar, ayarOku, sorgu, TABLO } from "@cry/blok-indeks";
import { RateGate } from "@cry/chain";

const arg = (ad: string, vars: number) => Number(process.argv.find((a) => a.startsWith(`--${ad}=`))?.split("=")[1] ?? vars);
const NOKTA = arg("nokta", 60), ARDISIK = arg("ardisik", 3), HIZ_BLOK = arg("hizBlok", 40);
const K = process.env.TRONGRID_API_KEY ?? "";
type Kaynak = { ad: string; url: string; h: Record<string, string>; kapi?: RateGate };
const TG: Kaynak = { ad: "trongrid+anahtar", url: "https://api.trongrid.io", h: K ? { "TRON-PRO-API-KEY": K } : {}, kapi: new RateGate(120) };
const DIGER: Kaynak[] = [
  { ad: "trongrid anahtarsız", url: "https://api.trongrid.io", h: {} },
  { ad: "tatum", url: "https://tron-mainnet.gateway.tatum.io", h: {} },
  { ad: "tronstack", url: "https://api.tronstack.io", h: {} },
  { ad: "publicnode", url: "https://tron-rpc.publicnode.com", h: {} },
];
const uyu = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Cagri = { j: any; ms: number; tekrar: number; s429: number };
async function post(k: Kaynak, yol: string, govde: unknown, bekle = true): Promise<Cagri> {
  const t = Date.now();
  let tekrar = 0, s429 = 0;
  for (;;) {
    if (bekle && k.kapi) await k.kapi.gec(); // A ve B: B2'nin ortak kapısı; C kapısız
    let durum = 0, j: any = null;
    try {
      const r = await fetch(k.url + yol, { method: "POST", headers: { "Content-Type": "application/json", ...k.h }, body: JSON.stringify(govde), signal: AbortSignal.timeout(30_000) });
      durum = r.status;
      if (r.ok) j = await r.json().catch(() => null);
    } catch { durum = -1; }
    const tamam = j !== null && (yol.endsWith("infobyblocknum") ? Array.isArray(j) : typeof j?.block_header?.raw_data?.number === "number");
    if (tamam) return { j, ms: Date.now() - t, tekrar, s429 };
    if (durum === 429) s429++;
    if (++tekrar > 5 || !bekle) throw Object.assign(new Error(`${k.ad} ${yol} HTTP ${durum} ${JSON.stringify(j)?.slice(0, 100)}`), { s429, tekrar });
    await uyu(400 * 2 ** tekrar);
  }
}
const ikili = async (k: Kaynak, num: number, bekle = true) => {
  const [b, i] = await Promise.all([post(k, "/wallet/getblockbynum", { num }, bekle), post(k, "/wallet/gettransactioninfobyblocknum", { num }, bekle)]);
  return { blok: b.j, bilgi: i.j as any[], ms: Math.max(b.ms, i.ms), tekrar: b.tekrar + i.tekrar, s429: b.s429 + i.s429 };
};
/** Satır kümesinin parmak izi: sıralı satırlar tek metin. */
const izi = (blok: any, bilgi: any[]) => bloktanSatirlar(blok, bilgi).satirlar.map((s) => `${s.tx}:${s.idx}:${s.varlik}:${s.kimden}:${s.kime}:${s.tutar}`).sort().join("|");

// ---------------- A) geçmiş boyunca ----------------
const kesin = (await post(TG, "/walletsolidity/getnowblock", {})).j.block_header.raw_data.number as number;
console.log(`kesinleşmiş uç ${kesin}`);
type Olcum = { no: number; yil: number; islem: number; bilgi: number; idEsit: boolean; trx: number; usdt: number; hata?: string; ms: number };
const olcumler: Olcum[] = [];
let aTekrar = 0;
const noktalar = Array.from({ length: NOKTA }, (_, i) => Math.floor(1 + (kesin - ARDISIK - 1) * (i + 0.5) / NOKTA));
const isler = noktalar.flatMap((p) => Array.from({ length: ARDISIK }, (_, d) => p + d));
const tA = Date.now();
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let no = isler.shift(); no !== undefined; no = isler.shift()) {
    const r = await ikili(TG, no);
    aTekrar += r.tekrar;
    const txId = new Set<string>((r.blok.transactions ?? []).map((t: any) => t.txID));
    const infoId = new Set<string>(r.bilgi.map((b: any) => b.id));
    const idEsit = txId.size === infoId.size && [...txId].every((x) => infoId.has(x));
    const o: Olcum = { no, yil: new Date(r.blok.block_header.raw_data.timestamp).getUTCFullYear(), islem: txId.size, bilgi: infoId.size, idEsit, trx: 0, usdt: 0, ms: r.ms };
    try { for (const s of bloktanSatirlar(r.blok, r.bilgi).satirlar) s.varlik === "TRX" ? o.trx++ : o.usdt++; } catch (e) { o.hata = (e as Error).message; }
    olcumler.push(o);
  }
}));
console.log(`\nA) ${olcumler.length} blok (${NOKTA} nokta × ${ARDISIK} ardışık) · ${((Date.now() - tA) / 1000).toFixed(0)} sn · yeniden deneme ${aTekrar}`);
const yillar = [...new Set(olcumler.map((o) => o.yil))].sort();
console.log("yıl  | blok | işlem/blok | TRX/blok | USDT/blok | satır/blok | bilgi≠işlem | ayrıştırma hatası");
for (const y of yillar) {
  const g = olcumler.filter((o) => o.yil === y);
  const ort = (f: (o: Olcum) => number) => (g.reduce((t, o) => t + f(o), 0) / g.length).toFixed(1);
  console.log(`${y} | ${String(g.length).padStart(4)} | ${ort((o) => o.islem).padStart(10)} | ${ort((o) => o.trx).padStart(8)} | ${ort((o) => o.usdt).padStart(9)} | ${ort((o) => o.trx + o.usdt).padStart(10)} | ${String(g.filter((o) => !o.idEsit).length).padStart(11)} | ${g.filter((o) => o.hata).length}`);
}
const esitsiz = olcumler.filter((o) => !o.idEsit);
if (esitsiz.length) console.log(`bilgi≠işlem örnekleri: ${esitsiz.slice(0, 8).map((o) => `${o.no} (işlem ${o.islem}, bilgi ${o.bilgi})`).join(", ")}`);
// Noktalar eşit aralıklı: toplam ≈ ortalama satır/blok × blok sayısı.
const ortSatir = olcumler.reduce((t, o) => t + o.trx + o.usdt, 0) / olcumler.length;
const toplamSatir = ortSatir * kesin;
console.log(`tahmini toplam satır (blok 1 → ${kesin}): ${(toplamSatir / 1e9).toFixed(2)} Mr (ortalama ${ortSatir.toFixed(1)} satır/blok)`);

// ---------------- D) ClickHouse bayt/satır ----------------
try {
  const [bayt, satir] = (await sorgu(ayarOku(), `SELECT sum(bytes_on_disk), sum(rows) FROM system.parts WHERE active AND table = '${TABLO}' FORMAT TSV`)).trim().split("\t").map(Number);
  const bps = bayt! / satir!;
  console.log(`\nD) ClickHouse ${TABLO}: ${satir} satır (birleşmemiş dahil) · ${(bayt! / 2 ** 20).toFixed(1)} MiB · ${bps.toFixed(1)} bayt/satır → tahmini tam geçmiş ${(toplamSatir * bps / 2 ** 30).toFixed(0)} GiB`);
} catch (e) { console.log(`\nD) ClickHouse okunamadı: ${(e as Error).message}`); }

// ---------------- B) diğer kaynaklar aynı cevabı veriyor mu ----------------
const secili = olcumler.filter((o) => o.islem > 0).sort((a, b) => a.no - b.no).filter((_, i, d) => i % Math.max(1, Math.floor(d.length / 10)) === 0).slice(0, 10);
console.log(`\nB) ${secili.length} blokta kaynak karşılaştırması (referans trongrid+anahtar)`);
const referans = new Map<number, { islem: number; bilgi: number; iz: string }>();
for (const o of secili) { const r = await ikili(TG, o.no); referans.set(o.no, { islem: (r.blok.transactions ?? []).length, bilgi: r.bilgi.length, iz: izi(r.blok, r.bilgi) }); await uyu(150); }
for (const k of DIGER) {
  let ayni = 0, bosBilgi = 0, farkli = 0, hata = 0;
  const notlar: string[] = [];
  for (const o of secili) {
    try {
      const r = await ikili(k, o.no);
      const ref = referans.get(o.no)!;
      const iz = izi(r.blok, r.bilgi);
      if (iz === ref.iz && r.bilgi.length === ref.bilgi) ayni++;
      else if (r.bilgi.length === 0 && ref.bilgi > 0) { bosBilgi++; notlar.push(`${o.no}: bilgi 0 (ref ${ref.bilgi})`); }
      else { farkli++; notlar.push(`${o.no}: işlem ${(r.blok.transactions ?? []).length}/${ref.islem} bilgi ${r.bilgi.length}/${ref.bilgi}`); }
    } catch (e) { hata++; notlar.push(`${o.no}: ${(e as Error).message.slice(0, 80)}`); }
    await uyu(300);
  }
  console.log(`  ${k.ad.padEnd(20)} aynı ${ayni} · SESSİZ BOŞ bilgi ${bosBilgi} · farklı ${farkli} · hata ${hata}${notlar.length ? `  [${notlar.slice(0, 3).join("; ")}]` : ""}`);
}

// ---------------- C) kapısız hız ----------------
console.log(`\nC) kapısız hız: kaynak başına ${HIZ_BLOK} yakın blok, 4 ve 8 eşzamanlı (yeniden deneme YOK — 429 sayılır)`);
for (const k of [TG, ...DIGER]) {
  for (const es of [4, 8]) {
    const kuyruk = Array.from({ length: HIZ_BLOK }, (_, i) => kesin - 5_000 - es * 1_000 - i);
    let ok = 0, s429 = 0, diger = 0;
    const t0 = Date.now();
    await Promise.all(Array.from({ length: es }, async () => {
      for (let no = kuyruk.shift(); no !== undefined; no = kuyruk.shift()) {
        try { await ikili(k, no, false); ok++; }
        catch (e) { const x = e as { s429?: number; message: string }; if (x.s429 || /HTTP 429/.test(x.message)) s429++; else diger++; }
      }
    }));
    const sn = (Date.now() - t0) / 1000;
    console.log(`  ${k.ad.padEnd(20)} eşzaman ${es}: ${ok}/${HIZ_BLOK} blok · ${(ok / sn).toFixed(2)} blok/sn · 429 ${s429} · diğer hata ${diger}`);
    await uyu(3_000);
  }
}
