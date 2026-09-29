/**
 * TCMB günlük döviz kuru bülteni — USD/TRY'nin resmî kaynağı.
 *
 * Neden bu kaynak: ücretsiz, anahtarsız, tam geçmişli ve kaynağın KENDİSİ
 * yetkili. Ölçüldü (2026-09-30): 2005-01-03 bile HTTP 200 (25–170 ms), yani
 * arşivin tamamı (ilk hareket 2015-09-28) kapsanıyor.
 *
 * Ayrıştırıcı SAF: metin girer, kur çıkar. Ağ ve veritabanı çağıranın işi.
 */

import type { TcmbKur, TcmbYoklama } from "./tipler";

/**
 * Bülten adresi. Dosya adı gün-ay-yıl, klasör yıl-ay.
 *
 * `today.xml` KULLANILMAZ: ölçüldü (2026-09-30 00:14) — o saatte hâlâ
 * 29.09.2026 bültenini veriyordu, çünkü TCMB günün kurunu öğleden sonra
 * yayımlar. Tarihli adres sorulan günün ne dediğini kesin söyler.
 */
export function tcmbUrl(isoGun: string): string {
  const [yil, ay, gun] = isoGun.split("-");
  if (!yil || !ay || !gun) throw new Error(`geçersiz gün: ${isoGun}`);
  return `https://www.tcmb.gov.tr/kurlar/${yil}${ay}/${gun}${ay}${yil}.xml`;
}

const TARIH = /Tarih="(\d{2})\.(\d{2})\.(\d{4})"/;
const BULTEN = /Bulten_No="([^"]*)"/;
const USD_BLOK = /<Currency[^>]*\bKod="USD"[^>]*>([\s\S]*?)<\/Currency>/;

function alan(blok: string, ad: string): string | null {
  const m = blok.match(new RegExp(`<${ad}>([^<]*)</${ad}>`));
  const deger = m?.[1]?.trim();
  return deger ? deger : null;
}

/**
 * Bülteni ayrıştır.
 *
 * **Bültenin tarihi gövdeden okunur, adresten DEĞİL.** Aynı kuralın iki yüzü
 * var: `today.xml` dünün bültenini veriyor (ölçüldü), ve tarihli bir adresin
 * 200 dönmesi o günün bülteni olduğunu ispatlamaz. Adresin tarihine güvenip
 * yazmak, pazartesinin kurunu salı gününe yazmak demekti.
 */
export function tcmbCevir(xml: string): TcmbYoklama {
  const tarih = xml.match(TARIH);
  if (!tarih) return { sonuc: "kaynak_hatasi", detay: "bültende Tarih alanı yok" };

  const blok = xml.match(USD_BLOK);
  if (!blok?.[1]) return { sonuc: "kaynak_hatasi", detay: "bültende USD bloğu yok" };

  /**
   * Birim ŞART koşulur. TCMB kimi para birimini 100 birim üzerinden yazıyor
   * (JPY). USD bugün 1 ama bu bir ÖLÇÜM, varsayım değil: birim değişirse
   * sessizce 100 kat yanlış bir kur yazmaktansa hata vermek gerekir.
   */
  const birim = alan(blok[1], "Unit");
  if (birim !== "1") {
    return { sonuc: "kaynak_hatasi", detay: `USD birimi 1 değil: ${birim ?? "yok"}` };
  }

  const dovizAlis = alan(blok[1], "ForexBuying");
  const dovizSatis = alan(blok[1], "ForexSelling");
  if (!dovizAlis || !dovizSatis) {
    // Resmî tatile denk gelen kimi bültende kur alanları BOŞ geliyor; bu
    // "kur yayınlanmadı"dır, bir hata değil.
    return { sonuc: "yayinlanmadi", detay: "bülten var ama USD kur alanları boş" };
  }

  const kur: TcmbKur = {
    tarih: `${tarih[3]}-${tarih[2]}-${tarih[1]}`,
    bultenNo: xml.match(BULTEN)?.[1]?.trim() || null,
    dovizAlis,
    dovizSatis,
    efektifAlis: alan(blok[1], "BanknoteBuying") ?? dovizAlis,
    efektifSatis: alan(blok[1], "BanknoteSelling") ?? dovizSatis,
  };
  return { sonuc: "bulundu", kur };
}

/**
 * HTTP durumunu cevaba çevir.
 *
 * **404 bir hata DEĞİLDİR**, "o gün bülten yayınlanmadı"dır: hafta sonu ve
 * resmî tatil (ölçüldü: 2026-09-27 Pazar ve 2026-01-01 → 404). Bunu
 * `kaynak_hatasi` saymak, bakılmış bir günü sonsuza dek yeniden sorduturdu.
 */
export function tcmbDurumu(status: number, govde: string): TcmbYoklama {
  if (status === 404) return { sonuc: "yayinlanmadi", detay: "TCMB o gün bülten yayınlamadı" };
  if (status === 429 || status === 503) return { sonuc: "hiz_siniri", detay: `HTTP ${status}` };
  if (status !== 200) return { sonuc: "kaynak_hatasi", detay: `HTTP ${status}` };
  return tcmbCevir(govde);
}

/**
 * Yazılacak kur: kullanıcı kararı (2026-09-30) **döviz alış** (ForexBuying),
 * dayanağı VUK 280'in yabancı para değerlemesi.
 *
 * Seçim `source` sütununa da yazılır — "atıf kuralı bir SEÇİMDİR ve rapora
 * YAZILIR" kuralının buradaki karşılığı: kuru söylemeyen bir TL tutarı
 * savunulamaz.
 */
export const TCMB_ALAN = "dovizAlis" as const satisfies keyof TcmbKur;
export const TCMB_KAYNAK = "tcmb-doviz-alis";

export function yazilacakKur(kur: TcmbKur): string {
  return kur[TCMB_ALAN];
}
