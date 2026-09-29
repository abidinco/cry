-- Turun NEDEN yarida kaldigini kaydeder. "kismi" tek basina sebebi soylemiyordu ve sebep
-- yalnizca worker gunlugunde kaliyordu: kullanici "bekleyeyim mi, bir daha mi deneyeyim"
-- sorusunu cevaplayamiyordu. NULL = tur yarida kalmadi (ya da eski kayit, sorulmadi).
ALTER TABLE "addresses" ADD COLUMN "index_note" TEXT;
