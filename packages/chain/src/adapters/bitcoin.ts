/**
 * Bitcoin adaptörü — Faz 2. Kaynak: mempool.space (anahtar istemiyor).
 *
 * DURUM: İSKELET, ve bilerek boş. Bitcoin hesap-bakiye değil UTXO modeli
 * kullanıyor: para üstü adresi tespiti, ortak girdi sahipliği kümelemesi ve
 * CoinJoin ayıklaması ayrı bir motor ister. Aynı kodu hesap modeliyle
 * paylaşamaz; arayüzü uygulaması yalnızca kayıt yerini tutmak içindir.
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

const BTC: Asset = { chain: "bitcoin", contract: null, symbol: "BTC", decimals: 8 };

export class BitcoinAdapter implements ChainAdapter {
  readonly chain = "bitcoin" as const;
  readonly family = "bitcoin" as const;
  readonly nativeAsset = BTC;
  readonly capabilities: Capabilities = {
    internalTransfers: false,
    tokenTransfers: false,
    activation: false,
    utxo: true,
    contractDetection: false,
  };

  normalizeAddress(input: string): string {
    return input.trim();
  }

  isValidAddress(input: string): boolean {
    // Gerçek doğrulama network-detect'te (bech32 + base58check); burada kaba kapı.
    return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{20,70}$/.test(input.trim());
  }

  async getAddressSummary(_address: string): Promise<AddressSummary> {
    throw new Error("Bitcoin adaptörü Faz 2'de doldurulacak (UTXO motoru gerekiyor)");
  }

  async listTransfers(_address: string, _opts?: ListOptions): Promise<Page<Transfer>> {
    throw new Error("Bitcoin adaptörü Faz 2'de doldurulacak (UTXO motoru gerekiyor)");
  }

  async getTransaction(_hash: string): Promise<TxDetail | null> {
    throw new Error("Bitcoin adaptörü Faz 2'de doldurulacak (UTXO motoru gerekiyor)");
  }
}
