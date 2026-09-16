// B2 ölçüm kapısı (2026-09-16): blok okuyucunun iki varsayımını ölçer.
//   1) Kesinleşme: TronGrid'in /walletsolidity/getnowblock ucu çalışıyor mu, uçla farkı kaç blok?
//   2) Hız: ortak kapı ARALIK ms iken N blok (blok başına 2 istek) kaç saniyede, kaç yeniden deneme?
// Çalıştır:
//   node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/b2-kapi.mts [--blok=40] [--aralikMs=120]
import { getJson, RateGate } from "@cry/chain";

const arg = (ad: string, vars: number) => Number(process.argv.find((a) => a.startsWith(`--${ad}=`))?.split("=")[1] ?? vars);
const N = arg("blok", 40);
const kapi = new RateGate(arg("aralikMs", 120));
const K = process.env.TRONGRID_API_KEY ?? "";
const H = { "Content-Type": "application/json", ...(K ? { "TRON-PRO-API-KEY": K } : {}) };

let istek = 0, sekilHatasi = 0;
async function post(yol: string, govde: unknown): Promise<any> {
  for (let d = 0; ; d++) {
    await kapi.gec();
    istek++;
    const j = await getJson<any>(`https://api.trongrid.io${yol}`, { chain: "tron", method: "POST", headers: H, body: JSON.stringify(govde) });
    const tamam = yol.endsWith("infobyblocknum") ? Array.isArray(j) : Boolean(j?.block_header);
    if (tamam) return j;
    sekilHatasi++;
    if (d >= 5) throw new Error(`şekil bozuk: ${JSON.stringify(j).slice(0, 120)}`);
    await new Promise((r) => setTimeout(r, 500 * 2 ** d));
  }
}

const [uc, kesin] = await Promise.all([post("/wallet/getnowblock", {}), post("/walletsolidity/getnowblock", {})]);
const ucNo = uc.block_header.raw_data.number as number;
const kesinNo = kesin.block_header.raw_data.number as number;
console.log(`uç ${ucNo} · kesinleşmiş ${kesinNo} · fark ${ucNo - kesinNo} blok`);

const bas = kesinNo - N;
const t0 = Date.now();
let islem = 0;
const kuyruk = Array.from({ length: N }, (_, i) => bas + i);
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let no = kuyruk.shift(); no !== undefined; no = kuyruk.shift()) {
    const [b, bilgi] = await Promise.all([post("/wallet/getblockbynum", { num: no }), post("/wallet/gettransactioninfobyblocknum", { num: no })]);
    islem += (b.transactions ?? []).length + 0 * bilgi.length;
  }
}));
const sn = (Date.now() - t0) / 1000;
console.log(`${N} blok · ${istek} istek · şekil hatası ${sekilHatasi} · ${sn.toFixed(1)} sn · ${(N / sn).toFixed(2)} blok/sn · ${islem} işlem`);
console.log(`zincir 3 sn'de 1 blok üretir: okuma hızı zincirin ${(N / sn * 3).toFixed(1)} katı`);
