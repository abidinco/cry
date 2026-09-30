import { describe, expect, it } from "vitest";

import {
  ayristir,
  carp,
  carpMetin,
  fiyatCumlesi,
  fiyatlandir,
  kurCumlesi,
  metne,
  olcekle,
} from "@cry/fiyat";

describe("ondalık aritmetiği", () => {
  it("metni değer + ölçeğe ayırır", () => {
    expect(ayristir("48.9131")).toEqual({ deger: 489131n, olcek: 4 });
    expect(ayristir("1")).toEqual({ deger: 1n, olcek: 0 });
    expect(ayristir("abc")).toBeNull();
  });

  /**
   * Prisma'nın Decimal'i `toString()`te 1e-6 ALTINI ÜSTEL yazıyor — 400
   * fiyatın 3'ünde ölçüldü (`3.72575e-7`). Reddedilince o hareketin TL
   * karşılığı "tutar fiyata çarpılamadı" diye düşüyordu: doğru davranıştı
   * ama fiyat GERÇEKTEN vardı. Okuyan taraf `toFixed()` kullanıyor, burası
   * ikinci kapı.
   */
  it("üstel yazımı da ayrıştırır", () => {
    expect(ayristir("3.72575e-7")).toEqual(ayristir("0.000000372575"));
    expect(ayristir("6e-7")).toEqual({ deger: 6n, olcek: 7 });
    expect(ayristir("1.5e3")).toEqual({ deger: 1500n, olcek: 0 });
    expect(ayristir("1E-2")).toEqual({ deger: 1n, olcek: 2 });
    expect(ayristir("1e999")).toBeNull();
  });

  it("üstel bir fiyatla çarpım doğru büyüklüğü verir", () => {
    // 85.563.825,672474 BTT (18 ondalık) × 3,72575e-7 USD
    const ham = "85563825672474000000000000";
    expect(carp(ham, 18, "3.72575e-7", 6)).toBe(carp(ham, 18, "0.000000372575", 6));
    expect(carp(ham, 18, "3.72575e-7", 6)).toBe("31.878942");
  });

  it("ölçek küçültürken yarıyı YUKARI yuvarlar", () => {
    expect(metne(olcekle(1235n, 3, 2), 2)).toBe("1.24");
    expect(metne(olcekle(1234n, 3, 2), 2)).toBe("1.23");
  });

  /**
   * Projenin en eski kuralı: tutar `Number`'a UĞRAMAZ. 2^256-1 canlı veride
   * var ve `Number`'dan geçince rapora `1.15e+53` diye düşer.
   */
  it("2^256-1 değerini kayıpsız çarpar", () => {
    const ham = (2n ** 256n - 1n).toString();
    const sonuc = carp(ham, 18, "1", 0);
    expect(sonuc).not.toContain("e");
    // Tam sayı bölmesi ...457 verirdi; ölçek küçültme YARIYI YUKARI yuvarlar.
    expect(sonuc).toBe("115792089237316195423570985008687907853269984665640564039458");
    expect(sonuc).toHaveLength(60);
  });

  it("ham tutarı fiyatla çarpar", () => {
    // 1500 USDT (6 ondalık) × 0,999692 USD
    expect(carp("1500000000", 6, "0.999692", 6)).toBe("1499.538000");
  });

  it("USD tutarını kura çarpar", () => {
    expect(carpMetin("1499.538000", "48.9131", 2)).toBe("73347.05");
  });
});

