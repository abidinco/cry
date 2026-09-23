import { describe, expect, it } from "vitest";
import {
  servisAdaylari,
  VARSAYILAN_KESIF,
  type AdresIstatistigi,
} from "../packages/etiket/src/kesif";
import {
  durmaSebebi,
  kosuDurmaSebebi,
  VARSAYILAN_ESIKLER,
} from "../packages/motor/src/durma";

function ist(p: Partial<AdresIstatistigi> & { address: string }): AdresIstatistigi {
  return {
    indeksDurumu: "tam",
    gonderenSayisi: 0,
    aliciSayisi: 0,
    hareketSayisi: 0,
    ...p,
  };
}

describe("yapısal keşif", () => {
  it("taranmamış adres ADAY DEĞİLDİR — 'küçük' değil, 'bakılmadı'", () => {
    const s = servisAdaylari([
      ist({ address: "A", indeksDurumu: "bilinmiyor", gonderenSayisi: 2, aliciSayisi: 1 }),
    ]);
    expect(s.adaylar).toHaveLength(0);
    expect(s.bakilmadi).toBe(1);
    expect(s.eşiginAltinda).toBe(0);
  });

  it("kısmi taramanın sayısı ALT SINIRDIR: eşiği zaten aşıyorsa aday olur", () => {
    const s = servisAdaylari([
      ist({ address: "A", indeksDurumu: "kismi", gonderenSayisi: 14, aliciSayisi: 2248 }),
    ]);
    expect(s.adaylar[0]!.altSinirMi).toBe(true);
    expect(s.adaylar[0]!.gerekce[0]).toContain("ALT SINIR");
  });

  it("alt sınır, ölçümden ZAYIF kanıttır: aynı sayıda güven daha düşük", () => {
    const [tam] = servisAdaylari([
      ist({ address: "A", gonderenSayisi: 300, aliciSayisi: 5 }),
    ]).adaylar;
    const [kismi] = servisAdaylari([
      ist({ address: "A", indeksDurumu: "kismi", gonderenSayisi: 300, aliciSayisi: 5 }),
    ]).adaylar;
    expect(kismi!.guven).toBeLessThan(tam!.guven);
  });

  it("şekli yön belirler", () => {
    const s = servisAdaylari([
      ist({ address: "T", gonderenSayisi: 300, aliciSayisi: 3 }),
      ist({ address: "D", gonderenSayisi: 2, aliciSayisi: 300 }),
      ist({ address: "G", gonderenSayisi: 300, aliciSayisi: 300 }),
    ]);
    const sekil = Object.fromEntries(s.adaylar.map((a) => [a.address, a.sekil]));
    expect(sekil).toEqual({ T: "toplayici", D: "dagitici", G: "gecis" });
  });

  it("eşiğin altındaki ölçülebilir adres SAYILIR, sessizce kaybolmaz", () => {
    const s = servisAdaylari([ist({ address: "A", gonderenSayisi: 10, aliciSayisi: 4 })]);
    expect(s.adaylar).toHaveLength(0);
    expect(s.eşiginAltinda).toBe(1);
  });

  it("sayım eşiksiz kalır — gerekçe HAM sayıyı ve tozun payını birlikte söyler", () => {
    // Gerçek pencereden (2026-09-17): 3.069 göndericinin 3.053'ü yalnızca toz gönderdi.
    const [c] = servisAdaylari([
      ist({
        address: "A", indeksDurumu: "kismi", altSinirNotu: "blok indeksi penceresi",
        gonderenSayisi: 3069, tozGonderenSayisi: 3053, aliciSayisi: 128231, tozAliciSayisi: 0,
      }),
    ]).adaylar;
    expect(c!.gerekce[0]).toBe(
      "3069 farklı adresten alıyor (3053'i yalnızca toz → gerçek 16), 128231 farklı adrese gönderiyor (blok indeksi penceresi — bunlar ALT SINIR)",
    );
    // Toz sayısı BİLİNMİYORSA toplam kullanılır (arşiv keşfi böyle) ve gerekçe sessiz kalır.
    const [tozsuz] = servisAdaylari([
      ist({ address: "A", indeksDurumu: "kismi", gonderenSayisi: 3069, aliciSayisi: 128231 }),
    ]).adaylar;
    expect(tozsuz!.gerekce[0]).toContain("(kısmi tarama — bunlar ALT SINIR)");
    expect(tozsuz!.gerekce[0]).not.toContain("toz");
  });

  it("ŞEKİL ölçütü tozu SAYMAZ: zehirleyici 'dağıtıcı servis' sayılmaz", () => {
    // Gerçek adres (M5, 2026-09-23): TWDDUF6J… 20.087 adrese gönderiyor, 20.085'i yalnızca toz.
    // Yani GERÇEK alıcısı 2. Toz dahil sayılınca eşiğin 400 katıydı ve `exchange_hot` yazılacaktı;
    // oysa bu adres bir servis cüzdanı değil, adres zehirlemenin KAYNAĞI.
    const s = servisAdaylari([
      ist({
        address: "Z", indeksDurumu: "kismi", altSinirNotu: "blok indeksi penceresi",
        gonderenSayisi: 1, tozGonderenSayisi: 1, aliciSayisi: 20087, tozAliciSayisi: 20085,
        hareketSayisi: 20100,
      }),
    ]);
    expect(s.adaylar).toHaveLength(0);
    expect(s.eşiginAltinda).toBe(1);
  });

  it("toz bir yönü şişirince ŞEKİL de yanlış çıkıyordu: geçiş sanılan adres dağıtıcıymış", () => {
    // 126 günlük pencerede ikisinde de aday kalan 95 adresin şekli bu yüzden değişti.
    const [c] = servisAdaylari([
      ist({
        address: "A", indeksDurumu: "kismi",
        gonderenSayisi: 400, tozGonderenSayisi: 380, aliciSayisi: 300, tozAliciSayisi: 0,
      }),
    ]).adaylar;
    expect(c!.sekil).toBe("dagitici");
  });

  it("eşik bir SEÇİMDİR: değiştirilince sonuç değişir", () => {
    const g = [ist({ address: "A", gonderenSayisi: 60, aliciSayisi: 1 })];
    expect(servisAdaylari(g, VARSAYILAN_KESIF).adaylar).toHaveLength(1);
    expect(servisAdaylari(g, { karsiTarafEsigi: 100, gecisEsigi: 200 }).adaylar).toHaveLength(0);
  });
});

