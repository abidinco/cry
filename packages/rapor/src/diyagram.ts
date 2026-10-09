/**
 * Raporun DİYAGRAMI — mühürlü paketten, sunucu tarafında, SVG.
 *
 * Öneri 11'in sorusu şuydu: rapora ekran görüntüsü konulamaz, çünkü rapor
 * YENİDEN ÜRETİLEBİLİR olmalı. Burada resim, paketin kendi verisinden
 * (düğümler + defter) türetiliyor; yani aynı paket her zaman aynı resmi verir
 * ve resmi doğrulamak için pakete bakmak yeterlidir.
 *
 * Yerleşim EKRANIN yerleşimidir (`@cry/akis`): ikinci bir yerleşim yazmak, aynı
 * paranın iki farklı resmi demekti ve karşı taraf ikisini yan yana koyabilirdi.
 * Düğüm seçimi de ekrandakiyle aynı kuraldan (`cizilecekler`).
 *
 * Renk hiçbir şeyi TEK BAŞINA anlatmaz (docs/arayuz.md): şerit türü renkle,
 * düğümün durumu DOKU ve İŞARETLE de söylenir (✓ doğrulanmış borsa, ? aday,
 * kesik çerçeve bizim sınırımız). Rapor siyah-beyaz basılabilir.
 */

import {
  akisModeli,
  anaVarlik,
  cizilecekler,
  kisaAdres,
  VARSAYILAN_YERLESIM,
  yerlesim,
  type AkisDugumu,
  type AkisEtiketi,
  type AkisKenari,
  type AkisModeli,
  type Yerlesim,
} from "@cry/akis";
import type { KanitPaketi } from "./tipler";

export type DiyagramAyari = { genislik: number; yukseklik?: number };

/**
 * A4 dikey sayfanın içerik genişliğine ölçeklenmek üzere seçildi.
 *
 * `yukseklik` VERİLMEZSE grafın kendisinden hesaplanır: sabit bir tuvalde 86
 * düğümlü bir koşunun adres etiketleri üst üste biniyor (ölçüldü, rapor 3) ve
 * okunamayan bir etiket, olmayan bir etikettir. Ekranda yakınlaştırma var,
 * basılı bir raporda yok.
 */
export const DIYAGRAM_AYARI: DiyagramAyari = { genislik: 1000 };

/** Etiket satırının göz için gereken en az yüksekliği (px). */
const SATIR_YUKSEKLIGI = 13;
const EN_AZ_YUKSEKLIK = 360;
const EN_COK_YUKSEKLIK = 4000;

/** Şeridin ne OLDUĞUNU anlatan renkler — ekranla aynı anlam kanalı. */
const RENK = {
  akis: "#8b93a7",
  borsa: "#2f9e6b",
  aday: "#c98a1b",
  geri: "#c2628f",
  dugum: "#2b3245",
  kok: "#1f6feb",
  yazi: "#1b1f2a",
  soluk: "#5b6475",
} as const;

const YAZI = "DejaVu Sans, Helvetica, sans-serif";

function kacir(metin: string): string {
  return metin
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Paketin düğüm/defter kayıtlarını akış katmanının girdisine çevirir.
 *
 * Etiket görüntüsü koşu anında DONDURULMUŞ bir `unknown[]`; biçimi burada
 * daraltılır ve tanınmayan kayıt ATILIR — uydurulmuş bir etiket, diyagramda
 * "doğrulanmış borsa" yeşili demek olurdu.
 */
export function paketAkisi(p: KanitPaketi): { dugumler: AkisDugumu[]; kenarlar: AkisKenari[] } {
  const dugumler: AkisDugumu[] = p.dugumler.map((d) => ({
    address: d.adres,
    hop: d.hop,
    terminalReason: d.terminalSebebi,
    etiketler: (Array.isArray(d.etiketler) ? d.etiketler : []).flatMap((e): AkisEtiketi[] => {
      const o = e as Partial<AkisEtiketi> | null;
      if (!o || typeof o.title !== "string" || typeof o.category !== "string") return [];
      return [
        {
          title: o.title,
          category: o.category,
          exchange: typeof o.exchange === "string" ? o.exchange : null,
          dogrulandi: o.dogrulandi === true,
        },
      ];
    }),
  }));
  const kenarlar: AkisKenari[] = p.defter.map((k) => ({
    txHash: k.txHash,
    from: k.kimden,
    to: k.kime,
    symbol: k.sembol,
    decimals: k.ondalik,
    amountRaw: k.hamTutar,
    ts: k.zamanUtc,
    hop: k.hop,
    // Pay METİN olarak donmuş; geometri için sayıya çevrilir, tutarlar HAM kalır.
    taintShare: Number(k.izliPay),
  }));
  return { dugumler, kenarlar };
}

export type DiyagramSonucu = {
  svg: string;
  /** Çizilen düğüm ve şerit sayısı. */
  dugum: number;
  serit: number;
  /** Çizim sınırına takılıp çizilmeyen düğüm sayısı — SAYILIR ve resme yazılır. */
  kirpilan: number;
  /** Diyagram TEK varlığı gösterir; ötekilerin kenar sayısı resmin altında durur. */
  varlik: string | null;
  digerVarlikKenari: number;
};

function bosSvg(ayar: DiyagramAyari, not: string): string {
  const h = ayar.yukseklik ?? 120;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ayar.genislik} ${h}"` +
    ` width="${ayar.genislik}" height="${h}" role="img" aria-label="${kacir(not)}">` +
    `<rect width="${ayar.genislik}" height="${h}" fill="#ffffff"/>` +
    `<text x="24" y="40" font-family="${YAZI}" font-size="15" fill="${RENK.yazi}">${kacir(not)}</text>` +
    `</svg>`
  );
}

