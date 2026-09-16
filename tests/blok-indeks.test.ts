import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { bloktanSatirlar, satirDizisi, TRANSFER_KONUSU, USDT_TRC20_HEX, type IndeksSatiri } from "@cry/blok-indeks";
import { hexToBase58 } from "@cry/chain";

// GERÇEK TRON blokları (86.271.000 ve 86.271.003), yalnızca ilgili işlemler bırakılarak kırpıldı.
// Beş vakanın beşi de gerçek veriden: TRX transferi, başarısız sözleşme çağrısı, USDT Transfer
// olayı, Transfer OLMAYAN olay, USDT olmayan token transferi. Üretimi: scripts/olcum ile aynı uçlar.
const fixture = JSON.parse(readFileSync(new URL("./fixtures/tron-bloklar.json", import.meta.url), "utf8")) as {
  bloklar: { vakalar: Record<string, string[]>; blok: unknown; bilgi: unknown[] }[];
};
const coz = (i: number) => bloktanSatirlar(fixture.bloklar[i]!.blok as never, fixture.bloklar[i]!.bilgi as never);

describe("bloktanSatirlar", () => {
  it("blok numarasını ve zamanı saniyeye çevirerek okur", () => {
    const r = coz(0);
    expect(r.blok).toBe(86_271_000);
    expect(r.zaman).toBe(Math.floor(1_789_485_141_000 / 1000)); // fixture'ın kendi damgası, ms → sn
    expect(r.satirlar.every((s) => s.blok === r.blok && s.zaman === r.zaman)).toBe(true);
  });

  it("TRX transferini ham tam sayıyla, 41 öneki olmadan yazar", () => {
    const trx = coz(0).satirlar.filter((s) => s.varlik === "TRX");
    expect(trx).toHaveLength(1);
    expect(trx[0]!.tutar).toBe(1n); // 1 sun — zincirdeki toz transferi, ham tam sayı olduğu gibi durur
    expect(trx[0]!.kimden).toMatch(/^[0-9a-f]{40}$/);
    expect(trx[0]!.kime).toMatch(/^[0-9a-f]{40}$/);
    // Gösterim sınırında base58'e çevrilebilmeli: 41 öneki eklenince geçerli bir TRON adresi.
    expect(hexToBase58("41" + trx[0]!.kime)).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
  });

  it("USDT Transfer olayını konudaki adreslerin son 20 baytından okur", () => {
    const usdt = coz(0).satirlar.filter((s) => s.varlik === "USDT");
    expect(usdt).toHaveLength(2);
    // Tutar olayın `data` alanındaki 32 baytlık büyük-endian sayıdır (0x5bdda5f8 = 1.541,2526 USDT).
    expect(usdt.map((s) => s.tutar)).toEqual([0x5bdda5f8n, 0x1803c420n]);
    expect(usdt.every((s) => s.kimden.length === 40 && s.kime.length === 40)).toBe(true);
    expect(usdt[0]!.idx).toBe(0);
  });

  it("başarısız işlemi ELEMEZ diye saymaz — eler ve sayar", () => {
    const r = coz(0);
    expect(r.sayac.basarisizIslem).toBe(1);
    // OUT_OF_ENERGY olan işlemin hash'i hiçbir satırda geçmemeli.
    const basarisiz = Object.entries(fixture.bloklar[0]!.vakalar).find(([, v]) => v.includes("basarisiz"))![0];
    expect(r.satirlar.some((s) => s.tx.startsWith(basarisiz))).toBe(false);
  });

  it("Transfer olmayan olayı (onay vb.) transfer SAYMAZ", () => {
    const r = coz(0);
    // ba7fa547 işlemi HEM bir USDT transferi HEM Transfer olmayan bir olay taşıyor: ikincisi düşer.
    expect(r.sayac.transferOlmayanOlay).toBe(1);
    expect(r.satirlar).toHaveLength(3); // bir TRX + iki USDT
  });

  it("USDT olmayan bir sözleşmenin Transfer olayını ALMAZ — kimlik sembol değil sözleşmedir", () => {
    const r = coz(1);
    expect(r.sayac.kapsamDisiToken).toBe(1);
    expect(r.satirlar).toHaveLength(0);
    expect(r.satirlar.filter((s) => s.varlik === "USDT")).toHaveLength(0);
  });

  it("aynı blok iki kez ayrıştırılınca birebir aynı satırları verir", () => {
    expect(coz(0).satirlar).toEqual(coz(0).satirlar);
  });

  it("blok başlığı okunamazsa SESSİZ KALMAZ, hata atar", () => {
    expect(() => bloktanSatirlar({} as never, [])).toThrow(/blok başlığı/);
    expect(() => bloktanSatirlar({ block_header: { raw_data: { number: 1 } } } as never, [])).toThrow(/blok başlığı/);
  });

  it("sabitler kaynağın yazdığı biçimde: USDT sözleşmesi 41 öneksiz, konu 32 bayt", () => {
    expect(USDT_TRC20_HEX).toHaveLength(40);
    expect(TRANSFER_KONUSU).toHaveLength(64);
  });
});

describe("satirDizisi", () => {
  const s: IndeksSatiri = { blok: 1, zaman: 2, tx: "ab".repeat(32), idx: 3, varlik: "USDT", kimden: "cd".repeat(20), kime: "ef".repeat(20), tutar: 2n ** 255n };

  it("tutarı METİN olarak taşır — JSON sayısı 2^53'te sessizce taşar", () => {
    const d = satirDizisi(s);
    expect(d[7]).toBe((2n ** 255n).toString());
    expect(BigInt(d[7])).toBe(2n ** 255n);
  });

  it("varlığı kodla yazar ve sütun sırası şemayla aynı", () => {
    expect(satirDizisi(s)).toEqual([1, 2, "ab".repeat(32), 3, 2, "cd".repeat(20), "ef".repeat(20), (2n ** 255n).toString()]);
  });
});
