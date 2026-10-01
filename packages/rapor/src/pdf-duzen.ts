/**
 * PDF'in SAYFA DÜZENİ — saf katman.
 *
 * Burada hiçbir PDF kütüphanesi yok: bu dosya kanıt paketini **ölçülebilir
 * ilkel çizim öğelerine** (metin, çizgi, kutu) ve sayfalara çeviriyor.
 * Sebebi basit: sayfalamayı, sarmayı ve kolon genişliklerini kütüphaneyle
 * birlikte test etmek, "satır taştı mı" sorusunu gözle bakmaya bırakmak olurdu.
 * Metnin genişliğini bilen tek şey yazı tipi, o yüzden ölçüm bir GİRDİ
 * (`olc`) — kütüphane onu doldurur, test sahte bir ölçerle doldurur.
 *
 * Basılamayan karakter SESSİZ kalmaz: yazı tipinin kapsamadığı her karakter
 * `?` olur, SAYILIR ve sayı raporun ilk sayfasına yazılır. Kanıt paketinde
 * karakter tamdır; PDF'in söylemesi gereken şey "bu metni ben tam basamadım".
 */

import type { KanitPaketi } from "./tipler";

export type Stil = "baslik" | "bolum" | "ad" | "govde" | "kucuk" | "mono" | "monoKucuk";
export type Ton = "normal" | "soluk" | "vurgu";

/** Metnin verilen stildeki genişliği (pt). Yazı tipini bilen taraf doldurur. */
export type Olcer = (metin: string, stil: Stil) => number;
/** Yazı tipi bu kod noktasını basabiliyor mu? */
export type Kapsayici = (kodNoktasi: number) => boolean;

export type Oge =
  /** `hiza: "sag"` ise `x` metnin SAĞ ucudur; çizici genişliği ölçüp geriye kaydırır. */
  | { tur: "metin"; x: number; y: number; metin: string; stil: Stil; ton: Ton; hiza: "sol" | "sag" }
  | { tur: "cizgi"; x1: number; y1: number; x2: number; y2: number; kalinlik: number; ton: Ton };

export type Sayfa = { genislik: number; yukseklik: number; ogeler: Oge[] };

export type Duzen = {
  sayfalar: Sayfa[];
  /** Yazı tipinin basamadığı karakter sayısı. 0 değilse ilk sayfada yazılı. */
  basilamayan: number;
};

/** A4 dikey, pt. Tek yön kullanılıyor: defter de buraya sığıyor (ölçüldü). */
export const SAYFA_GENISLIK = 595.28;
export const SAYFA_YUKSEKLIK = 841.89;
export const KENAR = 42;
export const ALT_KENAR = 34;

export const BOYUT: Record<Stil, number> = {
  baslik: 16,
  bolum: 10.5,
  ad: 7.5,
  govde: 9,
  kucuk: 7.5,
  mono: 8,
  monoKucuk: 6,
};

const SATIR_ARALIGI = 1.32;
const satirYuksekligi = (stil: Stil) => BOYUT[stil] * SATIR_ARALIGI;

/** Etiket kolonu: "ad" solda, değer sağda — ekrandaki `Satir` ile aynı düzen. */
const AD_GENISLIGI = 132;

const ICERIK = SAYFA_GENISLIK - 2 * KENAR;

/**
 * Yazı tipinin basamadığı karakteri `?` yapar ve kaç tanesini değiştirdiğini
 * söyler. Boş basmak en kötü seçenek olurdu: hash'in ortasında kaybolan bir
 * karakter, doğrulanamayan bir mühür demek.
 */
export function basilabilir(metin: string, kapsar: Kapsayici): { metin: string; atlanan: number } {
  let atlanan = 0;
  let cikti = "";
  for (const ch of metin) {
    const kod = ch.codePointAt(0)!;
    if (ch === "\n" || ch === "\t" || kapsar(kod)) cikti += ch;
    else {
      atlanan += 1;
      cikti += "?";
    }
  }
  return { metin: cikti, atlanan };
}

/**
 * Metni verilen genişliğe sarar. Tek parçası bile sığmayan kelime (64
 * karakterlik hash gibi) KARAKTERDEN bölünür — kırpmak, kanıtın bir kısmını
 * sessizce atmak olurdu.
 */
