/**
 * "Hazır" bir İDDİADIR ve yanlışsa pahalıdır: hazır sayılan bir zincirde motor adrese gidip
 * "bakıldı, hareket yok" der. Bu dosya o iddianın sınırlarını sabitler.
 */
import { describe, expect, it } from "vitest";
import { AdapterRegistry } from "@cry/chain";

const anahtarli = new AdapterRegistry({ trongridApiKey: "t", etherscanApiKey: "e" });
const anahtarsiz = new AdapterRegistry({});

describe("hazirMi", () => {
  it("TRON her zaman hazırdır", () => {
    expect(anahtarli.hazirMi("tron")).toBe(true);
    expect(anahtarsiz.hazirMi("tron")).toBe(true);
  });

  it("EVM zincirleri anahtarla hazırdır", () => {
    for (const z of ["ethereum", "polygon", "arbitrum", "optimism", "base", "avalanche"] as const) {
      expect(anahtarli.hazirMi(z)).toBe(true);
    }
  });

  // Anahtarsız Etherscan HTTP 200 ile "Missing/Invalid API Key" döndürüyor; hazır saymak
  // her adrese "bakıldı, bir şey yok" dedirtirdi.
  it("anahtarsız EVM hazır DEĞİLDİR", () => {
    expect(anahtarsiz.hazirMi("ethereum")).toBe(false);
  });

  // Ücretsiz plan BSC'yi kapsamıyor (ölçüldü) ve Blockscout'ta da yok.
  it("BSC anahtar olsa da hazır DEĞİLDİR", () => {
    expect(anahtarli.hazirMi("bsc")).toBe(false);
  });

  it("adaptörü olmayan zincirler hazır değildir", () => {
    expect(anahtarli.hazirMi("bitcoin")).toBe(false);
    expect(anahtarli.hazirMi("solana")).toBe(false);
  });
});
