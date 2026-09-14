/**
 * TronScan adres etiketleri — keşfin söyleyemediği KİMLİĞİ getirir.
 *
 * Keşif "burası bir servis cüzdanı" der, "burası Binance" DEMEZ
 * (`kesif.ts`). TronScan'ın kamuya açık etiketi (`publicTag`) bu boşluğu
 * kapatan ilk kaynak: 2026-09-14 ölçümünde arşivdeki 14 borsa adayının 4'ü
 * gerçek bir borsa adıyla etiketliydi (Binance-Hot 1, Bitfinex, Poloniex,
 * Paribu Exchange Hot Wallet).
 *
 * Aynı ölçüm bir UYARI da getirdi: bir aday "Black Hole Address(0)" çıktı —
 * keşif yakma adresini dağıtıcı sanmıştı. Etiket metni bu yüzden KAPALI bir
 * borsa sözlüğünden geçer: sözlükte olmayan etiket borsa SAYILMAZ (motor onu
 * terminal yapmaz), yalnızca bilgi olarak `diger` kategorisinde yazılır.
 * Yanlış bir "borsaya girdi" hükmü, eksik bir etiketten pahalıdır.
 *
 * Ayrıştırıcı SAF: yanıt girer, bulgu çıkar. Ağ, önbellek ve veritabanı
 * çağıranın işi — kural bir fixture üstünde sınanabilsin diye.
 */

import { tronGecerliMi } from "@cry/chain";
import type { Atlanan, TohumEtiket } from "./tipler";
import { YAKMA_ADRESLERI } from "./yakma";

export const TRONSCAN_API = "https://apilist.tronscanapi.com/api/accountv2";

/** İnsanın gidip bakabileceği sayfa — kanıtın bağlantısı. */
export const tronscanSayfasi = (adres: string) => `https://tronscan.org/#/address/${adres}`;

/**
 * Borsa sözlüğü — etiket metninin BAŞINDA aranır, kelime sınırıyla.
 *
 * Kapalı liste, çünkü etiket serbest metindir ve "içinde borsa adı geçiyor"
 * ölçütü yanlış pozitif üretir ("Binance Bridge", "Fake Binance"). Başta
 * geçmesi şart; öndeki niteleyici ("Fake", "Scam") zaten borsa demek değildir.
 * Köprü/kontrat biçimleri (`Bridge`, `Contract`) aşağıda ayrıca elenir.
 */
export const BORSA_SOZLUGU: { desen: RegExp; ad: string }[] = [
  { desen: /^binance\b/i, ad: "Binance" },
  { desen: /^okx\b|^okex\b/i, ad: "OKX" },
  { desen: /^huobi\b|^htx\b/i, ad: "HTX" },
  { desen: /^bitfinex\b/i, ad: "Bitfinex" },
  { desen: /^poloniex\b/i, ad: "Poloniex" },
  { desen: /^kucoin\b/i, ad: "KuCoin" },
  { desen: /^bybit\b/i, ad: "Bybit" },
  { desen: /^gate(\.io)?\b/i, ad: "Gate" },
  { desen: /^mexc\b/i, ad: "MEXC" },
  { desen: /^bitget\b/i, ad: "Bitget" },
  { desen: /^kraken\b/i, ad: "Kraken" },
  { desen: /^coinbase\b/i, ad: "Coinbase" },
  { desen: /^crypto\.com\b/i, ad: "Crypto.com" },
  { desen: /^bithumb\b/i, ad: "Bithumb" },
  { desen: /^upbit\b/i, ad: "Upbit" },
  { desen: /^whitebit\b/i, ad: "WhiteBIT" },
  { desen: /^paribu\b/i, ad: "Paribu" },
  { desen: /^btcturk\b/i, ad: "BtcTurk" },
  { desen: /^bitlo\b/i, ad: "Bitlo" },
  { desen: /^icrypex\b/i, ad: "ICRYPEX" },
];

/** Borsa adı taşısa da borsa CÜZDANI olmayan biçimler. */
const BORSA_DEGIL = /\b(bridge|contract|token|scam|fake|phish|hack|exploit)\b/i;

