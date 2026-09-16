import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { bloktanSatirlar, geriyeParcalar, kaynakUygunMu, satirIzi } from "@cry/blok-indeks";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/tron-bloklar.json", import.meta.url), "utf8")) as {
  bloklar: { blok: unknown; bilgi: unknown[] }[];
};

describe("geriyeParcalar", () => {
  it("üstten başlar, parçalar bitişik ve boşluksuz, en alttaki kısa kalabilir", () => {
    expect(geriyeParcalar(100, 76, 10)).toEqual([{ bas: 91, son: 100 }, { bas: 81, son: 90 }, { bas: 76, son: 80 }]);
  });

  it("tek bloklük aralık ve aralıktan büyük parça", () => {
    expect(geriyeParcalar(5, 5, 10)).toEqual([{ bas: 5, son: 5 }]);
    expect(geriyeParcalar(9, 0, 100)).toEqual([{ bas: 0, son: 9 }]);
  });

  it("parçaların toplamı aralığın kendisidir", () => {
    const p = geriyeParcalar(86_306_620, 83_654_397, 10_000);
    expect(p.reduce((t, r) => t + r.son - r.bas + 1, 0)).toBe(86_306_620 - 83_654_397 + 1);
    for (let i = 1; i < p.length; i++) expect(p[i]!.son).toBe(p[i - 1]!.bas - 1);
  });

  it("ters aralık ya da bozuk boy HATA verir", () => {
    expect(() => geriyeParcalar(5, 10, 1)).toThrow(/geçersiz aralık/);
    expect(() => geriyeParcalar(10, 5, 0)).toThrow(/parça boyu/);
    expect(() => geriyeParcalar(10.5, 5, 1)).toThrow(/geçersiz aralık/);
  });
});

describe("kaynakUygunMu", () => {
  it("sınırlı geçmişli kaynak eski bloğa SORULMAZ; tam geçmişli her bloğa sorulur", () => {
    const publicnode = { ad: "publicnode", enEski: 83_654_397 };
    expect(kaynakUygunMu(publicnode, 83_654_397)).toBe(true);
    expect(kaynakUygunMu(publicnode, 83_654_396)).toBe(false);
    expect(kaynakUygunMu({ ad: "tronstack", enEski: null }, 1)).toBe(true);
  });
});

describe("satirIzi", () => {
  const r = () => bloktanSatirlar(fixture.bloklar[0]!.blok as never, fixture.bloklar[0]!.bilgi as never);

  it("satır sırasından bağımsızdır", () => {
    const a = r();
    const b = r();
    b.satirlar.reverse();
    expect(a.satirlar.length).toBeGreaterThan(1);
    expect(satirIzi(b)).toBe(satirIzi(a));
  });

  it("aynı SAYIDA ama farklı satırı ayırt eder", () => {
    const a = r();
    const b = r();
    b.satirlar[0] = { ...b.satirlar[0]!, tutar: b.satirlar[0]!.tutar + 1n };
    expect(b.satirlar).toHaveLength(a.satirlar.length);
    expect(satirIzi(b)).not.toBe(satirIzi(a));
  });
});
