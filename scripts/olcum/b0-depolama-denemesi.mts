// B0 ölçümü (2026-09-15/16): blok indeksi depolama denemesi — dört ücretsiz motor, aynı veri, aynı sorgular.
//   ch    ClickHouse (Apache 2.0, kendi makinende)       — sütunlu, ReplacingMergeTree + kimden projeksiyonu
//   pg    Postgres 17 bölümlü tablo                      — satır tabanlı, iki B-ağacı dizini
//   ts    TimescaleDB (Postgres eklentisi)               — hypertable, sıkıştırılmış parçalar (orderby kime)
//   duck  DuckDB (MIT) — iki biçim: kendi dosyası + aylık bölümlü Parquet (ZSTD), ikisi de kime sıralı
//
// Taban GERÇEK veridir: tron-b0-ornekle.mts'in ardışık penceresi (.onbellek/b0/ardisik.csv).
// 2 günlük hacim TronGrid'den çekilemez (57.600 blok × 2 istek > günlük kota), bu yüzden gerçek pencere
// zamanda kaydırılarak çoğaltılır ve adres tekrarı İKİ SINIRLA ölçülür:
//   ayni  — her kopyada adresler aynı (iyimser)
//   taze  — pencerede ≤2 kez görünen adresler her kopyada YENİ (kötümser)
// Üretim DETERMİNİSTİKTİR (yeni adres/tx = sha256(kopya:eski)): aynı mod her motor için birebir aynı dosyadır.
//
// Geçici konteynerler (iş bitince: docker rm -f b0-ch b0-pg b0-ts b0-duck):
//   docker run -d --name b0-ch --ulimit nofile=262144:262144 -e CLICKHOUSE_SKIP_USER_SETUP=1 clickhouse/clickhouse-server:25.8
//   docker run -d --name b0-pg -e POSTGRES_PASSWORD=b0 postgres:17-alpine -c shared_buffers=2GB -c max_wal_size=8GB -c synchronous_commit=off
//   docker run -d --name b0-ts -e POSTGRES_PASSWORD=b0 timescale/timescaledb:latest-pg17 -c shared_buffers=2GB -c max_wal_size=8GB -c synchronous_commit=off
//   docker run -d --name b0-duck python:3.12-slim sleep infinity && docker exec b0-duck pip install -q duckdb==1.5.5
// Çalıştır:
//   node --max-old-space-size=8192 --import tsx scripts/olcum/b0-depolama-denemesi.mts [--mod=ayni|taze|gercek] [--gun=2] [--motorlar=ch,pg,ts,duck]
import { readFileSync, createWriteStream, existsSync, statSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const secenek = (ad: string, vars: string) => process.argv.find((a) => a.startsWith(`--${ad}=`))?.split("=")[1] ?? vars;
const GUN = Number(secenek("gun", "2"));
const MOD = secenek("mod", "ayni") as "ayni" | "taze" | "gercek";
const MOTOR = new Set(secenek("motorlar", "ch,pg,ts,duck").split(","));
const DIZIN = ".onbellek/b0";
// TimescaleDB 2.30: sıkıştırılmış parçada kimden için seyrek bloom dizini (orderby kime olduğundan kimden taranır)
const TS_BLOOM = process.argv.includes("--tsBloom");
// ClickHouse'un kimden projeksiyonu İKİNCİ bir sıralı kopyadır; öbür motorlarda karşılığı yok.
// Adil karşılaştırma için projeksiyonsuz hâli de ölçülür.
const CH_PROJEKSIYONSUZ = process.argv.includes("--chProjeksiyonsuz");

const docker = (...arg: string[]) => execFileSync("docker", arg, { encoding: "utf8", maxBuffer: 1 << 28 }).trim();
const sh = (kap: string, ...arg: string[]) => docker("exec", "-i", kap, ...arg);
const ch = (sorgu: string) => sh("b0-ch", "clickhouse-client", "--query", sorgu);
const pg = (sorgu: string) => sh("b0-pg", "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", sorgu);
const ts = (sorgu: string) => sh("b0-ts", "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", sorgu);
const sure = <T,>(f: () => T): [T, number] => { const t = performance.now(); const r = f(); return [r, performance.now() - t]; };
const sn = (ms: number) => +(ms / 1000).toFixed(1);

// --- 1) veri üret -----------------------------------------------------------------------------
type Satir = [number, number, string, number, string, string, string, string, number];
const ham: Satir[] = readFileSync(`${DIZIN}/ardisik.csv`, "utf8").split("\n").filter(Boolean).map((l) => {
  const p = l.split(",");
  return [+p[0]!, +p[1]!, p[2]!, +p[3]!, p[4]!, p[5]!, p[6]!, p[7]!, +p[8]!];
});
let zMin = Infinity, zMax = -Infinity, bMin = Infinity, bMax = -Infinity;
for (const r of ham) { zMin = Math.min(zMin, r[1]); zMax = Math.max(zMax, r[1]); bMin = Math.min(bMin, r[0]); bMax = Math.max(bMax, r[0]); }
const pencereMs = zMax - zMin + 3000, pencereBlok = bMax - bMin + 1;
const kopya = MOD === "gercek" ? 1 : Math.ceil((GUN * 86_400_000) / pencereMs);

const say = new Map<string, number>();
for (const r of ham) for (const a of [r[5], r[6]]) say.set(a, (say.get(a) ?? 0) + 1);
const nadir = new Set([...say].filter(([, n]) => n <= 2).map(([a]) => a));
const turet = (k: number, s: string, uzunluk: number) => createHash("sha256").update(`${k}:${s}`).digest("hex").slice(0, uzunluk);

const dosya = `${DIZIN}/deneme-${MOD}-${MOD === "gercek" ? 0 : GUN}g.csv`;
if (!existsSync(dosya)) {
  const w = createWriteStream(dosya);
  for (let k = 0; k < kopya; k++) {
    const adr = (a: string) => (MOD === "taze" && k > 0 && nadir.has(a) ? turet(k, a, 40) : a);
    const kay = k * pencereMs, blokKay = k * pencereBlok; // her kopya bir öncekinin hemen öncesine yerleşir
    let tampon = "";
    for (const r of ham) {
      const tx = k > 0 ? turet(k, r[2], 64) : r[2];
      tampon += `${r[0] - blokKay},${Math.floor((r[1] - kay) / 1000)},${tx},${r[3]},${r[4]},${adr(r[5])},${adr(r[6])},${r[7]},${r[8]}\n`;
    }
    if (!w.write(tampon)) await new Promise((r) => w.once("drain", r));
  }
  await new Promise((r) => w.end(r));
}
const satirSayisi = ham.length * kopya;
const csvBayt = statSync(dosya).size;
const zamanUc = Math.floor(zMax / 1000);
const zBas = Math.floor((zMax - kopya * pencereMs) / 86_400_000) * 86_400_000, zSon = zMax + 86_400_000;

// Sorgu hedefleri: pencerede en çok görünen, %1'lik dilimdeki ve ortancadaki adres
const alici = [...say].sort((a, b) => b[1] - a[1]);
const hedefler = { yogun: alici[0]![0], orta: alici[Math.floor(alici.length * 0.01)]![0], seyrek: alici[Math.floor(alici.length * 0.5)]![0] };

type Olcum = { ms: number; sonuc: string };
const olc = (f: () => Olcum, n = 5) => {
  const ms: number[] = [];
  let son = "", ilk = 0;
  for (let i = 0; i < n; i++) { const r = f(); if (i === 0) ilk = r.ms; ms.push(r.ms); son = r.sonuc; }
  ms.sort((a, b) => a - b);
  return { ilkMs: +ilk.toFixed(1), ortancaMs: +ms[Math.floor(n / 2)]!.toFixed(1), sonuc: son.replace(/[\t\n,]+/g, "|").replace(/\\x/g, "").toLowerCase().slice(0, 60) };
};
const kopyala = (kap: string) => docker("cp", dosya, `${kap}:/tmp/veri.csv`);
const sil = (kap: string) => sh(kap, "rm", "-f", "/tmp/veri.csv");
const cikti: Record<string, unknown> = {};

// --- ClickHouse ---------------------------------------------------------------------------------
if (MOTOR.has("ch")) {
  kopyala("b0-ch");
  ch("DROP TABLE IF EXISTS blok_indeks SYNC");
  ch(`CREATE TABLE blok_indeks (
    blok UInt32 CODEC(Delta, ZSTD(3)), zaman DateTime CODEC(Delta, ZSTD(3)), tx FixedString(32) CODEC(ZSTD(3)),
    idx UInt16 CODEC(ZSTD(3)), varlik Enum8('TRX' = 1, 'USDT' = 2), kimden FixedString(20) CODEC(ZSTD(3)),
    kime FixedString(20) CODEC(ZSTD(3)), tutar UInt256 CODEC(ZSTD(3)), basarili Bool
    ${CH_PROJEKSIYONSUZ ? "" : "PROJECTION gonderene (SELECT * ORDER BY kimden, zaman),"}
  ) ENGINE = ReplacingMergeTree PARTITION BY toYYYYMM(zaman) ORDER BY (kime, zaman, tx, idx)
    SETTINGS deduplicate_merge_projection_mode = 'rebuild'`);
  const [, yazMs] = sure(() => sh("b0-ch", "bash", "-c",
    `clickhouse-client --query "INSERT INTO blok_indeks SELECT blok, zaman, unhex(tx), idx, varlik, unhex(kimden), unhex(kime), toUInt256(tutar), basarili FROM input('blok UInt32, zaman DateTime, tx String, idx UInt16, varlik String, kimden String, kime String, tutar String, basarili UInt8') FORMAT CSV" < /tmp/veri.csv`));
  const [, birlesMs] = sure(() => ch("OPTIMIZE TABLE blok_indeks FINAL"));
  sil("b0-ch");
  const b = JSON.parse(ch(`SELECT sum(rows) r, sum(bytes_on_disk) disk FROM system.parts WHERE table='blok_indeks' AND active FORMAT JSONEachRow`));
  const q = (s: string): Olcum => {
    // Sorgu stdin'den gider (kabuk kaçışı yok); --time süreyi saniye olarak stderr'e yazar.
    const r = spawnSync("docker", ["exec", "-i", "b0-ch", "clickhouse-client", "--time"], { input: s, encoding: "utf8", maxBuffer: 1 << 26 });
    if (r.status !== 0) throw new Error(r.stderr);
    return { ms: Number(r.stderr.trim().split(/\s+/).pop()) * 1000, sonuc: r.stdout };
  };
  const w = `zaman >= toDateTime(${zamanUc}) - INTERVAL 90 DAY`;
  cikti[CH_PROJEKSIYONSUZ ? "clickhouseProjeksiyonsuz" : "clickhouse"] = {
    satir: +b.r, projeksiyon: !CH_PROJEKSIYONSUZ, diskBayt: +b.disk, baytSatir: +(b.disk / b.r).toFixed(1), yazmaSn: sn(yazMs), birlestirmeSn: sn(birlesMs),
    sorgular: Object.fromEntries(Object.entries(hedefler).map(([ad, a]) => [ad, {
      ozet: olc(() => q(`SELECT count(), uniqExact(kimden), sum(tutar) FROM blok_indeks WHERE kime = unhex('${a}') AND ${w} FORMAT TSV`)),
      gonderenler: olc(() => q(`SELECT lower(hex(kimden)), count() c FROM blok_indeks WHERE kime = unhex('${a}') AND ${w} GROUP BY kimden ORDER BY c DESC, kimden LIMIT 50 FORMAT TSV`)),
      alicilar: olc(() => q(`SELECT count(), uniqExact(kime) FROM blok_indeks WHERE kimden = unhex('${a}') AND ${w} FORMAT TSV`)),
    }])),
  };
}

// --- Postgres ve TimescaleDB: aynı şema, aynı yükleme; ayrılan yer bölümleme ve sıkıştırma -------------
const PG_SEMA = `blok int NOT NULL, zaman timestamptz NOT NULL, tx bytea NOT NULL, idx smallint NOT NULL,
  varlik smallint NOT NULL, kimden bytea NOT NULL, kime bytea NOT NULL, tutar numeric(78,0) NOT NULL, basarili boolean NOT NULL`;
const PG_DONUSUM = `SELECT blok, to_timestamp(zaman), decode(tx,'hex'), idx, CASE varlik WHEN 'TRX' THEN 1 ELSE 2 END,
  decode(kimden,'hex'), decode(kime,'hex'), tutar::numeric, basarili = 1 FROM yukle`;
const pgSorgular = (cal: (s: string) => string) => {
  const q = (s: string): Olcum => ({ ms: Number(/Execution Time: ([\d.]+)/.exec(cal(`EXPLAIN (ANALYZE, TIMING OFF) ${s}`))?.[1]), sonuc: cal(s) });
  const w = `zaman >= to_timestamp(${zamanUc}) - interval '90 days'`;
  return Object.fromEntries(Object.entries(hedefler).map(([ad, a]) => [ad, {
    ozet: olc(() => q(`SELECT count(*), count(DISTINCT kimden), sum(tutar) FROM blok_indeks WHERE kime = '\\x${a}' AND ${w}`)),
    gonderenler: olc(() => q(`SELECT encode(kimden,'hex'), count(*) c FROM blok_indeks WHERE kime = '\\x${a}' AND ${w} GROUP BY kimden ORDER BY c DESC, kimden LIMIT 50`)),
    alicilar: olc(() => q(`SELECT count(*), count(DISTINCT kime) FROM blok_indeks WHERE kimden = '\\x${a}' AND ${w}`)),
  }]));
};

if (MOTOR.has("pg")) {
  kopyala("b0-pg");
  pg("DROP TABLE IF EXISTS blok_indeks, yukle");
  pg(`CREATE UNLOGGED TABLE yukle (blok int, zaman bigint, tx text, idx int, varlik text, kimden text, kime text, tutar text, basarili int)`);
  pg(`CREATE TABLE blok_indeks (${PG_SEMA}, PRIMARY KEY (zaman, tx, idx)) PARTITION BY RANGE (zaman)`);
  for (let t = zBas; t < zSon; t += 86_400_000) {
    pg(`CREATE TABLE blok_indeks_${new Date(t).toISOString().slice(0, 10).replaceAll("-", "")} PARTITION OF blok_indeks FOR VALUES FROM ('${new Date(t).toISOString()}') TO ('${new Date(t + 86_400_000).toISOString()}')`);
  }
  const [, copyMs] = sure(() => pg(`COPY yukle FROM '/tmp/veri.csv' CSV`));
  const [, yazMs] = sure(() => pg(`INSERT INTO blok_indeks ${PG_DONUSUM}`));
  const [, dizinMs] = sure(() => { pg("CREATE INDEX ON blok_indeks (kime, zaman)"); pg("CREATE INDEX ON blok_indeks (kimden, zaman)"); });
  pg("DROP TABLE yukle"); pg("VACUUM ANALYZE blok_indeks"); sil("b0-pg");
  const [tablo, dizin] = pg(`SELECT sum(pg_table_size(c.oid)), sum(pg_indexes_size(c.oid)) FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid WHERE i.inhparent = 'blok_indeks'::regclass`).split("|").map(Number);
  cikti.postgres = {
    tabloBayt: tablo, dizinBayt: dizin, baytSatir: +((tablo! + dizin!) / satirSayisi).toFixed(1),
    copySn: sn(copyMs), yazmaSn: sn(yazMs), dizinSn: sn(dizinMs), sorgular: pgSorgular(pg),
  };
}

if (MOTOR.has("ts")) {
  kopyala("b0-ts");
  const surum = ts("SELECT extversion FROM pg_extension WHERE extname='timescaledb'") || (ts("CREATE EXTENSION IF NOT EXISTS timescaledb"), ts("SELECT extversion FROM pg_extension WHERE extname='timescaledb'"));
  ts("DROP TABLE IF EXISTS blok_indeks, yukle");
  ts(`CREATE UNLOGGED TABLE yukle (blok int, zaman bigint, tx text, idx int, varlik text, kimden text, kime text, tutar text, basarili int)`);
  // Sıkıştırılmış parçada tekillik kısıtı ve B-ağacı dizini yok; tekillik yazma sınırında sağlanır.
  ts(`CREATE TABLE blok_indeks (${PG_SEMA})`);
  ts(`SELECT create_hypertable('blok_indeks', by_range('zaman', INTERVAL '1 day'))`);
  const [, copyMs] = sure(() => ts(`COPY yukle FROM '/tmp/veri.csv' CSV`));
  const [, yazMs] = sure(() => ts(`INSERT INTO blok_indeks ${PG_DONUSUM}`));
  ts("DROP TABLE yukle"); sil("b0-ts");
  const ham0 = Number(ts("SELECT hypertable_size('blok_indeks')"));
  ts(`ALTER TABLE blok_indeks SET (timescaledb.compress, timescaledb.compress_orderby = 'kime, zaman'${TS_BLOOM ? ", timescaledb.sparse_index = 'bloom(kimden)'" : ""})`);
  const [, sikMs] = sure(() => ts(`SELECT count(compress_chunk(c)) FROM show_chunks('blok_indeks') c`));
  ts("VACUUM ANALYZE blok_indeks");
  const toplam = Number(ts("SELECT hypertable_size('blok_indeks')"));
  cikti[TS_BLOOM ? "timescaleBloom" : "timescale"] = {
    surum, seyrekDizin: TS_BLOOM ? "bloom(kimden)" : "yok", sikistirmaOncesiBayt: ham0, diskBayt: toplam, baytSatir: +(toplam / satirSayisi).toFixed(1),
    copySn: sn(copyMs), yazmaSn: sn(yazMs), sikistirmaSn: sn(sikMs), sorgular: pgSorgular(ts),
  };
}

// --- DuckDB: süre ve boyut konteyner İÇİNDEKİ tek python sürecinden okunur ---------------------------------
if (MOTOR.has("duck")) {
  kopyala("b0-duck");
  docker("cp", "scripts/olcum/b0-duckdb.py", "b0-duck:/tmp/b0-duckdb.py");
  const r = spawnSync("docker", ["exec", "-i", "b0-duck", "python", "/tmp/b0-duckdb.py", JSON.stringify({ hedefler, zamanUc })], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(r.stderr);
  sil("b0-duck");
  const d = JSON.parse(r.stdout);
  for (const bicim of ["duckdb", "parquet"]) {
    for (const s of Object.values(d[bicim].sorgular) as Record<string, { sonuc: string }>[]) for (const o of Object.values(s)) o.sonuc = o.sonuc.replace(/[\t\n,]+/g, "|").toLowerCase().slice(0, 60);
    d[bicim].baytSatir = +(d[bicim].diskBayt / satirSayisi).toFixed(1);
  }
  cikti.duckdb = d.duckdb;
  cikti.parquet = d.parquet;
}

console.log(JSON.stringify({
  mod: MOD, gun: MOD === "gercek" ? +(pencereMs / 86_400_000).toFixed(3) : GUN, kopya,
  gercekPencere: { satir: ham.length, blok: pencereBlok, dakika: +(pencereMs / 60000).toFixed(1), tekilAdres: say.size, nadirAdres: nadir.size },
  satir: satirSayisi, csvBayt, hedefler, ...cikti,
}, null, 1));
