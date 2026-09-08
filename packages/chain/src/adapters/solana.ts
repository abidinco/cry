/**
 * Solana adaptörü — Faz 3.
 *
 * DURUM: İSKELET. Solana hesap modelinde ama token'lar cüzdanda DEĞİL,
 * türetilmiş token hesaplarında (ATA) durur; "bu token hesabının sahibi kim"
 * ayrı bir çözümleme katmanı ister. İşlem hacmi de yüksek — sayfalama
 * stratejisi TRON'unkinden farklı olacak.
 */

import {
  type AddressSummary,
  type Asset,
  type Capabilities,
  type ChainAdapter,
  type ListOptions,
  type Page,
  type Transfer,
  type TxDetail,
} from "../types";

const SOL: Asset = { chain: "solana", contract: null, symbol: "SOL", decimals: 9 };

export class SolanaAdapter implements ChainAdapter {
  readonly chain = "solana" as const;
  readonly family = "solana" as const;
  readonly nativeAsset = SOL;
  readonly capabilities: Capabilities = {
    internalTransfers: true,
    tokenTransfers: true,
    activation: false,
    utxo: false,
    contractDetection: true,
  };

  normalizeAddress(input: string): string {
    return input.trim();
  }

  isValidAddress(input: string): boolean {
    // Solana adresinde checksum YOK — biçim tutuyorsa kabul, kesinlik yoklamada.
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input.trim());
  }

  async getAddressSummary(_address: string): Promise<AddressSummary> {
    throw new Error("Solana adaptörü Faz 3'te doldurulacak");
  }

  async listTransfers(_address: string, _opts?: ListOptions): Promise<Page<Transfer>> {
    throw new Error("Solana adaptörü Faz 3'te doldurulacak");
  }

  async getTransaction(_hash: string): Promise<TxDetail | null> {
    throw new Error("Solana adaptörü Faz 3'te doldurulacak");
  }
}
