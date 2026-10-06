/**
 * YALNIZCA YEREL kip — kaynağa gitmeyen koşunun sınavı.
 *
 * Kullanıcı kararı (2026-10-06): koşular kendi makinesindeki blok indeksinden beslenmeli,
 * API'ye istek gitmemeli. Kipin değeri hızda değil, **ne söylediğinde**: pencere öncesine
 * bakılmadığı için cevap bir ALT SINIRdır ve bunu kendisi söylemek zorunda.
 *
 * Testler GERÇEK sınıfı koşturuyor; kuralın bir kopyası sınanmıyor. Kopya sınamak, iki
 * tarafın ayrı ayrı değişip sessizce ayrılmasına izin verirdi — bu projede ölçülmüş bir
 * tuzak ("bir kural bir yerde uygulanıp kardeşinde unutulabiliyor"). Kaynağa gidilip
 * gidilmediği, sarılan adaptörün ÇAĞRILIP çağrılmadığıyla ölçülüyor.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { indeksNotuMetni, yerelKapsam } from "../packages/motor/src/indeks-notu.js";

const PENCERE = {
  bas: 78_281_200,
  son: 86_880_316,
  zamanBas: Math.floor(Date.parse("2025-12-12T02:14:51Z") / 1000),
  zamanSon: Math.floor(Date.parse("2026-10-06T19:08:00Z") / 1000),
};

/** Pencere okuması ve indeks sorgusu ağ ister; ikisi de burada taklit ediliyor. */
const pencereOku = vi.fn(async () => PENCERE as unknown);
const adresHareketleri = vi.fn(async () => ({
  satirlar: [],
  imlec: { gelen: "bitti", giden: "bitti" },
}));

vi.mock("@cry/blok-indeks", () => ({
  ayarOku: () => ({ url: "yok", kullanici: "", sifre: "", veritabani: "cry" }),
  pencereOku: (...a: unknown[]) => pencereOku(...(a as [])),
  adresHareketleri: (...a: unknown[]) => adresHareketleri(...(a as [])),
  USDT_TRC20_HEX: "a614f803b6fd780986a42c78ec9c7f77e6ded13c",
}));

const { BlokIndeksliAdaptor } = await import("../apps/worker/src/blok-indeksli-adaptor.js");

/** Sarılan adaptör: çağrılırsa KAYNAĞA GİDİLMİŞ demektir. Test ölçütü budur. */
function sahteIcAdaptor() {
  return {
    chain: "tron" as const,
    family: "tron" as const,
    nativeAsset: { chain: "tron", contract: null, symbol: "TRX", decimals: 6 },
    capabilities: { activation: true },
    normalizeAddress: (a: string) => a,
    isValidAddress: () => true,
    getAddressSummary: vi.fn(async () => ({
      chain: "tron",
      address: "T1",
      exists: true,
      firstSeen: "2019-01-01T00:00:00Z",
      lastSeen: "2026-10-01T00:00:00Z",
      balanceRaw: "123",
      txCount: 5,
    })),
    listTransfers: vi.fn(async () => ({ items: [], nextCursor: null })),
    getTransaction: vi.fn(async () => null),
    getActivation: vi.fn(async () => ({ activatedBy: "T9", ts: null, txHash: null })),
  };
}

beforeEach(() => {
  pencereOku.mockClear();
  adresHareketleri.mockClear();
  pencereOku.mockResolvedValue(PENCERE as unknown);
});

describe("kip KAPALI — bugünkü davranış", () => {
  it("'bütün geçmiş' sorusu KAYNAĞA gider (koşuyu hız sınırına sokan yol)", async () => {
    const ic = sahteIcAdaptor();
    const a = new BlokIndeksliAdaptor(ic as never, undefined, {});
    await a.listTransfers("T1", {});
    expect(a.sonKullanim.kaynak).toBe("melez");
    expect(ic.listTransfers).toHaveBeenCalledTimes(1);
  });
});