/** Diyagramın modeli ve yerleşimi — SVG ve (sonradan) PDF aynı kaynaktan beslenir. */
export function diyagramModeli(
  p: KanitPaketi,
  ayar: DiyagramAyari = DIYAGRAM_AYARI,
): { model: AkisModeli; yer: Yerlesim; kirpilan: number; kok: string; yukseklik: number } | null {
  const { dugumler, kenarlar } = paketAkisi(p);
  if (dugumler.length === 0 || kenarlar.length === 0) return null;
  const varlik = anaVarlik(kenarlar);
  if (!varlik) return null;
  // Kırpma kuralı EKRANIN kuralı (`cizilecekler`) ve girdisi `GrafDugumu`:
  // `isTerminal` orada ayrı bir alan, pakette ise `terminalMi`. Seçim o tip
  // üstünden yapılır, sonra adresten akış düğümüne geri dönülür — ikinci bir
  // kırpma kuralı yazmak, ekranla raporun ayrı resim çizmesi demekti.
  const harita = new Map(dugumler.map((d) => [d.address, d]));
  const { secilen, kirpilan } = cizilecekler(
    p.dugumler.map((d) => ({
      address: d.adres,
      hop: d.hop,
      isTerminal: d.terminalMi,
      terminalReason: d.terminalSebebi,
      etiketler: harita.get(d.adres)?.etiketler ?? [],
    })),
    p.kosu.kok,
  );
  const model = akisModeli(
    secilen.flatMap((g) => {
      const d = harita.get(g.address);
      return d ? [d] : [];
    }),
    kenarlar,
    p.kosu.kok,
    varlik,
  );
  if (model.dugumler.length === 0) return null;
  const yukseklik = ayar.yukseklik ?? tuvalYuksekligi(model);
  const yer = yerlesim(model, { ...VARSAYILAN_YERLESIM, genislik: ayar.genislik, yukseklik });
  return { model, yer, kirpilan, kok: p.kosu.kok, yukseklik };
}

/**
 * Tuval yüksekliği EN KALABALIK SÜTUNA göre: her düğüme bir etiket satırı.
 *
 * Sabit yükseklikte 86 düğümlü koşunun etiketleri üst üste biniyordu (ölçüldü).
 * Resmi küçültmek yerine tuval büyür; sayfaya ölçeklenirken oran korunur.
 */
export function tuvalYuksekligi(model: AkisModeli): number {
  const kolon = new Map<number, number>();
  for (const d of model.dugumler) kolon.set(d.hop, (kolon.get(d.hop) ?? 0) + 1);
  const enKalabalik = Math.max(1, ...kolon.values());
  const geri = model.seritler.filter((s) => s.geri).length;
  const istenen = enKalabalik * SATIR_YUKSEKLIGI + 90 + geri * 8;
  return Math.min(EN_COK_YUKSEKLIK, Math.max(EN_AZ_YUKSEKLIK, Math.round(istenen)));
}

