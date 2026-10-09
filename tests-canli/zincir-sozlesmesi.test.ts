/**
 * ZİNCİR kaynaklarının canlı sözleşmesi.
 *
 * Her denetim, bu projede GERÇEKTEN yaşanmış bir tuzağın nöbetçisidir:
 *
 *  1. Tek işlem okumasında TRC20 transferi bir OLAYdır ve AYRI uçtadır —
 *     `gettransactionbyid` gerçek bir USDT transferini 0 hareketle dönüyordu.
 *  2. Etherscan'de hata, "kayıt yok" ve hız sınırı ÜÇÜ DE HTTP 200 ile gelir;
 *     ayıran şey `result`ın tipidir. `!!result` kontrolü bir TRON işlemini
 *     "BSC'de var" diye raporlamıştı.
 *  3. BSC ücretsiz planda KAPSAM DIŞI; "hazır" sayılan bir zincir her adrese
 *     "bakıldı, bir şey yok" dedirtir.
 *  4. Hareketin indeksi işlem İÇİNDEKİ sırasıdır; aynı işlemde birebir aynı
 *     20 Transfer olayı ölçüldü ve yirmisi de gerçek.
 *
 * ANAHTARSIZ KOŞU YEŞİL DÖNMEZ: anahtar yoksa denetim BAŞARISIZ olur ve sebebi
 * "ölçülemedi" diye yazar. Yarısını sessizce atlayıp yeşil basan bir takım, bu
 * projenin kaçındığı kusurun ta kendisidir ("yok" ≠ "bakılamadı").
 */
import { describe, expect, it } from "vitest";

import { registryFromEnv, type Transfer } from "@cry/chain";

/** Arşivden seçilmiş GERÇEK kayıtlar. Zincir verisi değişmez; beklenti sabittir. */
const TRON_USDT_TX = "0160aba5227ab9990f609225c69cb583cebdcf9fb594363c839a49bfaff74b73";
const TRON_USDT_TUTAR = "300000000"; // 300 USDT (6 ondalık)
const TRON_USDT_KIME = "TKmSRCjnzWBmY94VdHoX8TD3Whxa2zoZpf";
const TRON_USDT_SOZLESME = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const EVM_ADRES = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"; // vitalik.eth

const registry = registryFromEnv();

