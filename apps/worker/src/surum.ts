/**
 * Sürüm damgasının OKUNAN tarafı.
 *
 * Sıra: imaja yazılan `CRY_SURUM` (deploy'un verdiği commit sha) → yoksa
 * çalışma kopyasının `.git` başı (yerel dev sunucusu ve ölçüm betikleri) →
 * yoksa `bilinmiyor`.
 *
 * `.git` konteynerde YOKTUR ve olmaması bir hata değildir; o yüzden okuma
 * sessizce başarısız olur ve karar saf katmana kalır.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { surumDamgasi, type SurumDamgasi } from "@cry/motor";

/** `.git/HEAD` → ref dosyası → sha. Bulunamazsa `null`. */
function gitBasi(baslangic: string = process.cwd()): string | null {
  let klasor = baslangic;
  for (let i = 0; i < 8; i += 1) {
    try {
      const head = readFileSync(join(klasor, ".git", "HEAD"), "utf8").trim();
      const ref = head.startsWith("ref:") ? head.slice(4).trim() : null;
      if (!ref) return head;
      return readFileSync(join(klasor, ".git", ref), "utf8").trim();
    } catch {
      const ust = dirname(klasor);
      if (ust === klasor) return null;
      klasor = ust;
    }
  }
  return null;
}

let onbellek: SurumDamgasi | null = null;

/** Süreç başına bir kez okunur: damga süreç ömründe değişmez. */
export function surumuOku(): SurumDamgasi {
  if (!onbellek) onbellek = surumDamgasi(process.env.CRY_SURUM, gitBasi());
  return onbellek;
}
