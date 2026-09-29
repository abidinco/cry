-- Fiyat ve kur YOKLAMALARI: olumsuz biten her sorgunun sebebi.
--
-- Neden iki ayrı tablo ve neden yeni tablo: `prices_daily.usd` ve
-- `fx_rates_daily.usd_try` zorunlu sütunlar, yani bir satır "değer yok"
-- diyemiyor. Sütunu nullable yapmak eski okuyucuyu yalancı çıkarırdı; tablo
-- EKLEMEK geriye uyumludur (migration `compose up`tan ÖNCE koşuyor, eski
-- konteynerler yeni şemaya bakar).

CREATE TABLE "price_lookups" (
    "asset_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "outcome" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "detail" TEXT,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_lookups_pkey" PRIMARY KEY ("asset_id","date")
);

CREATE INDEX "price_lookups_outcome_idx" ON "price_lookups"("outcome");

ALTER TABLE "price_lookups" ADD CONSTRAINT "price_lookups_asset_id_fkey"
    FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "fx_lookups" (
    "date" DATE NOT NULL,
    "outcome" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "detail" TEXT,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_lookups_pkey" PRIMARY KEY ("date")
);

CREATE INDEX "fx_lookups_outcome_idx" ON "fx_lookups"("outcome");
