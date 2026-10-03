-- İzleme eşikleri: eşik üstü hareket MESAJ, altındakiler GÜNLÜK ÖZET
-- (kullanıcı kararı, CLAUDE.md → Kalan kararlar).
--
-- Tamamı EKLEMEdir, yani geriye uyumlu: migration `compose up`tan ÖNCE koşuyor
-- ve o pencerede ESKİ konteynerler yeni şemaya bakıyor. Düşürülen tek şey
-- `alerts`in tekillik indeksi; o tabloya bugün hiçbir kod yazmıyor (izleme
-- servisi kendi SQLite'ına yazıyordu) ve tablo BOŞ.

-- Eşik varlık ve adres bazında. `*` o adresin bütün varlıkları için
-- VARSAYILAN eşiktir; nullable bir sütun olsaydı Postgres null'ları eşit
-- saymadığı için aynı adrese iki varsayılan eşik yazılabilirdi.
CREATE TABLE "watch_thresholds" (
    "id" SERIAL NOT NULL,
    "watch_id" INTEGER NOT NULL,
    "asset_symbol" TEXT NOT NULL DEFAULT '*',
    "min_amount" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watch_thresholds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "watch_thresholds_watch_id_asset_symbol_key"
    ON "watch_thresholds"("watch_id", "asset_symbol");

ALTER TABLE "watch_thresholds" ADD CONSTRAINT "watch_thresholds_watch_id_fkey"
    FOREIGN KEY ("watch_id") REFERENCES "watches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Uyarının hangi yoldan (mesaj|ozet) ve hangi sebeple gittiği. Yol yazılmazsa
-- "neden bu kadar az mesaj geldi" sorusu cevaplanamaz; sebep yazılmazsa
-- eşiği UYGULAYAMADIĞIMIZ hareket, eşik altında kalmış gibi okunur.
ALTER TABLE "alerts" ADD COLUMN "path" TEXT DEFAULT 'mesaj';
ALTER TABLE "alerts" ADD COLUMN "reason" TEXT;

-- Bir işlem birden çok hareket taşıyabiliyor (birebir aynı 20 Transfer olayı
-- ölçüldü, yirmisi de gerçek) ve biri eşiğin üstünde öteki altında kalabilir.
-- Tekillik yalnızca tx'ten kurulsaydı ikinci hareket SESSİZCE düşerdi.
ALTER TABLE "alerts" ADD COLUMN "movement_key" TEXT NOT NULL DEFAULT '';
DROP INDEX IF EXISTS "alerts_watch_id_tx_hash_key";
CREATE UNIQUE INDEX "alerts_watch_id_tx_hash_movement_key_key"
    ON "alerts"("watch_id", "tx_hash", "movement_key");
