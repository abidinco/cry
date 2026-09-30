/**
 * Ondalık aritmetiği — `Number`'a UĞRAMADAN.
 *
 * Projenin en eski kuralı: tutar ham tam sayıdır ve `Number`'a uğrayan tutar
 * rapora `1.15e+53` diye düşer (2^256-1 değerleri canlı veride var). Fiyatla
 * çarpmak tam da o uğrama anıdır; o yüzden çarpma da bölme de BigInt üstünde.
 */

/**
 * Ondalıklı bir metni (ör. "48.9131") tam sayı + ölçek çiftine ayır.
 *
 * ÜSTEL yazımı da kabul eder ve bu bir savunma değil bir ÖLÇÜM: Prisma'nın
 * Decimal'i `toString()`te 1e-6 altını üstel veriyor (`3.72575e-7`, 400
 * fiyatın 3'ünde ölçüldü) ve reddedilince o hareketin TL karşılığı "tutar
 * fiyata çarpılamadı" diye düşüyordu. Okuyan taraf artık `toFixed()`
 * kullanıyor; burası ikinci kapı, çünkü bu kural bir yerde uygulanıp
 * kardeşinde unutulabiliyor.
 */
export function ayristir(metin: string): { deger: bigint; olcek: number } | null {
  const t = metin.trim();
  const ustel = t.match(/^(-?\d+(?:\.\d+)?)[eE]([+-]?\d+)$/);
  if (ustel?.[1] && ustel[2]) {
    const taban = ayristir(ustel[1]);
    if (!taban) return null;
    const us = Number(ustel[2]);
    if (!Number.isSafeInteger(us) || Math.abs(us) > 100) return null;
    // Ölçek = tabanın ölçeği - üs. Negatif üs ölçeği BÜYÜTÜR.
    const olcek = taban.olcek - us;
    if (olcek >= 0) return { deger: taban.deger, olcek };
    return { deger: taban.deger * 10n ** BigInt(-olcek), olcek: 0 };
  }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const eksi = t.startsWith("-");
  const [tam, kesir = ""] = (eksi ? t.slice(1) : t).split(".");
  const deger = BigInt((tam || "0") + kesir);
  return { deger: eksi ? -deger : deger, olcek: kesir.length };
}

/** Ölçeği hedefe çek; küçültürken YARIYI YUKARI yuvarlar (bankacı değil, rapor okuru bekler). */
export function olcekle(deger: bigint, olcek: number, hedef: number): bigint {
  if (hedef === olcek) return deger;
  if (hedef > olcek) return deger * 10n ** BigInt(hedef - olcek);
  const bolen = 10n ** BigInt(olcek - hedef);
  const eksi = deger < 0n;
  const mutlak = eksi ? -deger : deger;
  const bolum = mutlak / bolen;
  const kalan = mutlak % bolen;
  const yuvarli = kalan * 2n >= bolen ? bolum + 1n : bolum;
  return eksi ? -yuvarli : yuvarli;
}

/** Tam sayı + ölçeği okunur ondalık metne çevir (üstel yazım YOK). */
export function metne(deger: bigint, olcek: number): string {
  const eksi = deger < 0n;
  const s = (eksi ? -deger : deger).toString().padStart(olcek + 1, "0");
  const tam = s.slice(0, s.length - olcek);
  const kesir = olcek > 0 ? "." + s.slice(s.length - olcek) : "";
  return (eksi ? "-" : "") + tam + kesir;
}

/**
 * `ham` (ondalıksız tam sayı) × `carpan` (ondalıklı metin) → `hedefOlcek`
 * haneli ondalık metin.
 */
export function carp(ham: string, ondalik: number, carpan: string, hedefOlcek: number): string | null {
  if (!/^-?\d+$/.test(ham.trim())) return null;
  const c = ayristir(carpan);
  if (!c) return null;
  const sonuc = BigInt(ham.trim()) * c.deger;
  return metne(olcekle(sonuc, ondalik + c.olcek, hedefOlcek), hedefOlcek);
}

/** Ondalıklı metin × ondalıklı metin. */
export function carpMetin(a: string, b: string, hedefOlcek: number): string | null {
  const x = ayristir(a);
  const y = ayristir(b);
  if (!x || !y) return null;
  return metne(olcekle(x.deger * y.deger, x.olcek + y.olcek, hedefOlcek), hedefOlcek);
}
