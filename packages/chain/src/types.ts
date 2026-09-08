/**
 * types.ts — bütün zincirlerin ortak sözlüğü.
 *
 * Tasarım kuralı: takip motoru ASLA zincire özgü bir alan okumaz. Motorun
 * gördüğü tek atom `Transfer`'dir; TRON'un TRC20'si, Ethereum'un ERC20'si ve
 * Bitcoin'in UTXO çıktısı buraya indirgenir. Zincire özgü olan her şey
 * `raw` alanında saklanır — bilgi kaybolmaz ama motora sızmaz.
 */

export type ChainFamily = "evm" | "tron" | "bitcoin" | "solana";

export type ChainId =
  | "tron"
  | "ethereum" | "bsc" | "polygon"
  | "arbitrum" | "optimism" | "base" | "avalanche"
  | "bitcoin"
  | "solana";

/** Bir varlığın (native coin ya da token) kimliği. */
export type Asset = {
  chain: ChainId;
  /** Native varlıkta null; token'da sözleşme/mint adresi. */
  contract: string | null;
  symbol: string;
  decimals: number;
};

/**
 * Değer hareketinin atomu: "şu tx içinde, şu andan, A'dan B'ye şu kadar X".
 *
 * Tutar HER ZAMAN ham tam sayı (string olarak taşınan bigint). Ondalığa
 * çevirme yalnızca GÖSTERİM sınırında yapılır — float aritmetiği bir adli
 * raporda tutarı sessizce kaydırır.
 */
export type Transfer = {
  chain: ChainId;
  txHash: string;
  /** Aynı tx içinde birden çok hareket olabilir; sıralamayı bu korur. */
  index: number;
  blockNumber: number | null;
  /** UTC, ISO 8601. */
  ts: string;
  from: string | null;
  to: string | null;
  asset: Asset;
  /** Ham tam sayı, ondalıksız. */
  amountRaw: string;
  kind: TransferKind;
  /** Başarısız işlem de kayda girer — para hareket etmedi ama niyet bilgidir. */
  success: boolean;
  /** Ham ücret (native varlık cinsinden), biliniyorsa. */
  feeRaw?: string | null;
  /** Zincire özgü artık: TRON resource, EVM log, BTC vin/vout indeksi… */
  raw?: unknown;
};

export type TransferKind =
  /** Zincirin kendi parası (TRX, ETH, BTC, SOL). */
  | "native"
  /** TRC20 / ERC20 / SPL token. */
  | "token"
  /** Kontrat içinden tetiklenen değer hareketi (EVM internal tx). */
  | "internal"
  /** UTXO modelinde girdi→çıktı kenarı. */
  | "utxo";

export type AddressSummary = {
  chain: ChainId;
  address: string;
  /** Zincirde hiç görülmemiş adres de geçerli bir adrestir — sadece boştur. */
  exists: boolean;
  firstSeen: string | null;
  lastSeen: string | null;
  /** Native bakiye, ham. */
  balanceRaw: string | null;
  txCount: number | null;
  /** Bilinen token bakiyeleri (kaynak veriyorsa). */
  tokenBalances?: { asset: Asset; balanceRaw: string }[];
  /** Adres bir akıllı sözleşme mi? Terminal düğüm kararında kullanılır. */
  isContract?: boolean;
  raw?: unknown;
};

/** Sayfalama: kaynaklar imleç (cursor) verir, biz onu olduğu gibi taşırız. */
export type Page<T> = {
  items: T[];
  /** null ise veri bitti. */
  nextCursor: string | null;
};

export type ListOptions = {
  cursor?: string | null;
  /** Kaynağın izin verdiği üst sınıra kırpılır. */
  limit?: number;
  /** Artımlı indeks: yalnızca bu bloktan sonrası. */
  fromBlock?: number | null;
  fromTs?: string | null;
  toTs?: string | null;
  /** Hangi hareket türleri isteniyor; verilmezse hepsi. */
  kinds?: TransferKind[];
  signal?: AbortSignal;
};

/**
 * Bir adaptörün NE YAPAMADIĞI da bilgidir. Motor bir yeteneği varsaymaz,
 * sorar; yoksa o düğümü "bu zincirde ölçülemez" diye işaretler — sessizce
 * yanlış sonuç üretmez.
 */
export type Capabilities = {
  /** Kontrat içi değer hareketleri okunabiliyor mu (EVM internal tx). */
  internalTransfers: boolean;
  /** Token transferleri ayrı bir uç noktadan gelebiliyor mu. */
  tokenTransfers: boolean;
  /** TRON'a özgü: hesabı kimin aktive ettiği zincirde yazılı. */
  activation: boolean;
  /** UTXO modeli — para üstü/ortak girdi kümelemesi ayrı motor ister. */
  utxo: boolean;
  /** Adresin sözleşme mi olduğu sorulabiliyor mu. */
  contractDetection: boolean;
};

export type TxDetail = {
  chain: ChainId;
  hash: string;
  blockNumber: number | null;
  ts: string;
  success: boolean;
  from: string | null;
  to: string | null;
  feeRaw: string | null;
  /** Bu tx'in ürettiği bütün hareketler. */
  transfers: Transfer[];
  raw?: unknown;
};

/** TRON aktivasyon kümelemesinin ham cevabı. */
export type Activation = {
  address: string;
  activatedBy: string | null;
  ts: string | null;
  txHash: string | null;
};

/**
 * Zincir adaptörü. Dördü de (TRON, EVM, Bitcoin, Solana) bunu uygular;
 * fazlar sırayla DOLDURULUR, arayüz baştan dördünü de kaldırır.
 */
export interface ChainAdapter {
  readonly chain: ChainId;
  readonly family: ChainFamily;
  readonly nativeAsset: Asset;
  readonly capabilities: Capabilities;

  /** Kanonik yazım (EVM'de EIP-55, TRON'da base58). Geçersizse hata atar. */
  normalizeAddress(input: string): string;
  isValidAddress(input: string): boolean;

  getAddressSummary(address: string, signal?: AbortSignal): Promise<AddressSummary>;

  /**
   * Adresin hareketleri, ESKİDEN YENİYE. Sıra garanti edilmelidir: artımlı
   * indeks "en son nereye kadar aldım" bilgisini buna dayandırıyor.
   */
  listTransfers(address: string, opts?: ListOptions): Promise<Page<Transfer>>;

  getTransaction(hash: string, signal?: AbortSignal): Promise<TxDetail | null>;

  /** capabilities.activation true ise zorunlu. */
  getActivation?(address: string, signal?: AbortSignal): Promise<Activation | null>;
}

/** Kaynak (API) kaynaklı hatalar — yeniden deneme kararı buna bakar. */
export class ChainSourceError extends Error {
  constructor(
    message: string,
    readonly opts: {
      chain: ChainId;
      /** HTTP durum kodu, biliniyorsa. */
      status?: number;
      /** Hız sınırı: çağıran beklemeli, vazgeçmemeli. */
      rateLimited?: boolean;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "ChainSourceError";
  }
}
