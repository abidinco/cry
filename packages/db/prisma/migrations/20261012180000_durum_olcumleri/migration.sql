-- Dışarıdan itilen ölçümler (B3 doldurma durumu). Tamamı EKLEMEdir: eski
-- konteynerler tabloyu hiç görmez, yani migration geriye uyumludur.
CREATE TABLE "durum_olcumleri" (
    "anahtar" TEXT NOT NULL,
    "veri" JSONB NOT NULL,
    "olculdu" TIMESTAMP(3) NOT NULL,
    "guncellendi" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "durum_olcumleri_pkey" PRIMARY KEY ("anahtar")
);
