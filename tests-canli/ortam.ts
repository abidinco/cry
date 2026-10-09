/**
 * Canlı testlerin ortamı İKİ dosyadan gelir (CLAUDE.md → yerel betik ortamı):
 * kök `.env` konteyner adlarını ve `TRONSCAN_API_KEY`i, `apps/web/.env.local`
 * `TRONGRID_API_KEY` ile `ETHERSCAN_API_KEY`i taşıyor. Kökteki iki anahtar BOŞ.
 *
 * **`process.loadEnvFile` BURADA KULLANILMAZ.** Ölçüldü (2026-10-09): o işlev
 * zaten TANIMLI bir değişkeni EZMİYOR ve kökteki boş `TRONGRID_API_KEY=` bir
 * tanımdır — iki dosya sırayla yüklendiğinde anahtar BOŞ kalıyor ve canlı takım
 * "anahtar yok" diye kırmızı yanıyordu. CLI'nin `--env-file` zinciri ise
 * sonrakini geçerli sayıyor (aynı turda ölçüldü: `--env-file=.env
 * --env-file=apps/web/.env.local` → ikisi de dolu). Yani iki yol AYNI DEĞİL.
 *
 * Bu yüzden ayrıştırma burada yapılır ve kural açıktır: **boş değer dolu bir
 * değeri ezmez**, dolu değer sonraki dosyada kazanır. Değerler EKRANA BASILMAZ.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function ayristir(icerik: string): Map<string, string> {
  const degerler = new Map<string, string>();
  for (const satir of icerik.split(/\r?\n/)) {
    const t = satir.trim();
    if (!t || t.startsWith("#")) continue;
    const esit = t.indexOf("=");
    if (esit <= 0) continue;
    const ad = t.slice(0, esit).trim();
    let deger = t.slice(esit + 1).trim();
    if (
      (deger.startsWith('"') && deger.endsWith('"') && deger.length > 1) ||
      (deger.startsWith("'") && deger.endsWith("'") && deger.length > 1)
    ) {
      deger = deger.slice(1, -1);
    }
    degerler.set(ad, deger);
  }
  return degerler;
}

for (const ad of [".env", "apps/web/.env.local"]) {
  const yol = resolve(import.meta.dirname, "..", ad);
  if (!existsSync(yol)) continue;
  try {
    for (const [k, v] of ayristir(readFileSync(yol, "utf8"))) {
      // Boş değer, dolu bir değeri ezmez: kökteki `TRONGRID_API_KEY=` satırı
      // `.env.local`in gerçek anahtarını silerdi.
      if (!v && process.env[k]) continue;
      process.env[k] = v;
    }
  } catch (e) {
    console.warn(`ortam dosyası okunamadı (${ad}): ${(e as Error).message}`);
  }
}
