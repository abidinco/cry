/**
 * Yeni bir takip koşusunun SINIRLARI — saf, testli.
 *
 * Neden ayrı bir dosya: bugüne kadar eşikler yalnızca API gövdesinde vardı ve arayüz hiçbirini
 * göndermiyordu, yani `VARSAYILAN_ESIKLER` her koşuda sessizce geçerliydi (ölçüldü 2026-09-28:
 * `AdresGorunumu.takipBaslat` yalnızca `taintRule` yolluyordu). Alanları ekrana açarken doğrulamayı
 * da açmak gerekiyor: sunucu bir sayıya güvenirse `maxDugum: 1e9` bir koşuyu günlerce sürdürür ve
 * bunu kimse durdurmaz.
 *
 * Sınırlar GENİŞ bilerek — kullanıcı kararı: "istediğim kadar sıçrama yapabilirim (lokal makinem
 * elverirse)". Buradaki iş makineyi korumak değil, ANLAMSIZ girdiyi (NaN, negatif, sonsuz, ondalık)
 * kapıda tutmak. Gerçek maliyeti kullanıcıya ekran söyler.
 */
import { VARSAYILAN_ESIKLER } from "@cry/motor";

export type EsikGirdisi = {
  maxHop?: unknown;
  maxDugum?: unknown;
  dallanmaEsigi?: unknown;
};

export type Esik = { maxHop: number; maxDugum: number; dallanmaEsigi: number };

/** Alan adı → [en az, en çok]. Üst sınırlar makineyi değil, anlamsız girdiyi eler. */
export const SINIRLAR = {
  maxHop: [1, 50],
  maxDugum: [1, 10_000],
  dallanmaEsigi: [2, 1_000_000],
} as const;

const AD: Record<keyof typeof SINIRLAR, string> = {
  maxHop: "sıçrama bütçesi",
  maxDugum: "düğüm bütçesi",
  dallanmaEsigi: "dallanma eşiği",
};

/**
 * Verilmeyen alan varsayılanını alır; verilen alan TAM SAYI ve sınırlar içinde olmalıdır.
 * Hatalı alan sessizce varsayılana DÜŞMEZ: kullanıcı 500 yazdıysa ve 300 koştuysa, rapor
 * kendi anlattığı sınırla çelişir ("eşikler kayda YAZILIR" kuralının kapı tarafı).
 */
export function esikleriDogrula(g: EsikGirdisi): { esikler: Esik } | { hata: string } {
  const cikti: Record<string, number> = {};
  for (const anahtar of ["maxHop", "maxDugum", "dallanmaEsigi"] as const) {
    const ham = g[anahtar];
    if (ham === undefined || ham === null || ham === "") {
      cikti[anahtar] = VARSAYILAN_ESIKLER[anahtar];
      continue;
    }
    const n = typeof ham === "number" ? ham : Number(ham);
    if (!Number.isInteger(n)) return { hata: `${AD[anahtar]} tam sayı olmalı` };
    const [alt, ust] = SINIRLAR[anahtar];
    if (n < alt || n > ust) return { hata: `${AD[anahtar]} ${alt}–${ust} arasında olmalı (verilen: ${n})` };
    cikti[anahtar] = n;
  }
  return { esikler: cikti as unknown as Esik };
}

/**
 * Seçilen sınırların kullanıcıya SÖYLENECEK bedeli. Sayıyı büyütmek serbest ama sessiz olmamalı:
 * düğüm başına bir adres taraması var ve pencere ÖNCESİ geçmiş kaynaktan okunuyor (M4: adres başına
 * ~25 sn). Tam geçmiş yüklenince bu süre düşer; o yüzden metin bir SÜRE değil bir BÜYÜKLÜK verir.
 */
export function butceNotu(e: Esik): string {
  const parcalar = [`en çok ${e.maxDugum} adres taranır`, `${e.maxHop} sıçrama derinliği`];
  if (e.maxDugum >= 1000) {
    parcalar.push("bu boyda bir koşu saatler sürebilir — pencere öncesi geçmiş kaynaktan okunuyor");
  }
  return parcalar.join(" · ");
}
