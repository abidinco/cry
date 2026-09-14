import { describe, expect, it } from "vitest";
import { borsaAdi, tronscanCoz } from "../packages/etiket/src/tronscan";
import { servisAdaylari } from "../packages/etiket/src/kesif";

// Adresler 2026-09-14 ölçümünde TronScan'a sorulan GERÇEK adreslerdir.
const BINANCE = "TAUN6FwrnwwmaEqYcckffC7wYmbaS6cBiX";
const PARIBU = "TJEw7U8a4Asoh83EoB5Pk5YyfTadVZbb8h";
const SIFIR = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
const BTCTURK_ADAYI = "TD32z28Qmyz1zj3LfoYMGnfxPTbsVopCSj";
const GUN = "2026-09-14";

describe("borsa sözlüğü", () => {
  it("ölçülen gerçek etiketleri tanır", () => {
    expect(borsaAdi("Binance-Hot 1")).toBe("Binance");
    expect(borsaAdi("Bitfinex")).toBe("Bitfinex");
    expect(borsaAdi("Poloniex")).toBe("Poloniex");
    expect(borsaAdi("Paribu Exchange Hot Wallet")).toBe("Paribu");
  });

  it("borsa adı TAŞIYAN ama borsa cüzdanı OLMAYANI tanımaz", () => {
    expect(borsaAdi("Binance Bridge")).toBeNull();
    expect(borsaAdi("Fake Binance")).toBeNull();
    expect(borsaAdi("Binance Scam Token")).toBeNull();
  });

  it("borsa adının ÖNEKİ olan başka bir kelimeyi tanımaz", () => {
    expect(borsaAdi("Gateway Service")).toBeNull();
    expect(borsaAdi("Krakenese")).toBeNull();
  });

  it("sözlükte olmayan etiket borsa değildir", () => {
    expect(borsaAdi("Black Hole Address(0)")).toBeNull();
    expect(borsaAdi("Tether Treasury")).toBeNull();
  });
});

describe("TronScan yanıtı → etiket", () => {
  it("borsa etiketi DOĞRULANMIŞ exchange_hot olur — terminal_aday'ı terminale çeviren şey bu", () => {
    const c = tronscanCoz(BINANCE, { address: BINANCE, publicTag: "Binance-Hot 1" }, GUN);
    expect(c.tur).toBe("etiket");
    if (c.tur !== "etiket") return;
    const e = c.etiketler[0]!;
    expect(e.category).toBe("exchange_hot");
    expect(e.exchange).toBe("Binance");
    expect(e.dogrulanmisMi).toBe(true);
    expect(e.source).toBe("tronscan");
    expect(e.sourceUrl).toContain(BINANCE);
    expect(e.evidence).toMatchObject({ publicTag: "Binance-Hot 1", olcumTarihi: GUN });
  });

  it("tanınmayan etiket yazılır ama borsa DEĞİL ve doğrulanmış DEĞİL", () => {
    const c = tronscanCoz(BINANCE, { publicTag: "Tether Treasury" }, GUN);
    if (c.tur !== "etiket") throw new Error("etiket bekleniyordu");
    expect(c.etiketler[0]!.category).toBe("diger");
    expect(c.etiketler[0]!.dogrulanmisMi).toBe(false);
  });

  it("yakma adresi, etiketi ne derse desin borsa sayılmaz", () => {
    const c = tronscanCoz(SIFIR, { publicTag: "Binance-Hot 9" }, GUN);
    if (c.tur !== "etiket") throw new Error("etiket bekleniyordu");
    expect(c.etiketler[0]!.category).toBe("diger");
  });

  it("etiketsiz adres SEBEBİYLE atlanır — sessiz sıfır değil", () => {
    const c = tronscanCoz(BTCTURK_ADAYI, { address: BTCTURK_ADAYI, publicTag: "" }, GUN);
    expect(c).toEqual({
      tur: "atla",
      atlanan: { ham: BTCTURK_ADAYI, sebep: "TronScan'da etiket yok" },
    });
  });

  it("başka bir adresin yanıtı bu adrese asılmaz", () => {
    const c = tronscanCoz(PARIBU, { address: BINANCE, publicTag: "Binance-Hot 1" }, GUN);
    expect(c.tur).toBe("atla");
  });

  it("kırmızı etiket ayrı bir risk etiketi olur, borsa değil", () => {
    const c = tronscanCoz(PARIBU, { redTag: "Phishing" }, GUN);
    if (c.tur !== "etiket") throw new Error("etiket bekleniyordu");
    expect(c.etiketler).toHaveLength(1);
    expect(c.etiketler[0]!.title).toBe("TronScan risk: Phishing");
    expect(c.etiketler[0]!.category).toBe("diger");
  });
});

describe("keşif — yakma adresi", () => {
  it("kalabalık görünse de aday olmaz ve adıyla sayılır", () => {
    const s = servisAdaylari([
      { address: SIFIR, indeksDurumu: "tam", gonderenSayisi: 1, aliciSayisi: 900, hareketSayisi: 950 },
    ]);
    expect(s.adaylar).toHaveLength(0);
    expect(s.yakma).toEqual([SIFIR]);
  });
});
