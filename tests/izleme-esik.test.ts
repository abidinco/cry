/**
 * İzleme eşiği — saf katmanın sınavı.
 *
 * Kullanıcı kararı: eşik üstü harekette MESAJ, küçükler GÜNLÜK ÖZETE. Burada
 * sınanan şey o kararın kendisi değil, kararın **uygulanamadığı** haller:
 * eşiği uygulayamadığımız bir hareketin özete gömülmesi, kaçırılan bir
 * hareketi görünmez yapardı.
 */
import { describe, expect, it } from "vitest";
// İzleme servisi derleme adımı OLMADAN koşuyor, kaynağı düz JS: tip bildirimi yok.
// eslint-disable-next-line
// @ts-expect-error -- düz JS modülü
import { TUM_VARLIKLAR, ayristirOndalik, esikSec, gunAnahtari, mesajMetni, ozetMetni, tutarMetni, yolSec } from "../apps/watcher/src/esik.js";

const USDT = { assetSymbol: "USDT", minAmount: "1000" };
const HEPSI = { assetSymbol: TUM_VARLIKLAR, minAmount: "1" };

describe("eşik seçimi", () => {
  it("varlığın kendi eşiği varsayılanı ezer", () => {
    expect(esikSec([HEPSI, USDT], "USDT")).toBe(USDT);
  });

  it("varlığa özel eşik yoksa varsayılana düşer", () => {
    expect(esikSec([HEPSI, USDT], "TRX")).toBe(HEPSI);
  });

  it("hiçbiri yoksa null — ve bu 'eşik 0' DEĞİLDİR", () => {
    expect(esikSec([USDT], "TRX")).toBeNull();
    expect(esikSec([], "USDT")).toBeNull();
    expect(esikSec(undefined, "USDT")).toBeNull();
  });
});

describe("yol seçimi", () => {
  const altiCizili = (tutarHam: string, ondalik: number, esik: unknown) =>
    yolSec({ tutarHam, ondalik, esik });

  it("eşik üstü ve eşiğe EŞİT hareket mesaj olur", () => {
    expect(altiCizili("1000000000", 6, USDT)).toMatchObject({ yol: "mesaj", sebep: "esik_ustu" });
    expect(altiCizili("1500000000", 6, USDT)).toMatchObject({ yol: "mesaj", sebep: "esik_ustu" });
  });

  it("eşik altı hareket özete girer", () => {
    expect(altiCizili("999999999", 6, USDT)).toMatchObject({ yol: "ozet", sebep: "esik_alti" });
  });

  it("eşik tanımlı değilse hareket SUSTURULMAZ", () => {
    expect(altiCizili("1", 6, null)).toMatchObject({ yol: "mesaj", sebep: "esik_yok" });
  });

  it("ondalık bilinmiyorsa eşik UYGULANAMAZ ve mesaj olur", () => {
    // Kaynağın okuyamadığı token metadata'sı uydurulmaz (ölçüldü: boş ad/sembol
    // + "1" ondalık). Böyle bir tutarı eşikle karşılaştırmak, 34 milyar kat
    // yanlış bir büyüklüğü "küçük" saymaktı.
    expect(yolSec({ tutarHam: "340000000000000000000", ondalik: null, esik: USDT })).toMatchObject({
      yol: "mesaj",
      sebep: "ondalik_bilinmiyor",
    });
  });

  it("okunamayan eşik sessizce 0 sayılmaz", () => {
    expect(altiCizili("1", 6, { assetSymbol: "USDT", minAmount: "bin" })).toMatchObject({
      yol: "mesaj",
      sebep: "esik_okunamadi",
    });
    // Üstel yazım bilerek reddedilir: "1e3" yanlış okunduğunda bin kat yanlış
    // bir sınır olurdu.
    expect(altiCizili("1", 6, { assetSymbol: "USDT", minAmount: "1e3" })).toMatchObject({
      sebep: "esik_okunamadi",
    });
  });

  it("okunamayan tutar da mesaj olur", () => {
    expect(altiCizili("", 6, USDT)).toMatchObject({ yol: "mesaj", sebep: "tutar_okunamadi" });
  });

  it("tutar Number'a UĞRAMAZ — 2^256-1 eşiğin üstünde kalır", () => {
    const enBuyuk = (2n ** 256n - 1n).toString();
    expect(altiCizili(enBuyuk, 18, { assetSymbol: "X", minAmount: "1" })).toMatchObject({
      sebep: "esik_ustu",
    });
  });

  it("ondalıklı eşik yuvarlanmaz: 0,5 eşiği 0 ondalıklı varlıkta 1'e ÇIKMAZ", () => {
    const esik = { assetSymbol: "NFT", minAmount: "0.5" };
    expect(altiCizili("1", 0, esik)).toMatchObject({ sebep: "esik_ustu" });
    expect(altiCizili("0", 0, esik)).toMatchObject({ sebep: "esik_alti" });
  });

  it("eşiğin ondalığı varlığınkinden fazlaysa da karşılaştırma TAM", () => {
    // 0,000001 USDT = 1 ham birim (6 ondalık).
    const esik = { assetSymbol: "USDT", minAmount: "0.0000005" };
    expect(altiCizili("1", 6, esik)).toMatchObject({ sebep: "esik_ustu" });
    expect(altiCizili("0", 6, esik)).toMatchObject({ sebep: "esik_alti" });
  });

  it("negatif ham tutar MUTLAK değeriyle ölçülür (yön ayrı bir alandır)", () => {
    expect(altiCizili("-1000000000", 6, USDT)).toMatchObject({ sebep: "esik_ustu" });
  });
});

