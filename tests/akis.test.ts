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

describe("gizleme", () => {
  const ayar = { ...VARSAYILAN_YERLESIM, genislik: 900, yukseklik: 600 };
  it("yoğun bir şerit gizlenince küçük şeritler KALINLAŞIR — ölçek görünen akışa göre kurulur", async () => {
    const { gizleneniAyikla } = await import("@/lib/akis");
    const once = yerlesim(akisModeli(DUGUMLER, KENARLAR, KOK, "USDT"), ayar);
    const g = gizleneniAyikla(DUGUMLER, KENARLAR, KOK, { seritler: new Set([`${KOK}>ADAY`]), dugumler: new Set() });
    const sonra = yerlesim(akisModeli(g.dugumler, g.kenarlar, KOK, "USDT"), ayar);
    expect(sonra.yollar.has(`${KOK}>ADAY`)).toBe(false);
    expect(sonra.yollar.get(`A>BINANCE`)!.kalinlik).toBeGreaterThan(once.yollar.get(`A>BINANCE`)!.kalinlik);
  });

  it("gizlenen adres şeritleriyle gider; kök gizlenemez", async () => {
    const { gizleneniAyikla } = await import("@/lib/akis");
    const g = gizleneniAyikla(DUGUMLER, KENARLAR, KOK, { seritler: new Set(), dugumler: new Set(["A", KOK]) });
    expect(g.dugumler.map((d) => d.address)).toContain(KOK);
    expect(g.dugumler.map((d) => d.address)).not.toContain("A");
    expect(g.kenarlar.some((k) => k.from === "A" || k.to === "A")).toBe(false);
  });
});

describe("devam edilmiş düğüm", () => {
  it("devam edilen aday, durma sebebi silinse de aday görünür", () => {
    expect(dugumTuru(d("x", 1, null, ADAY), KOK)).toBe("aday");
  });
});

describe("şerit yolu ve yakma", () => {
  it("tıklanan şerit köke kadar geldiği yolu taşır; geri dönüşleri almaz", async () => {
    const { seritYolu } = await import("@/lib/akis");
    const m = akisModeli(DUGUMLER, KENARLAR, KOK, "USDT");
    expect([...seritYolu(m, "A>BINANCE")].sort()).toEqual([`${KOK}>A`, "A>BINANCE"].sort());
    expect(seritYolu(m, "YOK>YOK").size).toBe(0);
  });

  it("sıfır adresi eski koşuda 'dallanma' diye kayıtlı olsa da yakıldı görünür ve özetle sayılır", () => {
    const Z = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
    const m = akisModeli([...DUGUMLER, d(Z, 2, "dallanma")], [...KENARLAR, k("A", Z, 4, 2)], KOK, "USDT");
    expect(m.dugumler.find((x) => x.address === Z)!.tur).toBe("yakildi");
    expect(akisOzeti(m, KOK).yakilan).toBe(4_000_000n);
  });
});

describe("defter satırları", () => {
  it("seçim yokken her şerit TEK satır: toplam ve adet", async () => {
    const { defterSatirlari } = await import("@/lib/akis");
    const m = akisModeli(DUGUMLER, KENARLAR, KOK, "USDT");
    const s = defterSatirlari(m, null);
    expect(s).toHaveLength(m.seritler.length);
    const kokA = s.find((x) => x.anahtar === `${KOK}>A`)!;
    expect(kokA.adet).toBe(2);
    expect(kokA.ham).toBe(32_000_000n);
    expect(kokA.pay).toBeNull();
    // sıçramaya göre, sonra büyükten küçüğe
    expect(s[0]!.anahtar).toBe(`${KOK}>ADAY`);
  });

  it("şerit seçiliyse o şeridin hareketleri tek tek", async () => {
    const { defterSatirlari } = await import("@/lib/akis");
    const m = akisModeli(DUGUMLER, KENARLAR, KOK, "USDT");
    const s = defterSatirlari(m, { serit: `${KOK}>A` });
    expect(s).toHaveLength(2);
    expect(s.every((x) => x.adet === 1 && x.txHash && x.pay === 1)).toBe(true);
  });

  it("adres seçiliyse yalnızca ona değen şeritler", async () => {
    const { defterSatirlari } = await import("@/lib/akis");
    const m = akisModeli(DUGUMLER, KENARLAR, KOK, "USDT");
    expect(defterSatirlari(m, { dugum: "BINANCE" }).map((x) => x.anahtar)).toEqual(["A>BINANCE"]);
  });
});

describe("yakınlaştırma", () => {
  it("imlecin altındaki nokta yerinde kalır", async () => {
    const { yakinlastir, GORUNUM_SIFIR } = await import("@/lib/akis");
    const g = yakinlastir(GORUNUM_SIFIR, 300, 200, 2);
    // ekrandaki (300,200) noktası diyagramda (300,200)'dü; yakınlaşınca yine orada
    expect(((300 - g.x) / g.k)).toBeCloseTo(300);
    expect(((200 - g.y) / g.k)).toBeCloseTo(200);
    expect(g.k).toBe(2);
  });
  it("ölçek sınırda durur", async () => {
    const { yakinlastir, GORUNUM_SIFIR, OLCEK_SINIRI } = await import("@/lib/akis");
    expect(yakinlastir(GORUNUM_SIFIR, 0, 0, 1000).k).toBe(OLCEK_SINIRI.en_cok);
    expect(yakinlastir(GORUNUM_SIFIR, 0, 0, 0.001).k).toBe(OLCEK_SINIRI.en_az);
  });
});

describe("geri şeritler ayrışır", () => {
  it("aynı sütun aralığından dönen iki şeridin dikey bacakları farklı x'tedir", async () => {
    const { yerlesim: yer, akisModeli: model, VARSAYILAN_YERLESIM: V } = await import("@/lib/akis");
    const D2 = [...DUGUMLER];
    const E2 = [...KENARLAR, k("A", "YAN", 5, 2)]; // A→YAN zaten var; A→KOK ile birlikte A'dan iki geri şerit
    const y = yer(model(D2, E2, KOK, "USDT"), { ...V, genislik: 900, yukseklik: 600 });
    const bacakX = (d: string) => Number(d.split(" ")[2]!.split(",")[0]!.slice(1)); // Q noktasının x'i
    const geriler = [...y.yollar.entries()].filter(([, v]) => v.etiket);
    expect(geriler.length).toBeGreaterThanOrEqual(2);
    const xler = geriler.map(([, v]) => bacakX(v.d));
    expect(new Set(xler).size).toBe(xler.length);
  });
});