export function sar(metin: string, genislik: number, stil: Stil, olc: Olcer): string[] {
  const satirlar: string[] = [];
  for (const parca of metin.split("\n")) {
    let simdiki = "";
    for (const kelime of parca.split(" ")) {
      const aday = simdiki ? `${simdiki} ${kelime}` : kelime;
      if (olc(aday, stil) <= genislik) {
        simdiki = aday;
        continue;
      }
      if (simdiki) satirlar.push(simdiki);
      if (olc(kelime, stil) <= genislik) {
        simdiki = kelime;
        continue;
      }
      // Tek kelime sığmıyor: karakterden böl.
      let kalan = kelime;
      while (kalan && olc(kalan, stil) > genislik) {
        let kes = kalan.length;
        while (kes > 1 && olc(kalan.slice(0, kes), stil) > genislik) kes -= 1;
        satirlar.push(kalan.slice(0, kes));
        kalan = kalan.slice(kes);
      }
      simdiki = kalan;
    }
    satirlar.push(simdiki);
  }
  return satirlar;
}

/** Türkçe defter düzeni: binlik nokta. Intl'e uğramıyor — çıktı deterministik olmalı. */
export function sayiTr(n: number): string {
  const s = Math.trunc(Math.abs(n)).toString();
  let cikti = "";
  for (let i = 0; i < s.length; i += 1) {
    if (i > 0 && (s.length - i) % 3 === 0) cikti += ".";
    cikti += s[i];
  }
  return (n < 0 ? "-" : "") + cikti;
}

/** `1234.56` → `1.234,56`. Tutarlar METİN üzerinden çevrilir; `Number`'a uğramaz. */
export function tutarTr(metin: string): string {
  const eksi = metin.startsWith("-");
  const [tam, kesir] = (eksi ? metin.slice(1) : metin).split(".");
  let basamaklar = "";
  const t = tam ?? "0";
  for (let i = 0; i < t.length; i += 1) {
    if (i > 0 && (t.length - i) % 3 === 0) basamaklar += ".";
    basamaklar += t[i];
  }
  return (eksi ? "-" : "") + basamaklar + (kesir ? `,${kesir}` : "");
}

/** Blok = sayfalanmadan önceki içerik birimi. Yüksekliğini kendisi bilir. */
type Blok =
  | { tur: "baslik"; metin: string }
  | { tur: "bolum"; metin: string }
  | { tur: "satir"; ad: string; satirlar: string[]; stil: Stil; ton: Ton }
  | { tur: "paragraf"; satirlar: string[]; stil: Stil; ton: Ton }
  | { tur: "tablo"; basliklar: string[]; sag: boolean[]; genislikler: number[]; satirlar: string[][] }
  | { tur: "bosluk"; yukseklik: number };

function blokYuksekligi(b: Blok): number {
  switch (b.tur) {
    case "baslik":
      return satirYuksekligi("baslik") + 10;
    case "bolum":
      return satirYuksekligi("bolum") + 8;
    case "satir":
      return Math.max(satirYuksekligi(b.stil) * b.satirlar.length, satirYuksekligi("ad")) + 2;
    case "paragraf":
      return satirYuksekligi(b.stil) * b.satirlar.length + 2;
    case "tablo":
      return satirYuksekligi("ad") + 4 + satirYuksekligi("kucuk") * b.satirlar.length;
    case "bosluk":
      return b.yukseklik;
  }
}

/** Tabloyu sayfaya sığacak parçalara böler; her parça başlık satırını TEKRARLAR. */
function tabloyuBol(b: Extract<Blok, { tur: "tablo" }>, ilkYer: number, tamYer: number): Blok[] {
  const basY = satirYuksekligi("ad") + 4;
  const satY = satirYuksekligi("kucuk");
  const sigar = (yer: number) => Math.max(0, Math.floor((yer - basY) / satY));
  const parcalar: Blok[] = [];
  let kalan = b.satirlar;
  let yer = ilkYer;
  while (kalan.length) {
    const n = sigar(yer);
    if (n === 0) {
      yer = tamYer;
      continue;
    }
    parcalar.push({ ...b, satirlar: kalan.slice(0, n) });
    kalan = kalan.slice(n);
    yer = tamYer;
  }
  return parcalar;
}

