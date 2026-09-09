import { describe, expect, it } from "vitest";
import { dagit } from "../packages/motor/src/dagitim";
import type { Hareket, IzliGiris } from "../packages/motor/src/tipler";

const SAAT = 3600_000;
const t = (saat: number) => saat * SAAT;

function gelen(ts: number, tutar: bigint, varlik = "TRX", kim = "A"): Hareket {
  return { txHash: `in-${ts}-${tutar}`, index: 0, ts, yon: "gelen", karsiTaraf: kim, varlik, tutar };
}
function giden(ts: number, tutar: bigint, hedef: string, varlik = "TRX"): Hareket {
  return { txHash: `out-${ts}-${hedef}`, index: 0, ts, yon: "giden", karsiTaraf: hedef, varlik, tutar };
}
const izli = (ts: number, tutar: bigint, varlik = "TRX", pay = 1): IzliGiris => ({
  varlik, tutar, ts, pay,
});

describe("FIFO atıfı", () => {
  it("ilk giren ilk çıkar: temiz para önce girdiyse iz ikinci çıkışa gider", () => {
    const hareketler = [
      gelen(t(1), 100n), // temiz
      gelen(t(2), 100n), // izli
      giden(t(3), 100n, "B"),
      giden(t(4), 100n, "C"),
    ];
    const { cikislar } = dagit(hareketler, [izli(t(2), 100n)], { kural: "fifo" });

    // İlk çıkış temiz parayı taşır, iz ikinci çıkışta.
    expect(cikislar).toHaveLength(1);
    expect(cikislar[0]!.hedef).toBe("C");
    expect(cikislar[0]!.izliTutar).toBe(100n);
  });

  it("izli para bölünerek çıkarsa iz de bölünür", () => {
    const hareketler = [
      gelen(t(1), 100n),
      giden(t(2), 60n, "B"),
      giden(t(3), 40n, "C"),
    ];
    const { cikislar } = dagit(hareketler, [izli(t(1), 100n)], { kural: "fifo" });
    expect(cikislar.map((c) => [c.hedef, c.izliTutar])).toEqual([
      ["B", 60n],
      ["C", 40n],
    ]);
  });

  it("çıkmayan para düğümde BEKLER ve bu ayrıca raporlanır", () => {
    const hareketler = [gelen(t(1), 100n), giden(t(2), 30n, "B")];
    const sonuc = dagit(hareketler, [izli(t(1), 100n)], { kural: "fifo" });
    expect(sonuc.cikislar[0]!.izliTutar).toBe(30n);
    expect(sonuc.bekleyenToplam).toBe(70n);
  });

  it("varlıklar KARIŞMAZ: USDT girişi TRX çıkışına iz vermez", () => {
    const hareketler = [
      gelen(t(1), 100n, "USDT"),
      giden(t(2), 100n, "B", "TRX"),
    ];
    const { cikislar } = dagit(hareketler, [izli(t(1), 100n, "USDT")], { kural: "fifo" });
    expect(cikislar).toHaveLength(0);
  });

  it("görmediğimiz bir girişten beslenen çıkışa iz ATFEDİLMEZ", () => {
    // İndeks eksik olabilir; kuyrukta karşılığı olmayan çıkış iz taşımaz.
    const hareketler = [giden(t(5), 500n, "B")];
    const { cikislar } = dagit(hareketler, [izli(t(1), 100n)], { kural: "fifo" });
    expect(cikislar).toHaveLength(0);
  });

  it("kısmi pay taşınır", () => {
    const hareketler = [gelen(t(1), 100n), giden(t(2), 100n, "B")];
    const { cikislar } = dagit(hareketler, [izli(t(1), 100n, "TRX", 0.25)], { kural: "fifo" });
    expect(cikislar[0]!.izliTutar).toBe(25n);
  });
});

describe("orantısal atıf", () => {
  it("havuzun payı kadarını her çıkışa dağıtır", () => {
    // 100 izli + 300 temiz girdi -> havuzun %25'i izli.
    const hareketler = [
      gelen(t(1), 100n),
      gelen(t(2), 300n),
      giden(t(3), 200n, "B"),
      giden(t(4), 200n, "C"),
    ];
    const { cikislar } = dagit(hareketler, [izli(t(1), 100n)], { kural: "orantisal" });
    expect(cikislar.map((c) => [c.hedef, c.izliTutar])).toEqual([
      ["B", 50n],
      ["C", 50n],
    ]);
  });

  it("FIFO ile AYNI veride farklı sonuç verir — kural seçimi bu yüzden raporlanır", () => {
    const hareketler = [
      gelen(t(1), 100n),
      gelen(t(2), 100n),
      giden(t(3), 100n, "B"),
    ];
    const girisler = [izli(t(2), 100n)];
    const f = dagit(hareketler, girisler, { kural: "fifo" });
    const o = dagit(hareketler, girisler, { kural: "orantisal" });
    // FIFO: ilk giren temiz para çıktı, ize dokunulmadı.
    expect(f.cikislar).toHaveLength(0);
    // Orantısal: havuzun yarısı izli, çıkışın yarısı ize atfedildi.
    expect(o.cikislar[0]!.izliTutar).toBe(50n);
  });
});

describe("zaman pencereli atıf", () => {
  it("pencere içindeki çıkışı takip eder", () => {
    const hareketler = [gelen(t(1), 100n), giden(t(5), 100n, "B")];
    const { cikislar } = dagit(hareketler, [izli(t(1), 100n)], {
      kural: "zaman_pencereli",
      pencereSaat: 6,
    });
    expect(cikislar[0]!.izliTutar).toBe(100n);
  });

  it("pencere dışındaki çıkışa iz vermez — ve bunu KAYIP olarak bırakır", () => {
    const hareketler = [gelen(t(1), 100n), giden(t(50), 100n, "B")];
    const sonuc = dagit(hareketler, [izli(t(1), 100n)], {
      kural: "zaman_pencereli",
      pencereSaat: 6,
    });
    expect(sonuc.cikislar).toHaveLength(0);
    // Kural bekletilen parayı kaybediyor; varsayılan olmamasının sebebi bu.
    expect(sonuc.bekleyenToplam).toBe(100n);
  });

  it("girişten ÖNCEKİ çıkışa iz vermez", () => {
    const hareketler = [giden(t(1), 100n, "B"), gelen(t(2), 100n)];
    const { cikislar } = dagit(hareketler, [izli(t(2), 100n)], {
      kural: "zaman_pencereli",
      pencereSaat: 24,
    });
    expect(cikislar).toHaveLength(0);
  });
});