/** Yanıtın bu dosyanın okuduğu parçası — gerisi kanıta ham girmez. */
export type TronscanYaniti = {
  address?: string;
  publicTag?: string;
  addressTag?: string;
  redTag?: string;
  greyTag?: string;
  blueTag?: string;
  feedbackRisk?: boolean;
};

export type TronscanCozum =
  | { tur: "etiket"; etiketler: TohumEtiket[] }
  | { tur: "atla"; atlanan: Atlanan };

export function borsaAdi(etiket: string): string | null {
  const metin = etiket.trim();
  if (BORSA_DEGIL.test(metin)) return null;
  return BORSA_SOZLUGU.find((b) => b.desen.test(metin))?.ad ?? null;
}

/**
 * Tek bir adresin yanıtını etikete çevirir.
 *
 * `olcumTarihi` dışarıdan verilir: saf fonksiyon saat okumaz, aynı girdi
 * aynı çıktıyı verir.
 */
export function tronscanCoz(
  adres: string,
  yanit: TronscanYaniti,
  olcumTarihi: string,
): TronscanCozum {
  if (!tronGecerliMi(adres)) {
    return { tur: "atla", atlanan: { ham: adres, sebep: "geçerli bir TRON adresi değil" } };
  }
  // Yanıt BAŞKA bir adres için geldiyse (önbellek karışması, API hatası)
  // etiket o adrese asılmaz.
  if (yanit.address && yanit.address !== adres) {
    return {
      tur: "atla",
      atlanan: { ham: adres, sebep: "yanıt başka bir adres için", ayrinti: yanit.address },
    };
  }

  const kamu = (yanit.publicTag || yanit.addressTag || "").trim();
  const kirmizi = (yanit.redTag || "").trim();
  const etiketler: TohumEtiket[] = [];
  const kanit = {
    kaynak: TRONSCAN_API,
    publicTag: yanit.publicTag ?? null,
    addressTag: yanit.addressTag ?? null,
    redTag: yanit.redTag ?? null,
    feedbackRisk: yanit.feedbackRisk ?? null,
    olcumTarihi,
  };

  if (kamu) {
    const borsa = YAKMA_ADRESLERI.has(adres) ? null : borsaAdi(kamu);
    etiketler.push({
      chain: "tron",
      address: adres,
      title: kamu,
      description: borsa
        ? `TronScan kamu etiketi; borsa sözlüğünde "${borsa}"`
        : "TronScan kamu etiketi; borsa sözlüğünde yok — terminal SAYILMAZ",
      category: borsa ? "exchange_hot" : "diger",
      exchange: borsa,
      source: "tronscan",
      sourceUrl: tronscanSayfasi(adres),
      // Borsa kimliği TronScan'ın küratörlü etiketinden gelir: kaynağın
      // kendisi "kim doğruladı" sorusunun cevabıdır (OFAC gibi). Sözlüğe
      // uymayan etiket bilgi olarak durur ama doğrulanmış bir BORSA iddiası
      // taşımadığı için onay da taşımaz.
      confidence: borsa ? 0.8 : 0.5,
      dogrulanmisMi: borsa !== null,
      dogrulayan: borsa ? "tronscan" : null,
      evidence: kanit,
    });
  }

  if (kirmizi) {
    // Kırmızı etiket (dolandırıcılık/oltalama işareti) ağır bir bulgudur ama
    // borsa değildir ve paranın hareketini bitirmez.
    etiketler.push({
      chain: "tron",
      address: adres,
      title: `TronScan risk: ${kirmizi}`,
      description: "TronScan kırmızı etiketi — kullanıcı bildirimli risk işareti",
      category: "diger",
      exchange: null,
      source: "tronscan",
      sourceUrl: tronscanSayfasi(adres),
      confidence: 0.5,
      dogrulanmisMi: false,
      evidence: kanit,
    });
  }

  if (etiketler.length === 0) {
    return { tur: "atla", atlanan: { ham: adres, sebep: "TronScan'da etiket yok" } };
  }
  return { tur: "etiket", etiketler };
}
