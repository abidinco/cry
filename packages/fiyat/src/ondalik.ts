/**
 * Ondalık aritmetiği — `Number`'a UĞRAMADAN.
 *
 * Projenin en eski kuralı: tutar ham tam sayıdır ve `Number`'a uğrayan tutar
 * rapora `1.15e+53` diye düşer (2^256-1 değerleri canlı veride var). Fiyatla
 * çarpmak tam da o uğrama anıdır; o yüzden çarpma da bölme de BigInt üstünde.
 */

/** Ondalıklı bir metni (ör. "48.9131") tam sayı + ölçek çiftine ayır. */
export function ayristir(metin: string): { deger: bigint; olcek: number } | null {
  const t = metin.trim();
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
