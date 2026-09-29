/**
 * Ölçüm: /islem sayfasının fiyat satırı, ekranla AYNI kod yolundan.
 *
 * Sayfa oturum istiyor ve ajan şifre girmiyor; o yüzden ekranın çağırdığı
 * saf katman (`gunVerisi` → `fiyatlandir` → `kurCumlesi`) gerçek arşiv
 * verisiyle burada koşturulur. "Göremedim" demek yerine ne ölçüldüğü yazılır.
 */
import { prisma } from "@cry/db";
import { fiyatlandir, gunVerisi, kurCumlesi } from "@cry/fiyat";

const bugun = new Date().toISOString().slice(0, 10);

const ornekler = await prisma.$queryRaw<
  { tx_hash: string; ts: Date; symbol: string; decimals: number; amount_raw: string; asset_id: number }[]
>`
  select t.tx_hash, t.ts, a.symbol, a.decimals, t.amount_raw, t.asset_id
  from transfers t join assets a on a.id = t.asset_id
  where t.ts::date in (select date from prices_daily)
  order by t.amount_raw::numeric desc
  limit 3`;

const eski = await prisma.$queryRaw<
  { tx_hash: string; ts: Date; symbol: string; decimals: number; amount_raw: string; asset_id: number }[]
>`
  select t.tx_hash, t.ts, a.symbol, a.decimals, t.amount_raw, t.asset_id
  from transfers t join assets a on a.id = t.asset_id
  where t.ts < '2023-01-01' and a.symbol = 'USDT'
  order by t.ts desc
  limit 2`;

console.log(`rapor günü (UTC): ${bugun}\n`);

for (const [baslik, liste] of [
  ["PENCERE İÇİ (fiyat var)", ornekler],
  ["PENCERE DIŞI (fiyat yok — sebebi olmalı)", eski],
] as const) {
  console.log(`--- ${baslik} ---`);
  for (const h of liste) {
    const gun = h.ts.toISOString().slice(0, 10);
    const f = fiyatlandir({
      hamTutar: h.amount_raw,
      ondalik: h.decimals,
      islemGunu: await gunVerisi(h.asset_id, gun),
      raporGunu: await gunVerisi(h.asset_id, bugun),
    });
    console.log(`  ${h.tx_hash.slice(0, 12)}… ${gun} · ${f.tutar} ${h.symbol}`);
    console.log(`    ${kurCumlesi(f)}`);
  }
  console.log();
}

await prisma.$disconnect();