describe("iki kurla fiyatlandırma", () => {
  const girdi = {
    hamTutar: "1500000000",
    ondalik: 6,
    islemGunu: { usd: "0.999692", kur: "17.2568", kurTarihi: "2022-06-15" },
    raporGunu: { usd: "0.999692", kur: "48.9131", kurTarihi: "2026-09-29" },
  };

  /**
   * Kullanıcı kararı: tek sayı hangi soruya cevap verdiğini GİZLER. Aynı 1.500
   * USDT 2022'de 25.877 ₺, bugün 73.347 ₺ eder ve ikisi de doğrudur.
   */
  it("iki kuru da verir ve ikisi FARKLIDIR", () => {
    const f = fiyatlandir(girdi);
    expect(f.islemGunu?.try).toBe("25877.23");
    expect(f.raporGunu?.try).toBe("73347.05");
    expect(f.gerekce).toEqual([]);
  });

  it("cümle hangi kurun hangi tarihten geldiğini söyler", () => {
    const c = fiyatCumlesi(fiyatlandir(girdi), "USDT");
    expect(c).toContain("işlem günü 25877.23 ₺");
    expect(c).toContain("2022-06-15");
    expect(c).toContain("rapor günü 73347.05 ₺");
    expect(c).toContain("TCMB döviz alış");
  });

  /**
   * "Yok" ile "bakılamadı" ayrı cevaplardır. İşlem günü fiyatı yoksa o taraf
   * BOŞ kalmaz, SEBEBİ yazılır — ve rapor günü yine de hesaplanır.
   */
  it("işlem günü fiyatı yoksa sebebini yazar, rapor gününü yine verir", () => {
    const f = fiyatlandir({
      ...girdi,
      islemGunu: {
        usd: null,
        kur: "17.2568",
        kurTarihi: "2022-06-15",
        not: "2022-06-15 fiyatı alınamadı (aralik_disi): ücretsiz katman 365 günden eskisini vermiyor",
      },
    });
    expect(f.islemGunu).toBeNull();
    expect(f.raporGunu?.try).toBe("73347.05");
    expect(f.gerekce[0]).toContain("aralik_disi");
    expect(fiyatCumlesi(f, "USDT")).toContain("eksik:");
  });

  /**
   * Ondalığı bilinmeyen tutar ÇEVRİLMEZ. EVM'de ölçüldü: uydurma bir "1"
   * ondalıkla çevrilen tutar 34 milyar kat yanlış bir büyüklük gösteriyordu.
   */
  it("ondalık bilinmiyorsa hiçbir çevrim yapmaz", () => {
    const f = fiyatlandir({ ...girdi, ondalikBilinmiyor: true });
    expect(f.tutar).toBeNull();
    expect(f.islemGunu).toBeNull();
    expect(f.raporGunu).toBeNull();
    expect(f.gerekce[0]).toContain("ondalığı bilinmiyor");
  });

  /**
   * Cümle kuralı TEK yerde: hem rapor metni hem ekran `kurCumlesi`i çağırıyor.
   * İki kopya olsaydı biri değişir öteki kalırdı.
   */
  it("kurCumlesi HİÇBİR durumda boş dönmez", () => {
    const durumlar = [
      fiyatlandir(girdi),
      fiyatlandir({ ...girdi, islemGunu: { usd: null, kur: null, kurTarihi: null, not: "a" } }),
      fiyatlandir({
        ...girdi,
        islemGunu: { usd: null, kur: null, kurTarihi: null, not: "a" },
        raporGunu: { usd: null, kur: null, kurTarihi: null, not: "b" },
      }),
    ];
    for (const f of durumlar) expect(kurCumlesi(f).length).toBeGreaterThan(0);
    // Rapor cümlesi kur cümlesini İÇERİR — ikisi ayrı kural yazmaz.
    expect(fiyatCumlesi(fiyatlandir(girdi), "USDT")).toContain(kurCumlesi(fiyatlandir(girdi)));
  });

  it("iki taraf da eksikse TL karşılığı YOK der, 0 demez", () => {
    const f = fiyatlandir({
      ...girdi,
      islemGunu: { usd: null, kur: null, kurTarihi: null, not: "hiç bakılmadı" },
      raporGunu: { usd: null, kur: null, kurTarihi: null, not: "hiç bakılmadı" },
    });
    const c = fiyatCumlesi(f, "USDT");
    expect(c).toContain("TL karşılığı yok");
    expect(c).not.toContain("0 ₺");
  });
});
