/**
 * CoinGecko — token → USD günlük fiyat.
 *
 * Ücretsiz katmanın İKİ sert sınırı ölçüldü (2026-09-30) ve ikisi de koda
 * yazılmak zorunda, çünkü ikisi de "fiyat yok" gibi görünüyor:
 *
 * 1. **365 günden eskisini VERMİYOR** ve bunu HTTP **401** ile söylüyor
 *    (`error_code: 10012`). 401'i "kimlik hatası" sanmak, 2015–2025 arasını
 *    "bu token'ın fiyatı yok" diye okumak olurdu. Ölçüldü: 15-06-2022 → 401,
 *    29-09-2025 → 200.
 * 2. **Hız sınırı çok dar ve 429 ISRAR EDİYOR**: 6 ardışık çağrının 6'sı da
 *    429 döndü. Yani geri çekilme şart, ve sonuç her hâlükârda KALICI olarak
 *    yazılmalı — aynı günü ikinci kez sormanın bedeli yüksek.
 */

import type { FiyatYoklamasi, GunlukFiyat } from "./tipler";

export const CG_TABAN = "https://api.coingecko.com/api/v3";

/** Ücretsiz katmanın geçmiş penceresi (gün). Ölçülmüş sınır, belgelerin iddiası değil. */
export const CG_GECMIS_GUN = 365;

/**
 * Zincir → CoinGecko platform kimliği.
 *
 * Sembol kimlik değildir, sözleşme kimliktir; CoinGecko'da da adres HANGİ
 * platformda diye sorulur. Bugün ölçülen: `tron` ve `ethereum`.
 */
export const CG_PLATFORM: Record<string, string> = {
  tron: "tron",
  ethereum: "ethereum",
  polygon: "polygon-pos",
  arbitrum: "arbitrum-one",
  optimism: "optimistic-ethereum",
  base: "base",
  avalanche: "avalanche",
  bsc: "binance-smart-chain",
};

/** Zincirin YERLİ varlığının coin kimliği (sözleşmesi olmayan varlık). */
export const CG_YERLI: Record<string, string> = {
  tron: "tron",
  ethereum: "ethereum",
  polygon: "matic-network",
  arbitrum: "ethereum",
  optimism: "ethereum",
  base: "ethereum",
  avalanche: "avalanche-2",
  bsc: "binancecoin",
};

/**
 * Tarih biçimi **GG-AA-YYYY**, ISO DEĞİL.
 *
 * Sessiz tuzak: `10-01-2025` kaynağa göre 10 Ocak, ISO okuyan bir göze göre
 * 1 Ekim. Ayın 12'sinden küçük her günde iki okuma da "geçerli" görünür ve
 * yanlış günün fiyatı hatasız yazılırdı.
 */
export function cgTarih(isoGun: string): string {
  const [yil, ay, gun] = isoGun.split("-");
  if (!yil || !ay || !gun) throw new Error(`geçersiz gün: ${isoGun}`);
  return `${gun}-${ay}-${yil}`;
}

export function cgGecmisUrl(coinId: string, isoGun: string): string {
  return `${CG_TABAN}/coins/${encodeURIComponent(coinId)}/history?date=${cgTarih(isoGun)}&localization=false`;
}

export function cgSozlesmeUrl(zincir: string, sozlesme: string): string | null {
  const platform = CG_PLATFORM[zincir];
  if (!platform) return null;
  return `${CG_TABAN}/coins/${platform}/contract/${encodeURIComponent(sozlesme)}`;
}

/**
 * İstenen gün ücretsiz pencerenin İÇİNDE mi?
 *
 * Bunu çağrıdan ÖNCE sormak, sınırın dışındaki 11.999 çifti hız sınırını
 * dövmeden "aralik_disi" diye kapatmayı sağlıyor.
 */
export function pencereIcinde(isoGun: string, bugun: Date = new Date()): boolean {
  const g = Date.parse(`${isoGun}T00:00:00Z`);
  if (Number.isNaN(g)) return false;
  const fark = (Date.UTC(bugun.getUTCFullYear(), bugun.getUTCMonth(), bugun.getUTCDate()) - g) / 86_400_000;
  return fark >= 0 && fark <= CG_GECMIS_GUN;
}

/**
 * Sayıyı Decimal sütununa gidecek METNE çevir.
 *
 * `String(3.2e-9)` → `"3.2e-9"` ve bu Decimal(38,12) için geçerli bir değer
 * değil. Küçük ondalıklı token fiyatları GERÇEK; üstel yazım sessizce ya
 * patlar ya yanlış büyüklük yazardı. (Projenin "ham tutar" kuralının fiyat
 * tarafındaki karşılığı.)
 */
export function fiyatMetni(n: number): string | null {
  if (!Number.isFinite(n) || n < 0) return null;
  if (!/e/i.test(String(n))) return String(n);
  // Üstel yazımı ondalığa aç; Decimal(38,12) 12 haneyi taşıyor.
  const sabit = n.toFixed(12);
  return Number(sabit) === 0 && n > 0 ? null : sabit;
}

type CgGecmisYanit = {
  id?: string;
  market_data?: { current_price?: Record<string, number> };
};

/**
 * `history` yanıtını çevir.
 *
 * Alan adı `current_price` ama bu **o günkü** fiyattır — uç `history`.
 * `market_data` hiç yoksa token o tarihte kaynakta YOK (henüz listelenmemiş);
 * bu bir cevaptır, hata değil.
 */
export function cgGecmisCevir(coinId: string, isoGun: string, govde: string): FiyatYoklamasi {
  let j: CgGecmisYanit;
  try {
    j = JSON.parse(govde) as CgGecmisYanit;
  } catch {
    return { sonuc: "kaynak_hatasi", detay: "yanıt JSON değil" };
  }
  const ham = j.market_data?.current_price?.usd;
  if (ham === undefined) {
    return { sonuc: "kaynakta_yok", detay: "o tarihte market_data yok (listelenmemiş olabilir)" };
  }
  const usd = fiyatMetni(ham);
  if (usd === null) return { sonuc: "kaynak_hatasi", detay: `fiyat sayıya çevrilemedi: ${ham}` };
  const fiyat: GunlukFiyat = { coinId: j.id ?? coinId, tarih: isoGun, usd };
  return { sonuc: "bulundu", fiyat };
}

/**
 * HTTP durumunu cevaba çevir.
 *
 * **401 burada kimlik hatası DEĞİL, aralık hatasıdır** (`error_code: 10012`).
 * Anahtarsız kullanımda başka bir 401 sebebi ölçülmedi; yine de gövde
 * sorulur — kaynağın söylediği, bizim tahminimizden güçlüdür.
 */
export function cgDurumu(coinId: string, isoGun: string, status: number, govde: string): FiyatYoklamasi {
  if (status === 200) return cgGecmisCevir(coinId, isoGun, govde);
  if (status === 429 || status === 503) return { sonuc: "hiz_siniri", detay: `HTTP ${status}` };
  if (status === 401 && govde.includes("10012")) {
    return { sonuc: "aralik_disi", detay: `ücretsiz katman ${CG_GECMIS_GUN} günden eskisini vermiyor` };
  }
  if (status === 404) return { sonuc: "kaynakta_yok", detay: "coin kimliği kaynakta yok" };
  return { sonuc: "kaynak_hatasi", detay: `HTTP ${status}: ${govde.slice(0, 120)}` };
}