function sayfala(bloklar: Blok[]): Sayfa[] {
  const ustY = SAYFA_YUKSEKLIK - KENAR;
  const altY = ALT_KENAR + satirYuksekligi("kucuk") + 6;
  const tamYer = ustY - altY;

  const sayfalar: Sayfa[] = [];
  let ogeler: Oge[] = [];
  let y = ustY;

  const yeniSayfa = () => {
    sayfalar.push({ genislik: SAYFA_GENISLIK, yukseklik: SAYFA_YUKSEKLIK, ogeler });
    ogeler = [];
    y = ustY;
  };

  const kuyruk: Blok[] = [...bloklar];
  // İLERLEME BÜTÇESİ. Sayfalama bölünen bloğu kuyruğa geri koyuyor, yani
  // ilerlemeyen bir bölme sessizce SONSUZ DÖNGÜ olur (ölçüldü 2026-10-01:
  // 1.342 hareketli koşuda 20 dakikada bitmedi, hata da vermedi). Bütçe
  // aşılırsa döngü HATA verir: takılmış bir süreç, hata veren süreçten çok
  // daha pahalıdır.
  const butce = bloklar.length * 4 + 1000;
  let adim = 0;
  while (kuyruk.length) {
    adim += 1;
    if (adim > butce) {
      throw new Error(`sayfalama ilerlemiyor: ${adim} adımda bitmedi (${bloklar.length} blok)`);
    }
    const b = kuyruk.shift()!;
    const h = blokYuksekligi(b);
    // Sıra önemli: sığmayan blok ÖNCE yeni sayfaya geçer, bölme ancak TAM
    // SAYFAYA da sığmadığında yapılır. Tersi ölçüldü ve SONSUZ DÖNGÜ: sayfa
    // dibinde kalan 10 pt'ye bölünen tablo, parçası da sığmadığı için
    // kendini yeniden bölüyordu.
    if (h > y - altY && ogeler.length) yeniSayfa();
    if (b.tur === "tablo" && h > tamYer) {
      kuyruk.unshift(...tabloyuBol(b, tamYer, tamYer));
      continue;
    }
    y = ciz(b, y, ogeler);
  }
  if (ogeler.length) yeniSayfa();

  // Altlık her sayfaya en sonda yazılır: "sayfa i/n" ancak n bilinince yazılabilir.
  return sayfalar;
}

function ciz(b: Blok, y: number, ogeler: Oge[]): number {
  switch (b.tur) {
    case "baslik": {
      const yy = y - BOYUT.baslik;
      ogeler.push({ tur: "metin", x: KENAR, y: yy, metin: b.metin, stil: "baslik", ton: "normal", hiza: "sol" });
      return y - blokYuksekligi(b);
    }
    case "bolum": {
      const yy = y - BOYUT.bolum;
      ogeler.push({ tur: "metin", x: KENAR, y: yy, metin: b.metin, stil: "bolum", ton: "normal", hiza: "sol" });
      ogeler.push({
        tur: "cizgi",
        x1: KENAR,
        y1: yy - 3.5,
        x2: SAYFA_GENISLIK - KENAR,
        y2: yy - 3.5,
        kalinlik: 0.6,
        ton: "soluk",
      });
      return y - blokYuksekligi(b);
    }
    case "satir": {
      ogeler.push({
        tur: "metin",
        x: KENAR,
        y: y - BOYUT[b.stil],
        metin: b.ad,
        stil: "ad",
        ton: "soluk",
        hiza: "sol",
      });
      b.satirlar.forEach((s, i) => {
        ogeler.push({
          tur: "metin",
          x: KENAR + AD_GENISLIGI,
          y: y - BOYUT[b.stil] - i * satirYuksekligi(b.stil),
          metin: s,
          stil: b.stil,
          ton: b.ton,
          hiza: "sol",
        });
      });
      return y - blokYuksekligi(b);
    }
    case "paragraf": {
      b.satirlar.forEach((s, i) => {
        ogeler.push({
          tur: "metin",
          x: KENAR,
          y: y - BOYUT[b.stil] - i * satirYuksekligi(b.stil),
          metin: s,
          stil: b.stil,
          ton: b.ton,
          hiza: "sol",
        });
      });
      return y - blokYuksekligi(b);
    }
    case "tablo": {
      let x = KENAR;
      const basY = y - BOYUT.ad;
      b.basliklar.forEach((bas, i) => {
        const g = b.genislikler[i]!;
        ogeler.push({
          tur: "metin",
          x: b.sag[i] ? x + g : x,
          y: basY,
          metin: bas,
          stil: "ad",
          ton: "soluk",
          hiza: b.sag[i] ? "sag" : "sol",
        });
        x += g;
      });
      ogeler.push({
        tur: "cizgi",
        x1: KENAR,
        y1: basY - 3,
        x2: KENAR + b.genislikler.reduce((a, c) => a + c, 0),
        y2: basY - 3,
        kalinlik: 0.6,
        ton: "soluk",
      });
      b.satirlar.forEach((satir, i) => {
        let sx = KENAR;
        const sy = basY - satirYuksekligi("ad") - 1 - i * satirYuksekligi("kucuk");
        satir.forEach((hucre, j) => {
          const g = b.genislikler[j]!;
          ogeler.push({
            tur: "metin",
            x: b.sag[j] ? sx + g : sx,
            y: sy,
            metin: hucre,
            stil: "kucuk",
            ton: "normal",
            hiza: b.sag[j] ? "sag" : "sol",
          });
          sx += g;
        });
      });
      return y - blokYuksekligi(b);
    }
    case "bosluk":
      return y - b.yukseklik;
  }
}

