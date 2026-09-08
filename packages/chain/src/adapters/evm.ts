/**
 * EVM adaptörü — Faz 1b (Ethereum, BSC, Polygon + ikincil zincirler).
 *
 * Etherscan V2: tek anahtar 60+ zincir, `chainid` parametresiyle ayrılıyor.
 * Ücretsiz katmanda istek başına 1.000 kayıt ve 5 çağrı/sn.
 *
 * DURUM: İSKELET. Arayüz baştan dördünü de kaldırsın diye burada; gövdesi
 * Faz 1b'de doldurulacak. Yarım bir uygulama sessizce eksik veri döndürür,
 * o yüzden çağrılan her metot açıkça hata atıyor.
 */

import { EVM_CHAIN_IDS } from "../network-detect";
import {
  type AddressSummary,
  type Asset,
  type Capabilities,
  type ChainAdapter,
  type ChainId,
  type ListOptions,
  type Page,
  type Transfer,
  type TxDetail,
} from "../types";

const NATIVE: Record<string, { symbol: string }> = {
  ethereum: { symbol: "ETH" },
  bsc: { symbol: "BNB" },
  polygon: { symbol: "POL" },
  arbitrum: { symbol: "ETH" },
  optimism: { symbol: "ETH" },
  base: { symbol: "ETH" },
  avalanche: { symbol: "AVAX" },
};

export class EvmAdapter implements ChainAdapter {
  readonly family = "evm" as const;
  readonly nativeAsset: Asset;
  readonly capabilities: Capabilities = {
    internalTransfers: true,
    tokenTransfers: true,
    activation: false,
    utxo: false,
    contractDetection: true,
  };

  readonly chainId: number;

  constructor(
    readonly chain: ChainId,
    private readonly opts: { apiKey?: string; baseUrl?: string } = {},
  ) {
    const id = (EVM_CHAIN_IDS as Record<string, number>)[chain];
    if (!id) throw new Error(`EVM zinciri tanınmıyor: ${chain}`);
    this.chainId = id;
    this.nativeAsset = {
      chain,
      contract: null,
      symbol: NATIVE[chain]?.symbol ?? "ETH",
      decimals: 18,
    };
  }

  normalizeAddress(input: string): string {
    const s = input.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(s)) throw new Error(`geçersiz EVM adresi: ${input}`);
    // EIP-55 büyütmesi network-detect tarafında doğrulanıyor; burada kanonik
    // biçim küçük harf — veritabanı anahtarı tek yazımda olmalı.
    return s.toLowerCase();
  }

  isValidAddress(input: string): boolean {
    return /^0x[0-9a-fA-F]{40}$/.test(input.trim());
  }

  async getAddressSummary(_address: string): Promise<AddressSummary> {
    throw new Error("EVM adaptörü Faz 1b'de doldurulacak");
  }

  async listTransfers(_address: string, _opts?: ListOptions): Promise<Page<Transfer>> {
    throw new Error("EVM adaptörü Faz 1b'de doldurulacak");
  }

  async getTransaction(_hash: string): Promise<TxDetail | null> {
    throw new Error("EVM adaptörü Faz 1b'de doldurulacak");
  }
}
