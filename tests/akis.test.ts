import { describe, expect, it } from "vitest";
import {
  akisModeli,
  akisOzeti,
  anaVarlik,
  dugumTuru,
  VARSAYILAN_YERLESIM,
  yerlesim,
  type AkisDugumu,
  type AkisKenari,
} from "@/lib/akis";

const KOK = "TKOK";

const d = (address: string, hop: number, terminalReason: string | null = null, etiketler: AkisDugumu["etiketler"] = []): AkisDugumu => ({
  address,
  hop,
  terminalReason,
  etiketler,
});

let n = 0;
const k = (from: string, to: string, usdt: number, hop: number, symbol = "USDT"): AkisKenari => ({
  txHash: `tx${n++}`,
  from,
  to,
  symbol,
  decimals: 6,
  amountRaw: (BigInt(usdt) * 1_000_000n).toString(),
  ts: "2019-04-25T03:43:30.000Z",
  hop,
  taintShare: 1,
});

const BINANCE = [{ title: "Binance-Hot 1", category: "exchange_hot", exchange: "Binance", dogrulandi: true }];
const ADAY = [{ title: "Servis cüzdanı adayı", category: "exchange_hot", exchange: null, dogrulandi: false }];

// Koşu 7'nin küçültülmüş şekli: ileri akış, borsa, aday, köke geri dönüş, yana dönüş.
const DUGUMLER = [
  d(KOK, 0),
  d("A", 1),
  d("ADAY", 1, "terminal_aday", ADAY),
  d("YAN", 1, "dallanma"),
  d("BINANCE", 2, "terminal", BINANCE),
  d("SINIR", 2, "butce"),
];
const KENARLAR = [
  k(KOK, "A", 22, 1),
  k(KOK, "A", 10, 1),
  k(KOK, "ADAY", 70, 1),
  k(KOK, "YAN", 10, 1),
  k("A", "BINANCE", 11, 2),
  k("A", "SINIR", 6, 2),
  k("A", "YAN", 2, 2),
  k("A", KOK, 3, 2),
  k(KOK, "A", 5, 1, "TRX"),
];

describe("düğüm türü", () => {
  it("doğrulanmış borsa, aday, bizim sınırımız ve taranamayan AYRI türlerdir", () => {
    expect(dugumTuru(d(KOK, 0, "terminal"), KOK)).toBe("kok");
    expect(dugumTuru(d("x", 1, "terminal"), KOK)).toBe("borsa");
    expect(dugumTuru(d("x", 1, "terminal_aday"), KOK)).toBe("aday");
    expect(dugumTuru(d("x", 1, "butce"), KOK)).toBe("sinir");
    expect(dugumTuru(d("x", 1, "indekssiz"), KOK)).toBe("taranamadi");
    expect(dugumTuru(d("x", 1, null), KOK)).toBe("ara");
  });
});

describe("akış modeli", () => {
  it("şerit kalınlığı TEK varlığın ölçeğidir; varsayılan en çok hareketi olan", () => {
    expect(anaVarlik(KENARLAR)).toBe("USDT");
    const m = akisModeli(DUGUMLER, KENARLAR, KOK, "USDT");
    expect(m.digerVarlikKenari).toBe(1);
  });

  it("aynı çift arasındaki hareketler tek şeritte toplanır, hareketler kaybolmaz", () => {
    const m = akisModeli(DUGUMLER, KENARLAR, KOK, "USDT");
    const s = m.seritler.find((x) => x.from === KOK && x.to === "A")!;
    expect(s.ham).toBe(32_000_000n);
    expect(s.kenarlar).toHaveLength(2);
    expect(s.deger).toBe(32);
  });

  it("şerit türü hedefe göre: borsa, aday, ileri akış", () => {
    const m = akisModeli(DUGUMLER, KENARLAR, KOK, "USDT");
    const tur = (f: string, t: string) => m.seritler.find((x) => x.from === f && x.to === t)!.tur;
    expect(tur("A", "BINANCE")).toBe("borsa");
    expect(tur(KOK, "ADAY")).toBe("aday");
    expect(tur("A", "SINIR")).toBe("akis");
  });

  it("köke ya da AYNI sıçramadaki adrese giden para 'geri'dir", () => {
    const m = akisModeli(DUGUMLER, KENARLAR, KOK, "USDT");
    expect(m.seritler.find((x) => x.to === KOK)!.tur).toBe("geri");
    expect(m.seritler.find((x) => x.from === "A" && x.to === "YAN")!.geri).toBe(true);
    expect(m.seritler.find((x) => x.from === "A" && x.to === "SINIR")!.geri).toBe(false);
  });

  it("doğrulanmamış etiket borsa ADI vermez", () => {
    const m = akisModeli(DUGUMLER, KENARLAR, KOK, "USDT");
    expect(m.dugumler.find((x) => x.address === "BINANCE")!.borsa).toBe("Binance");
    expect(m.dugumler.find((x) => x.address === "ADAY")!.borsa).toBeNull();
  });

  it("tutar bigint olarak toplanır — Number'a uğramaz", () => {
    const buyuk = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
    const m = akisModeli(
      [d(KOK, 0), d("X", 1)],
      [{ ...k(KOK, "X", 1, 1), amountRaw: buyuk }],
      KOK,
      "USDT",
    );
    expect(m.seritler[0]!.ham.toString()).toBe(buyuk);
  });

  it("ucu kırpılmış kenar şerit olmaz", () => {
    const m = akisModeli([d(KOK, 0)], [k(KOK, "YOK", 5, 1)], KOK, "USDT");
    expect(m.seritler).toHaveLength(0);
  });
});

