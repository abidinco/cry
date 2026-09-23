import { describe, expect, it } from "vitest";
import {
  incelemeSirasi,
  kararinVerisi,
  type IncelemeSatiri,
} from "../apps/web/src/lib/etiket-inceleme";

function s(p: Partial<IncelemeSatiri> & { address: string }): IncelemeSatiri {
  return {
    id: 1, chain: "tron", title: "Servis cüzdanı adayı", description: null,
    source: "kesif_blok", sourceUrl: null, confidence: 0.5, kosuda: 0, durdurdu: 0,
    ...p,
  };
}

describe("etiket incelemesi — sıra", () => {
  it("önce GERÇEKTEN izi durdurmuş olan gelir, güveni düşük olsa bile", () => {
    // Bir etiketin bedeli bir koşuyu durdurduğunda ödenir. Hiç karşılaşılmamış adresin doğru
    // etiketlenmesi bugün hiçbir raporu değiştirmiyor.
    const sira = incelemeSirasi([
      s({ address: "B", confidence: 0.9 }),
      s({ address: "A", confidence: 0.4, durdurdu: 2 }),
    ]);
    expect(sira.map((x) => x.address)).toEqual(["A", "B"]);
  });

  it("durdurma eşitse koşuda görülme, o da eşitse güven karar verir", () => {
    const sira = incelemeSirasi([
      s({ address: "C", confidence: 0.8 }),
      s({ address: "B", confidence: 0.5, kosuda: 3 }),
      s({ address: "A", confidence: 0.4, kosuda: 3, durdurdu: 1 }),
    ]);
    expect(sira.map((x) => x.address)).toEqual(["A", "B", "C"]);
  });

  it("sıra DETERMİNİSTİKTİR — aynı liste her açılışta aynı görünür", () => {
    const girdi = [s({ address: "Z" }), s({ address: "A" }), s({ address: "M" })];
    const bir = incelemeSirasi(girdi).map((x) => x.address);
    const iki = incelemeSirasi([...girdi].reverse()).map((x) => x.address);
    expect(bir).toEqual(iki);
    expect(bir).toEqual(["A", "M", "Z"]);
  });

  it("girdiyi DEĞİŞTİRMEZ", () => {
    const girdi = [s({ address: "Z" }), s({ address: "A" })];
    incelemeSirasi(girdi);
    expect(girdi.map((x) => x.address)).toEqual(["Z", "A"]);
  });
});

describe("etiket incelemesi — kararın verisi", () => {
  const simdi = new Date("2026-09-23T12:00:00Z");

  it("'borsa' etiketi DOĞRULAR: motor artık terminal der", () => {
    const v = kararinVerisi("borsa", "kullanici:abidin", simdi, "MaskEX");
    expect(v.category).toBe("exchange_hot");
    expect(v.exchange).toBe("MaskEX");
    expect(v.verifiedAt).toBe(simdi);
    expect(v.verifiedBy).toBe("kullanici:abidin");
    // İnsan onayı kaynağın küratörlü etiketinden (0,8) güçlüdür.
    expect(v.confidence).toBe(1);
  });

  it("'borsa değil' etiketi SİLMEZ, diger'e çeker — yoksa bir sonraki keşif turunda geri gelir", () => {
    const v = kararinVerisi("borsa_degil", "kullanici:abidin", simdi);
    expect(v.category).toBe("diger");
    expect(v.exchange).toBeNull();
    // "Borsa değil" de bir doğrulamadır: bakıldı ve karara bağlandı.
    expect(v.verifiedAt).toBe(simdi);
    expect(v.verifiedBy).toBe("kullanici:abidin");
  });

  it("boş borsa adı null olur — rapora boş bir ad yazılmaz", () => {
    expect(kararinVerisi("borsa", "kullanici:a", simdi, "   ").exchange).toBeNull();
    expect(kararinVerisi("borsa", "kullanici:a", simdi).exchange).toBeNull();
  });

  it("imza `kullanici:` önekini taşır — kaynak turu bu satıra dokunmayacak", () => {
    // `etiketleriYaz` bu önekli satırları atlıyor (INSAN_IMZASI). Önek kaybolursa insanın kararı
    // bir sonraki `--kaynak=tronscan --uygula` turunda sessizce geri alınır.
    for (const k of ["borsa", "borsa_degil"] as const) {
      expect(kararinVerisi(k, "kullanici:abidin", simdi).verifiedBy).toMatch(/^kullanici:/);
    }
  });
});
