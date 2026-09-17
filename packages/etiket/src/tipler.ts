/**
 * Etiket tohumlamasının ortak sözlüğü.
 *
 * Bir tohum kaynağı iki şey üretir: yazılacak ETİKETLER ve **atlanan
 * kayıtlar, sebebiyle**. İkincisi süs değil: sebebi yazılmadan atlanan bir
 * kayıt "kaynakta yoktu" sanılır ve bir sonraki turda kimse aramaz.
 */

import type { ChainId } from "@cry/chain";

/**
 * Etiket kategorileri — şemadaki `Label.category` ile aynı kapalı liste.
 *
 * Takip motoru YALNIZCA `exchange` ile başlayanı terminal sayar
 * (`packages/motor/src/durma.ts`): paranın bir borsaya girmesi izin BİTTİĞİ
 * anlamına gelir. Yaptırım listesindeki bir adres ağır bir bulgudur ama
 * terminal DEĞİLDİR — para oradan da hareket etmeye devam eder.
 */
export type EtiketKategorisi =
  | "exchange_hot"
  | "exchange_deposit"
  | "mixer"
  | "sanction"
  | "bridge"
  | "contract"
  | "kullanici"
  | "diger";

export type EtiketKaynagi = "ofac" | "tronscan" | "acik_kaynak" | "kesif" | "kesif_blok" | "kullanici";

export type TohumEtiket = {
  chain: ChainId;
  /** Kanonik yazım: TRON base58, EVM küçük harf. */
  address: string;
  title: string;
  description?: string;
  category: EtiketKategorisi;
  /** Kategori exchange_* ise dolu. */
  exchange?: string | null;
  source: EtiketKaynagi;
  sourceUrl?: string | null;
  /** 0..1 */
  confidence: number;
  /**
   * Kaynağın kendisi yetkiliyse (OFAC gibi) doğrulanmış sayılır: liste
   * resmî ve makine okunur, "kim doğruladı" sorusunun cevabı kaynağın
   * kendisidir. Kullanıcının verdiği bir iddia doğrulanmış DEĞİLDİR.
   */
  dogrulanmisMi: boolean;
  dogrulayan?: string | null;
  evidence: Record<string, unknown>;
};

export type Atlanan = {
  /** Kaynaktaki ham değer. */
  ham: string;
  /** Neden yazılmadı — kova değil, cevaplanabilir bir cümle. */
  sebep: string;
  ayrinti?: string;
};

export type TohumSonucu = {
  etiketler: TohumEtiket[];
  atlananlar: Atlanan[];
  /** Kaynağın kendi beyan ettiği tarih/sürüm — kanıt paketine girer. */
  kaynakSurumu?: string | null;
};
