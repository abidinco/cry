/**
 * Kanıt paketinin BİÇİMİ.
 *
 * Paket bir anın tutanağıdır: koşunun parametreleri, grafın tamamı, her
 * hareketin o günkü ve rapor günündeki TL karşılığı, kullanılan kurun tarihi,
 * neyin GÖRÜLEMEDİĞİ ve neyin bakılamadığı. Hash bu metnin üstünden alınır,
 * yani pakete girmeyen bir şey rapora da girmez.
 *
 * `surum` alanı ilk satırda: biçim değiştiğinde eski bir paketin hash'i
 * yeniden üretilebilsin diye. Eski bir raporun hash'i geri alınamaz.
 */

import type { Fiyatlandirma } from "@cry/fiyat";

export const KANIT_SURUMU = "cry-kanit-2";

/** Atıf kuralının İNSAN CÜMLESİ — rapor bunu olduğu gibi basar. */
export const ATIF_CUMLELERI: Record<string, string> = {
  fifo: "FIFO: bir adrese giren para, çıkanların sırasıyla eşlenir (ilk giren ilk çıkar).",
  orantisal: "Orantısal: çıkan her hareket, o ana kadar girmiş bütün kaynaklardan payları oranında taşır.",
  zaman_pencereli: "Zaman pencereli: yalnızca girişten sonraki belirli süre içindeki çıkışlar izli sayılır.",
};

export type KanitKenari = {
  txHash: string;
  txIndex: number;
  kimden: string;
  kime: string;
  sembol: string;
  sozlesme: string | null;
  ondalik: number;
  /** Kaynak ondalığı VEREMEDİYSE true: tutar ham taşınır, TL karşılığı hesaplanmaz. */
  ondalikBilinmiyor?: boolean;
  hamTutar: string;
  zamanUtc: string;
  hop: number;
  /** Atıf payı — metin, çünkü float biçimi serileştirmeye göre değişebilir. */
  izliPay: string;
  fiyat: Fiyatlandirma;
};

export type KanitDugumu = {
  adres: string;
  hop: number;
  hamTutar: string | null;
  terminalMi: boolean;
  terminalSebebi: string | null;
  /**
   * Bu adres TARANDI mı: `tam` | `kismi` | `bilinmiyor`.
   *
   * Grafın kapsamı buradan okunur. Taranmamış bir düğümden çıkan para izin
   * DIŞINDA kalmış olabilir ve bu, "o düğümden para çıkmadı" ile aynı cümle
   * değildir. Arşivde kaydı olmayan adres de `bilinmiyor` sayılır.
   */
  indeksDurumu: string;
  /** Tarama yarıda kaldıysa SEBEBİ: sayfa_butcesi | hiz_siniri | kaynak_hatasi | adaptor_yok | iptal. */
  indeksNotu: string | null;
  /** Koşu anında dondurulmuş etiket görüntüsü. */
  etiketler: unknown[];
};

/**
 * Kapsamın DÜĞÜM tarafı: izlenen yolun yanında İZLENMEYEN.
 *
 * Karşı tarafın ilk soracağı şey budur ve cevabı bugüne kadar yalnızca
 * veritabanında yaşıyordu: hangi düğüme hiç bakılmadı, hangi tarama yarıda
 * kaldı ve neden, iz kaç kez doğrulanmamış bir etikette durdu.
 */
export type BakilmayanOzeti = {
  dugum: number;
  taranan: number;
  kismi: number;
  bakilmayan: number;
  /** Yarıda kalan/hiç yapılmayan taramaların sebepleri, düğüm sayılarıyla. */
  taramaNotlari: { not: string; dugum: number }[];
  /** İzin DOĞRULANMAMIŞ bir borsa adayında durduğu düğüm sayısı. */
  dogrulanmamisTerminal: number;
  /** Düğüm bütçesi dolduğu için yazılıp TARANMAYAN sınır düğümü sayısı. */
  sinirDugumu: number;
  cumle: string;
};

export type VarlikOzeti = {
  sembol: string;
  sozlesme: string | null;
  ondalik: number;
  kenar: number;
  hamToplam: string;
  /** Okunur tutar; ondalığı bilinmeyen varlıkta `null`. */
  tutar: string | null;
  /** İşlem günü kurlarıyla TL toplamı. */
  islemGunuTry: string | null;
  /** Rapor günü kuruyla TL toplamı. */
  raporGunuTry: string | null;
  /**
   * Toplam bir ALT SINIR mı? Fiyatı olmayan kenar varsa evet — ve kaç kenarın
   * fiyatsız kaldığı yanında durur. Eksiği söylemeyen bir toplam, eksiksiz
   * sanılır.
   */
  fiyatsizKenar: number;
};

export type KanitPaketi = {
  surum: string;
  baslik: string;
  uretildi: string;
  /** Fiyatların "bugün" ucu — UTC gün. */
  raporGunu: string;
  vaka: { slug: string; baslik: string };
  kosu: {
    id: string;
    zincir: string;
    kok: string;
    yon: string;
    atifKurali: string;
    esikler: unknown;
    durum: string;
    durmaSebebi: string | null;
    baslangic: string;
    bitis: string | null;
    istatistik: unknown;
  };
  metodoloji: {
    atifKurali: string;
    atifCumlesi: string;
    kurKaynagi: string;
    gunSiniri: string;
    fiyatGeriyeYurume: string;
    kurGeriyeYurumeGun: number;
    uyarilar: string[];
  };
  kapsam: {
    /** Zincirde VAR OLUP okuyamadığımız şeyler; adaptör yoksa `null` = BİLİNMİYOR. */
    gorulemeyenler: string[] | null;
    korlukCumlesi: string;
    /** Grafın kendi kapsamı: hangi düğüme bakılmadı, hangi tarama yarıda kaldı. */
    bakilmayanlar: BakilmayanOzeti;
  };
  ozet: {
    dugum: number;
    kenar: number;
    varliklar: VarlikOzeti[];
    durma: Record<string, number>;
    devam: number;
    /** Paketin kendi eksikleri: fiyat/kur bulunamayan kenarların sebepleri, sayılarıyla. */
    eksikler: { sebep: string; kenar: number }[];
  };
  dugumler: KanitDugumu[];
  defter: KanitKenari[];
};
