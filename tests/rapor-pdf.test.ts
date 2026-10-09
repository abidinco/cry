/**
 * PDF'in SAYFA DÜZENİ ve üretimi.
 *
 * Buradaki sorular gözle bakılarak cevaplanamaz: 64 karakterlik bir hash
 * satıra sığdı mı, 1.300 satırlık bir tablo kaç sayfaya bölündü, yazı tipinin
 * basamadığı karakter sayıldı mı. Ölçüm için sahte bir "ölçer" yeterli —
 * gerçek yazı tipiyle üretim ayrı bir testte, çünkü orada ölçülen şey
 * kütüphanenin DETERMİNİSTİK olup olmadığı.
 */
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BOYUT,
  KENAR,
  SAYFA_GENISLIK,
  basilabilir,
  kanitPaketi,
  paketiMuhurle,
  pdfDuzeni,
  raporPdfi,
  sar,
  sayiTr,
  tutarTr,
  adayDizinler,
  yaziTipleriniOku,
  type KanitKenari,
  type Olcer,
  type PaketGirdisi,
  type PdfGirdisi,
  type Stil,
} from "@cry/rapor";

/** Sahte ölçer: her karakter 0,6 em — tek aralıklı bir yazı tipi gibi. */
const olc: Olcer = (metin: string, stil: Stil) => metin.length * BOYUT[stil] * 0.6;
const kapsarHepsi = () => true;
/** Türkçe'yi kapsamayan bir yazı tipi: `ğ` ve `₺` düşer. */
const kapsarLatin1 = (kod: number) => kod < 0x100;

function kenar(ek: Partial<KanitKenari> = {}): KanitKenari {
  return {
    txHash: "a".repeat(64),
    txIndex: 0,
    kimden: "T".repeat(34),
    kime: "U".repeat(34),
    sembol: "USDT",
    sozlesme: "TR7NHq",
    ondalik: 6,
    hamTutar: "4500000",
    zamanUtc: "2026-09-30T10:00:00.000Z",
    hop: 1,
    izliPay: "1.000000",
    fiyat: {
      tutar: "4.500000",
      islemGunu: { usd: "4.499800", try: "220.04", kurTarihi: "2026-09-29" },
      raporGunu: null,
      gerekce: ["2026-10-01 fiyatı kaynakta yok"],
    },
    ...ek,
  };
}

function girdi(kenarlar: KanitKenari[]): PdfGirdisi {
  const paketGirdisi: PaketGirdisi = {
    baslik: "Şüpheli akış raporu",
    uretildi: "2026-10-01T09:00:00.000Z",
    raporGunu: "2026-10-01",
    vaka: { slug: "deneme", baslik: "Deneme vakası" },
    kosu: {
      id: "9",
      zincir: "tron",
      kok: "T".repeat(34),
      yon: "ileri",
      atifKurali: "fifo",
      esikler: { maxHop: 3, maxDugum: 60 },
      durum: "bitti",
      durmaSebebi: "terminal",
      baslangic: "2026-09-14T21:00:00.000Z",
      bitis: "2026-09-14T21:05:00.000Z",
      istatistik: { durma: { terminal: 3, butce: 9 }, devamlar: [] },
    },
    gorulemeyenler: ["sözleşme içi TRX transferleri"],
    dugumler: [
      { adres: "T".repeat(34), hop: 0, hamTutar: null, terminalMi: false, terminalSebebi: null, indeksDurumu: "tam", indeksNotu: null, etiketler: [] },
      {
        adres: "U".repeat(34),
        hop: 1,
        hamTutar: "4500000",
        terminalMi: true,
        terminalSebebi: "terminal",
        indeksDurumu: "kismi",
        indeksNotu: "sayfa_butcesi",
        etiketler: [],
      },
    ],
    kenarlar,
  };
  const paket = kanitPaketi(paketGirdisi);
  const { sha256 } = paketiMuhurle(paket);
  return {
    paket,
    raporId: "3",
    sha256,
    muhurTutuyor: true,
    olusturuldu: "2026-10-01T09:00:01.000Z",
    kanitAdresi: "/api/rapor/3/kanit",
  };
}

