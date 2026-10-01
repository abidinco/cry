import { describe, expect, it } from "vitest";

import { toplaMetin } from "@cry/fiyat";
import {
  eksikSayimi,
  kanitPaketi,
  kanonikJson,
  korlukCumlesi,
  paketiMuhurle,
  sebepOzu,
  varlikOzetleri,
  type KanitKenari,
  type PaketGirdisi,
} from "@cry/rapor";

const fiyatli = (tl: string, raporTl: string) => ({
  tutar: "1.000000",
  islemGunu: { usd: "1.000000", try: tl, kurTarihi: "2026-09-30" },
  raporGunu: { usd: "1.000000", try: raporTl, kurTarihi: "2026-10-01" },
  gerekce: [],
});

const fiyatsiz = (gerekce: string[]) => ({
  tutar: "1.000000",
  islemGunu: null,
  raporGunu: null,
  gerekce,
});

function kenar(ek: Partial<KanitKenari> = {}): KanitKenari {
  return {
    txHash: "a".repeat(64),
    txIndex: 0,
    kimden: "T1",
    kime: "T2",
    sembol: "USDT",
    sozlesme: "TR7NHq",
    ondalik: 6,
    hamTutar: "1000000",
    zamanUtc: "2026-09-30T10:00:00.000Z",
    hop: 1,
    izliPay: "1.000000",
    fiyat: fiyatli("41.00", "42.00"),
    ...ek,
  };
}

function girdi(ek: Partial<PaketGirdisi> = {}): PaketGirdisi {
  return {
    baslik: "Deneme raporu",
    uretildi: "2026-10-01T09:00:00.000Z",
    raporGunu: "2026-10-01",
    vaka: { slug: "deneme", baslik: "Deneme vakasi" },
    kosu: {
      id: "9",
      zincir: "tron",
      kok: "T0",
      yon: "ileri",
      atifKurali: "fifo",
      esikler: { maxHop: 3, maxDugum: 60 },
      durum: "bitti",
      durmaSebebi: "terminal",
      baslangic: "2026-09-14T21:00:00.000Z",
      bitis: "2026-09-14T21:05:00.000Z",
      istatistik: { durma: { terminal: 4, butce: 48 }, devamlar: [{}, {}] },
    },
    gorulemeyenler: ["sözleşme içi TRX transferleri"],
    dugumler: [
      { adres: "T2", hop: 1, hamTutar: "1000000", terminalMi: false, terminalSebebi: null, etiketler: [] },
      { adres: "T0", hop: 0, hamTutar: null, terminalMi: false, terminalSebebi: null, etiketler: [] },
    ],
    kenarlar: [kenar()],
    ...ek,
  };
}

