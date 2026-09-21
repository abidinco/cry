-- Eski kimlik `(chain, tx_hash, index)` düşürülüyor (cozulmesi-gerekenler §16, 2. adım).
--
-- Birinci göç (20260921160000) onu BİLEREK bırakmıştı: o an çalışan worker `occurrence` yazmıyordu
-- ve eski anahtar hemen kalksaydı aynı işlemdeki ÖZDEŞ transferler tek satıra inerdi (veride bir
-- işlemde 20 tane var). `occurrence` yazan yazıcı 2026-09-21'de dağıtıldı; artık düşebilir.
--
-- Neden kalıcı olamazdı: blok indeksinden okuyan yol `index` olarak OLAY dizisindeki konumu
-- veriyor, TronGrid ise adresin o işlemdeki sırasını. Eski anahtar dururken ikisi birlikte yazsaydı
-- GERÇEKTEN FARKLI iki hareket aynı (tx, index) çiftine düşüp biri sessizce atılabilirdi.
DROP INDEX "transfers_chain_tx_hash_index_key";
