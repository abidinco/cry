/**
 * Raporun DİYAGRAMI (öneri 11): mühürlü paketten, sunucuda, SVG.
 *
 * Testlerin derdi üç cümle:
 *  1. Aynı paket AYNI resmi verir — rapora giren bir görselin şartı budur.
 *  2. Resim neyi göstermediğini SÖYLER (kırpılan adres, başka varlık, boş graf).
 *  3. Uydurulmuş etiket yeşile boyanmaz: tanınmayan etiket kaydı ATILIR.
 */
import { describe, expect, it } from "vitest";

import { diyagramSvg, kanitPaketi, paketAkisi, tuvalYuksekligi, type KanitKenari, type PaketGirdisi } from "@cry/rapor";
import { akisModeli } from "@cry/akis";

const KOK = "T0";

function kenar(ek: Partial<KanitKenari> = {}): KanitKenari {
  return {
    txHash: "a".repeat(64),
    txIndex: 0,
    kimden: KOK,
    kime: "T1",
    sembol: "USDT",
    sozlesme: "TR7NHq",
    ondalik: 6,
    hamTutar: "1000000",
    zamanUtc: "2026-09-30T10:00:00.000Z",
    hop: 1,
    izliPay: "1.000000",
    fiyat: { tutar: "1.000000", islemGunu: null, raporGunu: null, gerekce: [] },
    ...ek,
  };
}

function dugum(adres: string, hop: number, ek: Record<string, unknown> = {}) {
  return {
    adres,
    hop,
    hamTutar: null,
    terminalMi: false,
    terminalSebebi: null,
    indeksDurumu: "tam",
    indeksNotu: null,
    etiketler: [],
    ...ek,
  };
}

function paket(ek: Partial<PaketGirdisi> = {}) {
  return kanitPaketi({
    baslik: "Diyagram denemesi",
    uretildi: "2026-10-09T09:00:00.000Z",
    raporGunu: "2026-10-09",
    vaka: { slug: "deneme", baslik: "Deneme" },
    kosu: {
      id: "1",
      zincir: "tron",
      kok: KOK,
      yon: "ileri",
      atifKurali: "fifo",
      esikler: {},
      durum: "bitti",
      durmaSebebi: "terminal",
      baslangic: "2026-10-09T08:00:00.000Z",
      bitis: "2026-10-09T08:05:00.000Z",
      istatistik: {},
    },
    gorulemeyenler: [],
    dugumler: [dugum(KOK, 0), dugum("T1", 1)],
    kenarlar: [kenar()],
    ...ek,
  });
}

