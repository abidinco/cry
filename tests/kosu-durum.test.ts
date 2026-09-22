import { describe, expect, it } from "vitest";
import { ilerlemeMetni, kokTaramasiSorunu } from "@/lib/kosu-durum";

const SIMDI = new Date("2026-09-15T10:00:00Z");
const ilerleme = (sn: number) => ({
  islenen: 34,
  hop: 3,
  sirada: 12,
  adres: "TX",
  zaman: new Date(SIMDI.getTime() - sn * 1000).toISOString(),
});

describe("ilerleme satırı", () => {
  it("süren koşu: kaç adres, hangi sıçrama, sırada kaç", () => {
    expect(ilerlemeMetni("calisiyor", ilerleme(2), SIMDI)).toEqual({
      metin: "34 adres işlendi · 3. sıçrama · sırada 12",
      uyari: false,
    });
  });

  it("uzun sessizlik UYARI olur ama hata sayılmaz", () => {
    const r = ilerlemeMetni("calisiyor", ilerleme(120), SIMDI);
    expect(r.uyari).toBe(true);
    expect(r.metin).toContain("120 sn'dir ses yok");
  });

  it("kuyrukta ve henüz ilerleme yazılmamış hâller ayrı söylenir", () => {
    expect(ilerlemeMetni("kuyrukta", null, SIMDI).metin).toContain("kuyrukta");
    expect(ilerlemeMetni("calisiyor", null, SIMDI).metin).toContain("başladı");
    expect(ilerlemeMetni("bitti", ilerleme(1), SIMDI).metin).toBe("");
  });
});

describe("kök taraması — 'hareket yok' ile 'bakılamadı' ayrı cevaplardır", () => {
  it("hız sınırına takılan kök taraması sebebiyle birlikte söylenir", () => {
    // Gerçek koşuda ölçüldü (2026-09-22): koşu "bitti · 1 düğüm" kapandı, sebep stats'te kalmıştı.
    expect(kokTaramasiSorunu({ hata: "4 denemede alınamadı: https://api.trongrid.io/…" }))
      .toBe("Sebep: 4 denemede alınamadı: https://api.trongrid.io/…");
  });

  it("yarıda kalan tarama SESSİZ kalmaz — graf dolu olsa bile eksik olabilir", () => {
    expect(kokTaramasiSorunu({ yeniHareket: 200, tamamlandi: false })).toMatch(/yarıda kaldı/);
  });

  it("adaptör hazır değilse atlanma sebebi söylenir", () => {
    expect(kokTaramasiSorunu({ atlanmaSebebi: "bitcoin adaptörü henüz doldurulmadı" }))
      .toBe("Sebep: bitcoin adaptörü henüz doldurulmadı");
  });

  it("sorunsuz tarama ve hiç taranmamış olmak SESSİZDİR — uyarı enflasyonu bilgiyi öldürür", () => {
    expect(kokTaramasiSorunu({ yeniHareket: 117, tamamlandi: true, kaynak: "melez" })).toBeNull();
    expect(kokTaramasiSorunu(null)).toBeNull();
    expect(kokTaramasiSorunu(undefined)).toBeNull();
  });
});