describe("sarma ve biçim", () => {
  it("sığmayan tek kelimeyi KARAKTERDEN böler: hash kırpılmaz", () => {
    const hash = "b".repeat(64);
    const satirlar = sar(hash, 60, "mono", olc);
    expect(satirlar.length).toBeGreaterThan(1);
    expect(satirlar.join("")).toBe(hash);
    for (const s of satirlar) expect(olc(s, "mono")).toBeLessThanOrEqual(60);
  });

  it("tutarı Türkçe defter düzenine METİN üzerinden çevirir", () => {
    expect(tutarTr("1234567.891")).toBe("1.234.567,891");
    expect(tutarTr("-12.5")).toBe("-12,5");
    expect(tutarTr("999")).toBe("999");
    // 2^256-1: Number'a uğrasaydı 1.15e+77 olurdu.
    expect(tutarTr("115792089237316195423570985008687907853269984665640564039457584007913129639935")).toContain(
      "115.792.089",
    );
    expect(sayiTr(1342)).toBe("1.342");
  });
});

describe("basılamayan karakter", () => {
  it("kapsanmayanı `?` yapar ve SAYAR", () => {
    const { metin, atlanan } = basilabilir("1 ğün 5 ₺", kapsarLatin1);
    expect(metin).toBe("1 ?ün 5 ?");
    expect(atlanan).toBe(2);
  });

  it("düzen sayıyı İLK sayfaya yazar (son sayfaya değil)", () => {
    const duzen = pdfDuzeni(girdi([kenar()]), olc, kapsarLatin1);
    expect(duzen.basilamayan).toBeGreaterThan(0);
    const ilkSayfa = duzen.sayfalar[0]!.ogeler
      .filter((o) => o.tur === "metin")
      .map((o) => (o.tur === "metin" ? o.metin : ""))
      .join(" ");
    // Etiketin kendisi de aynı yazı tipinden geçiyor: `ı` de `?` oluyor.
    expect(ilkSayfa).toContain("172 karakter bu PDF'in yaz? tipiyle bas?lamad?");
  });
});

