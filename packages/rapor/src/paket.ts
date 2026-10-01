/**
 * Kanıt paketini KURAN saf katman.
 *
 * Saf olması bir tercih değil bir zorunluluk: hash'i bu fonksiyonun çıktısı
 * belirliyor, yani aynı girdinin aynı paketi vermesi ispat edilebilir olmalı.
 * Veritabanı okuma, "şu an saat kaç", "fiyatı kim getirdi" — hepsi ÇAĞIRANIN
 * işi ve girdi olarak gelir.
 */

import { GERIYE_GUN, KUR_KAYNAGI, toplaMetin, TRY_OLCEK, type Fiyatlandirma } from "@cry/fiyat";
import { ATIF_CUMLELERI, KANIT_SURUMU, type KanitDugumu, type KanitKenari, type KanitPaketi, type VarlikOzeti } from "./tipler";

export type PaketGirdisi = {
  baslik: string;
  /** Paketin üretildiği an (ISO). Girdi, çünkü saf katman saate bakmaz. */
  uretildi: string;
  /** Fiyatların "bugün" ucu (UTC gün). */
  raporGunu: string;
  vaka: { slug: string; baslik: string };
  kosu: KanitPaketi["kosu"];
  gorulemeyenler: string[] | null;
  dugumler: KanitDugumu[];
  kenarlar: KanitKenari[];
};

/**
 * Sebebin ÖZÜ: tarihler değişkendir, sebep değil.
 *
 * Normalize edilmezse 1.342 kenarlık bir koşuda "2019-04-25 fiyatına HİÇ
 * bakılmadı" gibi yüzlerce ayrı satır çıkar ve okuyan kişi "fiyat neden yok"
 * sorusunun cevabını göremez. Tarih `<gün>` olur, SAYI kenar sayısında durur.
 */
export function sebepOzu(gerekce: string): string {
  return gerekce.replace(/\d{4}-\d{2}-\d{2}/g, "<gün>");
}

function kenarSirasi(a: KanitKenari, b: KanitKenari) {
  return (
    a.hop - b.hop ||
    a.zamanUtc.localeCompare(b.zamanUtc) ||
    a.txHash.localeCompare(b.txHash) ||
    a.txIndex - b.txIndex ||
    a.kime.localeCompare(b.kime) ||
    a.hamTutar.localeCompare(b.hamTutar)
  );
}

/**
 * Varlık bazında özet.
 *
 * Varlıklar KARIŞMAZ ve varlıklar arası toplam alınmaz ("1 TRX + 1 USDT = 2"
 * diye bir büyüklük yok). Kimlik SEMBOL değil SÖZLEŞMEdir — arşivde "U S D T"
 * adlı taklit token ölçüldü.
 */
export function varlikOzetleri(kenarlar: KanitKenari[]): VarlikOzeti[] {
  const kovalar = new Map<string, KanitKenari[]>();
  for (const k of kenarlar) {
    const anahtar = `${k.sozlesme ?? ""}|${k.sembol}`;
    const liste = kovalar.get(anahtar);
    if (liste) liste.push(k);
    else kovalar.set(anahtar, [k]);
  }

  const ozetler: VarlikOzeti[] = [];
  for (const [, liste] of kovalar) {
    const ilk = liste[0]!;
    let ham = 0n;
    const islemTl: string[] = [];
    const raporTl: string[] = [];
    let fiyatsiz = 0;
    let ondalikBilinmiyor = false;
    for (const k of liste) {
      if (k.ondalikBilinmiyor) ondalikBilinmiyor = true;
      ham += BigInt(k.hamTutar);
      if (k.fiyat.islemGunu) islemTl.push(k.fiyat.islemGunu.try);
      else fiyatsiz += 1;
      if (k.fiyat.raporGunu) raporTl.push(k.fiyat.raporGunu.try);
    }
    // Tek bir fiyatlanmış kenar yoksa toplam "0 ₺" DEĞİL, yokluktur: sıfır
    // yazmak "bu para hiçbir şey etmiyordu" demek olurdu.
    ozetler.push({
      sembol: ilk.sembol,
      sozlesme: ilk.sozlesme,
      ondalik: ilk.ondalik,
      kenar: liste.length,
      hamToplam: ham.toString(),
      // Ondalığı BİLİNMEYEN tutar çevrilmez: tanınmayan token'ı 0 ondalıkla
      // basmak 34 milyar kat yanlış bir büyüklük gösteriyordu (EVM'de ölçüldü).
      tutar: ondalikBilinmiyor ? null : okunurToplam(ham, ilk.ondalik),
      islemGunuTry: islemTl.length ? toplaMetin(islemTl, TRY_OLCEK) : null,
      raporGunuTry: raporTl.length ? toplaMetin(raporTl, TRY_OLCEK) : null,
      fiyatsizKenar: fiyatsiz,
    });
  }
  return ozetler.sort(
    (a, b) => a.sembol.localeCompare(b.sembol) || (a.sozlesme ?? "").localeCompare(b.sozlesme ?? ""),
  );
}

