import { describe, expect, it } from "vitest";
import {
  CIZIM_SINIRI,
  cizilecekler,
  dugumSinifi,
  type GrafDugumu,
} from "@/lib/graf-secim";

const KOK = "TKOK";

function d(p: Partial<GrafDugumu> & { address: string }): GrafDugumu {
  return { hop: 1, isTerminal: false, terminalReason: null, etiketler: [], ...p };
}

describe("düğüm sınıfı", () => {
  it("kök her şeyin önündedir", () => {
    expect(dugumSinifi(d({ address: KOK, terminalReason: "terminal" }), KOK)).toBe("kok");
  });

  it("doğrulanmış borsa ile aday AYRI sınıflardır", () => {
    expect(dugumSinifi(d({ address: "A", terminalReason: "terminal" }), KOK)).toBe("terminal");
    expect(dugumSinifi(d({ address: "A", terminalReason: "terminal_aday" }), KOK)).toBe(
      "terminal_aday",
    );
  });

  it("bizim koyduğumuz sınırlar tek sınıfta toplanır — izin kendisi bitmedi", () => {
    for (const sebep of ["butce", "dugum_siniri", "dallanma", "esik"]) {
      expect(dugumSinifi(d({ address: "A", terminalReason: sebep }), KOK)).toBe("bizim_sinirimiz");
    }
  });

  it("'taranamadı' ayrı kalır: yok ile bakılamadı aynı şey değildir", () => {
    expect(dugumSinifi(d({ address: "A", terminalReason: "indekssiz" }), KOK)).toBe("bakilamadi");
  });
});

describe("çizim sınırı", () => {
  it("sınırın altında hiçbir şey kırpılmaz", () => {
    const g = [d({ address: KOK, hop: 0 }), d({ address: "A" })];
    const { secilen, kirpilan } = cizilecekler(g, KOK);
    expect(secilen).toHaveLength(2);
    expect(kirpilan).toBe(0);
  });

  it("kırpma BULGUYU kaybetmez: kök ve terminaller önce girer", () => {
    // 150 sıradan düğüm + sonda bir borsa: sınır 100 olsa da borsa çizilir.
    const g: GrafDugumu[] = [];
    for (let i = 0; i < 150; i++) g.push(d({ address: `Z${String(i).padStart(3, "0")}`, hop: 3 }));
    g.push(d({ address: KOK, hop: 0 }));
    g.push(d({ address: "BORSA", hop: 5, terminalReason: "terminal" }));
    g.push(d({ address: "ADAY", hop: 4, terminalReason: "terminal_aday" }));

    const { secilen, kirpilan } = cizilecekler(g, KOK);
    const adresler = secilen.map((x) => x.address);
    expect(adresler[0]).toBe(KOK);
    expect(adresler[1]).toBe("BORSA");
    expect(adresler[2]).toBe("ADAY");
    expect(secilen).toHaveLength(CIZIM_SINIRI);
    expect(kirpilan).toBe(53);
  });

  it("seçim DETERMİNİSTİKTİR: aynı koşu aynı resmi verir", () => {
    const g: GrafDugumu[] = [];
    for (let i = 0; i < 120; i++) g.push(d({ address: `A${String(i).padStart(3, "0")}`, hop: 2 }));
    const bir = cizilecekler(g, KOK).secilen.map((x) => x.address);
    const iki = cizilecekler([...g].reverse(), KOK).secilen.map((x) => x.address);
    expect(iki).toEqual(bir);
  });
});
