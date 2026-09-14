/**
 * Bilinen yakma / sıfır adresleri — kapalı liste.
 *
 * Buraya giden para yok edilir. Bir servis değildir, bir borsa hiç
 * değildir; ama kalabalık görünür (çok adres gönderir), o yüzden yapısal
 * keşif onu servis cüzdanı SANAR. Ölçüldü (2026-09-14): keşfin 12 adayından
 * biri TRON sıfır adresiydi ve TronScan onu "Black Hole Address(0)" diye
 * etiketliyordu. Liste kapalı: bir adres ancak kaynağıyla girer.
 */
export const YAKMA_ADRESLERI: ReadonlyMap<string, string> = new Map([
  // 41 + 20 bayt sıfır; TronScan etiketi "Black Hole Address(0)".
  ["T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb", "TRON sıfır adresi"],
]);
