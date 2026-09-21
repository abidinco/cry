-- Hareketin kimliği KAYNAĞA BAĞLI olamaz (ölçüm M1-E, 2026-09-21).
--
-- Eski tekillik (chain, tx_hash, index) TronGrid'in verdiği sıraya dayanıyordu. O sıra, adresin
-- o işlemdeki kayıtlarını BÜTÜN token'lar boyunca sayıyor; blok indeksi yalnızca USDT ve TRX
-- tuttuğu için aynı sayıyı üretemiyor. Ölçüldü: 2.270 harekette 60 uyuşmazlık, yani aynı para
-- iki satır olurdu. Kaynaktan bağımsız kural 0 uyuşmazlık verdi: işlem içinde aynı
-- (kimden, kime, varlık, tutar) dörtlüsünün kaçıncı TEKRARI olduğu.
--
-- `index` SİLİNMEZ: sıralama ve gösterim onu kullanıyor (takip.ts `orderBy: [ts, index]`).

ALTER TABLE "transfers" ADD COLUMN "occurrence" INTEGER NOT NULL DEFAULT 0;

-- Mevcut satırlar için tekrar sırası hesaplanır. Sıralama (index, id): aynı dörtlüden birden çok
-- satır olan öbek bugün 4 tane ve hepsi aynı işlemin özdeş kayıtları — hangisine 0 dendiği
-- sonucu değiştirmez, ama tekrarlanabilir olsun diye sabit bir sıra veriliyor.
UPDATE "transfers" AS t
SET "occurrence" = s.n
FROM (
  SELECT "id",
         (row_number() OVER (
            PARTITION BY "chain", "tx_hash", "from_address_id", "to_address_id", "asset_id", "amount_raw"
            ORDER BY "index", "id") - 1) AS n
  FROM "transfers"
) AS s
WHERE t."id" = s."id" AND t."occurrence" <> s.n;

-- ESKI TEKILLIK BURADA SILINMEZ. Bu goc uygulandiginda calisan worker hala eski kodu tasiyor ve
-- `occurrence` yazmiyor (varsayilan 0). Eski anahtar hemen kalkarsa, ayni islemdeki OZDES
-- transferler (olculdu: bir islemde 20 tane) tek satira iner ve para sessizce kaybolur. Eski
-- anahtar, yeni yazici dagitilana kadar kalir; ikinci goc onu dusurur.

CREATE UNIQUE INDEX "transfers_chain_tx_hash_from_address_id_to_address_id_asset_key"
  ON "transfers" ("chain", "tx_hash", "from_address_id", "to_address_id", "asset_id", "amount_raw", "occurrence");