describe("ondalık ayrıştırma", () => {
  it("virgül de kabul edilir — eşiği Türkçe defter düzeninde yazan insan var", () => {
    expect(ayristirOndalik("2,5")).toEqual({ deger: 25n, olcek: 1 });
  });
  it("boş ve harfli girdi null", () => {
    expect(ayristirOndalik("")).toBeNull();
    expect(ayristirOndalik("1 000")).toBeNull();
    expect(ayristirOndalik(undefined as unknown as string)).toBeNull();
  });
});

describe("tutar metni", () => {
  it("ondalık biliniyorsa çevirir, sondaki sıfırları atar", () => {
    expect(tutarMetni("1500000", 6, "USDT")).toBe("1.5 USDT");
    expect(tutarMetni("1000000", 6, "USDT")).toBe("1 USDT");
  });
  it("ondalık bilinmiyorsa HAM olduğunu SÖYLER", () => {
    expect(tutarMetni("340000000000000000000", null, "")).toBe("340000000000000000000 (ham) ?");
  });
});

describe("gün anahtarı UTC'dir ve bu söylenir", () => {
  it("03:00 TSİ bir ÖNCEKİ UTC gününe düşer", () => {
    expect(gunAnahtari("2026-10-04T00:00:00.000Z")).toBe("2026-10-04");
    // 2026-10-04 03:00 TSİ = 2026-10-04 00:00 UTC değil; TSİ UTC+3.
    expect(gunAnahtari("2026-10-04T01:30:00+03:00")).toBe("2026-10-03");
  });
  it("geçersiz zaman null", () => {
    expect(gunAnahtari("dün")).toBeNull();
  });
});

describe("günlük özet", () => {
  const kayit = (over: Record<string, unknown> = {}) => ({
    address: "TAdres1",
    label: "Kök",
    assetSymbol: "USDT",
    ondalik: 6,
    amountRaw: "500000",
    ...over,
  });

  it("boş günde özet GÖNDERİLMEZ (null)", () => {
    expect(ozetMetni("2026-10-03", [])).toBeNull();
  });

  it("adres+varlık başına tek satır, sayı ve toplam", () => {
    const metin = ozetMetni("2026-10-03", [kayit(), kayit(), kayit({ assetSymbol: "TRX", ondalik: 6 })]);
    expect(metin).toContain("2026-10-03 (UTC)");
    expect(metin).toContain("Eşik ALTI 3 hareket");
    expect(metin).toContain("2 hareket · toplam 1 USDT");
    expect(metin).toContain("1 hareket · toplam 0.5 TRX");
  });

  it("varlıklar KARIŞMAZ — iki varlık iki satır", () => {
    const metin = ozetMetni("2026-10-03", [kayit(), kayit({ assetSymbol: "TRX" })]) ?? "";
    expect(metin.match(/• /g)?.length).toBe(2);
  });

  it("aynı sembolde iki farklı ondalık görülürse tutar HAM basılır", () => {
    // "Sembol kimlik değildir, SÖZLEŞME kimliktir": arşivde boşluklu "U S D T"
    // adlı taklit token var. İki ondalığı toplayıp birini doğru sanmak, yanlış
    // bir BÜYÜKLÜK göstermekti.
    const metin = ozetMetni("2026-10-03", [kayit(), kayit({ ondalik: 18 })]) ?? "";
    expect(metin).toContain("(ham)");
  });

  it("okunamayan tutar SAYILIR", () => {
    const metin = ozetMetni("2026-10-03", [kayit({ amountRaw: "yok" })]) ?? "";
    expect(metin).toContain("1 kayıt okunamadı");
  });
});

