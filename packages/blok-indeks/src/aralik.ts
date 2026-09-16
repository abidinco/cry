/**
 * Blok aralıkları — SAF: aralık okuma, okunan bloklardan boşluk çıkarma, eksik listesi güncelleme.
 *
 * Kapsamın doğrusu tek bir "en yüksek blok" sayısı DEĞİLDİR: geçmiş geriye doğru ve parça parça
 * doldurulacak (karar: önce canlı uç, geçmiş geriye), yani yazılmış bölge delikli olabilir. Doğru
 * cevap blok başına bir kapsam kaydıdır (`blok_okundu`) ve boşluklar ondan HESAPLANIR.
 */
export type Aralik = { bas: number; son: number };

/** `"86000000-86001000"` → kapalı aralık [bas, son]. Tek sayı tek bloktur. Bozuk girdi HATA verir. */
export function araligiCoz(metin: string): Aralik {
  const m = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(metin);
  if (!m) throw new Error(`aralık okunamadı: "${metin}" (beklenen: 86000000-86001000)`);
  const bas = Number(m[1]);
  const son = m[2] === undefined ? bas : Number(m[2]);
  if (!Number.isSafeInteger(bas) || !Number.isSafeInteger(son)) throw new Error(`aralık sayı değil: "${metin}"`);
  if (son < bas) throw new Error(`aralık ters: ${bas} > ${son}`);
  return { bas, son };
}

export const aralikBoyu = (a: Aralik): number => a.son - a.bas + 1;

/** [bas, son] içinde `okunan`da OLMAYAN blokların ardışık öbekleri, artan sırada. */
export function eksikAraliklar(a: Aralik, okunan: ReadonlySet<number>): Aralik[] {
  const eksik: Aralik[] = [];
  let acik: number | null = null;
  for (let b = a.bas; b <= a.son; b++) {
    if (okunan.has(b)) {
      if (acik !== null) { eksik.push({ bas: acik, son: b - 1 }); acik = null; }
    } else if (acik === null) acik = b;
  }
  if (acik !== null) eksik.push({ bas: acik, son: a.son });
  return eksik;
}

/** Aralıkları sıralar, çakışan ve BİTİŞİK olanları birleştirir. */
export function birlestir(araliklar: readonly Aralik[]): Aralik[] {
  const sirali = [...araliklar].sort((x, y) => x.bas - y.bas);
  const sonuc: Aralik[] = [];
  for (const r of sirali) {
    const onceki = sonuc[sonuc.length - 1];
    if (onceki && r.bas <= onceki.son + 1) onceki.son = Math.max(onceki.son, r.son);
    else sonuc.push({ ...r });
  }
  return sonuc;
}

/**
 * Kursörün eksik listesini bir turun sonucuyla günceller: tur `bakilan` aralığın TAMAMINA baktı,
 * o yüzden eski listenin o aralığa düşen kısmı silinir ve yerine turun bulduğu boşluklar yazılır.
 * Aralık dışındaki eski eksikler olduğu gibi kalır — başka bir turun cevabını bu tur veremez.
 */
export function eksikleriGuncelle(mevcut: readonly Aralik[], bakilan: Aralik, yeniEksik: readonly Aralik[]): Aralik[] {
  const disarida: Aralik[] = [];
  for (const r of mevcut) {
    if (r.son < bakilan.bas || r.bas > bakilan.son) { disarida.push({ ...r }); continue; }
    if (r.bas < bakilan.bas) disarida.push({ bas: r.bas, son: bakilan.bas - 1 });
    if (r.son > bakilan.son) disarida.push({ bas: bakilan.son + 1, son: r.son });
  }
  return birlestir([...disarida, ...yeniEksik]);
}

/** Kursörde saklanan JSON'u doğrulayarak okur; şekli bozuk kayıt sessizce boş sayılmaz. */
export function eksikListesiOku(ham: unknown): Aralik[] {
  if (!Array.isArray(ham)) throw new Error("missing_ranges dizi değil");
  return ham.map((r, i) => {
    const bas = (r as Aralik)?.bas, son = (r as Aralik)?.son;
    if (!Number.isSafeInteger(bas) || !Number.isSafeInteger(son) || son < bas) throw new Error(`missing_ranges[${i}] bozuk: ${JSON.stringify(r)}`);
    return { bas, son };
  });
}
