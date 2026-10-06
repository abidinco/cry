/**
 * Bir taramanın NEDEN yarıda kaldığı — kod olarak saklanır, cümle olarak gösterilir.
 *
 * Ekran eskiden yalnızca "kısmi" diyor ve yanına "devam edecek" yazıyordu. İkisi de eksikti:
 * sebep yalnızca worker günlüğündeydi ve "devam edecek" DOĞRULANMAMIŞ bir vaattir — kimse
 * kendiliğinden devam etmiyor. Kullanıcının cevaplaması gereken soru "bekleyeyim mi, yeniden mi
 * deneyeyim, yoksa bu adres zaten bitmiş mi"dir; cevabı sebep verir.
 *
 * Kod `addresses.index_note`ta durur; NULL "tur yarıda kalmadı" demektir. Eski kayıtlarda da
 * NULL'dur ve orada "sebep SORULMAMIŞ" anlamına gelir — ikisini ayırt eden şey `index_state`.
 */
import { ChainSourceError } from "@cry/chain";

export type IndeksNotu =
  | "sayfa_butcesi"
  | "hiz_siniri"
  | "kaynak_hatasi"
  | "adaptor_yok"
  | "iptal"
  /**
   * YALNIZCA YEREL kipte tarandı: cevap blok indeksinin penceresiyle sınırlı ve
   * adresin geçmişi pencereden ÖNCE başlıyor. Bir hata değil, bir KAPSAM
   * bildirimidir — "bu adres temiz" değil "pencere öncesine bakılmadı".
   */
  | "pencere_oncesi";

const CUMLE: Record<IndeksNotu, string> = {
  sayfa_butcesi: "sayfa bütçesi doldu — adres büyük, devamı var",
  hiz_siniri: "kaynağın hız sınırına takıldı — biraz sonra yeniden denenebilir",
  kaynak_hatasi: "kaynak hata verdi — yeniden denemek işe yaramayabilir",
  adaptor_yok: "bu zincirin adaptörü henüz yok — bakılamadı",
  iptal: "tarama durduruldu",
  pencere_oncesi:
    "yalnızca yerel indeksten tarandı — cevap pencereyle sınırlı, öncesine BAKILMADI",
};

/**
 * İndeks satırının tam metni. "tam" dışındaki her durumda cümle, adresin EKSİK olduğunu söyler;
 * sebep bilinmiyorsa bunu da SÖYLER — "kısmi" deyip susmak, eksikliğin sebebini yokmuş gibi
 * gösterirdi ("yok ≠ bakılamadı"nın aynısı bir kademe aşağıda).
 */
export function indeksNotuMetni(indexState: string, not?: string | null): string | null {
  if (indexState === "tam") return null;
  if (indexState === "bilinmiyor") return null;
  if (!not) return "yarıda kaldı, sebebi kayıtlı değil";
  return CUMLE[not as IndeksNotu] ?? `yarıda kaldı: ${not}`;
}

/**
 * Hatayı bir NOT koduna çevirir. Hız sınırı bu projede BEKLENEN durumdur (`chain/http.ts`) ve
 * kalıcı bir kaynak hatasıyla AYNI kovaya konmaz: biri "bekle, yeniden dene", öteki "yeniden
 * denemek işe yaramayabilir". İkisini birleştirmek, kullanıcıya yanlış eylemi önerirdi.
 *
 * SEBEP ZİNCİRİN İÇİNDE OLABİLİR. `http.ts` denemeleri tükenince `"N denemede alınamadı: <url>"`
 * diye SARMALAYAN bir hata atıyor; o sarmalayıcıda durum kodu YOK, 429 yalnızca `cause`'ta duruyor.
 * Ölçüldü (2026-09-29, gerçek 429): yalnızca en dıştaki hataya bakan ilk sürüm kayda
 * `kaynak_hatasi` yazdı — yani "bekle" denmesi gereken yerde "yeniden denemek işe yaramayabilir"
 * denmiş olurdu. Zincir izlenir.
 */
