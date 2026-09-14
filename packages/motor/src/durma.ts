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
  | "terminal" // DOĞRULANMIŞ borsa etiketi: iz burada tamamlandı
  | "terminal_aday" // borsa ADAYI: etiket doğrulanmamış, durduk ama iddia zayıf
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
  /**
   * O etiket DOĞRULANMIŞ mı?
   *
   * Durma sebebi bir İDDİADIR: "para borsaya girdi" cümlesi rapora
   * doğrudan geçiyor. Doğrulanmamış bir etiketle kurulan aynı cümle,
   * kaynağı olmayan bir hükümdür — ve doğrulanmışından ayırt edilemezse
   * rapor savunulamaz. Durmak yine doğru (borsanın iç karıştırması izi
   * anlamsızlaştırır), ama sebep AYRI yazılır.
   */
  borsaEtiketiDogrulanmisMi?: boolean;
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
  // iz TAMAMLANMIŞTIR, kesilmemiş. Etiket doğrulanmamışsa iz yine burada
  // durur ama sebep bunu söyler.
  if (d.borsaMi) return d.borsaEtiketiDogrulanmisMi ? "terminal" : "terminal_aday";
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


/**
 * KOŞUNUN başlık durma sebebi.
 *
 * Düğüm başına sebep zaten yazılıyor; bu, koşunun tek satırlık cevabıdır ve
 * o satır rapora çıkar. En SIK sebebi seçmek yanlış: bir tarama 11 düğümde
 * bütçeye takılıp 2 düğümde borsaya varmışsa asıl bulgu ikincisidir ve
 * "bütçe bitti" başlığı onu görünmez yapar (ölçüldü 2026-09-09: gerçek
 * koşuda `butce:11, terminal_aday:2, dallanma:2` → başlık "butce" çıkıyordu).
 *
 * Bu, düğüm düzeyinde çoktan yazılmış olan kuralın ("borsaya varıldıysa
 * sebep terminal'dir, butce değil") KOŞU düzeyindeki karşılığı. Bir kural
 * bir yerde uygulanıp kardeşinde unutulabiliyor.
 *
 * Dağılımın tamamı `stats.durma` içinde durur; başlık onu özetler, silmez.
 */
const BASLIK_ONCELIGI: DurmaSebebi[] = ["terminal", "terminal_aday"];

export function kosuDurmaSebebi(sayac: Record<string, number>): string | null {
  for (const oncelikli of BASLIK_ONCELIGI) {
    if ((sayac[oncelikli] ?? 0) > 0) return oncelikli;
  }
  const sirali = Object.entries(sayac).sort((a, b) => b[1] - a[1]);
  return sirali[0]?.[0] ?? null;
}

/**
 * Durmuş bir düğümden takibe DEVAM edilebilir mi? (kullanıcı kararı 2026-09-14)
 *
 * Doğrulanmış borsada HAYIR: borsaya giren para borsanın ortak havuzuna
 * karışır ve zincirdeki çıkışı artık o paranın devamı DEĞİLDİR — kimin
 * çektiğini yalnızca borsanın kendi kayıtları söyler. Oradan "devam" etmek
 * başka müşterilerin parasını bu dosyaya yazmak olurdu.
 *
 * Aday borsada ve bizim koyduğumuz sınırlarda (bütçe, dallanma, eşik, düğüm
 * sınırı) EVET: iz bitmedi, biz durduk. Taranamamış ve sözleşme düğümünde de
 * evet — karar insanın, sebep kayda geçer.
 */
export function devamEdilebilir(
  sebep: string | null,
): { olur: true } | { olur: false; neden: string } {
  if (sebep === null) return { olur: false, neden: "bu adresten zaten devam edildi" };
  if (sebep === "terminal") {
    return {
      olur: false,
      neden: "doğrulanmış borsa — para borsanın havuzuna karıştı, zincirdeki çıkışı bu paranın devamı değil",
    };
  }
  return { olur: true };
}

/** Devamın ek bütçesi: kaç sıçrama daha. */
export const DEVAM_EK_HOP = { varsayilan: 2, en_az: 1, en_cok: 5 } as const;

/**
 * Devam koşusunun eşikleri: sıçrama bütçesi düğümün OLDUĞU yerden sayılır,
 * düğüm bütçesi koşunun mevcut büyüklüğünün ÜSTÜNE eklenir. Aksi hâlde 3.
 * sıçramadaki bir düğümden `maxHop: 3` ile devam etmek anında "bütçe" der.
 */
export function devamEsikleri(
  temel: Esikler,
  dugumHop: number,
  mevcutDugum: number,
  ekHop: number,
): Esikler {
  const hop = Math.min(DEVAM_EK_HOP.en_cok, Math.max(DEVAM_EK_HOP.en_az, Math.round(ekHop)));
  return { ...temel, maxHop: dugumHop + hop, maxDugum: mevcutDugum + temel.maxDugum };
}
