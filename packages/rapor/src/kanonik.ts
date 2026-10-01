/**
 * Kanonik serileştirme ve özet.
 *
 * Kullanıcı kararı (CLAUDE.md → Kalan kararlar): **raporun kanonik hash'i
 * JSON kanıt paketinin hash'idir.** PDF ondan üretilir ve kendi hash'i ikinci
 * satır olarak yazılır — çünkü PDF yazı tipine, kütüphane sürümüne ve üretim
 * tarihine göre bayt bayt değişir; dondurulması gereken şey KANITtır, sayfa
 * düzeni değil.
 *
 * Bir hash ancak serileştirme DETERMİNİSTİK ise bir şey ispatlar. `JSON.
 * stringify` anahtar sırasını nesnenin ekleme sırasından alır, yani aynı
 * kanıttan iki farklı metin — ve iki farklı hash — üretebilir. Burada
 * anahtarlar HER DÜZEYDE sıralanır; diziler sıralanmaz, çünkü dizideki sıra
 * veridir (hop sırası, defter sırası).
 */

import { createHash } from "node:crypto";

export type JsonDeger =
  | string
  | number
  | boolean
  | null
  | JsonDeger[]
  | { [anahtar: string]: JsonDeger };

/**
 * Anahtarları her düzeyde sıralanmış, boşluksuz JSON.
 *
 * `undefined` taşıyan alan DÜŞER (JSON'da karşılığı yok); bir alanın
 * bilinmediğini söylemek isteyen taraf açıkça `null` yazar. "Yok" ile
 * "bakılamadı" ayrımı bu dosyada da geçerli: kanıt paketinde eksik bir sayı
 * `null` ve yanında SEBEBİ durur.
 */
export function kanonikJson(deger: unknown): string {
  if (deger === null) return "null";
  if (typeof deger === "string") return JSON.stringify(deger);
  if (typeof deger === "boolean") return deger ? "true" : "false";
  if (typeof deger === "number") {
    // NaN/Infinity JSON'da yok ve sessizce `null` olurdu: hesaplanamamış bir
    // sayıyı "bilinmiyor" diye yazmak, sebebini kaybetmek demek.
    if (!Number.isFinite(deger)) throw new Error(`kanıt paketinde sonlu olmayan sayı: ${deger}`);
    return JSON.stringify(deger);
  }
  if (typeof deger === "bigint") return JSON.stringify(deger.toString());
  if (Array.isArray(deger)) return `[${deger.map((d) => kanonikJson(d)).join(",")}]`;
  if (typeof deger === "object") {
    const nesne = deger as Record<string, unknown>;
    const parcalar = Object.keys(nesne)
      .filter((a) => nesne[a] !== undefined)
      .sort()
      .map((a) => `${JSON.stringify(a)}:${kanonikJson(nesne[a])}`);
    return `{${parcalar.join(",")}}`;
  }
  throw new Error(`kanıt paketine yazılamayan tür: ${typeof deger}`);
}

/** Kanonik metnin SHA-256'sı, küçük harf onaltılık. */
export function sha256(metin: string): string {
  return createHash("sha256").update(metin, "utf8").digest("hex");
}

/** Kanıt paketinin kanonik metni + hash'i. İkisi birlikte döner: hash'i basan taraf, hash'i ÜRETTİĞİ metni de verebilmeli. */
export function paketiMuhurle(paket: unknown): { metin: string; sha256: string } {
  const metin = kanonikJson(paket);
  return { metin, sha256: sha256(metin) };
}