describe("sayfa düzeni", () => {
  it("her sayfaya altlık yazar: rapor, mühürün başı ve sayfa i/n", () => {
    const duzen = pdfDuzeni(girdi([kenar()]), olc, kapsarHepsi);
    for (const [i, sayfa] of duzen.sayfalar.entries()) {
      const metinler = sayfa.ogeler.flatMap((o) => (o.tur === "metin" ? [o.metin] : []));
      expect(metinler.some((m) => m.startsWith("rapor 3 · mühür "))).toBe(true);
      expect(metinler).toContain(`sayfa ${i + 1}/${duzen.sayfalar.length}`);
    }
  });

  it("hiçbir metin sayfanın dışına taşmaz", () => {
    const duzen = pdfDuzeni(girdi(Array.from({ length: 40 }, () => kenar())), olc, kapsarHepsi);
    for (const sayfa of duzen.sayfalar) {
      for (const oge of sayfa.ogeler) {
        if (oge.tur !== "metin") continue;
        const genislik = olc(oge.metin, oge.stil);
        const sol = oge.hiza === "sag" ? oge.x - genislik : oge.x;
        expect(sol).toBeGreaterThanOrEqual(KENAR - 0.01);
        expect(sol + genislik).toBeLessThanOrEqual(SAYFA_GENISLIK - KENAR + 0.01);
        expect(oge.y).toBeGreaterThan(0);
        expect(oge.y).toBeLessThan(sayfa.yukseklik);
      }
    }
  });

  it("defter uzadıkça sayfa sayısı artar; mühür sayfası hep ilk sayfadır", () => {
    const az = pdfDuzeni(girdi([kenar()]), olc, kapsarHepsi);
    const cok = pdfDuzeni(girdi(Array.from({ length: 300 }, (_, i) => kenar({ txIndex: i }))), olc, kapsarHepsi);
    expect(cok.sayfalar.length).toBeGreaterThan(az.sayfalar.length);
    // Mühür her iki durumda da İLK sayfada: defter uzadıkça aşağı kaymaz.
    for (const d of [az, cok]) {
      const ilk = d.sayfalar[0]!.ogeler.flatMap((o) => (o.tur === "metin" ? [o.metin] : []));
      expect(ilk).toContain("Mühür");
    }
  });

  it("sayfaya sığmayan tablo bölünür: satır KAYBOLMAZ, iki kez de yazılmaz", () => {
    // Tabloyu sayfa dibine itmek için önce uzun bir defter, sonra 300 düğüm.
    // Ölçüldü (2026-10-01): bu düzen SONSUZ DÖNGÜye giriyordu — sayfa dibinde
    // kalan boşluğa bölünen tablo parçası da sığmıyor, blok kendini yeniden
    // bölüyordu. Düzen 1.342 hareketli gerçek koşuda 20 dakikada bitmemişti.
    const dugumler = Array.from({ length: 300 }, (_, i) => ({
      adres: `T${String(i).padStart(33, "0")}`,
      hop: i % 4,
      hamTutar: null,
      terminalMi: false,
      terminalSebebi: null,
      indeksDurumu: "tam",
      indeksNotu: null,
      etiketler: [],
    }));
    const g = girdi([kenar(), kenar({ txIndex: 1 })]);
    const paket = { ...g.paket, dugumler, ozet: { ...g.paket.ozet, dugum: dugumler.length } };
    const duzen = pdfDuzeni({ ...g, paket }, olc, kapsarHepsi);
    const basilan = duzen.sayfalar
      .flatMap((s) => s.ogeler.flatMap((o) => (o.tur === "metin" ? [o.metin] : [])))
      .filter((m) => m.startsWith("T0") || m.startsWith("T1") || m.startsWith("T2"));
    for (const d of dugumler) expect(basilan.filter((m) => m === d.adres).length).toBe(1);
  });

  it("aynı girdi aynı düzeni verir (deterministik)", () => {
    const a = pdfDuzeni(girdi([kenar()]), olc, kapsarHepsi);
    const b = pdfDuzeni(girdi([kenar()]), olc, kapsarHepsi);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("mühür tutmuyorsa PDF bunu YAZAR", () => {
    const g = { ...girdi([kenar()]), muhurTutuyor: false };
    const metinler = pdfDuzeni(g, olc, kapsarHepsi)
      .sayfalar[0]!.ogeler.flatMap((o) => (o.tur === "metin" ? [o.metin] : []))
      .join(" ");
    expect(metinler).toContain("MÜHÜR TUTMUYOR");
  });
});

describe("gerçek yazı tipiyle üretim", () => {
  it("aynı rapordan iki kez üretilen PDF BİREBİR aynı baytları verir", async () => {
    const yazilar = yaziTipleriniOku();
    const g = girdi([kenar(), kenar({ hop: 2, txIndex: 1 })]);
    const bir = await raporPdfi(g, yazilar);
    const iki = await raporPdfi(g, yazilar);
    expect(bir.sha256).toBe(iki.sha256);
    expect(bir.bayt.length).toBe(iki.bayt.length);
    // Türkçe ve ₺ bu yazı tipinde var: tek karakter düşmemeli.
    expect(bir.basilamayan).toBe(0);
    expect(bir.sayfa).toBeGreaterThan(0);
    expect(new TextDecoder("latin1").decode(bir.bayt.slice(0, 8))).toContain("%PDF-");
  }, 30_000);
});

describe("yazı tipi yükleyici", () => {
  it("çalışma dizini nereden olursa olsun aynı dizini bulur", () => {
    // Üç çalışma dizini gerçek: depo kökü (betikler), apps/web (dev sunucusu),
    // /app (konteynerde standalone çıktı). Üçü de aynı dosyaya varmalı.
    const kok = yaziTipleriniOku(process.cwd());
    expect(kok.govde.byteLength).toBeGreaterThan(100_000);
    const adaylar = adayDizinler("/app");
    const duz = adaylar.map((d) => d.split(path.sep).join("/"));
    expect(duz.some((d) => d.endsWith("/app/packages/rapor/yazi-tipi"))).toBe(true);
  });

  it("bulamazsa DENENEN yolları söyler", () => {
    // "PDF alınamadı" tek başına hangi kurulumun bozuk olduğunu söylemiyor.
    expect(() => yaziTipleriniOku("/olmayan-bir-yer")).toThrow(/Denenen dizinler/);
  });
});