function okunurToplam(ham: bigint, ondalik: number): string {
  const s = (ham < 0n ? -ham : ham).toString().padStart(ondalik + 1, "0");
  const tam = s.slice(0, s.length - ondalik);
  const kesir = ondalik > 0 ? "." + s.slice(s.length - ondalik) : "";
  return (ham < 0n ? "-" : "") + tam + kesir;
}

/** Fiyat/kur eksiklerinin sebebe göre sayımı. */
export function eksikSayimi(kenarlar: KanitKenari[]): { sebep: string; kenar: number }[] {
  const sayac = new Map<string, number>();
  for (const k of kenarlar) {
    for (const g of tekil(k.fiyat)) {
      const oz = sebepOzu(g);
      sayac.set(oz, (sayac.get(oz) ?? 0) + 1);
    }
  }
  return [...sayac.entries()]
    .map(([sebep, kenar]) => ({ sebep, kenar }))
    .sort((a, b) => b.kenar - a.kenar || a.sebep.localeCompare(b.sebep));
}

/** Aynı kenarda aynı sebep iki kez sayılmaz (işlem günü + rapor günü aynı cümleyi verebilir). */
function tekil(f: Fiyatlandirma): string[] {
  return [...new Set(f.gerekce)];
}

/**
 * Körlüğün CÜMLESİ. Adaptör yoksa cevap "yok" değil BİLİNMİYOR'dur — bakılmamış
 * bir yeri temiz göstermemek bu projenin en çok tekrarlanan kuralı.
 */
export function korlukCumlesi(gorulemeyenler: string[] | null): string {
  if (gorulemeyenler === null) {
    return "Bu zincirin kapsamı BİLİNMİYOR: adaptör yüklenemedi, yani neyin görülemediği de ölçülemedi.";
  }
  if (gorulemeyenler.length === 0) {
    return "Bu zincirde, okunabildiği ölçüde, görülemeyen bir hareket türü kaydedilmedi.";
  }
  return `Bu zincirde VAR OLUP okuyamadığımız hareket türleri: ${gorulemeyenler.join(" · ")}.`;
}

/** Paketin metodoloji bölümü — bir yüzdeyi savunulabilir kılan tek bölüm. */
export function metodoloji(atifKurali: string, uyarilar: string[]): KanitPaketi["metodoloji"] {
  return {
    atifKurali,
    atifCumlesi: ATIF_CUMLELERI[atifKurali] ?? `Tanınmayan atıf kuralı: ${atifKurali}`,
    kurKaynagi: `${KUR_KAYNAGI} (TCMB), token→USD CoinGecko`,
    gunSiniri:
      "Gün sınırı baştan sona UTC'dir. Ekran saatleri TSİ gösterir: 03:00 TSİ'deki bir hareket bir ÖNCEKİ UTC gününün kuruyla çevrilir.",
    fiyatGeriyeYurume:
      "Fiyatta geriye yürüme YOK — kripto fiyatı 7/24 oynar, dünün fiyatını bugüne yazmak ölçüm değil uydurmadır.",
    kurGeriyeYurumeGun: GERIYE_GUN,
    uyarilar,
  };
}

export function kanitPaketi(girdi: PaketGirdisi): KanitPaketi {
  const kenarlar = [...girdi.kenarlar].sort(kenarSirasi);
  const dugumler = [...girdi.dugumler].sort((a, b) => a.hop - b.hop || a.adres.localeCompare(b.adres));
  const varliklar = varlikOzetleri(kenarlar);
  const eksikler = eksikSayimi(kenarlar);

  const uyarilar: string[] = [];
  const altSinir = varliklar.filter((v) => v.fiyatsizKenar > 0);
  if (altSinir.length) {
    uyarilar.push(
      `TL toplamları bir ALT SINIRdır: ${altSinir
        .map((v) => `${v.sembol} ${v.fiyatsizKenar}/${v.kenar} kenar fiyatsız`)
        .join(" · ")}.`,
    );
  }
  if (girdi.kosu.durum === "durduruldu") {
    uyarilar.push("Koşu DURDURULDU: graf eksik, iz tamamlanmadı.");
  }
  if (girdi.kosu.durum !== "bitti" && girdi.kosu.durum !== "durduruldu") {
    uyarilar.push(`Koşunun durumu "${girdi.kosu.durum}": paket bitmemiş bir grafın tutanağıdır.`);
  }

  const istatistik = girdi.kosu.istatistik as { durma?: Record<string, number>; devamlar?: unknown[] } | null;

  return {
    surum: KANIT_SURUMU,
    baslik: girdi.baslik,
    uretildi: girdi.uretildi,
    raporGunu: girdi.raporGunu,
    vaka: girdi.vaka,
    kosu: girdi.kosu,
    metodoloji: metodoloji(girdi.kosu.atifKurali, uyarilar),
    kapsam: {
      gorulemeyenler: girdi.gorulemeyenler,
      korlukCumlesi: korlukCumlesi(girdi.gorulemeyenler),
    },
    ozet: {
      dugum: dugumler.length,
      kenar: kenarlar.length,
      varliklar,
      durma: istatistik?.durma ?? {},
      devam: Array.isArray(istatistik?.devamlar) ? istatistik.devamlar.length : 0,
      eksikler,
    },
    dugumler,
    defter: kenarlar,
  };
}
