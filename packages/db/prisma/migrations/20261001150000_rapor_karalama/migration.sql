-- Rapor: karalama vakası + PDF'in kendi özeti.
--
-- İkisi de SÜTUN EKLEMEsidir, yani geriye uyumlu: migration `compose up`tan
-- ÖNCE koşuyor ve o pencerede ESKİ konteynerler yeni şemaya bakıyor
-- (CLAUDE.md → Windows self-hosted runner). Varsayılanlar bu yüzden şart.

-- Koşu başlatılırken adsız açılan vaka KARALAMAdır ve karalamadan rapor
-- alınmaz. Var olan vakalar adlandırılmış sayılır: hiçbiri otomatik açılma
-- bayrağı taşımıyordu, yani `true` yazmak onları yanlış yere koyardı.
ALTER TABLE "cases" ADD COLUMN "is_draft" BOOLEAN NOT NULL DEFAULT false;

-- Kanonik hash kanıt paketinin; PDF ondan üretilir ve kendi hash'i AYRI
-- sütunda durur. Tek sütuna iki hash sığdırmak, hangi şeyin mühürlendiğini
-- gizlerdi.
ALTER TABLE "reports" ADD COLUMN "pdf_sha256" TEXT;