describe("mesaj metni", () => {
  it("sebep mesajın İÇİNDE durur", () => {
    const m = mesajMetni(
      {
        address: "TAdres1",
        label: null,
        assetSymbol: "USDT",
        ondalik: 6,
        amountRaw: "2000000000",
        direction: "giden",
        ts: "2026-10-03T10:00:00.000Z",
        txHash: "abc",
      },
      "esik_ustu",
    );
    expect(m).toContain("eşik üstü");
    expect(m).toContain("↑ giden 2000 USDT");
    expect(m).toContain("abc");
  });

  it("eşik uygulanamadıysa mesaj bunu YAZAR", () => {
    const m = mesajMetni({ address: "T", amountRaw: "1", ts: "", txHash: "x" }, "ondalik_bilinmiyor");
    expect(m).toContain("UYGULANAMADI");
  });
});

/**
 * Ekranın kabul ettiği eşik, servisin OKUYABİLDİĞİ eşik olmalı.
 *
 * İki taraf iki ayrı dilde yazıldı (web TypeScript, servis düz JS — sunucuda
 * derleme adımı yok). Sapma sessiz olurdu: ekranda kabul edilen bir eşik
 * serviste `esik_okunamadi` olur ve o adresin BÜTÜN hareketleri mesaja döner.
 * Bir kural bir yerde uygulanıp kardeşinde unutulabiliyor; bu test o kardeşi
 * yan yana koyuyor.
 */
describe("eşik dilbilgisi: kapı ile servis AYNI şeyi kabul eder", () => {
  const ornekler = [
    "1000",
    "0.5",
    "0,5",
    " 12 ",
    "0",
    "1e3",
    "bin",
    "",
    "-5",
    "1 000",
    "1.2.3",
    "1.",
  ];

  it("her örnekte iki taraf aynı kararı verir", async () => {
    const { esikMetnini } = await import("../apps/web/src/lib/izleme");
    for (const ornek of ornekler) {
      const kapi = esikMetnini(ornek);
      const servis = ayristirOndalik(ornek);
      expect(
        { ornek, kabul: kapi !== null },
        `"${ornek}" kapıda ${kapi !== null ? "kabul" : "ret"}, serviste ${servis ? "kabul" : "ret"}`,
      ).toEqual({ ornek, kabul: servis !== null });
    }
  });

  it("kapının yazdığı kanonik metin serviste AYNI sayıyı verir", async () => {
    const { esikMetnini } = await import("../apps/web/src/lib/izleme");
    // Virgülle yazılan eşik depoda nokta ile durur; servis onu okuyabilmeli.
    const kanonik = esikMetnini("2,5");
    expect(kanonik).toBe("2.5");
    expect(ayristirOndalik(kanonik!)).toEqual({ deger: 25n, olcek: 1 });
  });
});

describe("eşik listesi doğrulaması", () => {
  it("aynı varlığa iki eşik HATADIR", async () => {
    const { esikleriDogrula } = await import("../apps/web/src/lib/izleme");
    expect(
      esikleriDogrula([
        { assetSymbol: "USDT", minAmount: "1" },
        { assetSymbol: "USDT", minAmount: "2" },
      ]),
    ).toEqual({ hata: "aynı varlığa iki eşik: USDT" });
  });

  it("varlık verilmezse varsayılan eşiktir (*)", async () => {
    const { esikleriDogrula } = await import("../apps/web/src/lib/izleme");
    expect(esikleriDogrula([{ minAmount: "10" }])).toEqual({
      esikler: [{ assetSymbol: "*", minAmount: "10" }],
    });
  });

  it("boşluklu sembol kabul edilir — arşivde boşluklu taklit token VAR", async () => {
    const { esikleriDogrula } = await import("../apps/web/src/lib/izleme");
    expect(esikleriDogrula([{ assetSymbol: "U S D T", minAmount: "1" }])).toEqual({
      esikler: [{ assetSymbol: "U S D T", minAmount: "1" }],
    });
  });

  it("hatalı tutar sessizce varsayılana düşmez", async () => {
    const { esikleriDogrula } = await import("../apps/web/src/lib/izleme");
    const sonuc = esikleriDogrula([{ assetSymbol: "USDT", minAmount: "çok" }]);
    expect("hata" in sonuc).toBe(true);
  });
});
