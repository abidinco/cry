/**
 * Tutar dönüşümleri.
 *
 * Kural: tutar veritabanında ve motorda HER ZAMAN ham tam sayıdır. Float'a
 * çevirme yalnızca ekranın ve raporun sınırında yapılır — 0.1 + 0.2 hatası
 * bir adli raporda tutarı sessizce kaydırır.
 */

/** Ham tam sayıyı ondalıklı METNE çevirir (float kullanmadan). */
export function hamdanMetne(amountRaw: string, decimals: number): string {
  const negatif = amountRaw.startsWith("-");
  const rakamlar = (negatif ? amountRaw.slice(1) : amountRaw).replace(/\D/g, "") || "0";
  const dolgulu = rakamlar.padStart(decimals + 1, "0");
  const tam = dolgulu.slice(0, dolgulu.length - decimals);
  const kesir = decimals > 0 ? dolgulu.slice(dolgulu.length - decimals).replace(/0+$/, "") : "";
  return `${negatif ? "-" : ""}${tam}${kesir ? "." + kesir : ""}`;
}

/** Ondalıklı metinden ham tam sayıya. Fazla basamak KESİLİR, yuvarlanmaz. */
export function metindenHama(deger: string, decimals: number): string {
  const [tamKisim = "0", kesirKisim = ""] = deger.trim().replace(/,/g, ".").split(".");
  const kesir = kesirKisim.slice(0, decimals).padEnd(decimals, "0");
  const sonuc = `${tamKisim}${kesir}`.replace(/^0+(?=\d)/, "");
  return sonuc || "0";
}

/**
 * Gösterim için sayıya çevirir. Yalnızca ARAYÜZDE kullanılır; hesaplamada
 * ASLA. Çok büyük değerlerde hassasiyet kaybı olabileceğini çağıran bilir.
 */
export function gosterimSayisi(amountRaw: string, decimals: number): number {
  return Number(hamdanMetne(amountRaw, decimals));
}
