/**
 * Geçmiş doldurma (B3) — SAF parçalar: geriye doğru parça sırası, kaynak uygunluğu ve satır parmak izi.
 * Ağ ve veritabanı `apps/blok-okuyucu/src/doldur.ts`'te.
 */
import type { AyristirmaSonucu } from "./ayristir.js";
import type { Aralik } from "./aralik.js";

/**
 * [taban, ust] aralığını YUKARIDAN aşağıya `boy` bloklük parçalara böler. Kapsam kararı "önce canlı uç,
 * geçmiş geriye doğru": disk dolup doldurma durduğunda elde kalan, en yeni ve en yoğun sorgulanan kısımdır.
 */
export function geriyeParcalar(ust: number, taban: number, boy: number): Aralik[] {
  if (!Number.isSafeInteger(ust) || !Number.isSafeInteger(taban) || taban < 0 || ust < taban) throw new Error(`geçersiz aralık: taban ${taban}, üst ${ust}`);
  if (!Number.isSafeInteger(boy) || boy < 1) throw new Error(`geçersiz parça boyu: ${boy}`);
  const parcalar: Aralik[] = [];
  for (let son = ust; son >= taban; son -= boy) parcalar.push({ bas: Math.max(taban, son - boy + 1), son });
  return parcalar;
}

export type KaynakSiniri = {
  ad: string;
  /** Kaynağın tuttuğu en eski blok; `null` tam geçmiş demektir. */
  enEski: number | null;
};

/** Kaynak bu bloğu tutuyor mu? Tutmayan kaynağa hiç sorulmaz: sorulursa HTTP 200 + boş cevap döner. */
export function kaynakUygunMu(k: KaynakSiniri, blok: number): boolean {
  return k.enEski === null || blok >= k.enEski;
}

/**
 * Bir bloktaki satırların sıra bağımsız parmak izi. İki kaynaktan gelen aynı blok satır satır aynı
 * olmalı; çapraz denetim bunu karşılaştırır (sayı yetmez — aynı sayıda farklı satır olabilir).
 */
export function satirIzi(r: AyristirmaSonucu): string {
  return r.satirlar.map((s) => `${s.tx}:${s.idx}:${s.varlik}:${s.kimden}:${s.kime}:${s.tutar}`).sort().join("|");
}

/**
 * Canlı uç (B4) kursörü: `kursor`un üstünde, okunmuş bloklarla KESİNTİSİZ ulaşılabilen en yüksek blok.
 * Arada okunmamış bir blok varsa kursör onun üstüne ATLAMAZ — atlarsa o blok hiçbir zaman okunmaz ve
 * "canlı uç boşluksuz" iddiası sessizce bozulur. Üstteki okunmuşlar zararsızdır: yeniden okunup
 * tekillikle birleşir.
 */
export function bitisikKursor(kursor: number, okunan: ReadonlySet<number>): number {
  let k = kursor;
  while (okunan.has(k + 1)) k++;
  return k;
}
