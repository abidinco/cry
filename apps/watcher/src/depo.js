/**
 * SQLite deposu — Node'un yerleşik `node:sqlite` modülü, ek bağımlılık yok.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

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
  `);

  return {
    db,

    /** PC'den gelen listeyi yerel kopyayla değiştirir. */
    listeyiTazele(kayitlar) {
      const ekle = db.prepare(
        `INSERT INTO watches (chain, address, label, active)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(chain, address) DO UPDATE SET label = excluded.label, active = excluded.active`,
      );
      // Listeden düşen adres pasife çekilir, SİLİNMEZ: last_seen_tx bilgisi
      // kaybolursa adres yeniden eklendiğinde bütün geçmişi "yeni" sanılır.
      db.exec("UPDATE watches SET active = 0");
      for (const k of kayitlar) {
        ekle.run(k.chain, k.address, k.label ?? null, 1);
      }
      db.prepare("INSERT INTO meta (k, v) VALUES ('son_senkron', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v")
        .run(new Date().toISOString());
      return kayitlar.length;
    },

    aktifTakipler() {
      return db.prepare("SELECT chain, address, label, last_seen_tx FROM watches WHERE active = 1").all();
    },

    sonIslemiYaz(chain, address, txHash) {
      db.prepare(
        "UPDATE watches SET last_seen_tx = ?, last_checked_at = ? WHERE chain = ? AND address = ?",
      ).run(txHash, new Date().toISOString(), chain, address);
    },

    /** Bildirim kaydı. Aynı işlem iki kez bildirilmez. */
    uyariKaydet(chain, address, txHash, ts, ozet, gonderildi) {
      db.prepare(
        `INSERT INTO alerts (chain, address, tx_hash, ts, summary, sent_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(chain, address, tx_hash) DO UPDATE SET sent_at = COALESCE(alerts.sent_at, excluded.sent_at)`,
      ).run(chain, address, txHash, ts ?? null, ozet ?? null, gonderildi ? new Date().toISOString() : null);
    },

    bildirildiMi(chain, address, txHash) {
      const satir = db
        .prepare("SELECT sent_at FROM alerts WHERE chain = ? AND address = ? AND tx_hash = ?")
        .get(chain, address, txHash);
      return Boolean(satir?.sent_at);
    },

    sonSenkron() {
      return db.prepare("SELECT v FROM meta WHERE k = 'son_senkron'").get()?.v ?? null;
    },
  };
}