describe("kanonik serileştirme", () => {
  it("anahtarları HER DÜZEYDE sıralar: ekleme sırası hash'i değiştirmez", () => {
    const a = { b: 1, a: { z: true, y: [3, 2, 1] } };
    const b = { a: { y: [3, 2, 1], z: true }, b: 1 };
    expect(kanonikJson(a)).toBe(kanonikJson(b));
    expect(kanonikJson(a)).toBe('{"a":{"y":[3,2,1],"z":true},"b":1}');
    // Dizi sıralanmaz: dizideki sıra VERİdir (hop sırası, defter sırası).
    expect(kanonikJson([1, 2])).not.toBe(kanonikJson([2, 1]));
  });

  it("sonlu olmayan sayıyı sessizce null yapmaz, HATA eder", () => {
    expect(() => kanonikJson({ x: Number.NaN })).toThrow(/sonlu olmayan/);
  });

  it("undefined alanı düşürür, null'ı KORUR", () => {
    expect(kanonikJson({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it("aynı paketten aynı hash, tek harf değişince başka hash", () => {
    const bir = paketiMuhurle(kanitPaketi(girdi()));
    const iki = paketiMuhurle(kanitPaketi(girdi()));
    expect(bir.sha256).toBe(iki.sha256);
    expect(bir.sha256).toMatch(/^[0-9a-f]{64}$/);
    const uc = paketiMuhurle(kanitPaketi(girdi({ baslik: "Deneme raporu." })));
    expect(uc.sha256).not.toBe(bir.sha256);
  });
});

describe("paketin determinizmi", () => {
  it("girdi sırası ters çevrilince AYNI hash çıkar", () => {
    const k = [
      kenar({ hop: 1, zamanUtc: "2026-09-30T10:00:00.000Z", kime: "TA" }),
      kenar({ hop: 2, zamanUtc: "2026-09-30T11:00:00.000Z", kime: "TB" }),
      kenar({ hop: 1, zamanUtc: "2026-09-30T09:00:00.000Z", kime: "TC" }),
    ];
    const duz = paketiMuhurle(kanitPaketi(girdi({ kenarlar: k })));
    const ters = paketiMuhurle(kanitPaketi(girdi({ kenarlar: [...k].reverse() })));
    expect(ters.sha256).toBe(duz.sha256);
    expect(kanitPaketi(girdi({ kenarlar: k })).defter.map((x) => x.kime)).toEqual(["TC", "TA", "TB"]);
  });

  it("düğümleri hop, sonra adres sırasına koyar", () => {
    expect(kanitPaketi(girdi()).dugumler.map((d) => d.adres)).toEqual(["T0", "T2"]);
  });
});

describe("varlık özeti", () => {
  it("varlıkları SÖZLEŞMEYE göre ayırır: sembol kimlik değildir", () => {
    const ozet = varlikOzetleri([
      kenar({ sembol: "USDT", sozlesme: "TR7NHq", hamTutar: "1000000" }),
      kenar({ sembol: "USDT", sozlesme: "TAKLIT", hamTutar: "2000000" }),
    ]);
    expect(ozet).toHaveLength(2);
    expect(ozet.map((o) => o.sozlesme)).toEqual(["TAKLIT", "TR7NHq"]);
  });

  it("TL toplamını BigInt ile toplar ve fiyatsız kenarı SAYAR", () => {
    const ozet = varlikOzetleri([
      kenar({ hamTutar: "1000000", fiyat: fiyatli("41.00", "42.00") }),
      kenar({ hamTutar: "2500000", fiyat: fiyatli("102.51", "105.00") }),
      kenar({ hamTutar: "500000", fiyat: fiyatsiz(["<gün> fiyatına HİÇ bakılmadı"]) }),
    ]);
    expect(ozet[0]!.hamToplam).toBe("4000000");
    expect(ozet[0]!.tutar).toBe("4.000000");
    expect(ozet[0]!.islemGunuTry).toBe("143.51");
    expect(ozet[0]!.fiyatsizKenar).toBe(1);
  });

  it("hiç fiyat yoksa toplam 0 ₺ DEĞİL, yokluktur", () => {
    const ozet = varlikOzetleri([kenar({ fiyat: fiyatsiz(["2019-04-25 fiyatı alınamadı (aralik_disi): -"]) })]);
    expect(ozet[0]!.islemGunuTry).toBeNull();
    expect(ozet[0]!.raporGunuTry).toBeNull();
  });

  it("ondalığı bilinmeyen varlıkta okunur tutar YAZILMAZ", () => {
    const ozet = varlikOzetleri([
      kenar({ sembol: "?", ondalik: 0, ondalikBilinmiyor: true, hamTutar: "85500000000000000000000000" }),
    ]);
    expect(ozet[0]!.tutar).toBeNull();
    expect(ozet[0]!.hamToplam).toBe("85500000000000000000000000");
  });
});

describe("eksiklerin sebebi", () => {
  it("tarihi <gün> yapar ve kenar SAYAR", () => {
    expect(sebepOzu("2019-04-25 fiyatına HİÇ bakılmadı")).toBe("<gün> fiyatına HİÇ bakılmadı");
    const sayim = eksikSayimi([
      kenar({ fiyat: fiyatsiz(["2019-04-25 fiyatına HİÇ bakılmadı"]) }),
      kenar({ fiyat: fiyatsiz(["2020-01-02 fiyatına HİÇ bakılmadı"]) }),
      kenar({ fiyat: fiyatsiz(["2020-01-02 için TCMB'ye HİÇ bakılmadı"]) }),
    ]);
    expect(sayim[0]).toEqual({ sebep: "<gün> fiyatına HİÇ bakılmadı", kenar: 2 });
    expect(sayim).toHaveLength(2);
  });

  it("aynı kenarda aynı sebebi iki kez saymaz", () => {
    const tekrarli = kenar({ fiyat: fiyatsiz(["aynı sebep", "aynı sebep"]) });
    expect(eksikSayimi([tekrarli])).toEqual([{ sebep: "aynı sebep", kenar: 1 }]);
  });
});

describe("toplam bir ALT SINIR olduğunda söylenir", () => {
  it("fiyatsız kenar varsa uyarı yazılır", () => {
    const p = kanitPaketi(
      girdi({ kenarlar: [kenar(), kenar({ fiyat: fiyatsiz(["<gün> fiyatına HİÇ bakılmadı"]) })] }),
    );
    expect(p.metodoloji.uyarilar.join(" ")).toMatch(/ALT SINIR.*USDT 1\/2 kenar fiyatsız/);
  });

  it("hepsi fiyatlıysa alt sınır uyarısı YOKTUR", () => {
    expect(kanitPaketi(girdi()).metodoloji.uyarilar).toEqual([]);
  });

  it("durdurulmuş koşu eksik olduğunu söyler", () => {
    const p = kanitPaketi(girdi({ kosu: { ...girdi().kosu, durum: "durduruldu" } }));
    expect(p.metodoloji.uyarilar.join(" ")).toMatch(/DURDURULDU/);
  });
});

describe("körlük cümlesi", () => {
  it("adaptör yoksa cevap 'yok' değil BİLİNMİYOR'dur", () => {
    expect(korlukCumlesi(null)).toMatch(/BİLİNMİYOR/);
    expect(korlukCumlesi([])).toMatch(/kaydedilmedi/);
    expect(korlukCumlesi(["iç transfer"])).toMatch(/iç transfer/);
  });
});

describe("metodoloji", () => {
  it("atıf kuralını CÜMLEYE çevirir — kuralı söylemeyen yüzde savunulamaz", () => {
    expect(kanitPaketi(girdi()).metodoloji.atifCumlesi).toMatch(/ilk giren ilk çıkar/);
    const p = kanitPaketi(girdi({ kosu: { ...girdi().kosu, atifKurali: "uydurma" } }));
    expect(p.metodoloji.atifCumlesi).toMatch(/Tanınmayan atıf kuralı/);
  });

  it("gün sınırının UTC olduğunu SÖYLER", () => {
    expect(kanitPaketi(girdi()).metodoloji.gunSiniri).toMatch(/UTC/);
  });
});

describe("ondalık toplama", () => {
  it("Number'a uğramadan toplar", () => {
    expect(toplaMetin(["0.01", "0.02"], 2)).toBe("0.03");
    expect(toplaMetin(["1.005", "1.005"], 2)).toBe("2.02");
    expect(toplaMetin(["99999999999999999999.99", "0.01"], 2)).toBe("100000000000000000000.00");
    expect(toplaMetin(["abc"], 2)).toBeNull();
  });
});
