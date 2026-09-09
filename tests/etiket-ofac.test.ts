import { describe, expect, it } from "vitest";
import { ofacAyristir } from "../packages/etiket/src/ofac";
import { ADAY_ETIKETLER } from "../packages/etiket/src/aday";
import { tronGecerliMi } from "../packages/chain/src/tron-address";

/**
 * OFAC belgesinin gerçek şeklinden kısaltılmış bir örnek. Aynı varlık üç
 * zincirde birden geçiyor — kaynakta da böyle.
 */
const XML = `<?xml version="1.0"?>
<sanctionsData>
  <publicationInfo><dataAsOf>2026-09-01</dataAsOf></publicationInfo>
  <entity id="1">
    <sanctionsPrograms><sanctionsProgram refId="1" id="1">RUSSIA-EO14024</sanctionsProgram></sanctionsPrograms>
    <names><name id="1"><isPrimary>true</isPrimary>
      <translations><translation id="1"><isPrimary>true</isPrimary><script refId="20122">Latin</script>
        <formattedFullName>OKO DESIGN BUREAU</formattedFullName></translation>
      <translation id="2"><isPrimary>false</isPrimary><script refId="20107">Cyrillic</script>
        <formattedFullName>OKO KIRIL</formattedFullName></translation></translations>
    </name></names>
    <features>
      <feature id="1"><type featureTypeId="14">Website</type><value>https://ornek.example</value></feature>
      <feature id="2"><type featureTypeId="345">Digital Currency Address - ETH</type>
        <value>0x19F8f2B0915Daa12a3f5C9CF01dF9E24D53794F7</value></feature>
      <feature id="3"><type featureTypeId="992">Digital Currency Address - TRX</type>
        <value>TFdTr9C3BqQrzKBXqSxJfAZFTh8UwBAfSg</value></feature>
      <feature id="4"><type featureTypeId="344">Digital Currency Address - XBT</type>
        <value>13fhnkmpBBWXUQucJd6efWvXdEj78DKavk</value></feature>
      <feature id="5"><type featureTypeId="887">Digital Currency Address - USDT</type>
        <value>TFdTr9C3BqQrzKBXqSxJfAZFTh8UwBAfSg</value></feature>
    </features>
  </entity>
  <entity id="2">
    <names><name id="2"><isPrimary>true</isPrimary><translations><translation id="3">
      <isPrimary>true</isPrimary><script refId="20122">Latin</script>
      <formattedFullName>SADECE ADRESSIZ</formattedFullName></translation></translations></name></names>
    <features><feature id="6"><type featureTypeId="14">Website</type><value>x</value></feature></features>
  </entity>
</sanctionsData>`;

describe("OFAC ayrıştırıcı", () => {
  const sonuc = ofacAyristir(XML);

  it("zinciri SEMBOLDEN değil ADRES BİÇİMİNDEN çözer", () => {
    // Kaynak "USDT" diyor ama adres T… ile başlıyor: TRON.
    const usdt = sonuc.etiketler.filter((e) => e.evidence.kaynakSembolu === "USDT");
    expect(usdt).toHaveLength(1);
    expect(usdt[0]!.chain).toBe("tron");
  });

  it("EVM sembolü hangi EVM zinciri olduğunu söyler ve adres küçük harfe çekilir", () => {
    const eth = sonuc.etiketler.find((e) => e.chain === "ethereum");
    expect(eth?.address).toBe("0x19f8f2b0915daa12a3f5c9cf01df9e24d53794f7");
  });

  it("adaptörü olmayan zinciri SESSİZCE atmaz, BİÇİMİNİ adıyla söyler", () => {
    const btc = sonuc.atlananlar.find((a) => a.ham.startsWith("13fhnk"));
    expect(btc).toBeDefined();
    expect(btc!.sebep).toContain("bitcoin biçimi");
  });

  it("adı birincil LATİN çeviriden alır", () => {
    expect(sonuc.etiketler[0]!.title).toBe("OFAC SDN: OKO DESIGN BUREAU");
    expect(sonuc.etiketler.some((e) => e.title.includes("KIRIL"))).toBe(false);
  });

  it("yaptırım programını ve liste sürümünü kanıta yazar", () => {
    expect(sonuc.kaynakSurumu).toBe("2026-09-01");
    expect(sonuc.etiketler[0]!.evidence.programlar).toEqual(["RUSSIA-EO14024"]);
  });

  it("yaptırım etiketi TERMINAL değildir — kategori exchange ile başlamaz", () => {
    // Motor yalnızca exchange* olanı terminal sayıyor; yaptırımlı adresten
    // para hareket etmeye devam eder.
    expect(sonuc.etiketler.every((e) => !e.category.startsWith("exchange"))).toBe(true);
  });

  it("adres taşımayan varlığı hiç açmaz", () => {
    expect(sonuc.etiketler.some((e) => e.title.includes("ADRESSIZ"))).toBe(false);
  });
});

describe("aday borsa etiketleri", () => {
  it("TRON adresleri checksum'dan geçer", () => {
    for (const e of ADAY_ETIKETLER.filter((x) => x.chain === "tron")) {
      expect(tronGecerliMi(e.address)).toBe(true);
    }
  });

  it("EVM adresleri kanonik küçük harf", () => {
    for (const e of ADAY_ETIKETLER.filter((x) => x.chain === "ethereum")) {
      expect(e.address).toMatch(/^0x[0-9a-f]{40}$/);
    }
  });

  it("hiçbiri doğrulanmış değil ve güveni düşük", () => {
    expect(ADAY_ETIKETLER.every((e) => !e.dogrulanmisMi)).toBe(true);
    expect(ADAY_ETIKETLER.every((e) => e.confidence < 0.5)).toBe(true);
  });
});
