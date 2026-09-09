/**
 * Tohum etiketlerini arşive yazar.
 *
 * İki kural bu dosyanın şeklini belirledi:
 *
 * 1. **Varsayılan KURU koşu.** "N etiket yazılacak" bir doğrulama değildir;
 *    yazmadan önce listeye bakılır. Yazma açık bir bayrakla istenir.
 * 2. **Etiket bir ADRESE asılır.** Adres arşivde yoksa açılır — ama
 *    `indexState` "bilinmiyor" kalır: etiketlemek TARAMAK değildir ve
 *    "bakıldı" görüntüsü vermek "yok ≠ bakılamadı" kuralını çiğner.
 */

import { prisma } from "@cry/db";
import type { TohumEtiket } from "./tipler";

export type YazmaRaporu = {
  yeniAdres: number;
  yeniEtiket: number;
  guncellenen: number;
  degismeyen: number;
  /** Kuru koşuda hiçbir şey yazılmadı. */
  uygulandi: boolean;
};

/** Etiketin kimliği: aynı adrese aynı kaynaktan aynı başlık iki kez yazılmaz. */
function anahtar(e: TohumEtiket): string {
  return `${e.chain}|${e.address}|${e.source}|${e.title}`;
}

export async function etiketleriYaz(
  etiketler: TohumEtiket[],
  secenekler: { uygula: boolean; kullaniciId?: number | null },
): Promise<YazmaRaporu> {
  const rapor: YazmaRaporu = {
    yeniAdres: 0,
    yeniEtiket: 0,
    guncellenen: 0,
    degismeyen: 0,
    uygulandi: secenekler.uygula,
  };

  // Aynı adrese iki kez yazmayı önle (OFAC'ta aynı adres iki varlıkta da
  // geçebiliyor; ikisi de gerçek bir iddiadır ama aynı satır iki kez açılmaz).
  const gorulen = new Set<string>();

  for (const e of etiketler) {
    const k = anahtar(e);
    if (gorulen.has(k)) continue;
    gorulen.add(k);

    const adres = await prisma.address.findUnique({
      where: { chain_address: { chain: e.chain, address: e.address } },
      select: { id: true },
    });

    let adresId = adres?.id ?? null;
    if (!adresId) {
      rapor.yeniAdres++;
      if (secenekler.uygula) {
        const yeni = await prisma.address.create({
          data: { chain: e.chain, address: e.address },
          select: { id: true },
        });
        adresId = yeni.id;
      }
    }

    // Kuru koşuda adres henüz yok; etiketin yeni olduğu kesindir.
    if (adresId === null) {
      rapor.yeniEtiket++;
      continue;
    }

    const mevcut = await prisma.label.findFirst({
      where: { addressId: adresId, source: e.source, title: e.title },
      select: { id: true, category: true, confidence: true, verifiedAt: true },
    });

    if (!mevcut) {
      rapor.yeniEtiket++;
      if (secenekler.uygula) {
        await prisma.label.create({
          data: {
            chain: e.chain,
            addressId: adresId,
            title: e.title,
            description: e.description ?? null,
            category: e.category,
            exchange: e.exchange ?? null,
            source: e.source,
            sourceUrl: e.sourceUrl ?? null,
            confidence: e.confidence,
            verifiedAt: e.dogrulanmisMi ? new Date() : null,
            verifiedBy: e.dogrulanmisMi ? (e.dogrulayan ?? e.source) : null,
            createdById: secenekler.kullaniciId ?? null,
            evidence: e.evidence as object,
          },
        });
      }
      continue;
    }

    const farkli =
      mevcut.category !== e.category ||
      mevcut.confidence !== e.confidence ||
      (mevcut.verifiedAt !== null) !== e.dogrulanmisMi;

    if (!farkli) {
      rapor.degismeyen++;
      continue;
    }

    rapor.guncellenen++;
    if (secenekler.uygula) {
      await prisma.label.update({
        where: { id: mevcut.id },
        data: {
          category: e.category,
          exchange: e.exchange ?? null,
          description: e.description ?? null,
          confidence: e.confidence,
          verifiedAt: e.dogrulanmisMi ? (mevcut.verifiedAt ?? new Date()) : null,
          verifiedBy: e.dogrulanmisMi ? (e.dogrulayan ?? e.source) : null,
          evidence: e.evidence as object,
        },
      });
    }
  }

  return rapor;
}
