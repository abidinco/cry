import { describe, expect, it } from "vitest";
import { sayfaGecisiMi, sonrakiIlerleme, surenIs, yuklemeBaslat, yuklemeDinle, yuklemeIzle } from "@/lib/yukleme";

const KONUM = { origin: "http://localhost:3005", pathname: "/takip/7", search: "" };
const SOL = { button: 0, ctrl: false, meta: false, shift: false, alt: false };
const a = (href: string, target = "", download = false) => ({ href, target, download });

describe("hangi tıklama çubuğu başlatır", () => {
  it("aynı sitede başka bir sayfa: evet", () => {
    expect(sayfaGecisiMi(a("http://localhost:3005/adres/tron/TX"), KONUM, SOL)).toBe(true);
  });
  it("yeni sekme, değiştirici tuş, orta tık, indirme: hayır — sayfa gitmiyor", () => {
    expect(sayfaGecisiMi(a("/adres/tron/TX", "_blank"), KONUM, SOL)).toBe(false);
    expect(sayfaGecisiMi(a("/adres/tron/TX"), KONUM, { ...SOL, ctrl: true })).toBe(false);
    expect(sayfaGecisiMi(a("/adres/tron/TX"), KONUM, { ...SOL, button: 1 })).toBe(false);
    expect(sayfaGecisiMi(a("/rapor.pdf", "", true), KONUM, SOL)).toBe(false);
  });
  it("başka site ya da yalnızca çapa: hayır", () => {
    expect(sayfaGecisiMi(a("https://tronscan.org/#/address/TX"), KONUM, SOL)).toBe(false);
    expect(sayfaGecisiMi(a("http://localhost:3005/takip/7#defter"), KONUM, SOL)).toBe(false);
  });
});

describe("iş sayacı", () => {
  it("her iş bir kez biter; ikinci bitirme sayacı eksiye düşürmez", () => {
    const olaylar: number[] = [];
    const birak = yuklemeDinle((n) => olaylar.push(n));
    const bitir = yuklemeBaslat();
    expect(surenIs()).toBe(1);
    bitir();
    bitir();
    expect(surenIs()).toBe(0);
    birak();
    expect(olaylar).toEqual([0, 1, 0]);
  });
  it("hatalı söz de işi bitirir — çubuk asılı kalmaz", async () => {
    await expect(yuklemeIzle(Promise.reject(new Error("ağ")))).rejects.toThrow("ağ");
    expect(surenIs()).toBe(0);
  });
  it("ilerleme %90'a yaklaşır ama ulaşmaz: bitişi yalnızca iş söyler", () => {
    let x = 0.08;
    for (let i = 0; i < 500; i++) x = sonrakiIlerleme(x);
    expect(x).toBeLessThan(0.9);
    expect(x).toBeGreaterThan(0.89);
  });
});
