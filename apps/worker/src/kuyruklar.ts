/**
 * Kuyruk adları ve iş tipleri — tek yerde.
 *
 * İş adı iki yerde yazılırsa (üreten ve tüketen) biri değişir, öteki sessizce
 * hiçbir iş almaz ve "worker çalışmıyor" gibi görünür.
 */
export const KUYRUK = {
  indeks: "cry:adres-indeksle",
  takip: "cry:takip-kosusu",
  fiyat: "cry:fiyat-cek",
} as const;

export type IndeksIsi = {
  chain: string;
  address: string;
  /** Kullanıcı bekliyorsa öncelik yükselir. */
  reason: "arama" | "takip" | "yenile";
  caseId?: number;
};

export type TakipIsi = {
  traceRunId: string;
};

export type FiyatIsi = {
  assetId: number;
  /** ISO tarih (gün). */
  date: string;
};
