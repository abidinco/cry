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

  /** Bu zincirde şu an gerçekten veri çekilebiliyor mu (iskelet değil mi). */
  hazirMi(chain: ChainId): boolean {
    return chain === "tron";
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