describe("doğrulanmamış borsa etiketi ayrı bir durma sebebidir", () => {
  const temel = {
    adres: "A",
    hop: 1,
    cikisSayisi: 2,
    izliTutar: 100n,
    sozlesmeMi: false,
    indekslendiMi: true,
  };

  it("doğrulanmış etiket → terminal", () => {
    const s = durmaSebebi(
      { ...temel, borsaMi: true, borsaEtiketiDogrulanmisMi: true },
      VARSAYILAN_ESIKLER,
      1,
    );
    expect(s).toBe("terminal");
  });

  it("doğrulanmamış etiket → terminal_aday (yine durur, iddia zayıf)", () => {
    const s = durmaSebebi(
      { ...temel, borsaMi: true, borsaEtiketiDogrulanmisMi: false },
      VARSAYILAN_ESIKLER,
      1,
    );
    expect(s).toBe("terminal_aday");
  });

  it("ikisi de bütçeden ÖNCE gelir: rapor asıl bulguyu kaybetmez", () => {
    const s = durmaSebebi(
      { ...temel, hop: 99, borsaMi: true, borsaEtiketiDogrulanmisMi: false },
      VARSAYILAN_ESIKLER,
      9999,
    );
    expect(s).toBe("terminal_aday");
  });
});

describe("koşunun BAŞLIK durma sebebi", () => {
  it("borsaya varıldıysa başlık bütçe DEĞİLDİR — az sayıda olsa bile", () => {
    // Gerçek koşudan (2026-09-09): 11 düğüm bütçede bitti, 2 düğüm borsa
    // adayına vardı. Asıl bulgu ikincisi.
    expect(kosuDurmaSebebi({ butce: 11, terminal_aday: 2, dallanma: 2 })).toBe("terminal_aday");
  });

  it("doğrulanmış terminal, adayın önündedir", () => {
    expect(kosuDurmaSebebi({ terminal_aday: 9, terminal: 1 })).toBe("terminal");
  });

  it("terminal yoksa en sık sebep başlıktır", () => {
    expect(kosuDurmaSebebi({ butce: 3, dallanma: 7 })).toBe("dallanma");
  });

  it("hiç durma yoksa null", () => {
    expect(kosuDurmaSebebi({})).toBeNull();
  });
});
