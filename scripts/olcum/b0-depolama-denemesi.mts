// B0 ölçümü (2026-09-15): blok indeksi depolama denemesi — Postgres bölümlü tablo ⟷ ClickHouse.
//
// Taban GERÇEK veridir: tron-b0-ornekle.mts'in ardışık penceresi (.onbellek/b0/ardisik.csv).
// 2 günlük hacim (~7 Mn satır) TronGrid'den çekilemez (57.600 blok × 2 istek > günlük kota), bu yüzden
// gerçek pencere zamanda kaydırılarak çoğaltılır ve adres tekrarı İKİ SINIRLA ölçülür:
//   ayni  — her kopyada adresler aynı (iyimser: sıkıştırma en iyi hâli)
//   taze  — pencerede ≤2 kez görünen adresler her kopyada YENİ (kötümser: yeni kullanıcı akışı)
// Gerçek günlük davranış ikisinin arasındadır; tx hash her kopyada rastgele (sıkışmaz, gerçekte de sıkışmaz).
//
// Geçici konteynerler (iş bitince silinir):
//   docker run -d --name b0-ch --ulimit nofile=262144:262144 -e CLICKHOUSE_SKIP_USER_SETUP=1 clickhouse/clickhouse-server:25.8
//   docker run -d --name b0-pg -e POSTGRES_PASSWORD=b0 postgres:17-alpine -c shared_buffers=2GB -c max_wal_size=8GB -c synchronous_commit=off
// Çalıştır:
//   node --import tsx scripts/olcum/b0-depolama-denemesi.mts [--gun=2] [--mod=ayni|taze|gercek]
import { readFileSync, createWriteStream, existsSync, statSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const secenek = (ad: string, vars: string) => process.argv.find((a) => a.startsWith(`--${ad}=`))?.split("=")[1] ?? vars;
const GUN = Number(secenek("gun", "2"));
const MOD = secenek("mod", "ayni") as "ayni" | "taze" | "gercek";
const DIZIN = ".onbellek/b0";

const sh = (kap: string, ...arg: string[]) => execFileSync("docker", ["exec", "-i", kap, ...arg], { encoding: "utf8", maxBuffer: 1 << 28 }).trim();
const ch = (sorgu: string) => sh("b0-ch", "clickhouse-client", "--query", sorgu);
const pg = (sorgu: string) => sh("b0-pg", "psql", "-U", "postgres", "-At", "-c", sorgu);
const sure = <T,>(f: () => T): [T, number] => { const t = performance.now(); const r = f(); return [r, performance.now() - t]; };

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

const dosya = `${DIZIN}/deneme-${MOD}-${MOD === "gercek" ? 0 : GUN}g.csv`;
let satirSayisi = 0;
if (!existsSync(dosya)) {
  const w = createWriteStream(dosya);
  for (let k = 0; k < kopya; k++) {
    const txMap = new Map<string, string>();
    const adr = (a: string) => (MOD === "taze" && k > 0 && nadir.has(a) ? randomBytes(20).toString("hex") : a);
    // her kopya, kendinden önceki pencerenin hemen öncesine yerleşir (geriye doğru)
    const kay = k * pencereMs, blokKay = k * pencereBlok;
    let tampon = "";
    for (const r of ham) {
      let tx = r[2];
      if (k > 0) { tx = txMap.get(r[2]) ?? randomBytes(32).toString("hex"); txMap.set(r[2], tx); }
      tampon += `${r[0] - blokKay},${Math.floor((r[1] - kay) / 1000)},${tx},${r[3]},${r[4]},${adr(r[5])},${adr(r[6])},${r[7]},${r[8]}\n`;
      satirSayisi++;
    }
    if (!w.write(tampon)) await new Promise((r) => w.once("drain", r));
  }
  await new Promise((r) => w.end(r));
} else satirSayisi = readFileSync(dosya, "utf8").split("\n").length - 1;
const csvBayt = statSync(dosya).size;

execFileSync("docker", ["cp", dosya, "b0-ch:/tmp/veri.csv"]);
execFileSync("docker", ["cp", dosya, "b0-pg:/tmp/veri.csv"]);

// --- 2) ClickHouse ------------------------------------------------------------------------------
ch("DROP TABLE IF EXISTS blok_indeks SYNC");
ch(`CREATE TABLE blok_indeks (
  blok UInt32 CODEC(Delta, ZSTD(3)),
  zaman DateTime CODEC(Delta, ZSTD(3)),
  tx FixedString(32) CODEC(ZSTD(3)),
  idx UInt16 CODEC(ZSTD(3)),
  varlik Enum8('TRX' = 1, 'USDT' = 2),
  kimden FixedString(20) CODEC(ZSTD(3)),
  kime FixedString(20) CODEC(ZSTD(3)),
  tutar UInt256 CODEC(ZSTD(3)),
  basarili Bool,
  PROJECTION gonderene (SELECT * ORDER BY kimden, zaman)
) ENGINE = ReplacingMergeTree PARTITION BY toYYYYMM(zaman) ORDER BY (kime, zaman, tx, idx)
  SETTINGS deduplicate_merge_projection_mode = 'rebuild'`);
const [, chYazMs] = sure(() => sh("b0-ch", "bash", "-c",
  `clickhouse-client --query "INSERT INTO blok_indeks SELECT blok, zaman, unhex(tx), idx, varlik, unhex(kimden), unhex(kime), toUInt256(tutar), basarili FROM input('blok UInt32, zaman DateTime, tx String, idx UInt16, varlik String, kimden String, kime String, tutar String, basarili UInt8') FORMAT CSV" < /tmp/veri.csv`));
const [, chBirlesMs] = sure(() => ch("OPTIMIZE TABLE blok_indeks FINAL"));
const chBoyut = JSON.parse(ch(`SELECT sum(rows) r, sum(bytes_on_disk) disk, sum(data_uncompressed_bytes) acik FROM system.parts WHERE table='blok_indeks' AND active FORMAT JSONEachRow`));
const chSutun = ch(`SELECT name, formatReadableSize(data_compressed_bytes) FROM system.columns WHERE table='blok_indeks' FORMAT TSV`);

// --- 3) Postgres (bölümlü, günlük; üretimde aylık olur — bayt aynı) ----------------------------------
pg("DROP TABLE IF EXISTS blok_indeks, yukle");
pg(`CREATE UNLOGGED TABLE yukle (blok int, zaman bigint, tx text, idx int, varlik text, kimden text, kime text, tutar text, basarili int)`);
pg(`CREATE TABLE blok_indeks (blok int NOT NULL, zaman timestamptz NOT NULL, tx bytea NOT NULL, idx smallint NOT NULL,
  varlik smallint NOT NULL, kimden bytea NOT NULL, kime bytea NOT NULL, tutar numeric(78,0) NOT NULL, basarili boolean NOT NULL,
  PRIMARY KEY (zaman, tx, idx)) PARTITION BY RANGE (zaman)`);
const zBas = Math.floor((zMax - kopya * pencereMs) / 86_400_000) * 86_400_000, zSon = zMax + 86_400_000;
for (let t = zBas; t < zSon; t += 86_400_000) {
  const ad = new Date(t).toISOString().slice(0, 10).replaceAll("-", "");
  pg(`CREATE TABLE blok_indeks_${ad} PARTITION OF blok_indeks FOR VALUES FROM ('${new Date(t).toISOString()}') TO ('${new Date(t + 86_400_000).toISOString()}')`);
}
const [, pgHamMs] = sure(() => pg(`COPY yukle FROM '/tmp/veri.csv' CSV`));
const [, pgYazMs] = sure(() => pg(`INSERT INTO blok_indeks SELECT blok, to_timestamp(zaman), decode(tx,'hex'), idx, CASE varlik WHEN 'TRX' THEN 1 ELSE 2 END,
  decode(kimden,'hex'), decode(kime,'hex'), tutar::numeric, basarili = 1 FROM yukle`));
const [, pgDizinMs] = sure(() => { pg("CREATE INDEX ON blok_indeks (kime, zaman)"); pg("CREATE INDEX ON blok_indeks (kimden, zaman)"); });
pg("DROP TABLE yukle"); pg("VACUUM ANALYZE blok_indeks");
const pgBoyut = pg(`SELECT sum(pg_table_size(c.oid)), sum(pg_indexes_size(c.oid)) FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid WHERE i.inhparent = 'blok_indeks'::regclass`).split("|").map(Number);

// --- 4) sorgular: "bu adrese gelenler, son 90 gün" ----------------------------------------------
const alici = [...say].sort((a, b) => b[1] - a[1]);
const hedefler = { yogun: alici[0]![0], orta: alici[Math.floor(alici.length * 0.01)]![0], seyrek: alici[Math.floor(alici.length * 0.5)]![0] };
const zamanUc = Math.floor(zMax / 1000);
// Süre SUNUCUDAN okunur: ClickHouse --time (stderr), Postgres EXPLAIN ANALYZE "Execution Time".
// docker exec + istemci açılışı (~200 ms) ölçüme karışmaz. Önbellek SICAK: ilk koşu da aynı süreçte, disk önbelleği dolu.
const chSure = (q: string) => {
  // Sorgu stdin'den gider (kabuk kaçışı yok); --time süreyi saniye olarak stderr'e yazar.
  const r = spawnSync("docker", ["exec", "-i", "b0-ch", "clickhouse-client", "--time"], { input: q, encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(r.stderr);
  return { ms: Number(r.stderr.trim().split(/\s+/).pop()) * 1000, sonuc: r.stdout.slice(0, 80) };
};
const pgSure = (q: string) => {
  const plan = pg(`EXPLAIN (ANALYZE, TIMING OFF) ${q}`);
  return { ms: Number(/Execution Time: ([\d.]+)/.exec(plan)?.[1]), sonuc: pg(q).slice(0, 80) };
};
const olc = (f: () => { ms: number; sonuc: string }, n = 5) => {
  const ms: number[] = [];
  let son = "", ilk = 0;
  for (let i = 0; i < n; i++) { const r = f(); if (i === 0) ilk = r.ms; ms.push(r.ms); son = r.sonuc; }
  ms.sort((a, b) => a - b);
  return { ilkMs: +ilk.toFixed(1), ortancaMs: +ms[Math.floor(n / 2)]!.toFixed(1), sonuc: son.replace(/[\t\n]+/g, "|").slice(0, 60) };
};
const sorgular: Record<string, unknown> = {};
const son90 = { ch: `zaman >= toDateTime(${zamanUc}) - INTERVAL 90 DAY`, pg: `zaman >= to_timestamp(${zamanUc}) - interval '90 days'` };
for (const [ad, a] of Object.entries(hedefler)) {
  sorgular[ad] = {
    satirPencerede: say.get(a),
    chOzet: olc(() => chSure(`SELECT count(), uniqExact(kimden), sum(tutar) FROM blok_indeks WHERE kime = unhex('${a}') AND ${son90.ch} FORMAT TSV`)),
    pgOzet: olc(() => pgSure(`SELECT count(*), count(DISTINCT kimden), sum(tutar) FROM blok_indeks WHERE kime = '\\x${a}' AND ${son90.pg}`)),
    chGonderenler: olc(() => chSure(`SELECT hex(kimden), count() c FROM blok_indeks WHERE kime = unhex('${a}') AND ${son90.ch} GROUP BY kimden ORDER BY c DESC LIMIT 50 FORMAT TSV`)),
    pgGonderenler: olc(() => pgSure(`SELECT kimden, count(*) c FROM blok_indeks WHERE kime = '\\x${a}' AND ${son90.pg} GROUP BY kimden ORDER BY c DESC LIMIT 50`)),
    chAlicilar: olc(() => chSure(`SELECT count(), uniqExact(kime) FROM blok_indeks WHERE kimden = unhex('${a}') AND ${son90.ch} FORMAT TSV`)),
    pgAlicilar: olc(() => pgSure(`SELECT count(*), count(DISTINCT kime) FROM blok_indeks WHERE kimden = '\\x${a}' AND ${son90.pg}`)),
  };
}

const n = Number(chBoyut.r);
console.log(JSON.stringify({
  mod: MOD, gun: MOD === "gercek" ? +(pencereMs / 86_400_000).toFixed(3) : GUN, kopya,
  gercekPencere: { satir: ham.length, blok: pencereBlok, dakika: +(pencereMs / 60000).toFixed(1), tekilAdres: say.size, nadirAdres: nadir.size },
  satir: satirSayisi, chSatir: n, csvBayt,
  clickhouse: { diskBayt: +chBoyut.disk, baytSatir: +(chBoyut.disk / n).toFixed(1), acikBayt: +chBoyut.acik, yazmaSn: +(chYazMs / 1000).toFixed(1), satirSn: Math.round(n / (chYazMs / 1000)), birlestirmeSn: +(chBirlesMs / 1000).toFixed(1), sutunlar: chSutun.split("\n") },
  postgres: { tabloBayt: pgBoyut[0], dizinBayt: pgBoyut[1], baytSatir: +((pgBoyut[0]! + pgBoyut[1]!) / satirSayisi).toFixed(1), copySn: +(pgHamMs / 1000).toFixed(1), yazmaSn: +(pgYazMs / 1000).toFixed(1), satirSn: Math.round(satirSayisi / (pgYazMs / 1000)), dizinSn: +(pgDizinMs / 1000).toFixed(1) },
  sorgular,
}, null, 1));
