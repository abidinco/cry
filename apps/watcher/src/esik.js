/**
 * İzleme eşiği — SAF katman, testli (`tests/izleme-esik.test.ts`).
 *
 * Kullanıcı kararı (CLAUDE.md → Kalan kararlar): **eşik üstü harekette mesaj,
 * küçükler günlük özete.** Eşik varlık ve adres bazında ayarlanır.
 *
 * Neden burada ve neden JavaScript: izleme servisi Hetzner'da derleme adımı
 * OLMADAN dönüyor (apps/watcher/README.md), yani `@cry/fiyat`ın TypeScript
 * ondalık yardımcılarını içe aktaramaz. Ondalık ayrıştırıcı bu yüzden burada
 * ikinci kez yazıldı; kuralı aynı: **tutar `Number`'a UĞRAMAZ** (2^256-1
 * değerleri canlı veride var).
 *
 * Eşiği UYGULAYAMADIĞIMIZ hareket susturulmaz: sebebiyle mesaj olur.
 * "Yok" ile "bakılamadı" ayrı cevaplardır ve bu dosyanın bütün dalları o
 * kurala bakar.
 */

/** Adresin bütün varlıkları için geçerli VARSAYILAN eşiğin sembolü. */
export const TUM_VARLIKLAR = "*";

/**
 * Ondalıklı metni tam sayı + ölçek çiftine ayır ("1.5" → 15, 1).
 * Üstel yazım KABUL EDİLMEZ: eşiği insan yazıyor ve `1e3` yazan bir eşik,
 * yanlış okunduğunda sessizce bin kat yanlış bir sınır olurdu.
 */
export function ayristirOndalik(metin) {
  if (typeof metin !== "string") return null;
  const t = metin.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [tam, kesir = ""] = t.split(".");
  return { deger: BigInt((tam || "0") + kesir), olcek: kesir.length };
}

/** Ham tam sayı metni → BigInt. Negatif ve boş reddedilir. */
function hamOku(metin) {
  const t = String(metin ?? "").trim();
  if (!/^-?\d+$/.test(t)) return null;
  const d = BigInt(t);
  return d < 0n ? -d : d;
}

/**
 * Varlığa uygulanacak eşiği seç: önce varlığın KENDİ eşiği, yoksa adresin
 * varsayılanı (`*`), o da yoksa null.
 *
 * Varlığa özel eşik varsayılanı EZER — "USDT'de 1.000, gerisinde 1" demek
 * ancak böyle mümkün.
 */
export function esikSec(esikler, varlik) {
  const liste = Array.isArray(esikler) ? esikler : [];
  if (varlik) {
    const kendi = liste.find((e) => e.assetSymbol === varlik);
    if (kendi) return kendi;
  }
  return liste.find((e) => e.assetSymbol === TUM_VARLIKLAR) ?? null;
}

/**
 * Bir hareketin hangi yoldan bildirileceğine karar ver.
 *
 * Dönen `yol`: `mesaj` (anında Telegram) | `ozet` (günlük özet).
 * Dönen `sebep`: `esik_ustu` · `esik_alti` · `esik_yok` · `ondalik_bilinmiyor`
 * · `esik_okunamadi` · `tutar_okunamadi`.
 *
 * Karşılaştırma ortak ölçekte ve ÇARPMAYLA yapılır: eşiği varlığın ondalığına
 * çekmek yuvarlama demekti ve 0,5 eşiği 0 ondalıklı bir token'da "1" olup
 * kendinden küçük hareketleri mesaja çevirirdi.
 */
export function yolSec({ tutarHam, ondalik, esik }) {
  if (!esik) return { yol: "mesaj", sebep: "esik_yok", esik: null };

  const sinir = ayristirOndalik(esik.minAmount);
  if (!sinir) return { yol: "mesaj", sebep: "esik_okunamadi", esik };

  const tutar = hamOku(tutarHam);
  if (tutar === null) return { yol: "mesaj", sebep: "tutar_okunamadi", esik };

  // Ondalığı bilinmeyen tutar ÇEVRİLMEZ (CLAUDE.md → Veri kuralları), yani
  // eşikle karşılaştırılamaz da. Böyle bir hareketi "küçük" saymak, eşiğin
  // altında kaldığı ÖLÇÜLMEMİŞ bir şeyi özete gömmek olurdu.
  if (!Number.isInteger(ondalik) || ondalik < 0 || ondalik > 80) {
    return { yol: "mesaj", sebep: "ondalik_bilinmiyor", esik };
  }

  const sol = tutar * 10n ** BigInt(sinir.olcek);
  const sag = sinir.deger * 10n ** BigInt(ondalik);
  return sol >= sag
    ? { yol: "mesaj", sebep: "esik_ustu", esik }
    : { yol: "ozet", sebep: "esik_alti", esik };
}

/** Ham tutarı okunur metne çevir; ondalık bilinmiyorsa HAM olduğu SÖYLENİR. */
export function tutarMetni(tutarHam, ondalik, varlik) {
  const ham = String(tutarHam ?? "").trim();
  const sembol = varlik || "?";
  if (!Number.isInteger(ondalik) || ondalik < 0) return `${ham} (ham) ${sembol}`;
  const d = hamOku(ham);
  if (d === null) return `${ham} (okunamadı) ${sembol}`;
  if (ondalik === 0) return `${d.toString()} ${sembol}`;
  const s = d.toString().padStart(ondalik + 1, "0");
  const tam = s.slice(0, s.length - ondalik);
  const kesir = s.slice(s.length - ondalik).replace(/0+$/, "");
  return `${tam}${kesir ? "." + kesir : ""} ${sembol}`;
}

