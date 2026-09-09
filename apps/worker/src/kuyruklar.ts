/**
 * Kuyruk adları ve iş tipleri — tek yerde.
 *
 * İş adı iki yerde yazılırsa (üreten ve tüketen) biri değişir, öteki sessizce
 * hiçbir iş almaz ve "worker çalışmıyor" gibi görünür.
 */
// Ad ayracı olarak ":" KULLANILMAZ — BullMQ bunu reddediyor ("Queue name
// cannot contain :"), çünkü Redis anahtarını kendisi o karakterle kuruyor.
// Ad alanı ayırmak için kuyruk adı değil `prefix` seçeneği vardır.
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
};

export type TakipIsi = {
  traceRunId: string;
};

export type FiyatIsi = {
  assetId: number;
  /** ISO tarih (gün). */
  date: string;
};
