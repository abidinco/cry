/**
 * SQLite deposu — Node'un yerleşik `node:sqlite` modülü, ek bağımlılık yok.
 *
 * Servis PC kapalıyken de çalışmak zorunda, o yüzden bildiği her şey burada
 * durur: takip listesi, EŞİKLER, en son bakılan an, gönderilen uyarılar ve
 * henüz özete girmemiş eşik altı hareketler.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** Var olan kuruluma sütun ekler. Sunucudaki dosya eski şemayla açılmış olabilir. */
function kolonEkle(db, tablo, tanim) {
  try {
    db.exec(`ALTER TABLE ${tablo} ADD COLUMN ${tanim}`);
  } catch {
    // Sütun zaten var — bu bir ARIZA DEĞİL.
  }
}

export function depoAc(yol = process.env.WATCHER_DB_PATH ?? "./data/watcher.sqlite") {
  mkdirSync(dirname(yol), { recursive: true });
  const db = new DatabaseSync(yol);

  db.exec(`
    CREATE TABLE IF NOT EXISTS watches (
      chain            TEXT NOT NULL,
      address          TEXT NOT NULL,
      label            TEXT,
      active           INTEGER NOT NULL DEFAULT 1,
      last_seen_tx     TEXT,
      last_checked_at  TEXT,
      PRIMARY KEY (chain, address)
    );

    CREATE TABLE IF NOT EXISTS alerts (
      chain     TEXT NOT NULL,
      address   TEXT NOT NULL,
      tx_hash   TEXT NOT NULL,
      ts        TEXT,
      summary   TEXT,
      sent_at   TEXT,
      PRIMARY KEY (chain, address, tx_hash)
    );

    CREATE TABLE IF NOT EXISTS meta (
      k TEXT PRIMARY KEY,
      v TEXT
    );

    -- Esik varlik ve adres bazinda; '*' o adresin varsayilani.
    CREATE TABLE IF NOT EXISTS thresholds (
      chain        TEXT NOT NULL,
      address      TEXT NOT NULL,
      asset_symbol TEXT NOT NULL,
      min_amount   TEXT NOT NULL,
      PRIMARY KEY (chain, address, asset_symbol)
    );

    -- Esik ALTI hareketler: gun donunce tek mesajda ozetlenir ve DUSER.
    -- Ozet gonderilmeden silinmez; gonderilemeyen ozet sonraki turda yeniden
    -- denenir (sessizce "ozetlendi" saymak, kacirilan hareketi gorunmez yapar).
    CREATE TABLE IF NOT EXISTS digest (
      gun          TEXT NOT NULL,
      chain        TEXT NOT NULL,
      address      TEXT NOT NULL,
      label        TEXT,
      asset_symbol TEXT,
      ondalik      INTEGER,
      amount_raw   TEXT,
      direction    TEXT,
      tx_hash      TEXT NOT NULL,
      movement_key TEXT NOT NULL,
      ts           TEXT,
      PRIMARY KEY (gun, chain, address, tx_hash, movement_key)
    );
  `);

  // Eski kurulumun sütunları.
  kolonEkle(db, "watches", "last_checked_ts INTEGER");
  kolonEkle(db, "alerts", "movement_key TEXT NOT NULL DEFAULT ''");
  kolonEkle(db, "alerts", "path TEXT");
  kolonEkle(db, "alerts", "reason TEXT");
  kolonEkle(db, "alerts", "asset_symbol TEXT");
  kolonEkle(db, "alerts", "amount_raw TEXT");
  kolonEkle(db, "alerts", "direction TEXT");
  kolonEkle(db, "alerts", "pushed_at TEXT");
  // Tekillik artık hareket bazında: bir işlem birden çok hareket taşıyabiliyor.
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS alerts_hareket ON alerts (chain, address, tx_hash, movement_key)",
  );

  const metaYaz = db.prepare(
    "INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
  );

  return {
    db,

    /** PC'den gelen listeyi ve EŞİKLERİ yerel kopyayla değiştirir. */
    listeyiTazele(kayitlar) {
      const ekle = db.prepare(
        `INSERT INTO watches (chain, address, label, active)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(chain, address) DO UPDATE SET label = excluded.label, active = excluded.active`,
      );
      const esikEkle = db.prepare(
        `INSERT INTO thresholds (chain, address, asset_symbol, min_amount)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(chain, address, asset_symbol) DO UPDATE SET min_amount = excluded.min_amount`,
      );
      const esikSil = db.prepare("DELETE FROM thresholds WHERE chain = ? AND address = ?");
      // Listeden düşen adres pasife çekilir, SİLİNMEZ: last_checked_ts bilgisi
      // kaybolursa adres yeniden eklendiğinde bütün geçmişi "yeni" sanılır.
      db.exec("UPDATE watches SET active = 0");
      for (const k of kayitlar) {
        ekle.run(k.chain, k.address, k.label ?? null, 1);
        // Eşikler PC'de SİLİNEBİLİR; yerelde kalan eski eşik, kaldırılmış bir
        // sınırla filtrelemeye devam ederdi.
        esikSil.run(k.chain, k.address);
        for (const e of k.thresholds ?? []) {
          esikEkle.run(k.chain, k.address, e.assetSymbol, e.minAmount);
        }
      }
      metaYaz.run("son_senkron", new Date().toISOString());
      return kayitlar.length;
    },

    aktifTakipler() {
      const satirlar = db
        .prepare(
          `SELECT chain, address, label, last_seen_tx, last_checked_ts
             FROM watches WHERE active = 1 ORDER BY address`,
        )
        .all();
      const esikler = db.prepare(
        "SELECT asset_symbol, min_amount FROM thresholds WHERE chain = ? AND address = ?",
      );
      return satirlar.map((s) => ({
        ...s,
        esikler: esikler
          .all(s.chain, s.address)
          .map((e) => ({ assetSymbol: e.asset_symbol, minAmount: e.min_amount })),
      }));
    },

    /** Bakılan anı ilerletir. Hareket bulunmasa da yazılır: "baktım" bir bilgidir. */
    bakildiYaz(chain, address, ts, txHash) {
      db.prepare(
        `UPDATE watches SET last_checked_ts = ?, last_checked_at = ?,
                            last_seen_tx = COALESCE(?, last_seen_tx)
          WHERE chain = ? AND address = ?`,
      ).run(ts, new Date().toISOString(), txHash ?? null, chain, address);
    },

    /** Uyarı kaydı. Aynı HAREKET iki kez bildirilmez. */
    uyariKaydet(k, gonderildi) {
      db.prepare(
        `INSERT INTO alerts (chain, address, tx_hash, movement_key, ts, summary, asset_symbol,
                             amount_raw, direction, path, reason, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(chain, address, tx_hash, movement_key)
           DO UPDATE SET sent_at = COALESCE(alerts.sent_at, excluded.sent_at)`,
      ).run(
        k.chain,
        k.address,
        k.txHash,
        k.movementKey,
        k.ts ?? null,
        k.summary ?? null,
        k.assetSymbol ?? null,
        k.amountRaw ?? null,
        k.direction ?? null,
        k.path ?? "mesaj",
        k.reason ?? null,
        gonderildi ? new Date().toISOString() : null,
      );
    },

    bildirildiMi(chain, address, txHash, movementKey) {
      const satir = db
        .prepare(
          `SELECT sent_at FROM alerts
            WHERE chain = ? AND address = ? AND tx_hash = ? AND movement_key = ?`,
        )
        .get(chain, address, txHash, movementKey);
      return Boolean(satir?.sent_at);
    },

    /** Eşik altı hareketi günlük özete koy. */
    ozeteKoy(gun, k) {
      db.prepare(
        `INSERT INTO digest (gun, chain, address, label, asset_symbol, ondalik, amount_raw,
                             direction, tx_hash, movement_key, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(gun, chain, address, tx_hash, movement_key) DO NOTHING`,
      ).run(
        gun,
        k.chain,
        k.address,
        k.label ?? null,
        k.assetSymbol ?? null,
        Number.isInteger(k.ondalik) ? k.ondalik : null,
        k.amountRaw ?? null,
        k.direction ?? null,
        k.txHash,
        k.movementKey,
        k.ts ?? null,
      );
    },

    /** Kapanmış (bugünden ESKİ) günlerin özet kayıtları. */
    bekleyenOzetGunleri(bugun) {
      return db
        .prepare("SELECT gun, count(*) as sayi FROM digest WHERE gun < ? GROUP BY gun ORDER BY gun")
        .all(bugun);
    },

    ozetKayitlari(gun) {
      return db
        .prepare(
          `SELECT address, label, asset_symbol, ondalik, amount_raw, direction, tx_hash, ts
             FROM digest WHERE gun = ?`,
        )
        .all(gun)
        .map((r) => ({
          address: r.address,
          label: r.label,
          assetSymbol: r.asset_symbol,
          ondalik: r.ondalik === null ? null : Number(r.ondalik),
          amountRaw: r.amount_raw,
          direction: r.direction,
          txHash: r.tx_hash,
          ts: r.ts,
        }));
    },

    /** Özet GİTTİKTEN sonra düşer; gitmediyse kayıt kalır ve yeniden denenir. */
    ozetiDusur(gun) {
      db.prepare("DELETE FROM digest WHERE gun = ?").run(gun);
      metaYaz.run("son_ozet_gunu", gun);
    },

    /** PC'ye geri gönderilmemiş uyarılar — arayüz servisten ne geldiğini görsün. */
    itilmeyenUyarilar(limit = 200) {
      return db
        .prepare(
          `SELECT chain, address, tx_hash, movement_key, ts, asset_symbol, amount_raw,
                  direction, path, reason, sent_at
             FROM alerts WHERE pushed_at IS NULL ORDER BY ts LIMIT ?`,
        )
        .all(limit)
        .map((r) => ({
          chain: r.chain,
          address: r.address,
          txHash: r.tx_hash,
          movementKey: r.movement_key,
          ts: r.ts,
          assetSymbol: r.asset_symbol,
          amountRaw: r.amount_raw,
          direction: r.direction,
          path: r.path,
          reason: r.reason,
          sentAt: r.sent_at,
        }));
    },

    itildiYaz(kayitlar) {
      const yaz = db.prepare(
        `UPDATE alerts SET pushed_at = ?
          WHERE chain = ? AND address = ? AND tx_hash = ? AND movement_key = ?`,
      );
      const simdi = new Date().toISOString();
      for (const k of kayitlar) yaz.run(simdi, k.chain, k.address, k.txHash, k.movementKey);
    },

    sonSenkron() {
      return db.prepare("SELECT v FROM meta WHERE k = 'son_senkron'").get()?.v ?? null;
    },
  };
}
