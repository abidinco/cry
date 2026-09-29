/**
 * EVM adaptörünün SAF katmanı: kaynağın cevabını okumak ve sayfalamak.
 *
 * Bu dosyanın sorduğu asıl soru, projenin en pahalı kusur sınıfıdır: kaynak bir şey
 * söylemediğinde biz "yok" mu diyoruz, "bakılamadı" mı? Etherscan ikisini de HTTP 200 ile
 * döndürüyor ve ayıran tek şey `result`ın TİPİ.
 */
import { describe, expect, it } from "vitest";
import {
  etherscanHatasi,
  etherscanKayitlari,
  hexTutar,
  imlecCoz,
  imlecKur,
  kayitAnahtari,
  konudanAdres,
  hizSinirimi,
  sonrakiUcImleci,
  sozlesmeKodu,
  tokenVarligi,
} from "../packages/chain/src/adapters/evm";

describe("etherscanHatasi — hata HTTP 200 ile ve `result` alanında gelir", () => {
  // Gerçek yanıt (ölçüldü 2026-09-29, anahtarsız çağrı).
  it("anahtar hatasını yakalar", () => {
    expect(etherscanHatasi({ status: "0", message: "NOTOK", result: "Missing/Invalid API Key" }))
      .toBe("Missing/Invalid API Key");
  });

  it("BSC'nin ücretsiz planda kapsanmamasını yakalar", () => {
    expect(
      etherscanHatasi({ status: "0", result: "Free API access is not supported for this chain" }),
    ).toContain("not supported");
  });

  // "Kayıt yok" da status:"0" ile geliyor; ayıran şey result'ın DİZİ olması.
  it("boş cevabı hata SAYMAZ", () => {
    expect(etherscanHatasi({ status: "0", message: "No transactions found", result: [] })).toBeNull();
  });

  it("başarılı cevapta hata yoktur", () => {
    expect(etherscanHatasi({ status: "1", result: [{ hash: "0x1" }] })).toBeNull();
  });
});

describe("etherscanKayitlari — 'yok' ile 'bakılamadı' ayrı kovalar", () => {
  it("gerçek bir hatayı YÜKSELTİR, boş liste döndürmez", () => {
    expect(() =>
      etherscanKayitlari({ status: "0", result: "Missing/Invalid API Key" }, "ethereum", "txlist"),
    ).toThrow(/Missing\/Invalid API Key/);
  });

  it("'kayıt yok' metni boş listedir", () => {
    expect(etherscanKayitlari({ status: "0", result: "No transactions found" }, "ethereum", "txlist"))
      .toEqual([]);
  });

  // Liste KAPALI: kaynağın yarın yazacağı yeni bir hata metni "hareket yok" diye okunmamalı.
  it("tanımadığı metni 'yok' saymaz, HATA sayar", () => {
    expect(() =>
      etherscanKayitlari({ status: "0", result: "Query timeout, please retry" }, "ethereum", "txlist"),
    ).toThrow(/Query timeout/);
  });

  it("şekli bozuk yanıtı sessizce boş saymaz", () => {
    expect(() => etherscanKayitlari({ status: "1", result: { hash: "0x1" } }, "ethereum", "txlist"))
      .toThrow(/beklenen dizi/);
  });

  it("dizi gelince olduğu gibi verir", () => {
    expect(etherscanKayitlari({ status: "1", result: [{ hash: "0xa" }] }, "ethereum", "txlist"))
      .toEqual([{ hash: "0xa" }]);
  });
});

describe("konudanAdres / hexTutar", () => {
  it("32 baytlık konudan sağa yaslı 20 baytı alır", () => {
    const konu = "0x" + "0".repeat(24) + "dac17f958d2ee523a2206206994597c13d831ec7";
    expect(konudanAdres(konu)).toBe("0xdac17f958d2ee523a2206206994597c13d831ec7");
  });

  it("bozuk uzunlukta null döner — adres UYDURULMAZ", () => {
    expect(konudanAdres("0xabc")).toBeNull();
    expect(konudanAdres(null)).toBeNull();
  });

  // Tutar HAM TAM SAYIDIR: `Number`'a uğrayan 2^256-1 rapora 1.15e+77 diye düşerdi.
  it("2^256-1'i tam sayı olarak taşır", () => {
    expect(hexTutar("0x" + "f".repeat(64))).toBe(
      "115792089237316195423570985008687907853269984665640564039457584007913129639935",
    );
  });

  it("hex olmayanı çevirmez", () => {
    expect(hexTutar("merhaba")).toBeNull();
  });
});

