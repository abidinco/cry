import { describe, it, expect } from "vitest";
import { gorulemeyenler, TronAdapter, type Capabilities } from "@cry/chain";

const hepsi: Capabilities = {
  internalTransfers: true, tokenTransfers: true, activation: true, utxo: false, contractDetection: true,
};

describe("gorulemeyenler — adaptörün körlüğü ekrana basılabilir olmalı", () => {
  it("her şeyi gören adaptör boş liste döndürür", () => {
    expect(gorulemeyenler(hepsi)).toEqual([]);
  });

  it("düşen her bayrak bir cümle üretir", () => {
    const hicbiri = gorulemeyenler({ ...hepsi, internalTransfers: false, tokenTransfers: false, contractDetection: false });
    expect(hicbiri).toHaveLength(3);
    expect(hicbiri[0]).toContain("internal transfer");
  });

  // Olmayan bir eksiği göstermek de yanlış: EVM'de "aktive eden" diye bir alan YOK, Bitcoin'de
  // sözleşme YOK. Bunları körlük diye saymak "yok ≠ bakılamadı" kuralının ikinci yanlış yönü.
  it("activation bir KÖRLÜK değil, TRON'a özgü bir alandır — listeye girmez", () => {
    expect(gorulemeyenler({ ...hepsi, activation: false })).toEqual([]);
  });

  it("utxo zincirinde liste BOŞTUR — oradaki eksik ayrı cinsten", () => {
    expect(gorulemeyenler({ internalTransfers: false, tokenTransfers: false, activation: false, utxo: true, contractDetection: false })).toEqual([]);
  });

  // ÖLÇÜM (2026-09-29): TRON'da iç transfer zincirde VAR ama hesap ucu vermiyor. Bayrak bu yüzden
  // düşürüldü; test bayrağın sessizce geri açılmasını engeller.
  it("TRON iç transferi GÖREMEZ ve bunu söyler", () => {
    const tron = new TronAdapter({ baseUrl: "https://ornek.invalid" });
    expect(tron.capabilities.internalTransfers).toBe(false);
    expect(gorulemeyenler(tron.capabilities)).toContain("sözleşme içi değer hareketleri (internal transfer)");
  });
});
