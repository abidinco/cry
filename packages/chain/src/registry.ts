/**
 * Adaptör kayıt defteri — motorun zincire ulaştığı TEK kapı.
 *
 * Motor `new TronAdapter()` yazmaz; zinciri adıyla ister. Böylece yeni bir
 * zincir eklemek tek satırlık bir iştir ve "hangi zincirler destekleniyor"
 * sorusunun cevabı tek yerde durur.
 */

import { EvmAdapter } from "./adapters/evm";
import { TronAdapter } from "./adapters/tron";
import { BitcoinAdapter } from "./adapters/bitcoin";
import { SolanaAdapter } from "./adapters/solana";
import type { ChainAdapter, ChainId } from "./types";

export type RegistryConfig = {
  trongridApiKey?: string;
  etherscanApiKey?: string;
};

const EVM_ZINCIRLERI: ChainId[] = [
  "ethereum", "bsc", "polygon", "arbitrum", "optimism", "base", "avalanche",
];

/**
 * Etherscan'in ÜCRETSİZ planının KAPSAMADIĞI zincirler.
 *
 * BSC ölçüldü (2026-09-09): `chainid=56` → "Free API access is not supported for this chain".
 * Yedek olarak seçilen Blockscout da BSC barındırmıyor (ölçüldü 2026-09-14: 404, zincir
 * listesinde 56 yok). Yoklama katmanı herkese açık RPC'ye düşüyor ve o yol "var" diyebiliyor,
 * "yok" DİYEMİYOR. Bu yüzden BSC HAZIR SAYILMAZ: yarım bir adaptör, bakılmamış bir yeri
 * bakılmış gösterirdi.
 */
const UCRETSIZ_KAPSAM_DISI: ChainId[] = ["bsc"];

export class AdapterRegistry {
  private readonly onbellek = new Map<ChainId, ChainAdapter>();

  constructor(private readonly config: RegistryConfig = {}) {}

  get(chain: ChainId): ChainAdapter {
    const mevcut = this.onbellek.get(chain);
    if (mevcut) return mevcut;

    const adaptor = this.uret(chain);
    this.onbellek.set(chain, adaptor);
    return adaptor;
  }

  /**
   * Bu zincirde şu an gerçekten veri çekilebiliyor mu (iskelet değil mi).
   *
   * EVM için ANAHTAR ŞART: anahtarsız Etherscan `{"status":"0","result":"Missing/Invalid API
   * Key"}` döndürüyor ve bu HTTP 200'dür. Anahtarsız bir adaptörü "hazır" saymak, her adrese
   * "bakıldı, bir şey yok" dedirtirdi.
   */
  hazirMi(chain: ChainId): boolean {
    if (chain === "tron") return true;
    if (EVM_ZINCIRLERI.includes(chain)) {
      return !UCRETSIZ_KAPSAM_DISI.includes(chain) && Boolean(this.config.etherscanApiKey);
    }
    return false;
  }

  private uret(chain: ChainId): ChainAdapter {
    if (chain === "tron") return new TronAdapter({ apiKey: this.config.trongridApiKey });
    if (chain === "bitcoin") return new BitcoinAdapter();
    if (chain === "solana") return new SolanaAdapter();
    if (EVM_ZINCIRLERI.includes(chain)) {
      return new EvmAdapter(chain, { apiKey: this.config.etherscanApiKey });
    }
    throw new Error(`bilinmeyen zincir: ${chain}`);
  }
}

/** Ortam değişkenlerinden kayıt defteri kurar. */
export function registryFromEnv(env: NodeJS.ProcessEnv = process.env): AdapterRegistry {
  return new AdapterRegistry({
    trongridApiKey: env.TRONGRID_API_KEY,
    etherscanApiKey: env.ETHERSCAN_API_KEY,
  });
}
