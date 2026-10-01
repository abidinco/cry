/**
 * Yazı tipi dosyalarını DİSKTEN okur — ve bulamazsa NEREYE baktığını söyler.
 *
 * Neden ayrı dosya: `pdf.ts` baytları girdi olarak alıyor (test ve betik aynı
 * üreticiyi kullanabilsin diye), ama bir yerde dosyaların gerçekten okunması
 * gerekiyor. Burada tek bir iş var ve o işin tuzağı ÇALIŞMA DİZİNİ:
 *
 *  - dev sunucusu `apps/web` içinden koşuyor,
 *  - betikler depo kökünden,
 *  - konteynerde standalone çıktı `/app` altında ve Next'in dosya izleyicisi
 *    bu dosyaları KENDİLİĞİNDEN taşımıyor (yol dinamik) — o yüzden
 *    `apps/web/Dockerfile` `packages/rapor/yazi-tipi`yi açıkça kopyalıyor.
 *
 * Bu yüzden aday yollar denenir ve hiçbiri yoksa hata **denenen yolları**
 * yazar: "yazı tipi yok" diye düşen bir uç, hangi kurulumun bozuk olduğunu
 * söylemeli. `CRY_YAZI_TIPI_DIZINI` verilirse ilk sırada o denenir.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { YaziTipleri } from "./pdf";

const DOSYALAR = {
  govde: "DejaVuSans.ttf",
  kalin: "DejaVuSans-Bold.ttf",
  tekAralik: "DejaVuSansMono.ttf",
} as const;

export function adayDizinler(cwd = process.cwd()): string[] {
  const adaylar = [
    process.env.CRY_YAZI_TIPI_DIZINI,
    path.join(cwd, "packages/rapor/yazi-tipi"),
    path.join(cwd, "../../packages/rapor/yazi-tipi"),
    path.join(cwd, "../packages/rapor/yazi-tipi"),
  ].filter((d): d is string => Boolean(d));
  return [...new Set(adaylar.map((d) => path.resolve(d)))];
}

/**
 * Önbellek DİZİN BAŞINA tutulur, tek bir kutuda değil: tek kutu olduğunda
 * başka bir dizinle yapılan ikinci çağrı ilk okumanın sonucunu geri veriyordu
 * — yani "bulamazsa ne der" sorusu hiç ölçülemezdi (testte yakalandı).
 */
const onbellek = new Map<string, YaziTipleri>();

/** Yazı tiplerini okur ve BELLEKTE tutar (her rapor için 1,8 MB okumak gereksiz). */
export function yaziTipleriniOku(cwd = process.cwd()): YaziTipleri {
  const denenen: string[] = [];
  for (const dizin of adayDizinler(cwd)) {
    denenen.push(dizin);
    const hazir = onbellek.get(dizin);
    if (hazir) return hazir;
    try {
      const oku = (ad: string) => new Uint8Array(readFileSync(path.join(dizin, ad)));
      const yazilar: YaziTipleri = {
        govde: oku(DOSYALAR.govde),
        kalin: oku(DOSYALAR.kalin),
        tekAralik: oku(DOSYALAR.tekAralik),
      };
      onbellek.set(dizin, yazilar);
      return yazilar;
    } catch {
      // Sıradaki adaya geç; sebep listenin sonunda topluca söylenir.
    }
  }
  throw new Error(
    `PDF yazı tipi bulunamadı (${Object.values(DOSYALAR).join(", ")}). Denenen dizinler: ${denenen.join(" · ")}`,
  );
}
