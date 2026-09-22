/**
 * Süren bir takip koşusunun ilerleme satırı — saf, testli.
 *
 * Kullanıcı bildirimi (cozulmesi-gerekenler §6): sayfa "çalışıyor" deyip
 * orada kalıyordu; taramanın çalışıp çalışmadığı, takılıp takılmadığı
 * bilinemiyordu — ve tarama gerçekten dakikalarca sürüyor. Worker saniyede
 * en çok bir kez `stats.ilerleme` yazar; bu dosya onu bir cümleye çevirir.
 */

export type Ilerleme = {
  islenen: number;
  hop: number;
  sirada: number;
  adres: string;
  /** ISO — worker'ın son yazdığı an. */
  zaman: string;
};

/** Bu kadar süredir ses yoksa "takılmış olabilir" denir. */
export const SESSIZLIK_ESIGI_SN = 90;

export function ilerlemeMetni(
  durum: string,
  ilerleme: Ilerleme | null | undefined,
  simdi: Date,
): { metin: string; uyari: boolean } {
  if (durum === "kuyrukta") return { metin: "kuyrukta — worker sıradaki işi bitirince başlayacak", uyari: false };
  if (durum !== "calisiyor") return { metin: "", uyari: false };
  if (!ilerleme) return { metin: "başladı — ilk adres taranıyor", uyari: false };

  const gecen = Math.max(0, Math.round((simdi.getTime() - new Date(ilerleme.zaman).getTime()) / 1000));
  const temel = `${ilerleme.islenen} adres işlendi · ${ilerleme.hop}. sıçrama · sırada ${ilerleme.sirada}`;
  // Tek bir adresin taranması (indeksleme) uzun sürebilir; sessizlik tek
  // başına hata değildir, ama kullanıcı bunu BİLMELİ.
  if (gecen >= SESSIZLIK_ESIGI_SN) {
    return { metin: `${temel} · ${gecen} sn'dir ses yok — büyük bir adres taranıyor olabilir`, uyari: true };
  }
  return { metin: temel, uyari: false };
}

/** Koşunun başında kök adres tarandıysa sonucu; taranamadıysa sebebi. */
export type KokTaramasi = {
  yeniHareket?: number;
  tamamlandi?: boolean;
  kaynak?: string | null;
  atlanmaSebebi?: string | null;
  hata?: string;
};

/**
 * Kökün taranmasında ekrana YAZILMASI gereken bir sorun var mı?
 *
 * Neden ayrı ve saf: boş bir graf iki farklı şeyin sonucu olabilir — para hareket etmemiştir ya da
 * KÖKE BAKILAMAMIŞTIR. İkisi aynı ekranda aynı görünürse ikincisi "temiz" diye okunur ("yok" ile
 * "bakılamadı" ayrı cevaplardır). Gerçek koşuda ölçüldü (2026-09-22): kök taraması TronGrid hız
 * sınırına takıldı, koşu "bitti · 1 düğüm" olarak kapandı ve sebep yalnızca `stats`te kaldı.
 *
 * `null` dönmesi "kök sorunsuz tarandı" ya da "zaten taranmıştı" demektir; ikisi de sessiz kalır.
 */
export function kokTaramasiSorunu(kt: KokTaramasi | null | undefined): string | null {
  if (!kt) return null;
  if (kt.hata) return `Sebep: ${kt.hata}`;
  if (kt.atlanmaSebebi) return `Sebep: ${kt.atlanmaSebebi}`;
  // `tamamlandi: false` = sayfa sınırına ya da kaynak sınırına takıldı; kökün geçmişi EKSİK okundu.
  if (kt.tamamlandi === false) return "Kök taraması yarıda kaldı (kaynak sınırı); kökün geçmişi eksik okundu.";
  return null;
}