describe("kip AÇIK — kaynağa HİÇ gidilmez", () => {
  it("aynı soru kaynağa gitmez, pencere dışı İŞARETLENİR", async () => {
    const ic = sahteIcAdaptor();
    const a = new BlokIndeksliAdaptor(ic as never, undefined, { yalnizYerel: true });
    await a.listTransfers("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", {});
    expect(ic.listTransfers).not.toHaveBeenCalled();
    expect(a.sonKullanim.kaynak).toBe("yalniz-yerel");
    expect(a.sonPencereDisi).toBe(true);
    expect(a.sonKullanim.sebep).toContain("ÖNCESİNE bakılmadı");
  });

  it("pencere içinden başlayan soru EKSİKSİZdir — işaret konmaz", async () => {
    const ic = sahteIcAdaptor();
    const a = new BlokIndeksliAdaptor(ic as never, undefined, { yalnizYerel: true });
    await a.listTransfers("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", { fromTs: "2026-05-01T00:00:00Z" });
    expect(a.sonPencereDisi).toBe(false);
    expect(ic.listTransfers).not.toHaveBeenCalled();
  });

  it("pencere OKUNAMAZSA cevap 'boş' değil BAKILAMADIdır", async () => {
    // ClickHouse'a ulaşılamamak "hareket yok" DEĞİLDİR; kaynağa da düşülemediği için
    // tek dürüst cevap işaretlemektir. Kaynağa gizlice düşmek kipin sözünü bozardı.
    pencereOku.mockRejectedValueOnce(new Error("motor kapalı"));
    const ic = sahteIcAdaptor();
    const a = new BlokIndeksliAdaptor(ic as never, undefined, { yalnizYerel: true });
    const sayfa = await a.listTransfers("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", {});
    expect(sayfa.items).toEqual([]);
    expect(ic.listTransfers).not.toHaveBeenCalled();
    expect(a.sonPencereDisi).toBe(true);
  });

  it("bakiye ve ilk/son görülme UYDURULMAZ: kaynağa sorulmaz, null döner", async () => {
    // Sıfır bakiye yazmak, bakılmamış bir yeri "boş" göstermekti.
    const ic = sahteIcAdaptor();
    const a = new BlokIndeksliAdaptor(ic as never, undefined, { yalnizYerel: true });
    const ozet = await a.getAddressSummary("T1");
    expect(ic.getAddressSummary).not.toHaveBeenCalled();
    expect(ozet).toMatchObject({ balanceRaw: null, firstSeen: null, lastSeen: null, txCount: null });
  });

  it("aktivasyon yöntemi hiç TANIMLANMAZ — karşılığı olmayan yetenek iddia edilmez", async () => {
    const ic = sahteIcAdaptor();
    const acik = new BlokIndeksliAdaptor(ic as never, undefined, {});
    const yerel = new BlokIndeksliAdaptor(ic as never, undefined, { yalnizYerel: true });
    expect(typeof acik.getActivation).toBe("function");
    expect(yerel.getActivation).toBeUndefined();
  });
});

describe("yerel kapsam kararı (saf)", () => {
  it("sayfalar bitti ama pencere öncesi varsa adres TAM değildir", () => {
    expect(yerelKapsam(true, true, null)).toEqual({ indexState: "kismi", not: "pencere_oncesi" });
  });

  it("pencere her şeyi kapsıyorsa tarama TAMdır ve not SİLİNİR", () => {
    expect(yerelKapsam(true, false, null)).toEqual({ indexState: "tam", not: null });
  });

  it("yarıda kalan tarama KENDİ sebebini korur", () => {
    // Sayfa bütçesi pencereden daha acil bir eksiktir: adres daha okunmayı bekliyor.
    expect(yerelKapsam(false, true, "sayfa_butcesi")).toEqual({
      indexState: "kismi",
      not: "sayfa_butcesi",
    });
    expect(yerelKapsam(false, false, null)).toEqual({ indexState: "kismi", not: null });
  });

  it("not EKRANA cümle olarak çıkar — kod tek başına kimseye bir şey anlatmaz", () => {
    const cumle = indeksNotuMetni("kismi", "pencere_oncesi") ?? "";
    expect(cumle).toContain("yerel");
    expect(cumle).toContain("BAKILMADI");
  });
});

