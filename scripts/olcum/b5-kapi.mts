// B5 ölçüm kapısı (2026-09-17): blok indeksi motora ve arayüze bağlanmadan önce dört soru.
//   A) Pencere: indeksin BOŞLUKSUZ kapsadığı son aralık hangisi? Keşif ve adres sayfası yalnızca onun
//      içinde konuşabilir ("pencere Y" — yol haritası B5).
//   B) Keşif: arşivdeki TRON adreslerinin (çoğu index_state=bilinmiyor) pencerede kaç farklı karşı tarafı
//      var, eşik 50'yi kaçı geçiyor, tutar eşiği (≥0 / ≥1 / ≥100) sonucu nasıl değiştiriyor? Aday sayısı
//      mevcut keşif etiketleriyle ve doğrulanmış kimliklerle karşılaştırılır.
//   C) Katman 2 ile tutarlılık: taranmış (tam) adreslerde, pencere ile tarama sonunun kesişiminde gelen
//      karşı taraf kümesi Postgres'teki hareketlerle aynı mı?
//   D) Hız: tek adres sorgusu (adres sayfası) kime- ve kimden-yönünde kaç ms, kaç satır okuyor —
//      `kimden` sıralamada olmadığı için tablo büyüdükçe tam geçmişe (~10,8 Mr satır) izdüşümü.
// Çalıştır:
//   node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/b5-kapi.mts
import { ayarOku, sorgu, ekle, TABLO, KAPSAM_TABLO, USDT_TRC20_HEX } from "@cry/blok-indeks";
import { base58ToHex, hexToBase58 } from "@cry/chain";
import { prisma } from "@cry/db";
import { servisAdaylari, VARSAYILAN_KESIF, type AdresIstatistigi } from "../../packages/etiket/src/kesif.ts";

const a = ayarOku();
const tsv = async (sql: string) => (await sorgu(a, `${sql} FORMAT TSV`)).trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
const zamanla = async <T,>(fn: () => Promise<T>): Promise<[T, number]> => { const t = performance.now(); const r = await fn(); return [r, Math.round(performance.now() - t)]; };
const b58 = (hex: string) => hexToBase58("41" + hex);
const TAM_GECMIS_SATIR = 10.8e9;

// ---------- A) Pencere ----------
const [[enBuyuk]] = (await tsv(`SELECT max(blok) FROM ${KAPSAM_TABLO}`)) as [[string]];
const [[sonBosluk]] = (await tsv(`
  SELECT max(sonraki) FROM (SELECT blok, leadInFrame(blok) OVER (ORDER BY blok ROWS BETWEEN CURRENT ROW AND 1 FOLLOWING) AS sonraki
  FROM (SELECT DISTINCT blok FROM ${KAPSAM_TABLO})) WHERE sonraki > blok + 1`)) as [[string]];
const bas = Number(sonBosluk), son = Number(enBuyuk);
const W = `blok BETWEEN ${bas} AND ${son}`;
const [[zmin, zmax, kapsamSatir, blokSay]] = (await tsv(`SELECT toUnixTimestamp(min(zaman)), toUnixTimestamp(max(zaman)), sum(satir), count() FROM ${KAPSAM_TABLO} FINAL WHERE ${W}`)).map((r) => r.map(Number));
const [[tumSatir]] = (await tsv(`SELECT count() FROM ${TABLO}`)).map((r) => r.map(Number));
const gun = (zmax! - zmin!) / 86400;
console.log(`A) pencere ${bas}–${son} · ${blokSay} blok (${son - bas + 1} beklenen) · ${new Date(zmin! * 1000).toISOString()} → ${new Date(zmax! * 1000).toISOString()} · ${gun.toFixed(2)} gün · ${kapsamSatir} satır (tablo ham ${tumSatir})`);

// ---------- Arşiv ----------
type Arsiv = { id: bigint; address: string; index_state: string; indexed_through_ts: Date | null; kaynaklar: string[] | null; dogrulanmis: boolean };
const arsiv = await prisma.$queryRaw<Arsiv[]>`
  select a.id, a.address, a.index_state, a.indexed_through_ts,
         array_agg(distinct l.source) filter (where l.id is not null) as kaynaklar,
         coalesce(bool_or(l.verified_at is not null), false) as dogrulanmis
  from addresses a left join labels l on l.address_id = a.id
  where a.chain = 'tron' group by a.id`;
const hexe = new Map<string, Arsiv>();
let gecersiz = 0;
for (const r of arsiv) {
  try { hexe.set(base58ToHex(r.address).slice(2).toLowerCase(), r); } catch { gecersiz++; }
}
await sorgu(a, "DROP TABLE IF EXISTS b5_kapi_arsiv");
await sorgu(a, "CREATE TABLE b5_kapi_arsiv (a FixedString(20)) ENGINE = Memory");
await ekle(a, "INSERT INTO b5_kapi_arsiv SELECT unhex(a) FROM input('a String') FORMAT JSONCompactEachRow", [...hexe.keys()].map((h) => [h]));
const durumSay = (f: (r: Arsiv) => boolean) => arsiv.filter(f).length;
console.log(`\narşiv: ${arsiv.length} TRON adresi (bilinmiyor ${durumSay((r) => r.index_state === "bilinmiyor")} · kismi ${durumSay((r) => r.index_state === "kismi")} · tam ${durumSay((r) => r.index_state === "tam")}) · çözülemeyen ${gecersiz}`);

