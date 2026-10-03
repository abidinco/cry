/**
 * İzleme servisinin TRON okuması — saf çevirici katmanı.
 *
 * Burada sınanan şey ağ değil, **kaynağın şeklinin doğru okunması**: ondalığı
 * uydurmamak, bir işlemdeki ikinci hareketi düşürmemek ve hex adresi base58'e
 * çevirirken ana yığının adaptörüyle AYNI cevabı vermek. Servis derleme adımı
 * olmadan koştuğu için bu kod `@cry/chain`i içe aktaramıyor; iki kez yazılan
 * bir kuralın sapmadığı ancak testle söylenebilir.
 */
import { describe, expect, it } from "vitest";
import { hexToBase58 as hexToBase58Ts } from "../packages/chain/src/tron-address.js";
// İzleme servisinin kaynağı düz JS (sunucuda derleme yok): tip bildirimi yok.
// @ts-expect-error -- düz JS modülü
import { hexToBase58, kimlikVer, nativeCevir, trc20Cevir } from "../apps/watcher/src/tron.js";

const USDT_SOZLESME = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const USDT_HEX = "41a614f803b6fd780986a42c78ec9c7f77e6ded13c";
const ADRES = "TAdresIzlenen";

describe("hex → base58", () => {
  it("ana yığının adaptörüyle AYNI cevabı verir", () => {
    expect(hexToBase58(USDT_HEX)).toBe(USDT_SOZLESME);
    expect(hexToBase58(USDT_HEX)).toBe(hexToBase58Ts(USDT_HEX));
  });

  it("geçersiz girdide null — patlamaz, UYDURMAZ", () => {
    expect(hexToBase58("")).toBeNull();
    expect(hexToBase58("deadbeef")).toBeNull();
    expect(hexToBase58(undefined)).toBeNull();
  });
});

describe("TRC20 çevirisi", () => {
  const kayit = (over: Record<string, unknown> = {}) => ({
    transaction_id: "tx1",
    block_timestamp: 1_767_222_000_000,
    from: "TGonderen",
    to: ADRES,
    value: "1500000",
    token_info: { symbol: "USDT", address: USDT_SOZLESME, decimals: 6, name: "Tether USD" },
    ...over,
  });

  it("yön alıcıya göre belirlenir", () => {
    expect(trc20Cevir(kayit(), ADRES).direction).toBe("gelen");
    expect(trc20Cevir(kayit({ to: "TBaska", from: ADRES }), ADRES).direction).toBe("giden");
  });

  it("tutar HAM metin olarak taşınır", () => {
    const h = trc20Cevir(kayit({ value: "115792089237316195423570985008687907853269984665640564039457584007913129639935" }), ADRES);
    expect(h.amountRaw).toBe("115792089237316195423570985008687907853269984665640564039457584007913129639935");
    expect(typeof h.amountRaw).toBe("string");
  });

  it("ad ve sembol birlikte boşsa ondalık UYDURULMAZ", () => {
    // Ölçüldü (EVM tarafında): boş ad/sembol + decimals "1". O "1" ile çevrilen
    // tutar 34 milyar kat yanlış bir büyüklük gösterirdi.
    const h = trc20Cevir(kayit({ token_info: { name: "", symbol: "", decimals: 1 } }), ADRES);
    expect(h.ondalik).toBeNull();
    expect(h.assetSymbol).toBe("?");
  });
});

describe("yerli (TRX) çevirisi", () => {
  const trx = {
    txID: "txn1",
    block_timestamp: 1_767_222_000_000,
    ret: [{ contractRet: "SUCCESS" }],
    raw_data: {
      contract: [
        {
          type: "TransferContract",
          parameter: { value: { amount: 4_500_000, owner_address: USDT_HEX, to_address: USDT_HEX } },
        },
      ],
    },
  };

  it("TransferContract 6 ondalıklı TRX olur", () => {
    const h = nativeCevir(trx, USDT_SOZLESME);
    expect(h).toMatchObject({ assetSymbol: "TRX", ondalik: 6, amountRaw: "4500000" });
  });

  it("tanınmayan sözleşme türü null — 'hareket yok' DEMEZ, hareket ÜRETMEZ", () => {
    // `nativeCevir` bir EKSİKSİZLİK iddiası değildir: sözleşme çağrısının
    // taşıdığı TRX (`call_value`) ve iç transferler bu uçta görünmüyor.
    const cagri = { ...trx, raw_data: { contract: [{ type: "TriggerSmartContract" }] } };
    expect(nativeCevir(cagri, USDT_SOZLESME)).toBeNull();
  });
});

describe("hareket kimliği", () => {
  const h = (over: Record<string, unknown> = {}) => ({
    txHash: "tx1",
    from: "A",
    to: "B",
    assetSymbol: "USDT",
    amountRaw: "100",
    direction: "gelen",
    ...over,
  });

  it("aynı işlemde birebir aynı hareketler AYRI kimlik alır", () => {
    // Ölçüldü: bir işlemde birebir aynı 20 Transfer olayı var ve yirmisi de
    // gerçek. Tekillik yalnızca tx'ten kurulsaydı 19'u sessizce düşerdi.
    const kimlikler = kimlikVer([h(), h(), h()]).map((k: { movementKey: string }) => k.movementKey);
    expect(new Set(kimlikler).size).toBe(3);
    expect(kimlikler).toEqual(["USDT|gelen|0", "USDT|gelen|1", "USDT|gelen|2"]);
  });

  it("farklı dörtlüler ayrı sayaç tutar — kimlik SIRAYA bağlı değil", () => {
    const a = kimlikVer([h(), h({ amountRaw: "200" }), h()]);
    const b = kimlikVer([h(), h(), h({ amountRaw: "200" })]);
    // Aynı kümenin iki ayrı sırası, aynı kimlik kümesini verir.
    expect(new Set(a.map((k: { movementKey: string }) => k.movementKey))).toEqual(
      new Set(b.map((k: { movementKey: string }) => k.movementKey)),
    );
  });

  it("yön kimliğin parçası: aynı tutar gelen ve giden olabilir", () => {
    const [x, y] = kimlikVer([h(), h({ direction: "giden" })]);
    expect(x.movementKey).not.toBe(y.movementKey);
  });
});
