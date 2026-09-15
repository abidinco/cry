import { describe, expect, it } from "vitest";
import { islemGezgini, kisaHash } from "@/lib/gezgin";
import {
  akisModeli,
  logDeger,
  logKonum,
  seritAraligi,
  tutarAraligiylaAyikla,
  tutarGirdisiniCoz,
  type AkisKenari,
} from "@/lib/akis";

describe("gezgin", () => {
  it("zincire göre işlem sayfası; tanınmayan zincir bağlantı UYDURMAZ", () => {
    expect(islemGezgini("tron", "58e1")).toBe("https://tronscan.org/#/transaction/58e1");
    expect(islemGezgini("bsc", "0xab")).toBe("https://bscscan.com/tx/0xab");
    expect(islemGezgini("dogecoin", "x")).toBeNull();
    expect(kisaHash("58e1123ce2b430de79da33c49e5c8afa75e4f7fa08e165460a308799530f46fd")).toBe("58e112…46fd");
  });
});

describe("tutar girdisi", () => {
  it("Türkçe defter düzeni ve kısaltmalar", () => {
    expect(tutarGirdisiniCoz("10.000")).toBe(10000);
    expect(tutarGirdisiniCoz("2.500,75")).toBe(2500.75);
    expect(tutarGirdisiniCoz("0,05")).toBe(0.05);
    expect(tutarGirdisiniCoz("0.05")).toBe(0.05);
    expect(tutarGirdisiniCoz("10 B")).toBe(10000);
    expect(tutarGirdisiniCoz("2,5Mn")).toBe(2500000);
    expect(tutarGirdisiniCoz("70.000.000")).toBe(70000000);
  });
  it("çözülemeyen girdi 0 değil null", () => {
    expect(tutarGirdisiniCoz("abc")).toBeNull();
    expect(tutarGirdisiniCoz("")).toBeNull();
    expect(tutarGirdisiniCoz("1.2.3")).toBeNull();
  });
});

describe("logaritmik kaydırıcı", () => {
  it("uçlar ve orta nokta; konum ile değer birbirinin tersi", () => {
    expect(logDeger(0, 0.01, 1e8)).toBeCloseTo(0.01);
    expect(logDeger(1, 0.01, 1e8)).toBeCloseTo(1e8);
    expect(logDeger(0.5, 1, 1e6)).toBeCloseTo(1000);
    expect(logKonum(logDeger(0.37, 0.01, 7e7), 0.01, 7e7)).toBeCloseTo(0.37);
  });
});

describe("tutar aralığı", () => {
  const K = "KOK";
  const k = (from: string, to: string, miktar: number, symbol = "USDT"): AkisKenari => ({
    txHash: `${from}${to}${miktar}`,
    from,
    to,
    symbol,
    decimals: 6,
    amountRaw: String(Math.round(miktar * 1e6)),
    ts: "2019-04-25T03:43:30.000Z",
    hop: 1,
    taintShare: 1,
  });
  const D = [K, "BUYUK", "KUCUK", "TORUN", "TRXCI"].map((a, i) => ({
    address: a,
    hop: i === 0 ? 0 : a === "TORUN" ? 2 : 1,
    terminalReason: null,
    etiketler: [],
  }));
  const E = [k(K, "BUYUK", 5_000_000), k(K, "KUCUK", 3), k(K, "KUCUK", 2), k("KUCUK", "TORUN", 1), k(K, "TRXCI", 7, "TRX")];

  it("şerit TOPLAMINA bakar: 3+2=5 aralıktaysa tek tek küçük hareketler kalır", () => {
    const r = tutarAraligiylaAyikla(D, E, K, "USDT", { alt: 4, ust: 10 });
    expect(r.kenarlar.filter((x) => x.to === "KUCUK")).toHaveLength(2);
    expect(r.kenarlar.some((x) => x.to === "BUYUK")).toBe(false);
    expect(r.disarida).toBe(2); // BUYUK ve TORUN şeritleri
  });

  it("bu varlıkta şeridi kalmayan adres çıkar; kök ve başka varlıktaki kenarlar kalır", () => {
    const r = tutarAraligiylaAyikla(D, E, K, "USDT", { alt: 4, ust: 10 });
    const adresler = r.dugumler.map((d) => d.address);
    expect(adresler).toContain(K);
    expect(adresler).not.toContain("BUYUK");
    expect(adresler).not.toContain("TORUN");
    expect(adresler).toContain("TRXCI");
    expect(r.kenarlar.some((x) => x.symbol === "TRX")).toBe(true);
  });

  it("aralık yoksa hiçbir şeye dokunmaz; sınırlar seçili varlığın şeritlerinden", () => {
    expect(tutarAraligiylaAyikla(D, E, K, "USDT", null).kenarlar).toHaveLength(E.length);
    // tutarı sıfır olan çift aralık dışında SAYILMAZ (şerit olarak zaten çizilmiyor)
    expect(tutarAraligiylaAyikla(D, [...E, k("KUCUK", "SIFIR", 0)], K, "USDT", { alt: 4, ust: 10 }).disarida).toBe(2);
    // ucu grafta olmayan kenar da sayılmaz (koşu 9: 57 yerine 49)
    expect(tutarAraligiylaAyikla(D, [...E, k("KUCUK", "GRAFTA_YOK", 999)], K, "USDT", { alt: 4, ust: 10 }).disarida).toBe(2);
    expect(seritAraligi(akisModeli(D, E, K, "USDT"))).toEqual({ en_az: 1, en_cok: 5_000_000 });
  });
});
