/**
 * Bilinen yakma / sıfır adresleri — kapalı liste.
 *
 * Buraya giden para YOK EDİLİR: kimse bu adreslerin anahtarına sahip değil.
 * Bir servis değildir, bir borsa hiç değildir; ama kalabalık görünür (çok
 * adrese "gönderiyor" gibi), o yüzden yapısal keşif onu servis cüzdanı SANDI
 * (2026-09-14) ve takip motoru onu "dallanma" sanıp devam ettirilebilir bir
 * sınır gibi gösterdi: koşu 8'de 70 Mn USDT'lik bir aday paranın tamamını
 * TRON sıfır adresine göndermişti.
 *
 * Liste `@cry/chain`'de, çünkü üç ayrı paket soruyor: etiket keşfi, takip
 * motoru ve arayüz. Bir adres ancak kaynağıyla girer.
 *
 * Adresler kanonik yazımla: TRON base58, EVM küçük harf.
 */
export const YAKMA_ADRESLERI: ReadonlyMap<string, string> = new Map([
  // 41 + 20 bayt sıfır; TronScan etiketi "Black Hole Address(0)".
  ["T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb", "TRON sıfır adresi"],
  // EVM sıfır adresi: token sözleşmeleri yakımı buraya transfer olarak yazar.
  ["0x0000000000000000000000000000000000000000", "EVM sıfır adresi"],
  // Geleneksel "dead" adresi; özel anahtarı bilinemez.
  ["0x000000000000000000000000000000000000dead", "EVM 0x…dEaD yakma adresi"],
]);

export function yakmaAdresiMi(adres: string): boolean {
  return YAKMA_ADRESLERI.has(adres.startsWith("0x") ? adres.toLowerCase() : adres);
}
