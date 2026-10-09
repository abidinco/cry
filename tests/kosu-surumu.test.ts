/**
 * Koşunun SÜRÜM DAMGASI (öneri 14).
 *
 * Bir taramanın sonucu o gün çalışan koda bağlı; eşikler ve atıf kuralı kayıtta
 * zaten vardı, eksik olan kodun kendisiydi. Testlerin derdi tek bir cümle:
 * **uydurma yok.** Damga okunamıyorsa cevap "bilinmiyor"dur ve rapor bunu söyler.
 */
import { describe, expect, it } from "vitest";

import { kisaSurum, surumCumlesi, surumDamgasi } from "../packages/motor/src/surum.js";
import { kosununSurumu, metodoloji } from "@cry/rapor";

const SHA = "8ecdd6d1234567890abcdef1234567890abcdef0";

describe("sürüm damgası", () => {
  it("ortam değişkeni varsa onu kullanır ve 12 haneye kısaltır", () => {
    const d = surumDamgasi(SHA, "ffffffffffffffffffffffffffffffffffffffff");
    expect(d).toEqual({ sha: SHA, kisa: "8ecdd6d12345", kaynak: "ortam" });
  });

  it("ortam yoksa git başına düşer", () => {
    expect(surumDamgasi(undefined, SHA).kaynak).toBe("git");
    expect(surumDamgasi("   ", SHA).kaynak).toBe("git");
  });

  it("hiçbir kaynak yoksa UYDURMAZ: bilinmiyor", () => {
    const d = surumDamgasi(undefined, null);
    expect(d).toEqual({ sha: null, kisa: "bilinmiyor", kaynak: "bilinmiyor" });
  });

  it("çözülmemiş şablonu sürüm SAYMAZ", () => {
    // `ENV CRY_SURUM=$CRY_SURUM` boş bir build arg ile geçerse ekrana
    // `${GITHUB_SHA}` basmak, damganın kendisinden daha kötü olurdu.
    expect(surumDamgasi("${GITHUB_SHA}", null).kaynak).toBe("bilinmiyor");
    expect(surumDamgasi("$CRY_SURUM", null).kaynak).toBe("bilinmiyor");
    expect(surumDamgasi("", null).kaynak).toBe("bilinmiyor");
  });

  it("satır sonu ve boşluk yapışması aynı sürümü iki metin yapmaz", () => {
    expect(surumDamgasi(` ${SHA}\n`, null).sha).toBe(SHA);
  });

  it("sha olmayan damgayı kısaltmaz (etiket de olabilir)", () => {
    expect(kisaSurum("v1.2.3")).toBe("v1.2.3");
    expect(kisaSurum(SHA)).toBe("8ecdd6d12345");
  });

  it("cümle, damga yoksa bunun NE ANLAMA geldiğini söyler", () => {
    expect(surumCumlesi(null)).toContain("BİLİNMİYOR");
    expect(surumCumlesi(surumDamgasi(undefined, null))).toContain("kurallardan mı koddan mı");
    expect(surumCumlesi(surumDamgasi(SHA, null))).toContain("8ecdd6d12345");
  });
});

describe("raporun metodoloji satırı", () => {
  it("koşu kaydındaki damgayı okur", () => {
    const d = kosununSurumu({ surum: { sha: SHA, kisa: "8ecdd6d12345", kaynak: "ortam" } });
    expect(d?.kisa).toBe("8ecdd6d12345");
    expect(metodoloji("fifo", [], d).kodSurumu).toBe("8ecdd6d12345");
  });

  it("damgası OLMAYAN eski koşuda sessiz kalmaz", () => {
    for (const istatistik of [null, {}, { surum: null }, { surum: "8ecdd6d" }]) {
      expect(kosununSurumu(istatistik)).toBeNull();
    }
    const m = metodoloji("fifo", [], kosununSurumu({}));
    expect(m.kodSurumu).toBeNull();
    expect(m.kodSurumuCumlesi).toContain("BİLİNMİYOR");
  });
});