// ---------- B) Keşif ----------
const esikler = [0, 1, 100];
console.log(`\nB) keşif — pencere içinde, karşı taraf eşiği ${VARSAYILAN_KESIF.karsiTarafEsigi} (varlık ayrımı yok, tutar eşiği her iki varlıkta 6 ondalık)`);
console.log("tutar ≥ | pencerede görünen arşiv adresi | gelen sorgusu ms | giden sorgusu ms | aday | ↳ bilinmiyor (YENİ) | ↳ mevcut keşif etiketi | ↳ doğrulanmış kimlik | mevcut keşif etiketinden eşik altı kalan");
const mevcutKesif = new Set(arsiv.filter((r) => r.kaynaklar?.includes("kesif")).map((r) => r.address));
let ornekAdaylar: { address: string; sekil: string; gerekce: string[] }[] = [];
for (const x of esikler) {
  const kosul = x ? `AND tutar >= ${x * 1_000_000}` : "";
  const [gelen, msG] = await zamanla(() => tsv(`SELECT lower(hex(kime)), uniqExact(kimden), count() FROM ${TABLO} WHERE ${W} ${kosul} AND kime IN (SELECT a FROM b5_kapi_arsiv) GROUP BY kime`));
  const [giden, msC] = await zamanla(() => tsv(`SELECT lower(hex(kimden)), uniqExact(kime), count() FROM ${TABLO} WHERE ${W} ${kosul} AND kimden IN (SELECT a FROM b5_kapi_arsiv) GROUP BY kimden`));
  const ist = new Map<string, AdresIstatistigi>();
  const al = (h: string) => { let s = ist.get(h); if (!s) { s = { address: hexe.get(h)!.address, indeksDurumu: "tam", gonderenSayisi: 0, aliciSayisi: 0, hareketSayisi: 0 }; ist.set(h, s); } return s; };
  for (const [h, u, n] of gelen) { const s = al(h!); s.gonderenSayisi = Number(u); s.hareketSayisi += Number(n); }
  for (const [h, u, n] of giden) { const s = al(h!); s.aliciSayisi = Number(u); s.hareketSayisi += Number(n); }
  const sonuc = servisAdaylari([...ist.values()]);
  const adr = new Map(arsiv.map((r) => [r.address, r]));
  const yeni = sonuc.adaylar.filter((c) => adr.get(c.address)!.index_state === "bilinmiyor").length;
  const kesifli = sonuc.adaylar.filter((c) => mevcutKesif.has(c.address)).length;
  const dogru = sonuc.adaylar.filter((c) => adr.get(c.address)!.dogrulanmis).length;
  const adaySet = new Set(sonuc.adaylar.map((c) => c.address));
  const kayip = [...mevcutKesif].filter((m) => !adaySet.has(m)).length;
  console.log(`${String(x).padStart(7)} | ${ist.size} | ${msG} | ${msC} | ${sonuc.adaylar.length} (yakma ${sonuc.yakma.length}) | ${yeni} | ${kesifli} | ${dogru} | ${kayip}/${mevcutKesif.size}`);
  if (x === 0) ornekAdaylar = sonuc.adaylar.filter((c) => adr.get(c.address)!.index_state === "bilinmiyor").slice(0, 5);
}
console.log("örnek YENİ adaylar (≥0):");
for (const c of ornekAdaylar) console.log(`  ${c.address} ${c.sekil} · ${c.gerekce[0]}`);
const [[zincirAday], msZ] = await zamanla(() => tsv(`SELECT count() FROM (SELECT kime FROM ${TABLO} WHERE ${W} GROUP BY kime HAVING uniq(kimden) >= ${VARSAYILAN_KESIF.karsiTarafEsigi})`));
console.log(`ölçek: pencerede ≥${VARSAYILAN_KESIF.karsiTarafEsigi} farklı göndericisi olan TÜM zincir adresleri ${zincirAday![0]} (${msZ} ms) — arşivle sınırlanmazsa aday listesi bu büyüklükte`);

