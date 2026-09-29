import { describe, expect, it } from "vitest";
import { indeksNotuMetni, kaydedilecekNot, notaCevir, yenidenDenemeyeDeger } from "@cry/motor";
import { ChainSourceError } from "@cry/chain";

describe("indeks notu — 'kısmi' tek başına sebebi söylemiyordu", () => {
  it("tam taramada not YOKTUR", () => {
    expect(indeksNotuMetni("tam", null)).toBeNull();
    // Biten tur eski notu siler; yine de gelirse cümle üretilmez.
    expect(indeksNotuMetni("tam", "hiz_siniri")).toBeNull();
  });

  it("hiç bakılmamış adres bir EKSİKLİK değildir", () => {
    expect(indeksNotuMetni("bilinmiyor", null)).toBeNull();
  });

  it("her sebep kendi cümlesini verir ve birbirinden AYRIDIR", () => {
    expect(indeksNotuMetni("kismi", "hiz_siniri")).toContain("hız sınırı");
    expect(indeksNotuMetni("kismi", "sayfa_butcesi")).toContain("devamı var");
    expect(indeksNotuMetni("kismi", "kaynak_hatasi")).toContain("işe yaramayabilir");
    expect(indeksNotuMetni("kismi", "adaptor_yok")).toContain("bakılamadı");
  });

  // Sebebi kayıtlı olmayan eski kayıt "temiz" görünmemeli: eksik olduğunu ve sebebin
  // BİLİNMEDİĞİNİ ayrı ayrı söyler.
  it("sebebi kayıtlı olmayan kısmi tarama sessiz KALMAZ", () => {
    expect(indeksNotuMetni("kismi", null)).toBe("yarıda kaldı, sebebi kayıtlı değil");
  });

  it("tanınmayan kod yutulmaz, olduğu gibi gösterilir", () => {
    expect(indeksNotuMetni("kismi", "yeni_sebep")).toBe("yarıda kaldı: yeni_sebep");
  });

  it("yeniden deneme yalnızca işe yarayacağı yerde önerilir", () => {
    expect(yenidenDenemeyeDeger("hiz_siniri")).toBe(true);
    expect(yenidenDenemeyeDeger("sayfa_butcesi")).toBe(true);
    expect(yenidenDenemeyeDeger("kaynak_hatasi")).toBe(false);
    expect(yenidenDenemeyeDeger("adaptor_yok")).toBe(false);
    expect(yenidenDenemeyeDeger(null)).toBe(false);
  });
});

describe("notaCevir — hız sınırı ile kalıcı hata AYNI şey değildir", () => {
  const hata = (mesaj: string, opts: Record<string, unknown> = {}) =>
    new ChainSourceError(mesaj, { chain: "tron", ...opts } as never);

  it("429 ve 503 hız sınırıdır: bekle, vazgeçme", () => {
    expect(notaCevir(hata("hız sınırı (429)", { status: 429 }))).toBe("hiz_siniri");
    expect(notaCevir(hata("hız sınırı (503)", { status: 503 }))).toBe("hiz_siniri");
    expect(notaCevir(hata("her neyse", { rateLimited: true }))).toBe("hiz_siniri");
  });

  // `http.ts` denemeler tükenince durum kodunu TAŞIMAYAN bir hata atıyor; sebep metinde kalıyor.
  it("durum kodu taşımayan sarmalayıcıda sebep METİNDEN okunur", () => {
    expect(notaCevir(hata("4 denemede alınamadı: hız sınırı (429)"))).toBe("hiz_siniri");
  });

  // ÖLÇÜLDÜ (2026-09-29, gerçek 429): `http.ts` denemeler tükenince SARMALAYAN bir hata atıyor ve
  // o sarmalayıcıda durum kodu yok — 429 yalnızca `cause`'ta. Yalnızca en dıştakine bakan sürüm
  // kayda "kaynak_hatasi" yazmıştı, yani "bekle" yerine "boşuna deneme" demiş olurdu.
  it("sebep ZİNCİRİN içindeyse de bulunur", () => {
    const ic = hata("hız sınırı (429)", { status: 429, rateLimited: true });
    expect(notaCevir(hata("4 denemede alınamadı: https://api.trongrid.io/v1/...", { cause: ic }))).toBe("hiz_siniri");
  });

  it("zincirin dibindeki kalıcı hata hız sınırı SAYILMAZ", () => {
    const ic = hata("HTTP 400: fingerprint does not match", { status: 400 });
    expect(notaCevir(hata("4 denemede alınamadı: https://x/", { cause: ic }))).toBe("kaynak_hatasi");
  });

  it("4xx kalıcıdır ve hız sınırıyla karıştırılmaz", () => {
    expect(notaCevir(hata("HTTP 400: fingerprint does not match", { status: 400 }))).toBe("kaynak_hatasi");
  });

  it("iptal ayrı bir cevaptır — 'kaynak bozuk' demek değildir", () => {
    const iptal = new Error("durduruldu");
    iptal.name = "AbortError";
    expect(notaCevir(iptal)).toBe("iptal");
  });

  it("tanımadığı her şey kaynak hatasıdır — sessizce 'bitti' sayılmaz", () => {
    expect(notaCevir(new TypeError("beklenmeyen"))).toBe("kaynak_hatasi");
  });
});

describe("kaydedilecekNot — biten tur eski notu SİLER", () => {
  it("tamamlanan turda not yazılmaz", () => {
    expect(kaydedilecekNot(true, "hiz_siniri")).toBeNull();
    expect(kaydedilecekNot(true, null)).toBeNull();
  });

  // Aksi hâlde dün hız sınırına takılmış bir adres, bugün tam taransa bile ekranda
  // "hız sınırına takıldı" demeye devam ederdi: bakılmış bir yeri bakılmamış göstermek.
  it("yarıda kalan turda sebep korunur", () => {
    expect(kaydedilecekNot(false, "sayfa_butcesi")).toBe("sayfa_butcesi");
    expect(kaydedilecekNot(false, null)).toBeNull();
  });
});