export type PdfGirdisi = {
  paket: KanitPaketi;
  raporId: string;
  /** Kanıt paketinin kanonik SHA-256'sı — PDF'in üstünde duran MÜHÜR. */
  sha256: string;
  /** Mühür tutuyor mu (paket yeniden hash'lendi)? */
  muhurTutuyor: boolean;
  /** Raporun oluşturulma anı (ISO) — kayıttan gelir. */
  olusturuldu: string;
  /** Kanıt paketini indirme adresi; PDF'in kendisi kanıt DEĞİL. */
  kanitAdresi: string;
};

/**
 * Kanıt paketinden sayfa düzeni üretir.
 *
 * Sıra bilinçli: önce MÜHÜR ve nasıl doğrulanacağı, sonra koşu, para, sonra
 * metodoloji ve EKSİKLER, en sonda defterin tamamı. Eksikleri sona atmak
 * onları gizlemek olurdu.
 */
export function pdfDuzeni(girdi: PdfGirdisi, olc: Olcer, kapsar: Kapsayici): Duzen {
  const p = girdi.paket;
  let basilamayan = 0;
  const t = (metin: string) => {
    const { metin: temiz, atlanan } = basilabilir(metin, kapsar);
    basilamayan += atlanan;
    return temiz;
  };
  const degerGenisligi = ICERIK - AD_GENISLIGI;

  const satir = (ad: string, deger: string, stil: Stil = "govde", ton: Ton = "normal"): Blok => ({
    tur: "satir",
    ad: t(ad),
    satirlar: sar(t(deger), degerGenisligi, stil, olc),
    stil,
    ton,
  });
  const paragraf = (metin: string, stil: Stil = "govde", ton: Ton = "normal"): Blok => ({
    tur: "paragraf",
    satirlar: sar(t(metin), ICERIK, stil, olc),
    stil,
    ton,
  });

  const govde: Blok[] = [];

  // 2. Koşu
  govde.push({ tur: "bolum", metin: t("Koşu") });
  govde.push(satir("kök adres", p.kosu.kok, "mono"));
  govde.push(satir("zincir · yön", `${p.kosu.zincir} · ${p.kosu.yon}`));
  govde.push(
    satir(
      "durum",
      p.kosu.durum + (p.kosu.durmaSebebi ? ` · durma sebebi: ${p.kosu.durmaSebebi}` : ""),
    ),
  );
  govde.push(satir("eşikler", JSON.stringify(p.kosu.esikler), "monoKucuk"));
  govde.push(
    satir(
      "graf",
      `${sayiTr(p.ozet.dugum)} düğüm · ${sayiTr(p.ozet.kenar)} hareket` +
        (p.ozet.devam > 0 ? ` · ${sayiTr(p.ozet.devam)} devam` : ""),
    ),
  );
  govde.push(
    satir(
      "durma sebepleri",
      Object.keys(p.ozet.durma).length === 0
        ? "—"
        : Object.entries(p.ozet.durma)
            .sort((a, b) => b[1] - a[1])
            .map(([s, n]) => `${s}: ${sayiTr(n)}`)
            .join(" · "),
    ),
  );
  govde.push(satir("koşu numarası", p.kosu.id, "mono"));
  govde.push({ tur: "bosluk", yukseklik: 8 });

  // 3. Hareket eden para
  govde.push({ tur: "bolum", metin: t("Hareket eden para") });
  govde.push({
    tur: "tablo",
    basliklar: ["varlık", "hareket", "tutar", "işlem günü ₺", "rapor günü ₺", "fiyatsız"].map(t),
    sag: [false, true, true, true, true, true],
    genislikler: [96, 52, 110, 92, 92, 69],
    satirlar: p.ozet.varliklar.map((v) => [
      t(v.sembol),
      sayiTr(v.kenar),
      // Ondalığı bilinmeyen tutar ÇEVRİLMEZ; ham olduğu söylenerek basılır.
      v.tutar ? tutarTr(v.tutar) : `${v.hamToplam} (ham)`,
      v.islemGunuTry ? tutarTr(v.islemGunuTry) : "—",
      v.raporGunuTry ? tutarTr(v.raporGunuTry) : "—",
      v.fiyatsizKenar > 0 ? `${sayiTr(v.fiyatsizKenar)}/${sayiTr(v.kenar)}` : "0",
    ]),
  });
  govde.push({ tur: "bosluk", yukseklik: 6 });
  govde.push(
    paragraf(
      "Varlıklar karışmaz ve varlıklar arası toplam alınmaz. Fiyatı olmayan kenar varsa TL " +
        "toplamı bir ALT SINIRdır; kaç kenarın fiyatsız kaldığı yukarıdaki son kolonda durur.",
      "kucuk",
      "soluk",
    ),
  );
  govde.push({ tur: "bosluk", yukseklik: 8 });

  // 4. Metodoloji
  govde.push({ tur: "bolum", metin: t("Metodoloji ve sınırlar") });
  govde.push(satir("atıf kuralı", p.metodoloji.atifCumlesi));
  govde.push(satir("kur kaynağı", p.metodoloji.kurKaynagi));
  govde.push(satir("gün sınırı", p.metodoloji.gunSiniri));
  govde.push(satir("fiyatta geriye yürüme", p.metodoloji.fiyatGeriyeYurume));
  govde.push(
    satir(
      "kurda geriye yürüme",
      `en çok ${p.metodoloji.kurGeriyeYurumeGun} gün; kullanılan bültenin tarihi her satırda durur`,
    ),
  );
  govde.push(satir("kapsam", p.kapsam.korlukCumlesi));
  for (const u of p.metodoloji.uyarilar) govde.push(satir("uyarı", u, "govde", "vurgu"));
  govde.push({ tur: "bosluk", yukseklik: 8 });

  // 5. Bakılamayanlar
  if (p.ozet.eksikler.length) {
    govde.push({ tur: "bolum", metin: t("Bakılamayanlar") });
    govde.push({
      tur: "tablo",
      basliklar: ["sebep", "hareket"].map(t),
      sag: [false, true],
      genislikler: [ICERIK - 70, 70],
      satirlar: p.ozet.eksikler.map((e) => [t(e.sebep), sayiTr(e.kenar)]),
    });
    govde.push({ tur: "bosluk", yukseklik: 8 });
  }

  // 6. Düğümler
  govde.push({ tur: "bolum", metin: t("Düğümler") });
  govde.push({
    tur: "tablo",
    basliklar: ["sıç", "adres", "durum"].map(t),
    sag: [false, false, false],
    genislikler: [28, 268, ICERIK - 296],
    satirlar: p.dugumler.map((d) => [
      sayiTr(d.hop),
      t(d.adres),
      d.terminalMi ? t(`terminal${d.terminalSebebi ? ` · ${d.terminalSebebi}` : ""}`) : "—",
    ]),
  });
  govde.push({ tur: "bosluk", yukseklik: 8 });

  // 7. Defter — hareketlerin TAMAMI, üç satırlık kayıtlar hâlinde.
  govde.push({ tur: "bolum", metin: t("Defter") });
  govde.push(
    paragraf(
      `${sayiTr(p.ozet.kenar)} hareketin tamamı aşağıda. Zamanlar UTC; tutarlar varlığın ` +
        "kendi biriminde; ₺ karşılığı işlem günü kuruyladır ve yoksa sebebi yukarıdaki " +
        "Bakılamayanlar tablosunda sayılıdır.",
      "kucuk",
      "soluk",
    ),
  );
  govde.push({ tur: "bosluk", yukseklik: 4 });
  p.defter.forEach((k, i) => {
    const tutar = k.ondalikBilinmiyor ? `${k.hamTutar} (ham)` : tutarTr(okunur(k.hamTutar, k.ondalik));
    const tl = k.fiyat.islemGunu
      ? `${tutarTr(k.fiyat.islemGunu.try)} ₺ (${k.fiyat.islemGunu.kurTarihi})`
      : "₺ yok";
    govde.push({
      tur: "paragraf",
      satirlar: [
        t(
          `#${sayiTr(i + 1)}  sıç ${k.hop}  ${k.zamanUtc}  ${tutar} ${k.sembol}  ${tl}  pay ${k.izliPay}`,
        ),
        t(`    ${k.kimden} -> ${k.kime}`),
        t(`    tx ${k.txHash} #${k.txIndex}`),
      ],
      stil: "monoKucuk",
      ton: "normal",
    });
  });

  // 1. Üst bölüm EN SON kuruluyor: basılamayan karakter sayısı ancak bütün
  // metin geçtikten sonra biliniyor ve o uyarı İLK sayfada durmalı.
  const ust: Blok[] = [];
  ust.push({ tur: "baslik", metin: t(p.baslik) });
  ust.push(
    paragraf(
      `${p.vaka.baslik} (${p.vaka.slug}) · rapor ${girdi.raporId} · oluşturuldu ${girdi.olusturuldu}`,
      "kucuk",
      "soluk",
    ),
  );
  ust.push({ tur: "bosluk", yukseklik: 10 });
  ust.push({ tur: "bolum", metin: t("Mühür") });
  ust.push(satir("kanıt paketi SHA-256", girdi.sha256, "mono"));
  ust.push(
    satir(
      "mühür denetimi",
      girdi.muhurTutuyor
        ? "saklanan paket yeniden hash'lendi ve kayıtlı hash ile birebir çıktı"
        : "MÜHÜR TUTMUYOR: saklanan paketin hash'i kayıtlı hash'ten farklı",
      "govde",
      girdi.muhurTutuyor ? "normal" : "vurgu",
    ),
  );
  ust.push(
    paragraf(
      "Kanonik olan KANIT PAKETİdir (JSON), bu PDF değil. Doğrulama: paketi " +
        `${girdi.kanitAdresi} adresinden indirin ve "sha256sum" ile yukarıdaki hash'i karşılaştırın. ` +
        "PDF'in kendi hash'i rapor kaydında ayrı sütunda (pdf_sha256) durur — yazı tipi ya da " +
        "kütüphane sürümü değişince PDF'in baytları değişir, kanıt paketinin baytları değişmez.",
      "kucuk",
      "soluk",
    ),
  );
  ust.push(satir("paket sürümü", p.surum, "mono"));
  ust.push(satir("rapor günü (fiyatların bugünü)", p.raporGunu));
  ust.push(satir("üretildi (pakete giren an)", p.uretildi));
  if (basilamayan > 0) {
    ust.push(
      satir(
        "basılamayan karakter",
        `${sayiTr(basilamayan)} karakter bu PDF'in yazı tipiyle basılamadı ve "?" olarak yazıldı. ` +
          "Kanıt paketinde karakterler tamdır.",
        "govde",
        "vurgu",
      ),
    );
  }
  ust.push({ tur: "bosluk", yukseklik: 10 });

  const sayfalar = sayfala([...ust, ...govde]);
  altlikYaz(sayfalar, girdi, t);
  return { sayfalar, basilamayan };
}

