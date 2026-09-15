// Ölçüm (2026-09-15): güncel bloktan geriye örnek bloklarda işlem ve transfer sayısı.
// Çalıştır: node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/tron-blok-hacmi.mts
// Anahtar (TRONGRID_API_KEY) ekrana basılmaz.
const K = process.env.TRONGRID_API_KEY ?? "";
const H = { "Content-Type": "application/json", ...(K ? { "TRON-PRO-API-KEY": K } : {}) };
const post = async (yol: string, govde: unknown) => (await fetch(`https://api.trongrid.io${yol}`, { method: "POST", headers: H, body: JSON.stringify(govde) })).json();
// USDT-TRC20 sözleşmesi (TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t) hex hâli, 41 önekli
const USDT_HEX = "a614f803b6fd780986a42c78ec9c7f77e6ded13c";
const TRANSFER = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const simdi: any = await post("/wallet/getnowblock", {});
const bas = simdi.block_header.raw_data.number as number;
const N = 30;
let tx = 0, usdt = 0, trc20 = 0, trx = 0, bayt = 0, sure = 0;
for (let i = 0; i < N; i++) {
  const no = bas - 25 - i * 997; // gün içine yayılmış örnekler
  const t0 = Date.now();
  const blok: any = await post("/wallet/getblockbynum", { num: no });
  const bilgi: any = await post("/wallet/gettransactioninfobyblocknum", { num: no });
  sure += Date.now() - t0;
  bayt += JSON.stringify(blok).length + JSON.stringify(bilgi).length;
  const txler = blok.transactions ?? [];
  tx += txler.length;
  trx += txler.filter((t: any) => t.raw_data?.contract?.[0]?.type === "TransferContract").length;
  for (const b of Array.isArray(bilgi) ? bilgi : []) for (const l of b.log ?? []) {
    if (l.topics?.[0] === TRANSFER && l.topics.length === 3) { trc20++; if (l.address === USDT_HEX) usdt++; }
  }
}
const blokGun = 86400 / 3;
console.log(JSON.stringify({ guncelBlok: bas, ornekBlok: N,
  blokBasina: { tx: +(tx / N).toFixed(1), usdtTransfer: +(usdt / N).toFixed(1), tumTrc20Transfer: +(trc20 / N).toFixed(1), trxTransfer: +(trx / N).toFixed(1) },
  gunlukTahmin: { usdtTransfer: Math.round(usdt / N * blokGun), tumTrc20: Math.round(trc20 / N * blokGun), trx: Math.round(trx / N * blokGun) },
  hamJsonBlokBasinaKB: +(bayt / N / 1024).toFixed(0), istekCiftiMs: Math.round(sure / N), anahtarVar: Boolean(K) }, null, 1));