describe("ekranın söyleyeceği cümleler (saf)", () => {
  it("kip kapalıyken söylenecek bir şey yok", async () => {
    const { yalnizYerelNotu } = await import("../apps/web/src/lib/kosu-durum.js");
    expect(yalnizYerelNotu(undefined)).toBeNull();
    expect(yalnizYerelNotu({ acik: false })).toBeNull();
  });

  it("kip açıkken pencere ve ALT SINIR söylenir", async () => {
    const { yalnizYerelNotu } = await import("../apps/web/src/lib/kosu-durum.js");
    const metin =
      yalnizYerelNotu({
        acik: true,
        pencere: { bas: "2025-12-12T02:14:51.000Z", son: "2026-10-06T19:29:03.000Z" },
        pencereDisiDugum: 22,
      }) ?? "";
    expect(metin).toContain("2025-12-12 → 2026-10-06");
    expect(metin).toContain("22 düğüm");
    expect(metin).toContain("ALT SINIR");
    expect(metin).toContain("hiç gidilmedi");
  });

  it("hiçbir düğüm dışarı taşmıyorsa bu da SÖYLENİR — sessizlik belirsizliktir", async () => {
    const { yalnizYerelNotu } = await import("../apps/web/src/lib/kosu-durum.js");
    const metin =
      yalnizYerelNotu({
        acik: true,
        pencere: { bas: "2025-12-12T00:00:00.000Z", son: "2026-10-06T00:00:00.000Z" },
        pencereDisiDugum: 0,
      }) ?? "";
    expect(metin).toContain("dışına uzanmıyor");
    expect(metin).not.toContain("ALT SINIR");
  });

  it("pencere okunamadıysa 'bilinmiyor' denir, boş geçilmez", async () => {
    const { yalnizYerelNotu } = await import("../apps/web/src/lib/kosu-durum.js");
    expect(yalnizYerelNotu({ acik: true, pencere: null }) ?? "").toContain("BİLİNMİYOR");
  });

  it("kökün etiketi durdurmadıysa da yazılır", async () => {
    const { kokEtiketiNotu } = await import("../apps/web/src/lib/kosu-durum.js");
    expect(kokEtiketiNotu(null)).toBeNull();
    const metin =
      kokEtiketiNotu({ sebep: "terminal_aday", etiketler: ["Servis cüzdanı adayı (toplayici)"] }) ?? "";
    expect(metin).toContain("borsa ADAYI");
    expect(metin).toContain("Servis cüzdanı adayı");
    expect(kokEtiketiNotu({ sebep: "terminal" }) ?? "").toContain("DOĞRULANMIŞ");
  });
});

describe("kökte durma kuralı (saf)", () => {
  it("borsa etiketleri kökü DURDURMAZ — adresi insan seçti", async () => {
    const { kokEtiketiDurdurmaz } = await import("../packages/motor/src/durma.js");
    expect(kokEtiketiDurdurmaz("terminal")).toBe(true);
    expect(kokEtiketiDurdurmaz("terminal_aday")).toBe(true);
  });

  it("yakma, sözleşme ve dallanma kökte de DURDURUR", async () => {
    // Biri paranın yok edildiğini söyler, ötekiler milyonlarca satırlık bir taramayı başlatırdı.
    const { kokEtiketiDurdurmaz } = await import("../packages/motor/src/durma.js");
    for (const s of ["yakildi", "kontrat", "dallanma", "indekssiz", "butce"] as const) {
      expect(kokEtiketiDurdurmaz(s)).toBe(false);
    }
    expect(kokEtiketiDurdurmaz(null)).toBe(false);
  });
});

describe("yerelde yeniden tarama kuralı (saf)", () => {
  it("hız sınırında yarım kalmış adres yeniden TARANIR", async () => {
    // Ölçüldü: kaynak hatası yüzünden `kismi` kalmış bir kök, eski kuralla bir daha hiç
    // taranmıyordu — koşu 1 düğüm/0 kenar veriyordu, oysa indekste 38.128 geleni vardı.
    const { yerelYenidenTara } = await import("../packages/motor/src/indeks-notu.js");
    expect(yerelYenidenTara("kismi", "hiz_siniri")).toBe(true);
    expect(yerelYenidenTara("kismi", "kaynak_hatasi")).toBe(true);
    expect(yerelYenidenTara("bilinmiyor", null)).toBe(true);
  });

  it("tam tarama ve yerelde bitmiş tarama yeniden taranmaz", async () => {
    const { yerelYenidenTara } = await import("../packages/motor/src/indeks-notu.js");
    expect(yerelYenidenTara("tam", null)).toBe(false);
    expect(yerelYenidenTara("kismi", "pencere_oncesi")).toBe(false);
  });
});
