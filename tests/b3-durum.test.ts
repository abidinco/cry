import { describe, expect, it } from "vitest";
import { b3Dogrula, b3Gorunum, BAYAT_SAAT, type B3Olcumu } from "../apps/web/src/lib/b3-durum.js";
import { ACIK_YOLLAR } from "../apps/web/src/middleware.js";

// Karar masasındaki gerçek kayıttan (2026-10-12): kapı bu şekli KABUL etmeli.
const GERCEK = {
  bosluk: 11,
  cephe: 75211157,
  diskBos: "1.631 GiB",
  hiz: 11.43,
  indeksDiski: "213,14 GiB",
  kalan: 75211156,
  kalanSure: "~88,1 gün",
  kaynak: "ClickHouse",
  not: "x",
  satir: 5585543665,
  satirMetni: "5,59 milyar",
  surec: "calisiyor",
  ts: "2026-10-12T14:15:30.000Z",
  uc: 87047134,
  yazilan: 11820317,
  id: "b3",
};

describe("B3 ölçümü kapıda", () => {
  it("masadaki gerçek kayıt kabul edilir, fazladan alan atılır", () => {
    const s = b3Dogrula(GERCEK);
    expect("olcum" in s).toBe(true);
    if ("olcum" in s) expect(s.olcum).not.toHaveProperty("id");
  });

  it("bozuk sayı 0'a çekilmez, REDDEDİLİR", () => {
    expect("hata" in b3Dogrula({ ...GERCEK, yazilan: "11820317" })).toBe(true);
    expect("hata" in b3Dogrula({ ...GERCEK, kalan: -1 })).toBe(true);
    expect("hata" in b3Dogrula({ ...GERCEK, hiz: Number.NaN })).toBe(true);
  });

  it("bilinmeyen süreç ve bozuk zaman reddedilir", () => {
    expect("hata" in b3Dogrula({ ...GERCEK, surec: "bitti" })).toBe(true);
    expect("hata" in b3Dogrula({ ...GERCEK, ts: "dün" })).toBe(true);
    expect("hata" in b3Dogrula({ ...GERCEK, ts: "2099-01-01T00:00:00Z" })).toBe(true);
  });

  it("ölçülemeyen alan null kalır, uydurulmaz", () => {
    const s = b3Dogrula({ surec: "bilinmiyor", ts: GERCEK.ts });
    expect("olcum" in s && s.olcum.yazilan).toBe(null);
  });

  it("uç jetonla korunan kapı listesinde", () => {
    expect(ACIK_YOLLAR).toContain("/api/durum/b3");
  });

  it("jetonsuz istek 401 verir — kapıyı açmak YETMEZ", async () => {
    const { POST } = await import("../apps/web/src/app/api/durum/b3/route.js");
    const y = await POST(new Request("http://x/api/durum/b3", { method: "POST", body: "{}" }));
    expect(y.status).toBe(401);
  });
});

describe("B3 görünümü", () => {
  const o = (b3Dogrula(GERCEK) as { olcum: B3Olcumu }).olcum;

  it("yüzde yazılan/uç'tan, Türkçe biçimde", () => {
    const g = b3Gorunum(o, new Date(GERCEK.ts));
    expect(g.yuzde).toBe("13,6%");
    expect(g.bayat).toBe(false);
  });

  it(`${BAYAT_SAAT} saatten eski ölçüm bayat işaretlenir`, () => {
    const g = b3Gorunum(o, new Date(new Date(GERCEK.ts).getTime() + 9 * 3_600_000));
    expect(g.bayat).toBe(true);
  });

  it("uç bilinmiyorsa yüzde '—' (çubuk uydurulmaz)", () => {
    const g = b3Gorunum({ ...o, uc: null }, new Date(GERCEK.ts));
    expect(g.oran).toBe(null);
    expect(g.yuzde).toBe("—");
  });
});
