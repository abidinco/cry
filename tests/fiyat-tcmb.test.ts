import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { tcmbCevir, tcmbDurumu, tcmbUrl, yazilacakKur, TCMB_KAYNAK } from "@cry/fiyat";

const fixture = (ad: string) =>
  readFileSync(path.join(import.meta.dirname, "fixtures", ad), "utf8");

describe("TCMB bülteni", () => {
  it("adres gün-ay-yıl kurar", () => {
    expect(tcmbUrl("2026-09-29")).toBe("https://www.tcmb.gov.tr/kurlar/202609/29092026.xml");
    expect(tcmbUrl("2015-09-28")).toBe("https://www.tcmb.gov.tr/kurlar/201509/28092015.xml");
  });

  it("gerçek bültenden dört kuru da okur", () => {
    const y = tcmbCevir(fixture("tcmb-20260929.xml"));
    expect(y.sonuc).toBe("bulundu");
    if (y.sonuc !== "bulundu") return;
    expect(y.kur.tarih).toBe("2026-09-29");
    expect(y.kur.bultenNo).toBe("2026/183");
    expect(y.kur.dovizAlis).toBe("48.9131");
    expect(y.kur.dovizSatis).toBe("49.0013");
    expect(y.kur.efektifAlis).toBe("48.8789");
    expect(y.kur.efektifSatis).toBe("49.0748");
  });

  it("eski bülteni de aynı şekilde okur (2022)", () => {
    const y = tcmbCevir(fixture("tcmb-20220615.xml"));
    expect(y.sonuc).toBe("bulundu");
    if (y.sonuc !== "bulundu") return;
    expect(y.kur.tarih).toBe("2022-06-15");
    expect(y.kur.dovizAlis).toBe("17.2568");
  });

  it("yazılacak kur DÖVİZ ALIŞTIR ve kaynak adı bunu söyler", () => {
    const y = tcmbCevir(fixture("tcmb-20260929.xml"));
    if (y.sonuc !== "bulundu") throw new Error("bülten okunamadı");
    expect(yazilacakKur(y.kur)).toBe("48.9131");
    expect(TCMB_KAYNAK).toContain("alis");
  });

  /**
   * En pahalı tuzak: `today.xml` (ve genel olarak bir adres) sorulan günün
   * bültenini verdiğini GARANTİ ETMEZ. Ölçüldü 2026-09-30 00:14'te: today.xml
   * hâlâ 29.09.2026 diyordu. Tarih gövdeden okunmalı.
   */
  it("tarihi GÖVDEDEN okur, adresten değil", () => {
    const y = tcmbCevir(fixture("tcmb-20260929.xml"));
    if (y.sonuc !== "bulundu") throw new Error("bülten okunamadı");
    // 30 Eylül istenmiş olsa bile cevap 29 Eylül'dür; yazan taraf buna bakar.
    expect(y.kur.tarih).not.toBe("2026-09-30");
  });

  it("404 hata DEĞİL, 'yayınlanmadı'dır (hafta sonu / resmî tatil)", () => {
    const y = tcmbDurumu(404, "<html>Sayfa Goruntulenemedi</html>");
    expect(y.sonuc).toBe("yayinlanmadi");
  });

  it("429 yeniden denenebilir, 500 hata", () => {
    expect(tcmbDurumu(429, "").sonuc).toBe("hiz_siniri");
    expect(tcmbDurumu(500, "").sonuc).toBe("kaynak_hatasi");
  });

  /**
   * TCMB kimi para birimini 100 birim üzerinden yazıyor (JPY). USD bugün 1,
   * ama bu bir ölçüm; birim değişirse 100 kat yanlış bir kur yazmaktansa
   * hata verilir.
   */
  it("USD birimi 1 değilse kur YAZILMAZ", () => {
    const bozuk = fixture("tcmb-20260929.xml").replace(
      /(<Currency[^>]*Kod="USD"[^>]*>\s*<Unit>)1(<\/Unit>)/,
      "$1100$2",
    );
    const y = tcmbCevir(bozuk);
    expect(y.sonuc).toBe("kaynak_hatasi");
    if (y.sonuc === "kaynak_hatasi") expect(y.detay).toContain("birimi");
  });

  it("USD bloğu boşsa 'yayınlanmadı' der, uydurmaz", () => {
    const bos = fixture("tcmb-20260929.xml")
      .replace(/<ForexBuying>[^<]*<\/ForexBuying>/, "<ForexBuying></ForexBuying>")
      .replace(/<ForexSelling>[^<]*<\/ForexSelling>/, "<ForexSelling></ForexSelling>");
    expect(tcmbCevir(bos).sonuc).toBe("yayinlanmadi");
  });
});
