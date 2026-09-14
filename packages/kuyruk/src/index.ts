/**
 * Kuyruk sözleşmesi — ÜRETEN (web) ile TÜKETEN (worker) arasında paylaşılır.
 *
 * İki tarafta ayrı yazılsaydı biri değişir, öteki sessizce hiçbir iş almaz ve
 * "worker çalışmıyor" gibi görünürdü. Ad ve iş tipi tek yerde durur.
 */

/**
 * Ad ayracı olarak ":" KULLANILMAZ — BullMQ bunu reddediyor ("Queue name
 * cannot contain :"), çünkü Redis anahtarını kendisi o karakterle kuruyor.
 * Ad alanı ayırmak için kuyruk adı değil `prefix` seçeneği vardır.
 */
export const KUYRUK_ONEKI = "cry";

export const KUYRUK = {
  indeks: "adres-indeksle",
  takip: "takip-kosusu",
  fiyat: "fiyat-cek",
} as const;

export type IndeksIsi = {
  chain: string;
  address: string;
  /** Kullanıcı bekliyorsa öncelik yükselir. */
  reason: "arama" | "takip" | "yenile";
  caseId?: number;
  /** Denetim kaydı için: işi kim istedi. */
  userId?: number;
};

export type TakipIsi = {
  traceRunId: string;
  /** Doluysa yeni koşu değil, durmuş bir düğümden DEVAM. */
  devam?: { adres: string; ekHop: number; userId?: number | null };
};

export type FiyatIsi = {
  assetId: number;
  /** ISO tarih (gün). */
  date: string;
};

/**
 * İŞ KİMLİĞİNDE DE ":" YASAK — kuyruk adındaki kuralın aynısı, ve BullMQ bunu
 * "Custom Ids cannot contain :" diye reddediyor. Ayraç bu yüzden "-": ne
 * zincir adı ne adres bu karakteri taşıyor.
 */
const AYRAC = "-";

/**
 * Bir adres için iş anahtarı. Aynı adres için kuyrukta bekleyen ikinci bir iş
 * açılmaz: kullanıcı düğmeye üç kez basınca üç tur tarama yapılmamalı.
 */
export function indeksIsAnahtari(chain: string, address: string): string {
  return ["indeks", chain, address].join(AYRAC);
}

export function takipIsAnahtari(traceRunId: string): string {
  return ["takip", traceRunId].join(AYRAC);
}

/**
 * Devam işinin anahtarı: aynı düğümden bekleyen ikinci bir devam açılmaz.
 * Adres TRON base58 ya da 0x hex — ikisi de ayraç karakterini taşımıyor.
 */
export function takipDevamIsAnahtari(traceRunId: string, adres: string): string {
  return ["takip", traceRunId, "devam", adres].join(AYRAC);
}