describe("özet", () => {
  it("para nereye ulaştı: borsa, aday, köke geri, sınırda kalan", () => {
    const o = akisOzeti(akisModeli(DUGUMLER, KENARLAR, KOK, "USDT"), KOK);
    expect(o.kokCikan).toBe(112_000_000n);
    expect(o.borsalar).toEqual([{ address: "BINANCE", ad: "Binance", ham: 11_000_000n }]);
    expect(o.adaylar[0]!.ham).toBe(70_000_000n);
    expect(o.kokeGeri).toBe(3_000_000n);
    expect(o.sinirda).toBe(2); // dallanma + bütçe
  });
});

describe("yerleşim", () => {
  const ayar = { ...VARSAYILAN_YERLESIM, genislik: 900, yukseklik: 600 };

  it("DETERMİNİSTİK: girdi sırası resmi değiştirmez", () => {
    const bir = yerlesim(akisModeli(DUGUMLER, KENARLAR, KOK, "USDT"), ayar);
    const iki = yerlesim(akisModeli([...DUGUMLER].reverse(), [...KENARLAR].reverse(), KOK, "USDT"), ayar);
    expect([...iki.kutular].sort()).toEqual([...bir.kutular].sort());
    expect([...iki.yollar].sort()).toEqual([...bir.yollar].sort());
  });

  it("kutular çizim alanının içinde kalır", () => {
    const y = yerlesim(akisModeli(DUGUMLER, KENARLAR, KOK, "USDT"), ayar);
    for (const k of y.kutular.values()) {
      expect(k.y).toBeGreaterThanOrEqual(0);
      expect(k.y + k.h).toBeLessThanOrEqual(ayar.yukseklik);
      expect(k.x + k.g).toBeLessThanOrEqual(ayar.genislik);
    }
  });

  it("kalınlık tutarla orantılı: 70'lik şerit 10'luktan 7 kat kalın", () => {
    const m = akisModeli(DUGUMLER, KENARLAR, KOK, "USDT");
    const y = yerlesim(m, ayar);
    const kalin = (f: string, t: string) => y.yollar.get(`${f}>${t}`)!.kalinlik;
    expect(kalin(KOK, "ADAY") / kalin(KOK, "YAN")).toBeCloseTo(7, 5);
  });

  it("geri dönen para diyagramın altındaki şeritten dolaşır", () => {
    const y = yerlesim(akisModeli(DUGUMLER, KENARLAR, KOK, "USDT"), ayar);
    expect(y.geriSeritY).not.toBeNull();
    const enAlt = Math.max(...[...y.kutular.values()].map((k) => k.y + k.h));
    expect(y.geriSeritY!).toBeGreaterThan(enAlt);
  });
});

describe("kısa tutar", () => {
  it("bigint üzerinden kısaltır", async () => {
    const { kisaTutar } = await import("@/lib/bicim");
    expect(kisaTutar(11_088_631_440_000n, 6)).toBe("11 Mn");
    expect(kisaTutar(11_188_631_440_000n, 6)).toBe("11,1 Mn");
    expect(kisaTutar(40_000_000_000n, 6)).toBe("40 B");
    expect(kisaTutar(50_000n, 6)).toBe("0,05");
    expect(kisaTutar(2n ** 256n - 1n, 6)).toMatch(/ Mr$/);
  });
});
