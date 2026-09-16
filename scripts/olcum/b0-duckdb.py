# B0 ölçümü (2026-09-16): DuckDB'nin iki biçimi — kendi veritabanı dosyası ve aylık bölümlü Parquet (ZSTD).
# b0-depolama-denemesi.mts tarafından b0-duck konteynerinde çalıştırılır; /tmp/veri.csv'yi okur.
# Süreler bu TEK süreçten okunur (docker exec masrafı yok); ilk koşu da aynı süreçte, disk önbelleği sıcak.
# Tutar DECIMAL(38,0): DuckDB'de 256 bit tam sayı yok ve Parquet HUGEINT'i DOUBLE yazıyor (hassasiyet kaybı).
# 38 haneye sığmayan tutar TRY_CAST ile boş kalır ve SAYILIR — sessizce düşmez.
import duckdb, json, os, shutil, statistics, sys, time

girdi = json.loads(sys.argv[1])
hedefler, uc = girdi["hedefler"], girdi["zamanUc"]
DB, PQ = "/data/b0.duckdb", "/data/pq"
shutil.rmtree("/data", ignore_errors=True)
os.makedirs("/data")

con = duckdb.connect(DB)
con.execute("SET preserve_insertion_order = true")

def sure(f):
    t = time.perf_counter(); r = f(); return r, (time.perf_counter() - t) * 1000

_, yaz_ms = sure(lambda: con.execute("""
  CREATE TABLE blok_indeks AS
  SELECT blok::UINTEGER blok, to_timestamp(zaman)::TIMESTAMP zaman, unhex(tx) tx, idx::USMALLINT idx,
         (CASE varlik WHEN 'TRX' THEN 1 ELSE 2 END)::UTINYINT varlik,
         unhex(kimden) kimden, unhex(kime) kime, TRY_CAST(tutar AS DECIMAL(38,0)) tutar, basarili = 1 AS basarili
  FROM read_csv('/tmp/veri.csv', header = false, columns = {
    'blok': 'BIGINT', 'zaman': 'BIGINT', 'tx': 'VARCHAR', 'idx': 'INTEGER', 'varlik': 'VARCHAR',
    'kimden': 'VARCHAR', 'kime': 'VARCHAR', 'tutar': 'VARCHAR', 'basarili': 'INTEGER'})
  ORDER BY kime, zaman"""))
con.execute("CHECKPOINT")
tasan = con.execute("SELECT count(*) FROM blok_indeks WHERE tutar IS NULL").fetchone()[0]
db_bayt = os.path.getsize(DB)

_, pq_ms = sure(lambda: con.execute(f"""
  COPY (SELECT *, strftime(zaman, '%Y%m') AS ay FROM blok_indeks ORDER BY kime, zaman)
  TO '{PQ}' (FORMAT parquet, COMPRESSION zstd, PARTITION_BY (ay), ROW_GROUP_SIZE 122880)"""))
pq_bayt = sum(os.path.getsize(os.path.join(k, d)) for k, _, ds in os.walk(PQ) for d in ds)
con.execute(f"CREATE VIEW pq AS SELECT * FROM read_parquet('{PQ}/*/*.parquet', hive_partitioning = true)")

W = f"zaman >= to_timestamp({uc})::TIMESTAMP - INTERVAL 90 DAY"
def olc(sorgu, n=5):
    ms, son = [], ""
    for _ in range(n):
        r, t = sure(lambda: con.execute(sorgu).fetchall())
        ms.append(t); son = "|".join("|".join(str(x.hex() if isinstance(x, (bytes, bytearray)) else x) for x in satir) for satir in r)
    return {"ilkMs": round(ms[0], 1), "ortancaMs": round(statistics.median(ms), 1), "sonuc": son[:80]}

# DuckDB 1.5.5'in Parquet BLOB bloom filtresi BOZUK (ölçüldü 2026-09-16, 19 Mn satır): eşitlik süzgeci
# 165 satır grubunun 165'ini eliyor ve HATASIZ 0 dönüyor; aralık süzgeci ve IN doğru. Parquet'te adres
# bu yüzden aralıkla sorulur, hata da her koşuda ayrıca SINANIR ki sürüm değişince görünsün.
def esit(tablo, sutun, a):
    return f"{sutun} >= unhex('{a}') AND {sutun} <= unhex('{a}')" if tablo == "pq" else f"{sutun} = unhex('{a}')"

def sorgular(tablo):
    return {ad: {
        "ozet": olc(f"SELECT count(*), count(DISTINCT kimden), sum(tutar) FROM {tablo} WHERE {esit(tablo, 'kime', a)} AND {W}"),
        "gonderenler": olc(f"SELECT kimden, count(*) c FROM {tablo} WHERE {esit(tablo, 'kime', a)} AND {W} GROUP BY kimden ORDER BY c DESC, kimden LIMIT 50"),
        "alicilar": olc(f"SELECT count(*), count(DISTINCT kime) FROM {tablo} WHERE {esit(tablo, 'kimden', a)} AND {W}"),
    } for ad, a in hedefler.items()}

y = hedefler["yogun"]
bloom_hatasi = {
    "esitlik": con.execute(f"SELECT count(*) FROM pq WHERE kime = unhex('{y}')").fetchone()[0],
    "aralik": con.execute(f"SELECT count(*) FROM pq WHERE kime >= unhex('{y}') AND kime <= unhex('{y}')").fetchone()[0],
    "bloomunElediGrup": con.execute(f"SELECT count(*) FILTER (WHERE bloom_filter_excludes) || '/' || count(*) FROM parquet_bloom_probe('{PQ}/*/*.parquet', 'kime', unhex('{y}'))").fetchone()[0],
}

print(json.dumps({
    "surum": duckdb.__version__, "tutari38HaneyeSigmayan": tasan,
    "duckdb": {"diskBayt": db_bayt, "yazmaSn": round(yaz_ms / 1000, 1), "sorgular": sorgular("blok_indeks")},
    "parquet": {"diskBayt": pq_bayt, "bloomHatasi": bloom_hatasi, "yazmaSn": round(pq_ms / 1000, 1), "not": "yazma süresi DuckDB tablosundan Parquet'e", "sorgular": sorgular("pq")},
}))
