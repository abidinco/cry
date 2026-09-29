/**
 * Fiyat ve kur katmanının tipleri.
 *
 * Bu dosyanın taşıdığı tek fikir: **"fiyat yok" ile "fiyata bakılamadı" ayrı
 * cevaplardır.** `prices_daily`de satır olmaması ikisini de anlatır; o yüzden
 * her yoklama, cevabı olumsuz olsa bile SEBEBİYLE kayda geçer.
 */

/** Bir yoklamanın sonucu. Sıra: önce cevap var mı, sonra neden yok. */
export type YoklamaSonucu =
  /** Kaynak değeri verdi. */
  | "bulundu"
  /** Kaynak o gün için bir değer YAYINLAMADI (TCMB hafta sonu/tatil: HTTP 404). */
  | "yayinlanmadi"
  /** Kaynağın ücretsiz katmanı o tarihe BAKAMIYOR (CoinGecko > 365 gün: HTTP 401). */
  | "aralik_disi"
  /** Kaynak bu varlığı tanımıyor (listelenmemiş token). */
  | "kaynakta_yok"
  /** Hız sınırı; sonra yeniden denenebilir. */
  | "hiz_siniri"
  /** Kaynak hatası ya da ağ hatası; sonra yeniden denenebilir. */
  | "kaynak_hatasi";

/** Yeniden denemenin anlamı var mı? "yok" cevabı kalıcıdır, "bakılamadı" değil. */
export function tekrarDenenir(sonuc: YoklamaSonucu): boolean {
  return sonuc === "hiz_siniri" || sonuc === "kaynak_hatasi";
}

/**
 * TCMB bülteninden okunan bir günün kurları.
 *
 * Dördü de taşınır: bugün `dovizAlis` yazılıyor (kullanıcı kararı, VUK 280
 * dayanağıyla) ama karar değişirse ayrıştırıcı değil yalnızca yazan taraf
 * değişsin.
 */
export type TcmbKur = {
  /** Bültenin KENDİ tarihi (ISO gün). İstenen tarih DEĞİL — bkz. tcmb.ts. */
  tarih: string;
  bultenNo: string | null;
  dovizAlis: string;
  dovizSatis: string;
  efektifAlis: string;
  efektifSatis: string;
};

export type TcmbYoklama =
  | { sonuc: "bulundu"; kur: TcmbKur }
  | { sonuc: Exclude<YoklamaSonucu, "bulundu">; detay: string };

/** CoinGecko'dan okunan bir günün fiyatı. */
export type GunlukFiyat = {
  /** CoinGecko coin kimliği — sembol DEĞİL (sembol kimlik değildir). */
  coinId: string;
  /** İstenen gün (ISO). */
  tarih: string;
  /** USD fiyat, metin olarak: Decimal(38,12) sütununa kayıpsız gitsin. */
  usd: string;
};

export type FiyatYoklamasi =
  | { sonuc: "bulundu"; fiyat: GunlukFiyat }
  | { sonuc: Exclude<YoklamaSonucu, "bulundu">; detay: string };