describe("rapor diyagramı", () => {
  it("aynı paket AYNI baytları verir", () => {
    const p = paket();
    expect(diyagramSvg(p).svg).toBe(diyagramSvg(p).svg);
  });

  it("kenarların sırası resmi DEĞİŞTİRMEZ", () => {
    const k = [
      kenar({ kime: "T1", hop: 1 }),
      kenar({ kimden: "T1", kime: "T2", hop: 2, hamTutar: "400000" }),
    ];
    const d = [dugum(KOK, 0), dugum("T1", 1), dugum("T2", 2)];
    const duz = diyagramSvg(paket({ dugumler: d, kenarlar: k })).svg;
    const ters = diyagramSvg(paket({ dugumler: [...d].reverse(), kenarlar: [...k].reverse() })).svg;
    expect(ters).toBe(duz);
  });

  it("çizilen + kırpılan = paketin düğümü; kırpma resmin ALTINDA yazar", () => {
    const dugumler = [dugum(KOK, 0), ...Array.from({ length: 140 }, (_, i) => dugum(`T${i + 1}`, 1))];
    const kenarlar = dugumler.slice(1).map((d, i) => kenar({ kime: d.adres, txIndex: i }));
    const sonuc = diyagramSvg(paket({ dugumler, kenarlar }));
    expect(sonuc.dugum).toBe(100);
    expect(sonuc.kirpilan).toBe(41);
    expect(sonuc.dugum + sonuc.kirpilan).toBe(141);
    expect(sonuc.svg).toContain("çizilmeyen 41 adres");
  });

  it("başka varlıktaki hareketler ÇİZİLMEZ ama SAYILIR", () => {
    const sonuc = diyagramSvg(
      paket({
        dugumler: [dugum(KOK, 0), dugum("T1", 1), dugum("T2", 1)],
        kenarlar: [
          kenar({ kime: "T1" }),
          kenar({ kime: "T1", txIndex: 1 }),
          kenar({ kime: "T2", sembol: "TRX", sozlesme: null, txIndex: 2 }),
        ],
      }),
    );
    expect(sonuc.varlik).toBe("USDT");
    expect(sonuc.digerVarlikKenari).toBe(1);
    expect(sonuc.svg).toContain("başka varlıkta 1 hareket çizilmedi");
  });

  it("boş defter SESSİZ kalmaz: resmin yerine SEBEP yazılır", () => {
    const sonuc = diyagramSvg(paket({ kenarlar: [] }));
    expect(sonuc.dugum).toBe(0);
    expect(sonuc.svg).toContain("defter boş");
  });

  it("etiket metni XML'e KAÇIRILIR", () => {
    const sonuc = diyagramSvg(
      paket({
        dugumler: [
          dugum(KOK, 0),
          dugum("T1", 1, {
            terminalMi: true,
            terminalSebebi: "terminal",
            etiketler: [
              { title: "Borsa", category: "exchange_hot", exchange: 'A&B "<borsa>"', dogrulandi: true },
            ],
          }),
        ],
      }),
    );
    expect(sonuc.svg).toContain("A&amp;B &quot;&lt;borsa&gt;&quot;");
    expect(sonuc.svg).not.toContain('"<borsa>"');
  });

  it("tanınmayan etiket kaydı ATILIR: uydurulmuş etiket yeşile boyanmaz", () => {
    const { dugumler } = paketAkisi(
      paket({
        dugumler: [
          dugum(KOK, 0),
          dugum("T1", 1, { etiketler: [null, 42, { exchange: "Binance" }, { title: "X", category: "diger", exchange: null }] }),
        ],
      }),
    );
    const t1 = dugumler.find((d) => d.address === "T1")!;
    expect(t1.etiketler).toHaveLength(1);
    expect(t1.etiketler[0]!.title).toBe("X");
  });

  it("tuval, en kalabalık sütuna göre BÜYÜR: üst üste binen etiket okunmaz", () => {
    const az = akisModeli(
      [
        { address: KOK, hop: 0, terminalReason: null, etiketler: [] },
        { address: "T1", hop: 1, terminalReason: null, etiketler: [] },
      ],
      [
        {
          txHash: "a".repeat(64),
          from: KOK,
          to: "T1",
          symbol: "USDT",
          decimals: 6,
          amountRaw: "1000000",
          ts: "2026-09-30T10:00:00.000Z",
          hop: 1,
          taintShare: 1,
        },
      ],
      KOK,
      "USDT",
    );
    const cok = akisModeli(
      [
        { address: KOK, hop: 0, terminalReason: null, etiketler: [] },
        ...Array.from({ length: 80 }, (_, i) => ({
          address: `T${i}`,
          hop: 1,
          terminalReason: null,
          etiketler: [],
        })),
      ],
      Array.from({ length: 80 }, (_, i) => ({
        txHash: "a".repeat(64),
        from: KOK,
        to: `T${i}`,
        symbol: "USDT",
        decimals: 6,
        amountRaw: "1000000",
        ts: "2026-09-30T10:00:00.000Z",
        hop: 1,
        taintShare: 1,
      })),
      KOK,
      "USDT",
    );
    expect(tuvalYuksekligi(cok)).toBeGreaterThan(tuvalYuksekligi(az));
    expect(tuvalYuksekligi(cok)).toBeGreaterThanOrEqual(80 * 13);
    // Üst sınır: bir resim sonsuza kadar uzamaz.
    expect(tuvalYuksekligi(cok)).toBeLessThanOrEqual(4000);
  });
});