describe("imleç — kalıcı ve KAYIPSIZ olmalı", () => {
  it("boş imleç üç ucun da başını gösterir", () => {
    expect(imlecCoz(null)).toEqual({ native: null, token: null, internal: null });
  });

  it("gidiş dönüş aynı imleci verir", () => {
    const i = { native: { blok: 100, gorulen: ["0xa#"] }, token: "bitti" as const, internal: null };
    expect(imlecCoz(imlecKur(i))).toEqual(i);
  });

  it("üç uç da bitince imleç NULL olur — tur biter", () => {
    expect(imlecKur({ native: "bitti", token: "bitti", internal: "bitti" })).toBeNull();
  });

  it("bozuk imleç sessizce baştan başlatmaz, HATA verir", () => {
    // Sessizce baştan başlamak, artımlı indeksi her turda sıfırdan okuturdu.
    expect(() => imlecCoz("{bozuk")).toThrow(/imleci okunamadı/);
  });
});

describe("sonrakiUcImleci — blok sınırında kayıp da döngü de olmamalı", () => {
  const kayit = (blok: number, hash: string, log = "") => ({ blockNumber: String(blok), hash, logIndex: log });

  it("sayfa dolu değilse uç BİTMİŞTİR", () => {
    expect(sonrakiUcImleci([kayit(10, "0xa")], kayitAnahtari, 1000)).toBe("bitti");
  });

  /*
   * Asıl mesele bu: sayfa son blokta BÖLÜNÜYOR. `sonBlok + 1` demek o blokta kalan kaydı
   * sessizce atlamaktır; bu yüzden aynı bloktan devam edilir ve verilmiş olanlar taşınır.
   */
  it("dolu sayfada son bloktan devam eder ve o bloktakileri taşır", () => {
    const sayfa = [kayit(10, "0xa"), kayit(11, "0xb"), kayit(11, "0xc")];
    expect(sonrakiUcImleci(sayfa, kayitAnahtari, 3)).toEqual({ blok: 11, gorulen: ["0xb#", "0xc#"] });
  });

  it("aynı işlemin iki log'u anahtarda AYRILIR", () => {
    const sayfa = [kayit(10, "0xa"), kayit(11, "0xb", "5"), kayit(11, "0xb", "6")];
    expect(sonrakiUcImleci(sayfa, kayitAnahtari, 3)).toEqual({ blok: 11, gorulen: ["0xb#5", "0xb#6"] });
  });

  // Yerinde saymak sessiz bir sonsuz döngüdür; söylenmesi eksik veri vermekten iyidir.
  it("sayfanın tamamı tek bloktaysa ilerleyemediğini SÖYLER", () => {
    const sayfa = [kayit(11, "0xa"), kayit(11, "0xb")];
    expect(() => sonrakiUcImleci(sayfa, kayitAnahtari, 2)).toThrow(/ilerleyemiyor/);
  });
});

describe("sozlesmeKodu — kod var ≠ sözleşme (EIP-7702)", () => {
  it("boş kod sözleşme değildir", () => {
    expect(sozlesmeKodu("0x")).toEqual({ sozlesme: false, devrettigi: null });
    expect(sozlesmeKodu("")).toEqual({ sozlesme: false, devrettigi: null });
  });

  // ÖLÇÜLDÜ (2026-09-29): vitalik.eth için `eth_getCode` bunu döndürüyor. Sıradan bir cüzdan.
  // "Kod var mı" diye bakan bir kontrol onu sözleşme sayar ve takip motoru izi `kontrat`
  // sebebiyle durdurur — olmayan bir duvara yanlış bir SEBEP yazmak.
  it("EIP-7702 yetki devri bir CÜZDANDIR, sözleşme değil", () => {
    const kod = "0xef01005a7fc11397e9a8ad41bf10bf13f22b0a63f96f6d";
    expect(sozlesmeKodu(kod)).toEqual({
      sozlesme: false,
      devrettigi: "0x5a7fc11397e9a8ad41bf10bf13f22b0a63f96f6d",
    });
  });

  it("gerçek sözleşme kodu sözleşmedir", () => {
    // USDT sözleşmesinin kodu 22.152 karakter (ölçüldü); baştaki birkaç bayt yeter.
    expect(sozlesmeKodu("0x6060604052600436106101965760").sozlesme).toBe(true);
  });

  it("ef0100 ile başlayan ama uzunluğu tutmayan kod sözleşme SAYILIR", () => {
    // 23 bayttan farklı bir şey yetki devri değildir; "belki öyledir" diye cüzdan saymak
    // gerçek bir sözleşmeyi cüzdan göstermek olurdu.
    expect(sozlesmeKodu("0xef0100" + "ab".repeat(30)).sozlesme).toBe(true);
  });

  it("hex olmayan cevap sözleşme SAYILMAZ", () => {
    expect(sozlesmeKodu("Max calls per sec rate limit reached").sozlesme).toBe(false);
  });
});

