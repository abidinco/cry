import { describe, expect, it } from "vitest";
import { durmaSebebi, hopOnerisi, VARSAYILAN_ESIKLER } from "../packages/motor/src/durma";
import type { DugumDurumu } from "../packages/motor/src/durma";

const dugum = (uzer: Partial<DugumDurumu> = {}): DugumDurumu => ({
  adres: "A",
  hop: 1,
  cikisSayisi: 3,
  izliTutar: 1000n,
  borsaMi: false,
  sozlesmeMi: false,
  indekslendiMi: true,
  ...uzer,
});

describe("durma ölçütleri", () => {
  it("sıradan düğümde devam eder", () => {
    expect(durmaSebebi(dugum(), VARSAYILAN_ESIKLER, 10)).toBeNull();
  });

  it("borsaya varınca durur ve sebep TERMİNAL olur", () => {
    // Aracın var olma sebebi burası; "bütçe bitti" yazmak bulguyu kaybettirir.
    expect(durmaSebebi(dugum({ borsaMi: true }), VARSAYILAN_ESIKLER, 10)).toBe("terminal");
  });

  it("borsa sebebi bütçe ve dallanmanın ÖNÜNDE gelir", () => {
    const d = dugum({ borsaMi: true, hop: 99, cikisSayisi: 9999 });
    expect(durmaSebebi(d, VARSAYILAN_ESIKLER, 99999)).toBe("terminal");
  });

  it("taranmamış düğüm 'yok' değil 'indekssiz' der", () => {
    expect(durmaSebebi(dugum({ indekslendiMi: false }), VARSAYILAN_ESIKLER, 1)).toBe("indekssiz");
  });

  it("hop bütçesi, düğüm sınırı ve dallanma ayrı ayrı raporlanır", () => {
    expect(durmaSebebi(dugum({ hop: 5 }), VARSAYILAN_ESIKLER, 1)).toBe("butce");
    expect(durmaSebebi(dugum(), VARSAYILAN_ESIKLER, 300)).toBe("dugum_siniri");
    expect(durmaSebebi(dugum({ cikisSayisi: 51 }), VARSAYILAN_ESIKLER, 1)).toBe("dallanma");
  });

  it("tutar eşiği VARSAYILAN OLARAK kapalı", () => {
    // Açık bir eşik küçük ama kritik bir transferi sessizce eler.
    expect(VARSAYILAN_ESIKLER.minTutar).toBe(0n);
    expect(durmaSebebi(dugum({ izliTutar: 1n }), VARSAYILAN_ESIKLER, 1)).toBeNull();
    const esikli = { ...VARSAYILAN_ESIKLER, minTutar: 100n };
    expect(durmaSebebi(dugum({ izliTutar: 1n }), esikli, 1)).toBe("esik");
  });

  it("varsayılanlar kullanıcı kararıyla aynı", () => {
    expect(VARSAYILAN_ESIKLER.maxHop).toBe(5);
    expect(VARSAYILAN_ESIKLER.maxDugum).toBe(300);
    expect(VARSAYILAN_ESIKLER.dallanmaEsigi).toBe(50);
  });
});

describe("hop önerisi", () => {
  it("düğümlerin yarısı borsaysa orada durmayı önerir", () => {
    const { onerilenHop, gerekce } = hopOnerisi([1, 4, 6], [0, 0, 4]);
    expect(onerilenHop).toBe(2);
    expect(gerekce).toContain("borsa");
  });

  it("yeni düğüm kalmadıysa orada durur", () => {
    expect(hopOnerisi([1, 3, 0], [0, 0, 0]).onerilenHop).toBe(2);
  });

  it("hiçbir ölçüt tetiklenmezse derinleştirilebilir der", () => {
    const { onerilenHop, gerekce } = hopOnerisi([1, 5, 9], [0, 1, 2]);
    expect(onerilenHop).toBe(3);
    expect(gerekce).toContain("derinleştirilebilir");
  });
});
