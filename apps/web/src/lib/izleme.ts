/**
 * İzleme eşiklerinin KAPIDAKİ doğrulaması — saf, testli (`tests/izleme-esik.test.ts`).
 *
 * Eşiği insan yazıyor ve servis onu başka bir dilde (düz JS,
 * `apps/watcher/src/esik.js`) okuyor. İki taraf aynı dilbilgisini kabul
 * etmezse arayüzde yazılan eşik sunucuda "okunamadı" olur ve o adresin
 * BÜTÜN hareketleri mesaja döner — sessiz değil, ama yanlış. Bu yüzden
 * burada kabul edilen biçim orada kabul edilenle AYNI olmak zorundadır ve
 * testi iki tarafı yan yana koyar.
 *
 * Hatalı değer sessizce varsayılana DÜŞMEZ, hata olur: 1.000 isteyip 1 ile
 * filtreleyen bir izleme kendi yazdığı sınırla çelişir.
 */

import { timingSafeEqual } from "node:crypto";

/** Adresin bütün varlıkları için geçerli VARSAYILAN eşiğin sembolü. */
export const TUM_VARLIKLAR = "*";

/**
 * İzleme servisinin jetonu. Servis bir tarayıcı değil, çerez taşımıyor.
 *
 * Burada duruyor çünkü **Next bir `route.ts`ten fazladan dışa aktarıma izin
 * vermiyor** (tip denetimi `OmitWithTag` ile düşüyor) ve iki uç da aynı
 * kontrolü kullanmak zorunda: kontrolün kopyalanması, birinin güncellenip
 * ötekinin unutulduğu yer olurdu.
 *
 * Jeton TANIMSIZSA uç AÇILMAZ: tanımsız bir sır "kontrol yok" demektir ve bu
 * liste soruşturma konusu adresleri taşıyor.
 */
export function jetonGecerliMi(gelen: string | null): boolean {
  const beklenen = process.env.WATCHER_TOKEN;
  if (!beklenen || !gelen) return false;
  const a = Buffer.from(gelen);
  const b = Buffer.from(beklenen);
  // Uzunluk farkı timingSafeEqual'ı patlatır; önce ayrı kontrol.
  return a.length === b.length && timingSafeEqual(a, b);
}

export type EsikGirdisi = { assetSymbol?: string; minAmount?: string };
export type Esik = { assetSymbol: string; minAmount: string };

/**
 * Eşik metnini kanonik hâle çevir: virgül noktaya döner, baştaki/sondaki
 * boşluk atılır. Kabul edilen dilbilgisi `123` ya da `123.45` — **üstel yazım
 * YOK**: `1e3` yanlış okunduğunda bin kat yanlış bir sınır olurdu.
 */
export function esikMetnini(girdi: string): string | null {
  const t = girdi.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  // Depoda kanonik biçim durur; servis onu olduğu gibi okuyor.
  return t;
}

/** Varlık sembolü: `*` (varsayılan) ya da 1–32 karakterlik bir sembol. */
export function varligi(girdi: string): string | null {
  const t = girdi.trim();
  if (t === TUM_VARLIKLAR) return t;
  if (t.length === 0 || t.length > 32) return null;
  // Boşluk bilerek YASAK DEĞİL: arşivde boşluklu "U S D T" adlı taklit token
  // var ve onun için de eşik yazılabilmeli. Yasak olan yalnızca ayraçlar.
  if (/[\u0000\n\r\t]/.test(t)) return null;
  return t;
}

/**
 * Eşik listesini doğrula. Aynı varlığa iki eşik HATADIR: hangisinin
 * uygulandığı sorusunun cevabı "bilmiyoruz" olurdu.
 */
export function esikleriDogrula(
  girdiler: EsikGirdisi[] | undefined,
): { esikler: Esik[] } | { hata: string } {
  const liste = Array.isArray(girdiler) ? girdiler : [];
  const esikler: Esik[] = [];
  const gorulen = new Set<string>();

  for (const g of liste) {
    const varlik = varligi(String(g.assetSymbol ?? TUM_VARLIKLAR));
    if (!varlik) return { hata: `geçersiz varlık sembolü: ${g.assetSymbol}` };
    const tutar = esikMetnini(String(g.minAmount ?? ""));
    if (tutar === null) {
      return {
        hata: `eşik sayı olmalı (ör. 1000 ya da 0,5) — alınan: ${g.minAmount}`,
      };
    }
    if (gorulen.has(varlik)) return { hata: `aynı varlığa iki eşik: ${varlik}` };
    gorulen.add(varlik);
    esikler.push({ assetSymbol: varlik, minAmount: tutar });
  }

  return { esikler };
}
