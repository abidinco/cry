/**
 * Etiket incelemesi — doğrulanmamış borsa iddialarını insana SIRALI sunar.
 *
 * Neden ayrı ve SAF bir katman: bugün 764 doğrulanmamış `exchange_hot` etiketi var (739'u blok
 * keşfinin yapısal adayı). Hepsi motorda `terminal_aday` üretiyor, yani her biri bir izi durdurabilen
 * bir İDDİA. "Listeyi ekrana bas" yetmez — insanın hangisine önce bakacağı bir karardır ve bu karar
 * test edilebilir bir yerde durmalı.
 *
 * Sıralama ölçütü şu: bir etiketin bedeli, BİR KOŞUYU DURDURDUĞUNDA ödenir. Hiç karşılaşılmamış bir
 * adresin doğru etiketlenmesi bugün hiçbir raporu değiştirmiyor; bir koşuyu durdurmuş adresinki
 * değiştiriyor — ve yanlışsa o rapor zaten yanlış çıkmış demektir.
 */

/** Bir satırın insana gösterilecek hâli; veritabanı biçiminden bağımsız. */
export type IncelemeSatiri = {
  id: number;
  chain: string;
  address: string;
  title: string;
  description: string | null;
  source: string;
  sourceUrl: string | null;
  confidence: number;
  /** Bu adres kaç takip koşusunda düğüm olarak göründü. */
  kosuda: number;
  /** Koşularda bu adreste kaç kez `terminal_aday` denip durulduğu. */
  durdurdu: number;
};

/**
 * Önce GERÇEKTEN durdurmuş olanlar, sonra koşularda görülmüşler, sonra güveni yüksek olanlar.
 * Eşitlikte adres — sıralama DETERMİNİSTİK olmalı, yoksa aynı liste her açılışta karışır ve
 * "şunu onaylamıştım" diyen insan onu bir daha bulamaz.
 */
export function incelemeSirasi(satirlar: readonly IncelemeSatiri[]): IncelemeSatiri[] {
  return [...satirlar].sort(
    (a, b) =>
      b.durdurdu - a.durdurdu ||
      b.kosuda - a.kosuda ||
      b.confidence - a.confidence ||
      a.address.localeCompare(b.address),
  );
}

export type Karar = "borsa" | "borsa_degil";

/**
 * İnsanın kararının veriye karşılığı.
 *
 * "borsa" → etiket DOĞRULANIR ve motor artık `terminal` der: iz orada biter, çünkü paranın borsa
 * havuzuna girdiği bir insan tarafından onaylanmıştır.
 * "borsa_degil" → etiket SİLİNMEZ, `diger`e çekilir. Silmek, aynı adresin bir sonraki keşif turunda
 * yeniden aday yazılmasına yol açardı; "buna baktım, borsa değil" bilgisi kaydın KENDİSİNDE durur.
 */
export function kararinVerisi(
  karar: Karar,
  kim: string,
  simdi: Date,
  borsaAdi?: string | null,
): {
  category: string;
  exchange: string | null;
  verifiedAt: Date | null;
  verifiedBy: string | null;
  confidence: number;
} {
  if (karar === "borsa") {
    return {
      category: "exchange_hot",
      // Ad verilmezse etiketin kendi başlığı kalır; rapor "hangi borsa" sorusuna bir şey demeli.
      exchange: (borsaAdi ?? "").trim() || null,
      verifiedAt: simdi,
      verifiedBy: kim,
      // İnsan onayı kaynağın küratörlü etiketinden (0,8) güçlüdür.
      confidence: 1,
    };
  }
  return {
    category: "diger",
    exchange: null,
    // "Borsa değil" de bir DOĞRULAMADIR: bakıldı ve karara bağlandı.
    verifiedAt: simdi,
    verifiedBy: kim,
    confidence: 1,
  };
}
