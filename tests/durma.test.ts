import { describe, expect, it } from "vitest";
import { devamEdilebilir, devamEsikleri, durmaSebebi, hopOnerisi, VARSAYILAN_ESIKLER } from "../packages/motor/src/durma";
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

  it("DOĞRULANMIŞ borsa etiketinde durur ve sebep TERMİNAL olur", () => {
    // Aracın var olma sebebi burası; "bütçe bitti" yazmak bulguyu kaybettirir.
    const d = dugum({ borsaMi: true, borsaEtiketiDogrulanmisMi: true });
    expect(durmaSebebi(d, VARSAYILAN_ESIKLER, 10)).toBe("terminal");
  });

  it("doğrulama BİLİNMİYORSA aday sayılır — yokluk bir doğrulama değildir", () => {
    // Bayrak hiç verilmemiş: güvenli varsayılan zayıf iddiadır.
    expect(durmaSebebi(dugum({ borsaMi: true }), VARSAYILAN_ESIKLER, 10)).toBe("terminal_aday");
  });

  it("borsa sebebi bütçe ve dallanmanın ÖNÜNDE gelir", () => {
    const d = dugum({ borsaMi: true, borsaEtiketiDogrulanmisMi: true, hop: 99, cikisSayisi: 9999 });
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

describe("takibe devam", () => {
  it("doğrulanmış borsada devam YOK, adayda ve bizim sınırlarımızda VAR", () => {
    expect(devamEdilebilir("terminal").olur).toBe(false);
    for (const s of ["terminal_aday", "butce", "dallanma", "esik", "dugum_siniri", "indekssiz", "kontrat"]) {
      expect(devamEdilebilir(s).olur).toBe(true);
    }
    expect(devamEdilebilir(null).olur).toBe(false);
  });

  it("sıçrama bütçesi düğümün yerinden sayılır, düğüm bütçesi mevcut koşunun üstüne eklenir", () => {
    const e = devamEsikleri({ maxHop: 3, maxDugum: 60, dallanmaEsigi: 50, minTutar: 0n }, 3, 23, 2);
    expect(e.maxHop).toBe(5);
    expect(e.maxDugum).toBe(83);
  });

  it("ek sıçrama 1..5 aralığına sıkıştırılır", () => {
    const t = { maxHop: 3, maxDugum: 60, dallanmaEsigi: 50, minTutar: 0n };
    expect(devamEsikleri(t, 2, 10, 99).maxHop).toBe(7);
    expect(devamEsikleri(t, 2, 10, 0).maxHop).toBe(3);
  });
});

describe("yakıldı", () => {
  it("yakma adresi borsadan ve sınırlardan ÖNCE gelir", () => {
    expect(durmaSebebi(dugum({ yakmaMi: true, borsaMi: true, cikisSayisi: 9999 }), VARSAYILAN_ESIKLER, 1)).toBe("yakildi");
  });
  it("yakılan paradan devam edilmez", () => {
    expect(devamEdilebilir("yakildi").olur).toBe(false);
    // yakma sebebinden önce yazılmış koşu: sıfır adresi "dallanma" diye kayıtlı
    expect(devamEdilebilir("dallanma", "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb").olur).toBe(false);
  });
  it("koşu başlığında yakıldı adaydan önemlidir, doğrulanmış borsadan değil", async () => {
    const { kosuDurmaSebebi } = await import("../packages/motor/src/durma");
    expect(kosuDurmaSebebi({ butce: 9, terminal_aday: 1, yakildi: 1 })).toBe("yakildi");
    expect(kosuDurmaSebebi({ terminal: 1, yakildi: 1 })).toBe("terminal");
  });
  it("EVM adresi büyük/küçük harften bağımsız tanınır", async () => {
    const { yakmaAdresiMi } = await import("../packages/chain/src/yakma");
    expect(yakmaAdresiMi("0x000000000000000000000000000000000000dEaD")).toBe(true);
    expect(yakmaAdresiMi("T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb")).toBe(true);
    expect(yakmaAdresiMi("TAUN6FwrnwwmaEqYcckffC7wYmbaS6cBiX")).toBe(false);
  });
});