function okunur(ham: string, ondalik: number): string {
  const eksi = ham.startsWith("-");
  const s = (eksi ? ham.slice(1) : ham).padStart(ondalik + 1, "0");
  const tam = s.slice(0, s.length - ondalik);
  const kesir = ondalik > 0 ? "." + s.slice(s.length - ondalik) : "";
  return (eksi ? "-" : "") + tam + kesir;
}

/** Her sayfanın altına rapor kimliği, mührün ilk 16 hanesi ve "sayfa i/n". */
function altlikYaz(sayfalar: Sayfa[], girdi: PdfGirdisi, t: (m: string) => string) {
  sayfalar.forEach((s, i) => {
    s.ogeler.push({
      tur: "cizgi",
      x1: KENAR,
      y1: ALT_KENAR + BOYUT.kucuk + 4,
      x2: SAYFA_GENISLIK - KENAR,
      y2: ALT_KENAR + BOYUT.kucuk + 4,
      kalinlik: 0.5,
      ton: "soluk",
    });
    s.ogeler.push({
      tur: "metin",
      x: KENAR,
      y: ALT_KENAR,
      metin: t(`rapor ${girdi.raporId} · mühür ${girdi.sha256.slice(0, 16)}…`),
      stil: "kucuk",
      ton: "soluk",
      hiza: "sol",
    });
    s.ogeler.push({
      tur: "metin",
      x: SAYFA_GENISLIK - KENAR,
      y: ALT_KENAR,
      metin: t(`sayfa ${i + 1}/${sayfalar.length}`),
      stil: "kucuk",
      ton: "soluk",
      hiza: "sag",
    });
  });
}
