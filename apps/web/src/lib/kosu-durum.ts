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