export function notaCevir(hata: unknown): IndeksNotu {
  for (let h: unknown = hata, derinlik = 0; h && derinlik < 10; derinlik++) {
    if (h instanceof ChainSourceError) {
      if (h.opts.rateLimited || h.opts.status === 429 || h.opts.status === 503) return "hiz_siniri";
      if (h.opts.status !== undefined) return "kaynak_hatasi"; // kalıcı: 4xx
    }
    if (h instanceof Error && h.name === "AbortError") return "iptal";
    if (h instanceof Error && /hız sınırı|429|503/.test(h.message)) return "hiz_siniri";
    h = h instanceof ChainSourceError ? h.opts.cause : h instanceof Error ? h.cause : undefined;
  }
  return "kaynak_hatasi";
}

/**
 * Kayda hangi not yazılır. Biten tur notu SİLER: eski bir "hız sınırı" notu, artık tam olan bir
 * adresi yarım gösterirdi — bakılmış bir yeri bakılmamış göstermek, projenin "yok ≠ bakılamadı"
 * kuralının ters yüzü.
 */
export function kaydedilecekNot(tamamlandi: boolean, not: IndeksNotu | null): IndeksNotu | null {
  return tamamlandi ? null : not;
}

/**
 * YALNIZCA YEREL kipte bir taramanın kapsamı: sayfalar bitti diye adres "tam" DEĞİLDİR.
 *
 * Kipin sözü "kaynağa gitmeyeceğim"; bedeli, pencereden önceki geçmişe bakılmamış olması.
 * O adresi `tam` yazmak, bakılmamış bir yeri taranmış göstermekti — bu dosyanın en çok
 * tekrarlanan kuralının ("yok ≠ bakılamadı") tam karşılığı. Saf ve testli.
 */
export function yerelKapsam(
  tamamlandi: boolean,
  pencereDisi: boolean,
  not: IndeksNotu | null,
): { indexState: "tam" | "kismi"; not: IndeksNotu | null } {
  // Yarıda kalan tarama kendi sebebini korur: sayfa bütçesi, pencereden daha acil bir eksiktir.
  if (!tamamlandi) return { indexState: "kismi", not };
  if (pencereDisi) return { indexState: "kismi", not: "pencere_oncesi" };
  return { indexState: "tam", not: null };
}

/**
 * YALNIZCA YEREL kipte bu adrese yeniden bakılmalı mı?
 *
 * Kaynaklı kipte kural "bilinmiyor değilse dokunma"ydı ve gerekçesi KOTAydı: her tarama
 * TronGrid'e gidiyor, yarım kalmış bir adresi yeniden denemek koşuya dakikalar ekliyordu.
 * Yerelde o gerekçe YOK — tarama bir ClickHouse sorgusu. Ölçüldü (2026-10-06): hız sınırında
 * `kismi` kalmış bir kök yüzünden koşu 1 düğüm/0 kenar veriyordu, oysa aynı adresin yerel
 * indekste 38.128 geleni vardı. Yani eski kural, kaynağın bıraktığı hasarı KALICI yapıyordu.
 *
 * Yeniden bakılmaz: tarama TAM bittiyse, ya da yerel kipte bitip yalnızca pencere öncesi
 * eksik kaldıysa (`pencere_oncesi`) — ikinci tur aynı cevabı verir.
 */
export function yerelYenidenTara(indexState: string, indexNote?: string | null): boolean {
  if (indexState === "tam") return false;
  if (indexNote === "pencere_oncesi") return false;
  return true;
}

/** Yeniden denemenin işe yarayabileceği durumlar — düğme ancak o zaman anlamlı. */
export function yenidenDenemeyeDeger(not?: string | null): boolean {
  return not === "hiz_siniri" || not === "sayfa_butcesi";
}
