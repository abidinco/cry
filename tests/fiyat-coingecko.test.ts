import { describe, expect, it } from "vitest";

import { cgDurumu, cgGecmisCevir, cgGecmisUrl, cgTarih, fiyatMetni, pencereIcinde } from "@cry/fiyat";

/** Ölçülmüş gerçek yanıtın iskeleti (2026-09-30, coins/tether/history?date=01-10-2025). */
const YANIT = JSON.stringify({
  id: "tether",
  symbol: "usdt",
  market_data: { current_price: { usd: 1.0000249949916378, try: 41.5 } },
});

/** Ölçülmüş gerçek 401 gövdesi. */
const ARALIK_HATASI = JSON.stringify({
  error: {
    status: {
      error_code: 10012,
      error_message:
        "Your request exceeds the allowed time range. Public API users are limited to querying historical data within the past 365 days.",
    },
  },
});

describe("CoinGecko", () => {
  /**
   * Tarih biçimi GG-AA-YYYY. ISO okuyan bir göz `10-01-2025`i 1 Ekim sanar;
   * ayın 12'sinden küçük her günde iki okuma da "geçerli" görünür ve yanlış
   * günün fiyatı HATASIZ yazılırdı.
   */
  it("tarihi GG-AA-YYYY yazar", () => {
    expect(cgTarih("2025-01-10")).toBe("10-01-2025");
    expect(cgTarih("2025-10-01")).toBe("01-10-2025");
    expect(cgGecmisUrl("tether", "2025-10-01")).toContain("date=01-10-2025");
  });

  it("gerçek yanıttan USD fiyatı okur", () => {
    const y = cgGecmisCevir("tether", "2025-10-01", YANIT);
    expect(y.sonuc).toBe("bulundu");
    if (y.sonuc !== "bulundu") return;
    expect(y.fiyat.usd).toBe("1.0000249949916378");
    expect(y.fiyat.coinId).toBe("tether");
  });

  /**
   * 1 USDT = 1 USD VARSAYILMAZ, ölçülür. Ölçülen anlık değer 0,999692 idi;
   * depeg günleri gerçek ve bir raporda fark eden büyüklükler üretir.
   */
  it("USDT fiyatını 1 diye yuvarlamaz", () => {
    const y = cgGecmisCevir("tether", "2025-10-01", YANIT);
    if (y.sonuc !== "bulundu") throw new Error("okunamadı");
    expect(y.fiyat.usd).not.toBe("1");
  });

  /**
   * En sinsi tuzak: 365 gün sınırı HTTP 401 ile geliyor. "Kimlik hatası"
   * sanmak, 2015-2025 arasını "bu token'ın fiyatı yok" diye okumak olurdu.
   */
  it("401 + 10012 'aralık dışı'dır, kimlik hatası DEĞİL", () => {
    const y = cgDurumu("tether", "2022-06-15", 401, ARALIK_HATASI);
    expect(y.sonuc).toBe("aralik_disi");
  });

  it("429 yeniden denenebilir, 404 kaynakta yok", () => {
    expect(cgDurumu("x", "2026-01-01", 429, "").sonuc).toBe("hiz_siniri");
    expect(cgDurumu("x", "2026-01-01", 404, "").sonuc).toBe("kaynakta_yok");
  });

  it("market_data yoksa 'kaynakta yok' der, 0 yazmaz", () => {
    const y = cgGecmisCevir("x", "2026-01-01", JSON.stringify({ id: "x" }));
    expect(y.sonuc).toBe("kaynakta_yok");
  });

  it("pencere ölçüsü 365 gün", () => {
    const bugun = new Date("2026-09-30T12:00:00Z");
    expect(pencereIcinde("2026-09-29", bugun)).toBe(true);
    expect(pencereIcinde("2025-10-01", bugun)).toBe(true);
    expect(pencereIcinde("2022-06-15", bugun)).toBe(false);
    // Gelecek bir gün de pencerede değildir.
    expect(pencereIcinde("2026-12-01", bugun)).toBe(false);
  });

  /**
   * Küçük ondalıklı token fiyatları GERÇEK. `String(3.2e-9)` → "3.2e-9" ve bu
   * Decimal(38,12) için geçerli değil: üstel yazım ya patlar ya yanlış
   * büyüklük yazar.
   */
  it("üstel yazımı ondalığa açar", () => {
    expect(fiyatMetni(1.5)).toBe("1.5");
    expect(fiyatMetni(3.2e-9)).toBe("0.000000003200");
    expect(fiyatMetni(3.2e-9)).not.toContain("e");
    // 12 hanenin ALTINA düşen bir fiyat sıfır yazılmaz, cevapsız kalır.
    expect(fiyatMetni(1e-20)).toBeNull();
  });
});
