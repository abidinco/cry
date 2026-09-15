// Ölçüm (2026-09-15): örnek bloklarda USDT-TRC20 ve TRX transfer tutarlarının eşik dağılımı.
// Çalıştır: node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/tron-tutar-dagilimi.mts
const K = process.env.TRONGRID_API_KEY ?? "";
const H = { "Content-Type": "application/json", ...(K ? { "TRON-PRO-API-KEY": K } : {}) };
const post = async (yol: string, g: unknown) => (await fetch(`https://api.trongrid.io${yol}`, { method: "POST", headers: H, body: JSON.stringify(g) })).json();
const USDT_HEX = "a614f803b6fd780986a42c78ec9c7f77e6ded13c";
const TRANSFER = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const simdi: any = await post("/wallet/getnowblock", {});
const bas = simdi.block_header.raw_data.number as number;
const esik = [1, 10, 100, 1000, 10000, 100000];
const usdtSay = new Array(esik.length).fill(0); let usdtTop = 0;
const trxSay = new Array(esik.length).fill(0); let trxTop = 0;
for (let i = 0; i < 30; i++) {
  const no = bas - 40 - i * 1511;
  const blok: any = await post("/wallet/getblockbynum", { num: no });
  const bilgi: any = await post("/wallet/gettransactioninfobyblocknum", { num: no });
  for (const t of blok.transactions ?? []) {
    const c = t.raw_data?.contract?.[0];
    if (c?.type !== "TransferContract") continue;
    const trx = Number(c.parameter.value.amount) / 1e6; trxTop++;
    esik.forEach((e, j) => { if (trx >= e) trxSay[j]++; });
  }
  for (const b of Array.isArray(bilgi) ? bilgi : []) for (const l of b.log ?? []) {
    if (l.address !== USDT_HEX || l.topics?.[0] !== TRANSFER) continue;
    const usdt = Number(BigInt("0x" + (l.data || "0"))) / 1e6; usdtTop++;
    esik.forEach((e, j) => { if (usdt >= e) usdtSay[j]++; });
  }
}
const oran = (s: number[], t: number) => Object.fromEntries(esik.map((e, j) => [`>=${e}`, `%${(100 * s[j] / t).toFixed(1)}`]));
console.log(JSON.stringify({ usdtOrnek: usdtTop, usdt: oran(usdtSay, usdtTop), trxOrnek: trxTop, trx: oran(trxSay, trxTop) }, null, 1));