describe("hizSinirimi — Etherscan hız sınırını HTTP 200 ile söylüyor", () => {
  it("ölçülen gerçek metni tanır", () => {
    expect(hizSinirimi("Max calls per sec rate limit reached (3/sec)")).toBe(true);
  });

  it("kalıcı hatayı hız sınırı SANMAZ", () => {
    expect(hizSinirimi("Missing/Invalid API Key")).toBe(false);
    expect(hizSinirimi("Free API access is not supported for this chain")).toBe(false);
  });

  // "bekle" ile "boşuna deneme" ayrımı kayda geçiyor (§12); bayrak yanlışsa öneri de yanlış olur.
  it("hız sınırı hatası `rateLimited` taşır", () => {
    try {
      etherscanKayitlari({ status: "0", result: "Max calls per sec rate limit reached (3/sec)" }, "ethereum", "txlist");
      expect.unreachable();
    } catch (e) {
      expect((e as { opts?: { rateLimited?: boolean } }).opts?.rateLimited).toBe(true);
    }
  });
});

describe("tokenVarligi — kaynağın okuyamadığı metadata uydurulmaz", () => {
  it("normal token kaynağın dediği gibi çözülür", () => {
    const { varlik, metaEksik } = tokenVarligi(
      { tokenSymbol: "USDT", tokenName: "Tether USD", tokenDecimal: "6", contractAddress: "0xDAC17F958D2ee523a2206206994597C13D831ec7" },
      "ethereum",
    );
    expect(metaEksik).toBe(false);
    expect(varlik).toEqual({
      chain: "ethereum",
      contract: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      symbol: "USDT",
      decimals: 6,
    });
  });

  /*
   * ÖLÇÜLDÜ (2026-09-29): `0xd654bdd3…` için kaynak tokenName ve tokenSymbol'ü BOŞ,
   * tokenDecimal'i "1" veriyor. O "1" bir ölçüm değil dolgudur; onunla çevrilen
   * 340000000000000000000, ekrana 34 milyar kat yanlış bir büyüklük olarak düşerdi.
   */
  it("adı ve sembolü boş olan token TANINMAMIŞTIR: ondalığı uydurulmaz", () => {
    const { varlik, metaEksik } = tokenVarligi(
      { tokenSymbol: "", tokenName: "", tokenDecimal: "1", contractAddress: "0xd654bdd32fc99471455e86c2e7f7d7b6437e9179" },
      "ethereum",
    );
    expect(metaEksik).toBe(true);
    expect(varlik.symbol).toBe("?");
    expect(varlik.decimals).toBe(0);
    // Kimlik sembolde değil SÖZLEŞMEDE: tanınmasa da hangi token olduğu bellidir.
    expect(varlik.contract).toBe("0xd654bdd32fc99471455e86c2e7f7d7b6437e9179");
  });

  it("sembolü boş ama ADI olan token tanınmış sayılır", () => {
    const { varlik, metaEksik } = tokenVarligi(
      { tokenSymbol: "", tokenName: "Endgame", tokenDecimal: "18", contractAddress: "0xabc" },
      "ethereum",
    );
    expect(metaEksik).toBe(false);
    expect(varlik.symbol).toBe("Endgame");
    expect(varlik.decimals).toBe(18);
  });

  it("ondalık sayı değilse 18 varsayılır ama sembol varsa token tanınmıştır", () => {
    expect(tokenVarligi({ tokenSymbol: "X", tokenDecimal: "abc", contractAddress: "0x1" }, "ethereum").varlik.decimals)
      .toBe(18);
  });
});