function hareketiDenetle(h: Transfer) {
  expect(h.txHash).toMatch(/^(0x)?[0-9a-fA-F]{64}$/);
  // Tutar HAM TAM SAYI ve METİN taşınır: `Number`'a uğrayan tutar rapora
  // `1.15e+53` diye düşüyordu (2^256-1 değerleri canlı veride var).
  expect(typeof h.amountRaw).toBe("string");
  expect(h.amountRaw).toMatch(/^\d+$/);
  // Ondalığı bilinmeyen varlık `?` olur; sembol HER ZAMAN bir şey söyler.
  expect(h.asset.symbol.length).toBeGreaterThan(0);
  // Zaman UTC ISO METİNdir (Date değil): serileştirme sırası hash'e giriyor.
  expect(h.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(Number.isFinite(Date.parse(h.ts))).toBe(true);
  // `index` kaynağın sırası, `occurrence` kimliğin kaynaktan BAĞIMSIZ parçası.
  expect(Number.isInteger(h.index)).toBe(true);
  expect(Number.isInteger(h.occurrence)).toBe(true);
  expect(h.occurrence).toBeGreaterThanOrEqual(0);
}

describe("TRON · TronGrid", () => {
  it("anahtar var (yoksa bu kaynak ÖLÇÜLEMEDİ, yeşil sayılmaz)", () => {
    expect(
      Boolean(process.env.TRONGRID_API_KEY),
      "TRONGRID_API_KEY boş: TRON kaynağı ölçülemedi",
    ).toBe(true);
  });

  it("tek işlem okuması TRC20 transferini GÖRÜR (olay ucu, sözleşme çağrısı değil)", async () => {
    const tx = await registry.get("tron").getTransaction(TRON_USDT_TX);
    expect(tx, "işlem kaynakta bulunamadı").not.toBeNull();
    expect(tx!.hash.toLowerCase()).toBe(TRON_USDT_TX);
    expect(tx!.success).toBe(true);
    // Asıl ölçüt: 0 hareket DÖNMEMELİ. `gettransactionbyid` tek başına bunu
    // yapıyordu ve gerçek bir USDT transferi "para hareket etmedi" diye okunurdu.
    expect(tx!.transfers.length).toBeGreaterThan(0);
    const usdt = tx!.transfers.find((h) => h.asset.contract === TRON_USDT_SOZLESME);
    expect(usdt, "USDT hareketi bu işlemde görünmüyor").toBeTruthy();
    expect(usdt!.amountRaw).toBe(TRON_USDT_TUTAR);
    expect(usdt!.to).toBe(TRON_USDT_KIME);
    // Sembol kimlik değildir, SÖZLEŞME kimliktir (arşivde "U S D T" adlı taklit var).
    expect(usdt!.asset.decimals).toBe(6);
    for (const h of tx!.transfers) hareketiDenetle(h);
  });

  it("adresin hareket listesi ESKİDEN YENİYE ve şekli tam gelir", async () => {
    const sayfa = await registry.get("tron").listTransfers(TRON_USDT_KIME, { limit: 25 });
    expect(sayfa.items.length).toBeGreaterThan(0);
    for (const h of sayfa.items) hareketiDenetle(h);
    const zamanlar = sayfa.items.map((h) => Date.parse(h.ts));
    expect(zamanlar).toEqual([...zamanlar].sort((a, b) => a - b));
  });

  it("adres özeti UYDURMAZ: bakiye ham metin ya da null", async () => {
    const ozet = await registry.get("tron").getAddressSummary(TRON_USDT_KIME);
    expect(ozet.address).toBe(TRON_USDT_KIME);
    // Bakiye HAM metin ya da null: "0" yazmak bakılmamış bir yeri boş gösterirdi.
    if (ozet.balanceRaw !== null) expect(ozet.balanceRaw).toMatch(/^\d+$/);
    for (const b of ozet.tokenBalances ?? []) expect(b.balanceRaw).toMatch(/^\d+$/);
  });
});

describe("EVM · Etherscan", () => {
  it("anahtar var (yoksa EVM kaynağı ÖLÇÜLEMEDİ)", () => {
    expect(
      Boolean(process.env.ETHERSCAN_API_KEY),
      "ETHERSCAN_API_KEY boş: EVM kaynağı ölçülemedi",
    ).toBe(true);
  });

  it("kapı doğru zincirleri açar: ethereum HAZIR, bsc DEĞİL", () => {
    expect(registry.hazirMi("ethereum")).toBe(true);
    expect(registry.hazirMi("bsc")).toBe(false);
  });

  it("gerçek bir adresin hareketleri okunur ve şekli tam gelir", async () => {
    const sayfa = await registry.get("ethereum").listTransfers(EVM_ADRES, { limit: 25 });
    expect(sayfa.items.length).toBeGreaterThan(0);
    for (const h of sayfa.items) hareketiDenetle(h);
  });

  it("aynı işlem tek işlem ucundan da okunur (iki yol aynı şeyi söyler)", async () => {
    const sayfa = await registry.get("ethereum").listTransfers(EVM_ADRES, { limit: 5 });
    const ilk = sayfa.items[0]!;
    const tx = await registry.get("ethereum").getTransaction(ilk.txHash);
    expect(tx, `işlem ${ilk.txHash} tek işlem ucunda yok`).not.toBeNull();
    expect(tx!.hash.toLowerCase()).toBe(ilk.txHash.toLowerCase());
  });

  it("BSC'nin HATASI veri gibi görünmez: 200 dönse de hata olarak çıkar", async () => {
    // Ücretsiz plan `chainid=56`yı kapsamıyor ve mesajı HTTP 200 ile `result`
    // alanında METİN olarak dönüyor. Kural burada ateşlenmeli; aksi hâlde
    // gerçek bir TRON işlemi "BSC'de var" diye raporlanır.
    await expect(registry.get("bsc").listTransfers(EVM_ADRES, { limit: 5 })).rejects.toThrow();
  });
});
