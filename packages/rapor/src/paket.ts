/**
 * Kanıt paketini KURAN saf katman.
 *
 * Saf olması bir tercih değil bir zorunluluk: hash'i bu fonksiyonun çıktısı
 * belirliyor, yani aynı girdinin aynı paketi vermesi ispat edilebilir olmalı.
 * Veritabanı okuma, "şu an saat kaç", "fiyatı kim getirdi" — hepsi ÇAĞIRANIN
 * işi ve girdi olarak gelir.
 */

import { GERIYE_GUN, KUR_KAYNAGI, toplaMetin, TRY_OLCEK, type Fiyatlandirma } from "@cry/fiyat";
import {
  ATIF_CUMLELERI,
  KANIT_SURUMU,
  type BakilmayanOzeti,
  type KanitDugumu,
  type KanitKenari,
  type KanitPaketi,
  type VarlikOzeti,
} from "./tipler";

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
 * İzlenmeyenin ÖZETİ: grafın kendi kapsamı.
 *
 * Arşivin dürüstlüğü "yok ≠ bakılamadı" ayrımına dayanıyor ve bu ayrım bugüne
 * kadar yalnızca veritabanında yaşıyordu: rapor izlenen yolu sayıyor, izlenmeyeni
 * saymıyordu. Taranmamış bir düğüm "oradan para çıkmadı" demek DEĞİLDİR.
 *
 * Sebep metni tarihsizleştirilir (`sebepOzu`): 300 düğümlük bir koşuda tarih
 * taşıyan notlar yüzlerce ayrı satıra dağılır ve "tarama neden yarıda kaldı"
 * sorusunun cevabı görünmez olur.
 */
export function bakilmayanOzeti(dugumler: KanitDugumu[]): BakilmayanOzeti {
  let taranan = 0;
  let kismi = 0;
  let bakilmayan = 0;
  let dogrulanmamisTerminal = 0;
  let sinirDugumu = 0;
  const notlar = new Map<string, number>();

  for (const d of dugumler) {
    if (d.indeksDurumu === "tam") taranan += 1;
    else if (d.indeksDurumu === "kismi") kismi += 1;
    else bakilmayan += 1;
    if (d.terminalSebebi === "terminal_aday") dogrulanmamisTerminal += 1;
    if (d.terminalSebebi === "dugum_siniri") sinirDugumu += 1;
    if (d.indeksDurumu !== "tam") {
      // Sebebi KAYITLI OLMAYAN kısmi tarama da bunu söyler: boş bir hücre,
      // sebebin olmadığı anlamına gelmez.
      const not = d.indeksNotu ? sebepOzu(d.indeksNotu) : "sebep kayıtlı değil";
      notlar.set(not, (notlar.get(not) ?? 0) + 1);
    }
  }

  const taramaNotlari = [...notlar.entries()]
    .map(([not, dugum]) => ({ not, dugum }))
    .sort((a, b) => b.dugum - a.dugum || a.not.localeCompare(b.not));

  return {
    dugum: dugumler.length,
    taranan,
    kismi,
    bakilmayan,
    taramaNotlari,
    dogrulanmamisTerminal,
    sinirDugumu,
    cumle: kapsamCumlesi({ dugum: dugumler.length, taranan, kismi, bakilmayan, dogrulanmamisTerminal, sinirDugumu }),
  };
}

/** Kapsamın İNSAN CÜMLESİ — sayıyı okuyan kişi hükmü de okuyabilmeli. */
export function kapsamCumlesi(s: {
  dugum: number;
  taranan: number;
  kismi: number;
  bakilmayan: number;
  dogrulanmamisTerminal: number;
  sinirDugumu: number;
}): string {
  const parcalar: string[] = [];
  if (s.dugum === 0) {
    parcalar.push("Grafta düğüm yok: bu koşudan izlenecek bir yol çıkmadı.");
  } else if (s.bakilmayan === 0 && s.kismi === 0) {
    parcalar.push(
      `${s.dugum} düğümün tamamı tarandı: grafın sınırı bu koşunun eşiklerinden gelir, tarama eksiğinden değil.`,
    );
  } else {
    parcalar.push(
      `${s.dugum} düğümden ${s.taranan} tanesi tam tarandı; ${s.bakilmayan} düğüme HİÇ bakılmadı, ` +
        `${s.kismi} düğümde tarama yarıda kaldı. Bu düğümlerden çıkan para izin DIŞINDA kalmış olabilir: ` +
        `"hareket yok" değil, "bakılmadı".`,
    );
  }
  if (s.sinirDugumu > 0) {
    parcalar.push(
      `${s.sinirDugumu} düğüm, düğüm bütçesi dolduğu için SINIR olarak yazıldı ve taranmadı — kenarın ucu ` +
        `boşta kalmasın diye grafa girdi.`,
    );
  }
  if (s.dogrulanmamisTerminal > 0) {
    parcalar.push(
      `${s.dogrulanmamisTerminal} düğümde iz, DOĞRULANMAMIŞ bir borsa adayında durdu: etiket yapısal bir ` +
        `iddiadır, kimliği teyit edilmedi.`,
    );
  }
  return parcalar.join(" ");
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
  const bakilmayanlar = bakilmayanOzeti(dugumler);

  const uyarilar: string[] = [];
  const altSinir = varliklar.filter((v) => v.fiyatsizKenar > 0);
  if (altSinir.length) {
    uyarilar.push(
      `TL toplamları bir ALT SINIRdır: ${altSinir
        .map((v) => `${v.sembol} ${v.fiyatsizKenar}/${v.kenar} kenar fiyatsız`)
        .join(" · ")}.`,
    );
  }
  if (bakilmayanlar.bakilmayan > 0 || bakilmayanlar.kismi > 0) {
    // Kapsam eksiği metodolojinin uyarı listesine de girer: rapor sayfası ve
    // PDF uyarıları ayrı basıyor, kapsam bölümünü atlayan okur bunu görmeli.
    uyarilar.push(
      `Graf bir ALT SINIRdır: ${bakilmayanlar.bakilmayan} düğüme hiç bakılmadı, ` +
        `${bakilmayanlar.kismi} düğümde tarama yarıda kaldı.`,
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
      bakilmayanlar,
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
