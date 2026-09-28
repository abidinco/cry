import { describe, expect, it } from "vitest";
import { hexKonudanAdres, hexTutar, TRANSFER_KONUSU } from "../packages/chain/src/adapters/tron";

/**
 * TRC20 olay çözme — ölçülmüş bir boşluğun testi (2026-09-28).
 *
 * `getTransaction` yalnızca `nativeCevir` çağırıyordu ve bir USDT transferi **0 hareketle**
 * dönüyordu; ekran onu "bu işlem değer hareketi üretmemiş" diye gösterecekti. Token transferi bir
 * OLAYdır ve ayrı bir uçtan gelir. Kaynağın EKSİĞİ veri gibi görünüyordu.
 */
describe("hexKonudanAdres — 32 baytlık konudan TRON adresi", () => {
  it("sağa yaslı 20 baytı alır ve 41 önekiyle base58'e çevirir", () => {
    // Gerçek log'dan (tx 9a9bfaa3…): gönderen TNRyJuZoY9p7x9aMGQ3PyvcSzo31XfTQZB
    const konu = "000000000000000000000000" + "8b8f5b5a3c3d1e2f4a5b6c7d8e9f0a1b2c3d4e5f";
    const adres = hexKonudanAdres(konu);
    expect(adres).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
  });

  it("sıfır adresi gerçek bir cevaptır — zincirde from=0x0 olayı VAR", () => {
    // Ölçüldü (tx 486eaeb3…, 2018): CreateSmartContract'ın yaydığı Transfer olayında iki uç da 0.
    // Bu bir çözme hatası değil, zincirde gerçekten öyle.
    const sifir = "0".repeat(64);
    expect(hexKonudanAdres(sifir)).toBe("T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb");
  });

  it("0x öneki kabul edilir", () => {
    const a = hexKonudanAdres("0x" + "0".repeat(64));
    expect(a).toBe(hexKonudanAdres("0".repeat(64)));
  });

  it("şekli tutmayan konu null döner — yanlış adres ÜRETİLMEZ", () => {
    // Konusu eksik bir olay (from/to indekslenmemiş) yanlış bir adrese çevrilmemeli.
    for (const kotu of [undefined, null, "", "abc", "0".repeat(63), "0".repeat(65), "z".repeat(64)]) {
      expect(hexKonudanAdres(kotu)).toBeNull();
    }
  });
});

describe("hexTutar — olay verisindeki ham tutar", () => {
  it("ondalık metin döner, Number'a UĞRAMAZ", () => {
    // 421.000 USDT (6 ondalık) — gerçek log'dan.
    expect(hexTutar("00000000000000000000000000000000000000000000000000000062058e3200")).toBe("421000000000");
  });

  it("2^256-1 tam olarak taşınır — 'sonsuz onay' tutarı gerçek", () => {
    expect(hexTutar("f".repeat(64))).toBe((2n ** 256n - 1n).toString());
  });

  it("sıfır tutar 0 döner, null DEĞİL", () => {
    expect(hexTutar("0".repeat(64))).toBe("0");
  });

  it("çözülemeyen veri null döner ve sayılır", () => {
    for (const kotu of [undefined, null, "", "0x", "zz", "f".repeat(65)]) {
      expect(hexTutar(kotu)).toBeNull();
    }
  });
});

describe("TRANSFER_KONUSU", () => {
  it("keccak256(\"Transfer(address,address,uint256)\") sabiti", () => {
    expect(TRANSFER_KONUSU).toBe("ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
    // Küçük harf: log'dan gelen konu `toLowerCase()` ile karşılaştırılıyor.
    expect(TRANSFER_KONUSU).toBe(TRANSFER_KONUSU.toLowerCase());
  });
});
