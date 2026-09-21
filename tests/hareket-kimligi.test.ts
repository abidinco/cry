/**
 * Hareketin KİMLİĞİ: `occurrence`.
 *
 * Ölçüldü (M1-E, 2026-09-21): eski kimlik `(chain, txHash, index)` KAYNAĞA BAĞLIYDI — TronGrid
 * `index`'i adresin o işlemdeki kayıtlarını bütün token'lar boyunca sayarak veriyor, blok indeksi
 * yalnızca USDT+TRX gördüğü için aynı sayıyı üretemiyor (2.270 harekette 60 kayma). Kaynaktan
 * bağımsız kural: işlem içinde aynı (from, to, asset, amountRaw) dörtlüsünün kaçıncı tekrarı.
 *
 * Buradaki iki sınav, kuralın iki gerçek tuzağını tutuyor:
 *   1. Sayaç TUR boyunca yaşar — bir işlemin kayıtları SAYFA SINIRINDA bölünebiliyor. Parti başına
 *      sıfırlanan bir sayaç ikinci yarıya yeniden 0 verir ve tekillik o satırı sessizce düşürür.
 *   2. Yeni tur sayacı SIFIRLAR — aynı adres yeniden indekslenince aynı numaralar çıkmalı, yoksa
 *      her tur aynı parayı yeni satır olarak yazar.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { TronAdapter } from "../packages/chain/src/adapters/tron";

const ADRES = "TN3U9RyqgyrvEnMXzKfT4CEdA3qh8zXUtc";
const KARSI = "TLkwyaJU6i1Z8noiZp8jM5Hw4Dw3zYfaJt";
const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

/** Aynı işlemde birebir aynı transfer — gerçek bir durum (bir tx'te 20 özdeşi ölçüldü). */
const kayit = (tx: string, tutar = "1000000") => ({
  transaction_id: tx,
  block_timestamp: 1_700_000_000_000,
  from: ADRES,
  to: KARSI,
  value: tutar,
  type: "Transfer",
  token_info: { address: USDT, symbol: "USDT", decimals: 6 },
});

/** trc20 ucunu sayfa sayfa besleyen sahte fetch; native uç hep boş. */
function sahteAg(sayfalar: unknown[][]) {
  let sira = 0;
  return vi.fn(async (url: string | URL) => {
    const s = String(url);
    const govde = s.includes("/trc20")
      ? { data: sayfalar[sira] ?? [], meta: { fingerprint: `fp${sira++}` } }
      : { data: [] };
    return new Response(JSON.stringify(govde), { status: 200, headers: { "content-type": "application/json" } });
  });
}

afterEach(() => vi.unstubAllGlobals());

async function hepsiniTopla(a: TronAdapter, limit: number) {
  const hepsi: { txHash: string; occurrence: number; amountRaw: string }[] = [];
  let imlec: string | null = null;
  for (let i = 0; i < 10; i++) {
    const s = await a.listTransfers(ADRES, { cursor: imlec, limit });
    hepsi.push(...s.items.map((t) => ({ txHash: t.txHash, occurrence: t.occurrence, amountRaw: t.amountRaw })));
    imlec = s.nextCursor;
    if (!imlec) break;
  }
  return hepsi;
}

describe("occurrence — hareketin kaynaktan bağımsız kimliği", () => {
  it("sayfa sınırında bölünen işlemde sayaç DEVAM eder, sıfırlanmaz", async () => {
    // "AA" işleminin üç özdeş kaydı var; sayfa boyu 2, yani üçüncüsü İKİNCİ sayfaya düşüyor.
    vi.stubGlobal("fetch", sahteAg([[kayit("AA"), kayit("AA")], [kayit("AA")], []]));
    const bulunan = await hepsiniTopla(new TronAdapter({ baseUrl: "http://sahte" }), 2);

    expect(bulunan.map((x) => x.occurrence)).toEqual([0, 1, 2]);
  });

  it("aynı dörtlü değilse sayaç ayrı ilerler — tutar farklıysa ikisi de 0'dır", async () => {
    vi.stubGlobal("fetch", sahteAg([[kayit("AA", "1000000"), kayit("AA", "2000000"), kayit("AA", "1000000")], []]));
    const bulunan = await hepsiniTopla(new TronAdapter({ baseUrl: "http://sahte" }), 3);

    expect(bulunan.map((x) => [x.amountRaw, x.occurrence])).toEqual([
      ["1000000", 0],
      ["2000000", 0],
      ["1000000", 1],
    ]);
  });

  it("yeni tur sayacı sıfırlar — aynı adres yeniden indekslenince aynı numaralar çıkar", async () => {
    const sayfalar = [[kayit("AA"), kayit("AA")], []];
    vi.stubGlobal("fetch", sahteAg(sayfalar));
    const a = new TronAdapter({ baseUrl: "http://sahte" });
    const birinci = await hepsiniTopla(a, 2);

    vi.stubGlobal("fetch", sahteAg(sayfalar));
    const ikinci = await hepsiniTopla(a, 2);

    expect(ikinci).toEqual(birinci);
    expect(birinci.map((x) => x.occurrence)).toEqual([0, 1]);
  });
});
