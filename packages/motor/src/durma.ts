/**
 * Durma ölçütleri — tarama nerede biter ve NEDEN bittiği nasıl söylenir.
 *
 * Her durma sebebi kayda geçer. Sebebi yazılmayan bir durma, "burada iz
 * kesildi" ile "burada bütçe bitti"yi aynı şey gibi gösterir; ikincisi
 * taramayı sürdürmekle çözülür, birincisi çözülmez.
 */

export type DurmaSebebi =
  | "butce" // hop bütçesi bitti
  | "dugum_siniri" // düğüm sayısı sınırına ulaşıldı
  | "dallanma" // çıkış sayısı eşiği aştı: borsa ya da mikser
  | "esik" // tutar eşiğin altına düştü
  | "terminal" // etiketli borsa adresi
  | "kontrat" // akıllı sözleşme: iz burada kesiliyor
  | "indekssiz"; // düğüm taranmamış, veri yok

export type Esikler = {
  /** Kökten kaç sıçrama. */
  maxHop: number;
  /** Graf kaç düğümde durur. */
  maxDugum: number;
  /** Bir düğümün çıkış sayısı bunu aşarsa terminal sayılır. */
  dallanmaEsigi: number;
  /**
   * Ham tam sayı; bunun altındaki izli tutar takip edilmez. Varsayılan 0 =
   * KAPALI: açık bir eşik küçük ama kritik bir transferi sessizce eler.
   */
  minTutar: bigint;
};

/** Kullanıcı kararı (2026-09-09). Hepsi arayüzden değiştirilebilir. */
export const VARSAYILAN_ESIKLER: Esikler = {
  maxHop: 5,
  maxDugum: 300,
  dallanmaEsigi: 50,
  minTutar: 0n,
};

export type DugumDurumu = {
  adres: string;
  hop: number;
  /** Bu düğümde kaç ayrı çıkış var (dallanma ölçüsü). */
  cikisSayisi: number;
  izliTutar: bigint;
  /** Etiketli borsa adresi mi (hot wallet ya da deposit). */
  borsaMi: boolean;
  sozlesmeMi: boolean;
  indekslendiMi: boolean;
};

/**
 * Bu düğümden devam edilir mi? Edilmiyorsa SEBEBİ döner.
 *
 * Sıra önemli: önce "burada iz gerçekten bitiyor" diyen sebepler (borsa,
 * indeks yok), sonra bizim koyduğumuz sınırlar. Tersi sırada, borsaya
 * ulaşıldığı hâlde "bütçe bitti" yazılır ve rapor asıl bulguyu kaybeder.
 */
export function durmaSebebi(
  d: DugumDurumu,
  esikler: Esikler,
  toplamDugum: number,
): DurmaSebebi | null {
  // Aracın var olma sebebi: paranın girdiği borsayı bulmak. Oraya varıldıysa
  // iz TAMAMLANMIŞTIR, kesilmemiş.
  if (d.borsaMi) return "terminal";
  if (!d.indekslendiMi) return "indekssiz";
  if (d.sozlesmeMi) return "kontrat";
  if (d.hop >= esikler.maxHop) return "butce";
  if (toplamDugum >= esikler.maxDugum) return "dugum_siniri";
  if (d.cikisSayisi > esikler.dallanmaEsigi) return "dallanma";
  if (esikler.minTutar > 0n && d.izliTutar < esikler.minTutar) return "esik";
  return null;
}

/**
 * Aracın kendi önerisi: kaç hop yeter?
 *
 * Ölçüt tahmin değil GÖZLEM: bir hop'ta ulaşılan düğümlerin çoğu terminalse
 * (borsa) ilerlemenin faydası bitmiştir; hiçbiri terminal değilse ve dallanma
 * patlıyorsa daha derine inmek grafı okunmaz yapar.
 */
export function hopOnerisi(
  hopBasinaDugum: number[],
  hopBasinaTerminal: number[],
): { onerilenHop: number; gerekce: string } {
  for (let h = 0; h < hopBasinaDugum.length; h++) {
    const dugum = hopBasinaDugum[h] ?? 0;
    const terminal = hopBasinaTerminal[h] ?? 0;
    if (dugum === 0) {
      return { onerilenHop: h, gerekce: "bu derinlikte yeni düğüm yok" };
    }
    if (terminal / dugum >= 0.5) {
      return {
        onerilenHop: h,
        gerekce: `bu derinlikte düğümlerin yarısından fazlası borsa (${terminal}/${dugum})`,
      };
    }
  }
  const son = hopBasinaDugum.length;
  return { onerilenHop: son, gerekce: "tarama bütçe sınırında durdu, derinleştirilebilir" };
}
