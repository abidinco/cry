/**
 * FİYAT ve KUR kaynaklarının canlı sözleşmesi.
 *
 * Nöbetçi olduğu ölçümler (CLAUDE.md → Fiyat ve kur):
 *  1. Bültenin TARİHİ gövdeden okunur, adresten değil — `today.xml` saat
 *     00:14'te hâlâ dünün bültenini veriyordu.
 *  2. TCMB 404'ü hata DEĞİL, "o gün bülten yayınlanmadı"dır.
 *  3. CoinGecko ücretsiz katmanı 365 günden eskisini HTTP **401** ile
 *     reddediyor (`error_code: 10012`) — 401'i kimlik hatası sanmak, on yıllık
 *     bir aralığı "bu token'ın fiyatı yok" diye okumaktı.
 *  4. 1 USDT ≈ 1 USD VARSAYILMAZ, ölçülür.
 *
 * Ayrıştırıcıların KENDİSİ saf ve `tests/` içinde sınanıyor; buradaki soru tek:
 * kaynağın bugün döndürdüğü gövde, o ayrıştırıcıların okuduğu gövde mi?
 */
import { describe, expect, it } from "vitest";

import { CG_GECMIS_GUN, cgGecmisUrl, cgDurumu, tcmbDurumu, tcmbUrl } from "@cry/fiyat";

const uyu = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function iste(url: string): Promise<{ status: number; govde: string }> {
  const y = await fetch(url, { headers: { accept: "application/json, text/xml" } });
  return { status: y.status, govde: await y.text() };
}

/** Gün sınırı baştan sona UTC. */
const bugunUtc = new Date();
const gun = (geri: number) => new Date(bugunUtc.getTime() - geri * 86_400_000).toISOString().slice(0, 10);

describe("TCMB · kur bülteni", () => {
  it("bugünün bülteni ayrıştırılır ve TARİHİ gövdeden gelir", async () => {
    // Bülten öğleden sonra yayımlanıyor: bugünün adresi 404 olabilir, o zaman
    // dünkü sorulur. Ölçülen şey adresin değil GÖVDENİN tarihi.
    let yanit = await iste(tcmbUrl(gun(0)));
    let istenen = gun(0);
    if (yanit.status === 404) {
      istenen = gun(1);
      yanit = await iste(tcmbUrl(istenen));
    }
    // Hafta sonuna denk gelirse geriye yürünür (en çok 14 gün — bu bir SEÇİM).
    let geri = 1;
    while (yanit.status === 404 && geri < 14) {
      geri += 1;
      istenen = gun(geri);
      yanit = await iste(tcmbUrl(istenen));
    }
    expect(yanit.status, "14 gün geriye yürüdük, bülten bulunamadı").toBe(200);

    const sonuc = tcmbDurumu(yanit.status, yanit.govde);
    expect(sonuc.sonuc, `bülten ayrıştırılamadı: ${JSON.stringify(sonuc)}`).toBe("bulundu");
    if (sonuc.sonuc !== "bulundu") return;

    // Yazılan kur DÖVİZ ALIŞ (kullanıcı kararı, dayanağı VUK 280) ve bülten
    // dördünü de veriyor; alanların hepsi hâlâ geliyor mu?
    expect(sonuc.kur.tarih).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sonuc.kur.dovizAlis).toMatch(/^\d+(\.\d+)?$/);
    expect(Number(sonuc.kur.dovizAlis)).toBeGreaterThan(1);
    // Bültenin tarihi, istenen günden ESKİ olabilir ama 14 günden eski olamaz:
    // "bugünün kuru" diye bir ay önceki sayıyı yazmak ölçüm değildir.
    const fark = (Date.parse(gun(0)) - Date.parse(sonuc.kur.tarih)) / 86_400_000;
    expect(fark).toBeGreaterThanOrEqual(0);
    expect(fark).toBeLessThanOrEqual(14);
  });

  it("yayınlanmayan gün HATA değil, «yayınlanmadı»dır", async () => {
    // 2026-01-01 — ölçülmüş bir tatil: bülten yok.
    const yanit = await iste(tcmbUrl("2026-01-01"));
    expect(yanit.status).toBe(404);
    expect(tcmbDurumu(yanit.status, yanit.govde).sonuc).toBe("yayinlanmadi");
  });
});

describe("CoinGecko · token fiyatı", () => {
  it("1 USDT ≈ 1 USD VARSAYILMAZ, ölçülür", async () => {
    const dun = gun(2);
    const url = cgGecmisUrl("tether", dun);
    const yanit = await iste(url);
    const sonuc = cgDurumu("tether", dun, yanit.status, yanit.govde);
    if (sonuc.sonuc === "hiz_siniri") {
      // Hız sınırı bir CEVAP değil: ölçüm yapılamadı, yeşil sayılmaz.
      throw new Error(`CoinGecko hız sınırı: ${dun} ÖLÇÜLEMEDİ (${sonuc.detay})`);
    }
    expect(sonuc.sonuc, JSON.stringify(sonuc)).toBe("bulundu");
    if (sonuc.sonuc !== "bulundu") return;
    expect(sonuc.fiyat.coinId).toBe("tether");
    expect(sonuc.fiyat.tarih).toBe(dun);
    // Depeg günleri gerçek: eşitlik DEĞİL, yakınlık ölçülür.
    const usd = Number(sonuc.fiyat.usd);
    expect(usd).toBeGreaterThan(0.9);
    expect(usd).toBeLessThan(1.1);
    // Üstel yazım iki uçta da çıkabiliyor; metin Decimal'e gidecek biçimde.
    expect(sonuc.fiyat.usd).not.toMatch(/e/i);
  });

  it("365 günden eskisi 401 ile reddedilir ve bu «aralık dışı» demektir", async () => {
    // Kapı 13 saniye (ölçüldü: 6 ardışık çağrının 6'sı da 429).
    await uyu(13_000);
    const eski = gun(CG_GECMIS_GUN + 30);
    const yanit = await iste(cgGecmisUrl("tether", eski));
    const sonuc = cgDurumu("tether", eski, yanit.status, yanit.govde);
    if (sonuc.sonuc === "hiz_siniri") {
      throw new Error(`CoinGecko hız sınırı: ${eski} ÖLÇÜLEMEDİ (${sonuc.detay})`);
    }
    // 401 bir KİMLİK hatası sanılırsa 2015–2025 arası "fiyatı yok" diye okunur.
    expect(yanit.status).toBe(401);
    expect(sonuc.sonuc).toBe("aralik_disi");
  });
});