// ---------- C) Katman 2 ile tutarlılık ----------
const USDT_B58 = b58(USDT_TRC20_HEX);
const [[usdtId]] = await prisma.$queryRaw<[{ id: number }][]>`select id from assets where chain='tron' and contract=${USDT_B58}`.then((r) => r.map((x) => [x.id]));
const [[trxId]] = await prisma.$queryRaw<[{ id: number }][]>`select id from assets where chain='tron' and contract=''`.then((r) => r.map((x) => [x.id]));
const tamlar = arsiv.filter((r) => r.index_state === "tam" && r.indexed_through_ts && r.indexed_through_ts.getTime() / 1000 > zmin! + 3600);
let ayni = 0, farkli = 0, bosIkisi = 0;
const farklar: string[] = [];
for (const r of tamlar) {
  const ust = Math.min(Math.floor(r.indexed_through_ts!.getTime() / 1000), zmax!);
  const pg = await prisma.$queryRaw<{ gonderen: string; n: number }[]>`
    select f.address as gonderen, count(*)::int as n from transfers t join addresses f on f.id = t.from_address_id
    where t.to_address_id = ${r.id} and t.success and t.asset_id in (${usdtId}, ${trxId})
      and t.ts >= to_timestamp(${zmin}) and t.ts <= to_timestamp(${ust}) group by f.address`;
  const h = base58ToHex(r.address).slice(2).toLowerCase();
  const ch = await tsv(`SELECT lower(hex(kimden)), count() FROM ${TABLO} FINAL WHERE ${W} AND kime = unhex('${h}') AND zaman BETWEEN toDateTime(${zmin}) AND toDateTime(${ust}) GROUP BY kimden`);
  const pgK = new Map(pg.map((x) => [x.gonderen, x.n]));
  const chK = new Map(ch.map(([k, n]) => [b58(k!), Number(n)]));
  if (!pgK.size && !chK.size) { bosIkisi++; continue; }
  const esit = pgK.size === chK.size && [...pgK].every(([k, n]) => chK.get(k) === n);
  if (esit) ayni++; else { farkli++; farklar.push(`${r.address}: tarama ${pgK.size} gönderici/${[...pgK.values()].reduce((t, n) => t + n, 0)} hareket · indeks ${chK.size}/${[...chK.values()].reduce((t, n) => t + n, 0)}`); }
}
console.log(`\nC) tutarlılık — taraması pencereye uzanan ${tamlar.length} tam adres: gelen karşı taraf + hareket sayısı AYNI ${ayni} · FARKLI ${farkli} · ikisinde de boş ${bosIkisi}`);
for (const f of farklar.slice(0, 10)) console.log(`  ${f}`);

// ---------- D) Hız ----------
const [[yogunHex, yogunN]] = await tsv(`SELECT lower(hex(kime)), count() AS n FROM ${TABLO} WHERE ${W} AND kime IN (SELECT a FROM b5_kapi_arsiv) GROUP BY kime ORDER BY n DESC LIMIT 1`);
const [[genelHex, genelN]] = await tsv(`SELECT lower(hex(kime)), count() AS n FROM ${TABLO} WHERE ${W} GROUP BY kime ORDER BY n DESC LIMIT 1`);
const olc = async (etiket: string, sql: string) => {
  const sureler: number[] = [];
  for (let i = 0; i < 3; i++) sureler.push((await zamanla(() => sorgu(a, `${sql} SETTINGS log_comment='b5-kapi:${etiket}' FORMAT TSV`)))[1]);
  sureler.sort((p, q) => p - q);
  return sureler[1]!;
};
console.log(`\nD) hız — tablo ${tumSatir} satır; arşivin en yoğun alıcısı ${b58(yogunHex!)} (${yogunN} gelen), zincirin en yoğunu ${b58(genelHex!)} (${genelN} gelen)`);
const sorgular: [string, string][] = [];
for (const [ad, h] of [["arsiv", yogunHex!], ["zincir", genelHex!]] as const) {
  sorgular.push([`${ad}-kime`, `SELECT uniqExact(kimden), count(), sum(tutar) FROM ${TABLO} FINAL WHERE kime = unhex('${h}')`]);
  sorgular.push([`${ad}-kimden`, `SELECT uniqExact(kime), count(), sum(tutar) FROM ${TABLO} FINAL WHERE kimden = unhex('${h}')`]);
  sorgular.push([`${ad}-kimden-finalsiz`, `SELECT uniqExact(kime), count() FROM ${TABLO} WHERE kimden = unhex('${h}')`]);
}
const sureler = new Map<string, number>();
for (const [e, s] of sorgular) sureler.set(e, await olc(e, s));
let okunan = new Map<string, number>();
try {
  await sorgu(a, "SYSTEM FLUSH LOGS");
  okunan = new Map((await tsv(`SELECT replaceOne(log_comment, 'b5-kapi:', ''), max(read_rows) FROM system.query_log WHERE type = 'QueryFinish' AND startsWith(log_comment, 'b5-kapi:') AND event_time > now() - INTERVAL 15 MINUTE GROUP BY log_comment`)).map(([k, v]) => [k!, Number(v)]));
} catch (e) { console.log(`  (query_log okunamadı: ${String(e).slice(0, 120)})`); }
console.log("sorgu | ortanca ms | okunan satır | tam geçmişte (10,8 Mr) doğrusal izdüşüm");
for (const [e] of sorgular) {
  const ms = sureler.get(e)!, rr = okunan.get(e);
  const izd = rr ? `${Math.round((ms * TAM_GECMIS_SATIR) / tumSatir! / 1000)} sn (tam tarama sayılırsa)` : "-";
  console.log(`${e} | ${ms} | ${rr ?? "?"} | ${e.includes("kimden") ? izd : "sıralı anahtar — satır sayısıyla değil adresin hacmiyle büyür"}`);
}

await sorgu(a, "DROP TABLE IF EXISTS b5_kapi_arsiv");
await prisma.$disconnect();
