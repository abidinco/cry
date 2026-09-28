import { describe, expect, it } from "vitest";
import { butceNotu, esikleriDogrula, SINIRLAR } from "../apps/web/src/lib/kosu-baslatma";
import { tohumSorunu } from "../apps/web/src/lib/kosu-durum";

describe("esikleriDogrula — ekrana açılan eşiklerin kapısı", () => {
  it("boş girdi varsayılanları verir", () => {
    const s = esikleriDogrula({});
    expect(s).toEqual({ esikler: { maxHop: 5, maxDugum: 300, dallanmaEsigi: 50 } });
  });

  it("verilen değer geçerse aynen geçer — arayüz artık gerçekten gönderiyor", () => {
    const s = esikleriDogrula({ maxHop: 12, maxDugum: 2000, dallanmaEsigi: 200 });
    expect(s).toEqual({ esikler: { maxHop: 12, maxDugum: 2000, dallanmaEsigi: 200 } });
  });

  it("metin olarak gelen sayı kabul edilir (form alanları metin taşır)", () => {
    expect(esikleriDogrula({ maxHop: "8" })).toEqual({
      esikler: { maxHop: 8, maxDugum: 300, dallanmaEsigi: 50 },
    });
  });

  it("boş metin verilmemiş sayılır, 0 SAYILMAZ", () => {
    expect(esikleriDogrula({ maxHop: "" })).toEqual({
      esikler: { maxHop: 5, maxDugum: 300, dallanmaEsigi: 50 },
    });
    expect(esikleriDogrula({ maxHop: 0 })).toHaveProperty("hata");
  });

  it("ondalık, NaN ve sonsuz REDDEDİLİR — sessizce yuvarlanmaz", () => {
    for (const kotu of [2.5, NaN, Infinity, -Infinity, "abc"]) {
      expect(esikleriDogrula({ maxHop: kotu })).toHaveProperty("hata");
    }
  });

  it("sınır dışı değer varsayılana DÜŞMEZ, hata olur", () => {
    const s = esikleriDogrula({ maxDugum: SINIRLAR.maxDugum[1] + 1 });
    expect(s).toHaveProperty("hata");
    // Sessizce 300'e düşseydi rapor kendi yazdığı sınırla çelişirdi.
    expect(s).not.toHaveProperty("esikler");
  });

  it("hata mesajı hangi alan olduğunu SÖYLER", () => {
    const s = esikleriDogrula({ dallanmaEsigi: 1 });
    expect("hata" in s && s.hata).toContain("dallanma");
  });

  it("sınırların uçları geçerlidir", () => {
    for (const [ad, [alt, ust]] of Object.entries(SINIRLAR)) {
      expect(esikleriDogrula({ [ad]: alt })).toHaveProperty("esikler");
      expect(esikleriDogrula({ [ad]: ust })).toHaveProperty("esikler");
    }
  });
});

describe("butceNotu — büyük bütçenin bedeli söylenir", () => {
  it("küçük bütçede uyarı yok", () => {
    expect(butceNotu({ maxHop: 5, maxDugum: 300, dallanmaEsigi: 50 })).not.toContain("saatler");
  });

  it("büyük bütçede süre uyarısı var", () => {
    expect(butceNotu({ maxHop: 5, maxDugum: 1000, dallanmaEsigi: 50 })).toContain("saatler");
  });
});

describe("tohumSorunu — işlemden başlatılan koşunun boş tohumu", () => {
  it("işlem seçilmemişse sessiz", () => {
    expect(tohumSorunu(null)).toBeNull();
    expect(tohumSorunu({ bulunan: 0 })).toBeNull();
  });

  it("giriş bulunduysa sessiz", () => {
    expect(tohumSorunu({ tohumTx: "abc", bulunan: 3 })).toBeNull();
  });

  it("0 giriş bulunduysa SÖYLER ve boş grafın yanlış okunmasını engeller", () => {
    const m = tohumSorunu({ tohumTx: "a".repeat(64), bulunan: 0 });
    expect(m).toContain("0 giriş");
    expect(m).toContain("DEĞİLDİR");
  });

  it("henüz ölçülmemişse (bulunan yok) hüküm vermez", () => {
    expect(tohumSorunu({ tohumTx: "abc" })).toBeNull();
  });
});
