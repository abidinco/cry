import { describe, expect, it } from "vitest";
import { araligiCoz, birlestir, eksikAraliklar, eksikleriGuncelle, eksikListesiOku, kapsamDizisi, bloktanSatirlar } from "@cry/blok-indeks";
import { readFileSync } from "node:fs";

describe("araligiCoz", () => {
  it("kapalı aralık okur; tek sayı tek bloktur", () => {
    expect(araligiCoz("86000000-86000999")).toEqual({ bas: 86_000_000, son: 86_000_999 });
    expect(araligiCoz("42")).toEqual({ bas: 42, son: 42 });
  });

  it("bozuk ya da ters aralık SESSİZCE düzeltilmez, hata verir", () => {
    expect(() => araligiCoz("10-5")).toThrow(/ters/);
    expect(() => araligiCoz("abc")).toThrow(/okunamadı/);
    expect(() => araligiCoz("1-")).toThrow(/okunamadı/);
    expect(() => araligiCoz("99999999999999999999")).toThrow(/sayı değil/);
  });
});

describe("eksikAraliklar", () => {
  it("okunmayan blokları ardışık öbekler olarak verir — uçlar dahil", () => {
    expect(eksikAraliklar({ bas: 10, son: 20 }, new Set([12, 13, 17]))).toEqual([
      { bas: 10, son: 11 }, { bas: 14, son: 16 }, { bas: 18, son: 20 },
    ]);
  });

  it("tam okunmuş aralıkta boşluk yok; hiç okunmamışta aralığın kendisi", () => {
    expect(eksikAraliklar({ bas: 1, son: 3 }, new Set([1, 2, 3]))).toEqual([]);
    expect(eksikAraliklar({ bas: 1, son: 3 }, new Set())).toEqual([{ bas: 1, son: 3 }]);
  });

  it("aralık DIŞINDAKİ okunmuş bloklar boşluğu kapatmaz", () => {
    expect(eksikAraliklar({ bas: 5, son: 6 }, new Set([4, 7]))).toEqual([{ bas: 5, son: 6 }]);
  });
});

describe("eksik listesi", () => {
  it("birleştirme çakışan ve bitişik öbekleri tek öbek yapar", () => {
    expect(birlestir([{ bas: 8, son: 9 }, { bas: 1, son: 3 }, { bas: 4, son: 5 }, { bas: 9, son: 12 }])).toEqual([
      { bas: 1, son: 5 }, { bas: 8, son: 12 },
    ]);
  });

  it("turun baktığı aralıkta eski eksikleri siler, dışındakilere DOKUNMAZ", () => {
    const mevcut = [{ bas: 1, son: 10 }, { bas: 50, son: 60 }, { bas: 95, son: 120 }];
    // Tur 5–100'e baktı ve yalnızca 70–72'yi okuyamadı.
    expect(eksikleriGuncelle(mevcut, { bas: 5, son: 100 }, [{ bas: 70, son: 72 }])).toEqual([
      { bas: 1, son: 4 }, { bas: 70, son: 72 }, { bas: 101, son: 120 },
    ]);
  });

  it("kursördeki bozuk JSON boş liste SAYILMAZ", () => {
    expect(eksikListesiOku([])).toEqual([]);
    expect(eksikListesiOku([{ bas: 1, son: 2 }])).toEqual([{ bas: 1, son: 2 }]);
    expect(() => eksikListesiOku({})).toThrow(/dizi değil/);
    expect(() => eksikListesiOku([{ bas: 3, son: 1 }])).toThrow(/bozuk/);
    expect(() => eksikListesiOku([{ bas: "1", son: 2 }])).toThrow(/bozuk/);
  });
});

describe("kapsamDizisi", () => {
  it("transfer ÜRETMEYEN blok da kapsam satırı alır — 'okundu, 0 satır' ile 'okunmadı' ayrı", () => {
    const fixture = JSON.parse(readFileSync(new URL("./fixtures/tron-bloklar.json", import.meta.url), "utf8")) as { bloklar: { blok: never; bilgi: never }[] };
    const r = bloktanSatirlar(fixture.bloklar[1]!.blok, fixture.bloklar[1]!.bilgi);
    expect(r.satirlar).toHaveLength(0);
    expect(kapsamDizisi(r)).toEqual([r.blok, r.zaman, 0, r.sayac.islem, r.sayac.basarisizIslem, r.sayac.transferOlmayanOlay, 1]);
  });
});
