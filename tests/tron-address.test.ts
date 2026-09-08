import { describe, expect, it } from "vitest";
import { base58ToHex, hexToBase58, tronGecerliMi, tronNormalize } from "../packages/chain/src/tron-address.js";

// Bilinen adres: TRON kurucu/genesis adreslerinden, checksum'ı geçerli.
const ADRES = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"; // USDT-TRC20 sözleşmesi
const HEX = "41a614f803b6fd780986a42c78ec9c7f77e6ded13c";

describe("TRON adresi", () => {
  it("base58 ile hex arasında gidip gelir", () => {
    expect(base58ToHex(ADRES)).toBe(HEX);
    expect(hexToBase58(HEX)).toBe(ADRES);
  });

  it("iki biçimi de aynı kanonik adrese çeker", () => {
    // Aynı cüzdan grafın iki ayrı düğümü olmamalı.
    expect(tronNormalize(HEX)).toBe(ADRES);
    expect(tronNormalize("0x" + HEX)).toBe(ADRES);
    expect(tronNormalize(` ${ADRES} `)).toBe(ADRES);
  });

  it("checksum'ı bozuk adresi SESSİZCE kabul etmez", () => {
    // Son karakteri değiştirilmiş adres: tek yanlış karakter tüm soruşturmayı
    // başka cüzdana yönlendirir.
    const bozuk = ADRES.slice(0, -1) + (ADRES.endsWith("t") ? "u" : "t");
    expect(tronGecerliMi(bozuk)).toBe(false);
    expect(() => tronNormalize(bozuk)).toThrow();
  });

  it("TRON olmayan girdiyi reddeder", () => {
    expect(tronGecerliMi("0x742d35Cc6634C0532925a3b844Bc454e4438f44e")).toBe(false);
    expect(tronGecerliMi("")).toBe(false);
  });
});
