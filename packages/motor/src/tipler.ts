/**
 * Takip motorunun sözlüğü.
 *
 * Bu katman SAF: veritabanı, ağ ve zaman yok. Girdi bir düğümün hareketleri,
 * çıktı o düğümden çıkan izin nasıl dağıldığı. Böylece atıf kuralı ağ olmadan
 * sınanabiliyor — ve bir adli araçta en çok sınanması gereken şey bu.
 */

export type AtifKurali = "fifo" | "orantisal" | "zaman_pencereli";

/** Motorun gördüğü hareket. Zincire özgü ne varsa dışarıda kaldı. */
export type Hareket = {
  txHash: string;
  index: number;
  ts: number;
  /** Bu düğüme göre yön. */
  yon: "gelen" | "giden";
  karsiTaraf: string | null;
  /** Varlık kimliği: TRX ile USDT'nin izi KARIŞMAZ. */
  varlik: string;
  /** Ham tam sayı; motor bigint ile çalışır. */
  tutar: bigint;
};

/** Düğüme giren izli para: ne kadarı, ne zaman, hangi payla. */
export type IzliGiris = {
  varlik: string;
  tutar: bigint;
  ts: number;
  /** 0..1 — bu girişin ne kadarı takip edilen paraya atfediliyor. */
  pay: number;
  /** Nereden geldi (kanıt zinciri için). */
  kaynakTx?: string;
};

/** Düğümden çıkan ve iz taşıyan hareket. */
export type IzliCikis = {
  txHash: string;
  index: number;
  ts: number;
  hedef: string;
  varlik: string;
  /** Bu çıkışın izli kısmı — ham tam sayı. */
  izliTutar: bigint;
  /** Çıkışın tamamı. */
  toplamTutar: bigint;
};

export type DagitimSonucu = {
  cikislar: IzliCikis[];
  /** Düğümde kalan izli bakiye (henüz çıkmamış para). */
  kalan: Map<string, bigint>;
  /** İzi tüketilmeden düğümde duran para varsa bu, "bekliyor" demektir. */
  bekleyenToplam: bigint;
};

export type KuralSecenekleri = {
  kural: AtifKurali;
  /** zaman_pencereli için: girişten sonra kaç saat içindeki çıkışlar sayılır. */
  pencereSaat?: number;
};