/**
 * Gün sınırı baştan sona **UTC**'dir ve bu SÖYLENİR (CLAUDE.md → Fiyat ve kur).
 * Özetin "hangi gün" olduğu buradan çıkar; ekran saatleri TSİ gösterdiği için
 * 03:00 TSİ'deki bir hareket bir ÖNCEKİ UTC gününün özetine girer.
 */
export function gunAnahtari(iso) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return t.toISOString().slice(0, 10);
}

/**
 * Kapanmış bir günün özeti ŞİMDİ gönderilsin mi?
 *
 * Gün UTC'de 00:00'da kapanıyor ve o an TSİ 03:00 — özeti orada göndermek,
 * kimsenin okumadığı bir saatte telefon çaldırmaktı. Varsayılan `saatUtc = 6`
 * (09:00 TSİ) bir SEÇİMDİR ve geri alınabilir (`WATCHER_DIGEST_HOUR_UTC`).
 *
 * İki istisna, ikisi de "bilgi bekletilmez" diyor:
 *  - DÜNDEN ESKİ bir gün hemen gider (servis kapalı kalmış olabilir; birikmiş
 *    özet, saatini beklerse hiç gitmeyebilir),
 *  - gün bugünse hiç gitmez — gün henüz kapanmadı.
 */
export function ozetZamaniMi(gun, simdiIso, saatUtc = 6) {
  const bugun = gunAnahtari(simdiIso);
  if (!bugun || !gun || gun >= bugun) return false;
  const dun = gunAnahtari(new Date(new Date(simdiIso).getTime() - 86_400_000).toISOString());
  if (dun && gun < dun) return true;
  const saat = new Date(simdiIso).getUTCHours();
  return Number.isInteger(saatUtc) ? saat >= saatUtc : true;
}

/**
 * Günlük özet metni. Eşik ALTI hareketler burada toplanır; satır başına
 * (adres, varlık) ve o çiftin kaç hareket / ne kadar tuttuğu yazılır.
 *
 * Toplam BigInt'te alınır ve **varlıklar karışmaz** — "1 TRX + 1 USDT = 2"
 * diye bir büyüklük yok. Ondalığı bilinmeyen varlık da toplanır ama ham
 * olduğu söylenir; bu yol zaten mesaja gittiği için özette nadir.
 */
export function ozetMetni(gun, kayitlar) {
  const liste = Array.isArray(kayitlar) ? kayitlar : [];
  if (liste.length === 0) return null;

  const kovalar = new Map();
  for (const k of liste) {
    const anahtar = `${k.address}\u0000${k.assetSymbol ?? "?"}`;
    let kova = kovalar.get(anahtar);
    if (!kova) {
      kova = {
        address: k.address,
        label: k.label ?? null,
        assetSymbol: k.assetSymbol ?? "?",
        ondalik: Number.isInteger(k.ondalik) ? k.ondalik : null,
        sayi: 0,
        toplam: 0n,
        okunamayan: 0,
      };
      kovalar.set(anahtar, kova);
    }
    kova.sayi += 1;
    const d = hamOku(k.amountRaw);
    if (d === null) kova.okunamayan += 1;
    else kova.toplam += d;
    // Aynı çiftte iki farklı ondalık gelirse (taklit token) ondalık DÜŞER:
    // "Sembol kimlik değildir, SÖZLEŞME kimliktir" kuralının bedeli budur.
    if (kova.ondalik !== null && Number.isInteger(k.ondalik) && k.ondalik !== kova.ondalik) {
      kova.ondalik = null;
    }
  }

  const satirlar = [...kovalar.values()]
    .sort((a, b) => b.sayi - a.sayi || a.address.localeCompare(b.address))
    .map((k) => {
      const ad = k.label ? `${k.label} (${k.address})` : k.address;
      const tutar = tutarMetni(k.toplam.toString(), k.ondalik, k.assetSymbol);
      const not = k.okunamayan > 0 ? ` · ${k.okunamayan} kayıt okunamadı` : "";
      return `• ${ad}\n  ${k.sayi} hareket · toplam ${tutar}${not}`;
    });

  return (
    `🗒 <b>Günlük özet — ${gun} (UTC)</b>\n` +
    `Eşik ALTI ${liste.length} hareket; eşik üstü olanlar gün içinde ayrıca mesaj oldu.\n\n` +
    satirlar.join("\n")
  );
}

/** Eşik üstü (ya da eşiği uygulanamayan) hareketin anlık mesajı. */
export function mesajMetni(hareket, sebep) {
  const ad = hareket.label ? `${hareket.label} (${hareket.address})` : hareket.address;
  const yon = hareket.direction === "giden" ? "↑ giden" : "↓ gelen";
  const tutar = tutarMetni(hareket.amountRaw, hareket.ondalik, hareket.assetSymbol);
  // Sebep MESAJA yazılır: eşiği uygulayamadığımız bir bildirimi, eşiği aşan
  // bir bildirimden ayırt edemeyen okur ikisine de aynı ağırlığı verir.
  const aciklama = {
    esik_ustu: "eşik üstü",
    esik_yok: "eşik tanımlı değil",
    ondalik_bilinmiyor: "ondalık bilinmiyor — eşik UYGULANAMADI",
    esik_okunamadi: "eşik okunamadı — eşik UYGULANAMADI",
    tutar_okunamadi: "tutar okunamadı — eşik UYGULANAMADI",
  }[sebep] ?? sebep;

  return (
    `🔔 <b>Hareket</b> — ${aciklama}\n${ad}\n` +
    `${yon} ${tutar}\n${hareket.ts}\n` +
    `<code>${hareket.txHash}</code>\n` +
    `https://tronscan.org/#/transaction/${hareket.txHash}`
  );
}
