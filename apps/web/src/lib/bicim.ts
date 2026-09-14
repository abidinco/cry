/**
 * Gösterim biçimleri.
 *
 * Tutarlar METİN üzerinden biçimlenir, sayıya HİÇ çevrilmez: zincirde 2^256-1
 * gibi değerler gerçekten görülüyor ve Number'a uğrayan bir tutar rapora
 * 1.15e+53 diye düşer.
 */

/** Ham tam sayıyı Türkçe defter düzenine ayırır: 1.128.831 + "12984". */
export function tutarParcala(
  amountRaw: string,
  decimals: number,
): { tam: string; kusurat: string; negatif: boolean } {
  const negatif = amountRaw.startsWith("-");
  const rakamlar = (negatif ? amountRaw.slice(1) : amountRaw).replace(/\D/g, "") || "0";
  const dolgulu = rakamlar.padStart(decimals + 1, "0");
  const tamHam = dolgulu.slice(0, dolgulu.length - decimals);
  const kusurat = decimals > 0 ? dolgulu.slice(dolgulu.length - decimals).replace(/0+$/, "") : "";
  return { tam: binlikAyir(tamHam), kusurat, negatif };
}

/** Türkçe binlik ayracı nokta. Dizgi üzerinde yapılır; sayıya çevrilmez. */
function binlikAyir(tam: string): string {
  const temiz = tam.replace(/^0+(?=\d)/, "");
  return temiz.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

const TARIH = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Istanbul",
});

const TARIH_UTC = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

/** Ekranda TSİ gösterilir; UTC karşılığı başlıkta durur (rapor UTC ister). */
export function tarih(a: string | Date | null | undefined): string {
  if (!a) return "—";
  return TARIH.format(new Date(a));
}

export function tarihUtc(a: string | Date | null | undefined): string {
  if (!a) return "";
  return `${TARIH_UTC.format(new Date(a))} UTC`;
}

/** Uzun adresi ortadan kırpar; tam hâli başlıkta kalır. */
export function kisaAdres(a: string, bas = 10, son = 6): string {
  return a.length > bas + son + 2 ? `${a.slice(0, bas)}…${a.slice(-son)}` : a;
}

/** "şu kadar gündür hareketsiz" — bekleme durumu tespitinin gösterimi. */
export function hareketsizGun(sonHareket: string | Date | null | undefined): number | null {
  if (!sonHareket) return null;
  const g = Math.floor((Date.now() - new Date(sonHareket).getTime()) / 86_400_000);
  return g >= 1 ? g : null;
}

export function sayi(n: number): string {
  return new Intl.NumberFormat("tr-TR").format(n);
}

/**
 * Grafik etiketi için kısa tutar: "11,1 Mn", "40 B", "0,05".
 *
 * Yine bigint üzerinden: kısaltmak yuvarlamaktır ama sayıya çevirmek değildir.
 * Tam tutar her zaman yanında (ipucu, tablo) durur; bu yalnızca bir işarettir.
 */
export function kisaTutar(ham: bigint, decimals: number): string {
  const olcu = 10n ** BigInt(decimals);
  const tam = ham / olcu;
  const birimler: [bigint, string][] = [
    [1_000_000_000n, " Mr"],
    [1_000_000n, " Mn"],
    [1_000n, " B"],
  ];
  for (const [bolen, ad] of birimler) {
    if (tam >= bolen) {
      const onda = (tam * 10n) / bolen;
      const kus = onda % 10n;
      return `${binlikAyir((onda / 10n).toString())}${kus ? `,${kus}` : ""}${ad}`;
    }
  }
  const yuzde = (ham * 100n) / olcu;
  const kus = (yuzde % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  return `${binlikAyir((yuzde / 100n).toString())}${kus ? `,${kus}` : ""}`;
}
