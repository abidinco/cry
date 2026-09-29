/**
 * Bir hareketin TL karşılığı — **iki kurla**.
 *
 * Kullanıcı kararı (CLAUDE.md → Kalan kararlar): rapor "işlem günü X ₺ (rapor
 * günü Y ₺)" der ve hangi kurun kullanıldığını satırda söyler. Tek sayı,
 * hangi soruya cevap verdiğini gizler: 2022'de 100 $'lık bir transfer o gün
 * 1.700 ₺, bugün 4.900 ₺ eder ve ikisi de doğrudur — hangisini istediği
 * okurun sorusuna bağlıdır.
 *
 * Katman SAF: girdi olarak fiyat/kur satırları verilir, veritabanına bakmaz.
 */

import { carp, carpMetin } from "./ondalik";

/** Bir günün fiyat + kur çifti; biri eksikse o gün için cevap YOKTUR. */
export type GunVerisi = {
  /** 1 birim varlığın USD fiyatı (metin ondalık). */
  usd: string | null;
  /** USD/TRY (metin ondalık). */
  kur: string | null;
  /** Kurun KENDİ tarihi — istenen günden geriye yürünmüş olabilir. */
  kurTarihi: string | null;
  /** Fiyat/kur bulunamadıysa sebebi (rapora girer). */
  not?: string;
};

export type Fiyatlandirma = {
  /** Varlık cinsinden okunur tutar (ör. "1500.000000"). */
  tutar: string | null;
  islemGunu: { usd: string; try: string; kurTarihi: string | null } | null;
  raporGunu: { usd: string; try: string; kurTarihi: string | null } | null;
  /**
   * Neden eksik. **Boş bir alan ile "bakılamadı" ayrı şeylerdir**; rapor bu
   * cümleyi olduğu gibi basar.
   */
  gerekce: string[];
};

export const USD_OLCEK = 6;
export const TRY_OLCEK = 2;

function birGun(ham: string, ondalik: number, v: GunVerisi, etiket: string, gerekce: string[]) {
  if (!v.usd) {
    gerekce.push(v.not ?? `${etiket}: fiyat bakılamadı`);
    return null;
  }
  if (!v.kur) {
    gerekce.push(v.not ?? `${etiket}: USD/TRY kuru bakılamadı`);
    return null;
  }
  const usd = carp(ham, ondalik, v.usd, USD_OLCEK);
  if (usd === null) {
    gerekce.push(`${etiket}: tutar fiyata çarpılamadı`);
    return null;
  }
  const tl = carpMetin(usd, v.kur, TRY_OLCEK);
  if (tl === null) {
    gerekce.push(`${etiket}: USD tutarı kura çarpılamadı`);
    return null;
  }
  return { usd, try: tl, kurTarihi: v.kurTarihi };
}

/**
 * Ham tutarı iki kurla fiyatlandır.
 *
 * `ondalikBilinmiyor` doluysa HİÇBİR çevrim yapılmaz: "ondalığı bilinmeyen
 * tutar çevrilmez" kuralı. Tanınmayan token'ı 0 ondalıkla fiyatlamak, 34
 * milyar kat yanlış bir büyüklük yazmak demekti (EVM adaptöründe ölçüldü).
 */
export function fiyatlandir(girdi: {
  hamTutar: string;
  ondalik: number;
  ondalikBilinmiyor?: boolean;
  islemGunu: GunVerisi;
  raporGunu: GunVerisi;
}): Fiyatlandirma {
  const gerekce: string[] = [];
  if (girdi.ondalikBilinmiyor) {
    return {
      tutar: null,
      islemGunu: null,
      raporGunu: null,
      gerekce: ["varlığın ondalığı bilinmiyor — tutar ham, TL karşılığı hesaplanmadı"],
    };
  }
  const tutar = carp(girdi.hamTutar, girdi.ondalik, "1", girdi.ondalik);
  return {
    tutar,
    islemGunu: birGun(girdi.hamTutar, girdi.ondalik, girdi.islemGunu, "işlem günü", gerekce),
    raporGunu: birGun(girdi.hamTutar, girdi.ondalik, girdi.raporGunu, "rapor günü", gerekce),
    gerekce,
  };
}

export const KUR_KAYNAGI = "TCMB döviz alış";

/**
 * TL karşılığının CÜMLESİ — tutarsız, yalnızca kur tarafı.
 *
 * Tek yerde durmasının sebebi: bu cümleyi hem rapor metni hem ekran yazıyor
 * ve iki kopya olsaydı biri değişir öteki kalırdı. Projenin kendi ölçümü:
 * "bir kural bir yerde uygulanıp kardeşinde unutulabiliyor."
 *
 * Boş dönmez: iki taraf da yoksa "TL karşılığı yok" ve SEBEBİ yazar.
 */
export function kurCumlesi(f: Fiyatlandirma, kaynak = KUR_KAYNAGI): string {
  if (!f.islemGunu && !f.raporGunu) {
    return `TL karşılığı yok — ${f.gerekce[0] ?? "sebep kayıtlı değil"}`;
  }
  const parca: string[] = [];
  if (f.islemGunu) {
    const t = f.islemGunu.kurTarihi ? ` · ${kaynak} ${f.islemGunu.kurTarihi}` : "";
    parca.push(`işlem günü ${f.islemGunu.try} ₺${t}`);
  }
  if (f.raporGunu) {
    const t = f.raporGunu.kurTarihi ? ` · ${kaynak} ${f.raporGunu.kurTarihi}` : "";
    parca.push(`rapor günü ${f.raporGunu.try} ₺${t}`);
  }
  const eksik = f.gerekce.length ? ` · eksik: ${f.gerekce[0]}` : "";
  return parca.join(" | ") + eksik;
}

/**
 * Rapor satırı: tutar + kur cümlesi. Tek sayı basmak yasak — hangi gün,
 * hangi kur, hangi tarihli bülten, üçü de cümlede durur.
 */
export function fiyatCumlesi(f: Fiyatlandirma, sembol: string, kaynak = KUR_KAYNAGI): string {
  if (!f.tutar) return `${f.gerekce[0] ?? "tutar okunamadı"}`;
  return `${f.tutar} ${sembol} — ${kurCumlesi(f, kaynak)}`;
}