export function diyagramSvg(p: KanitPaketi, ayar: DiyagramAyari = DIYAGRAM_AYARI): DiyagramSonucu {
  const hazir = diyagramModeli(p, ayar);
  if (!hazir) {
    // Boş graf SESSİZ kalmaz: resmin yerine SEBEBİ yazılır.
    const not =
      p.defter.length === 0
        ? "Bu koşuda çizilecek hareket yok: defter boş."
        : "Diyagram çizilemedi: baskın bir varlık seçilemedi.";
    return { svg: bosSvg(ayar, not), dugum: 0, serit: 0, kirpilan: 0, varlik: null, digerVarlikKenari: 0 };
  }
  const { model, yer, kirpilan, kok, yukseklik } = hazir;
  const yuvarla = (n: number) => Math.round(n * 10) / 10;

  const p1: string[] = [];
  p1.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ayar.genislik} ${yukseklik}"` +
      ` width="${ayar.genislik}" height="${yukseklik}" role="img" aria-label="${kacir(
        `Akış diyagramı: ${model.dugumler.length} adres, ${model.seritler.length} şerit, varlık ${model.varlik}`,
      )}">`,
  );
  p1.push(`<rect width="${ayar.genislik}" height="${yukseklik}" fill="#ffffff"/>`);
  // Aday düğümün TARAMASI: renk körü bir okur için de ayırt edilebilir olmalı.
  p1.push(
    `<defs><pattern id="cry-aday" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">` +
      `<rect width="6" height="6" fill="#ffffff"/>` +
      `<line x1="0" y1="0" x2="0" y2="6" stroke="${RENK.aday}" stroke-width="3"/></pattern></defs>`,
  );

  p1.push(
    `<text x="24" y="18" font-family="${YAZI}" font-size="11" fill="${RENK.soluk}">${kacir(
      "şerit kalınlığı = aktarılan tutar · sütunlar = sıçrama · ✓ doğrulanmış borsa · ? aday · kesik çerçeve = bizim sınırımız",
    )}</text>`,
  );

  // Şeritler önce: düğümler üstte kalsın.
  for (const s of model.seritler) {
    const yol = yer.yollar.get(s.anahtar);
    if (!yol) continue;
    p1.push(
      `<path d="${yol.d}" fill="none" stroke="${RENK[s.tur]}" stroke-width="${yuvarla(yol.kalinlik)}"` +
        ` stroke-opacity="0.75"/>`,
    );
  }

  for (const d of model.dugumler) {
    const k = yer.kutular.get(d.address);
    if (!k) continue;
    const dolgu =
      d.tur === "kok"
        ? RENK.kok
        : d.tur === "borsa"
          ? RENK.borsa
          : d.tur === "aday"
            ? "url(#cry-aday)"
            : RENK.dugum;
    // Bizim durdurduğumuz yer KESİK çerçeveyle söylenir: iz bitmedi, biz durduk.
    const kesik = d.tur === "sinir" || d.tur === "taranamadi";
    p1.push(
      `<rect x="${yuvarla(k.x)}" y="${yuvarla(k.y)}" width="${yuvarla(k.g)}" height="${yuvarla(Math.max(1, k.h))}"` +
        ` fill="${dolgu}"` +
        (kesik ? ` stroke="${RENK.soluk}" stroke-width="1" stroke-dasharray="3 2"` : "") +
        `/>`,
    );
    const isaret = d.tur === "borsa" ? " ✓" : d.tur === "aday" ? " ?" : d.tur === "yakildi" ? " ⊘" : "";
    const ad = d.borsa ? `${kisaAdres(d.address)} · ${d.borsa}` : kisaAdres(d.address);
    p1.push(
      `<text x="${yuvarla(k.x + k.g + 5)}" y="${yuvarla(k.orta + 3.5)}" font-family="${YAZI}" font-size="10"` +
        ` fill="${d.address === kok ? RENK.yazi : RENK.soluk}">${kacir(ad + isaret)}</text>`,
    );
  }

  // Altlık: resmin NEYİ göstermediği de resmin üstünde durur.
  const altlik =
    `varlık ${model.varlik} · ${model.dugumler.length} adres · ${model.seritler.length} şerit` +
    (kirpilan > 0 ? ` · çizilmeyen ${kirpilan} adres (ilk 100: önce kök ve iz biten adresler)` : "") +
    (model.digerVarlikKenari > 0 ? ` · başka varlıkta ${model.digerVarlikKenari} hareket çizilmedi` : "");
  p1.push(
    `<text x="24" y="${yukseklik - 10}" font-family="${YAZI}" font-size="11" fill="${RENK.soluk}">${kacir(altlik)}</text>`,
  );
  p1.push("</svg>");

  return {
    svg: p1.join(""),
    dugum: model.dugumler.length,
    serit: model.seritler.length,
    kirpilan,
    varlik: model.varlik,
    digerVarlikKenari: model.digerVarlikKenari,
  };
}
