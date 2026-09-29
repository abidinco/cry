/**
 * Fiyat ve kur satırlarını arşive yazar.
 *
 * İki kural bu dosyanın şeklini belirledi:
 *
 * 1. **Varsayılan KURU koşu.** "N satır yazıldı" bir doğrulama değildir.
 * 2. **Olumsuz cevap da YAZILIR.** Bir günün fiyatı alınamadıysa sebebi
 *    `price_lookups`/`fx_lookups`a geçer; yoksa bir sonraki tur aynı günü
 *    yeniden sorar ve rapor "fiyat yok" ile "bakılamadı"yı ayırt edemez.
 */

import { prisma } from "@cry/db";
import type { YoklamaSonucu } from "./tipler";

export type YazmaRaporu = {
  yeniDeger: number;
  guncellenenDeger: number;
  yoklamaKaydi: number;
  uygulandi: boolean;
};

export function bosRapor(uygulandi: boolean): YazmaRaporu {
  return { yeniDeger: 0, guncellenenDeger: 0, yoklamaKaydi: 0, uygulandi };
}

const gun = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** TCMB kurunu yaz. `kurTarihi` bültenin KENDİ tarihidir, istenen gün değil. */
export async function kuruYaz(
  kurTarihi: string,
  usdTry: string,
  kaynak: string,
  rapor: YazmaRaporu,
): Promise<void> {
  if (!rapor.uygulandi) return;
  const mevcut = await prisma.fxRateDaily.findUnique({ where: { date: gun(kurTarihi) } });
  await prisma.fxRateDaily.upsert({
    where: { date: gun(kurTarihi) },
    create: { date: gun(kurTarihi), usdTry, source: kaynak },
    update: { usdTry, source: kaynak, fetchedAt: new Date() },
  });
  if (mevcut) rapor.guncellenenDeger++;
  else rapor.yeniDeger++;
}

/** Kur yoklamasının sonucunu yaz — olumlu da olumsuz da. */
export async function kurYoklamasiYaz(
  istenenGun: string,
  outcome: YoklamaSonucu,
  kaynak: string,
  detay: string | null,
  rapor: YazmaRaporu,
): Promise<void> {
  if (!rapor.uygulandi) return;
  await prisma.fxLookup.upsert({
    where: { date: gun(istenenGun) },
    create: { date: gun(istenenGun), outcome, source: kaynak, detail: detay },
    update: { outcome, source: kaynak, detail: detay, checkedAt: new Date() },
  });
  rapor.yoklamaKaydi++;
}

export async function fiyatYaz(
  assetId: number,
  tarih: string,
  usd: string,
  kaynak: string,
  rapor: YazmaRaporu,
): Promise<void> {
  if (!rapor.uygulandi) return;
  const mevcut = await prisma.priceDaily.findUnique({
    where: { assetId_date: { assetId, date: gun(tarih) } },
  });
  await prisma.priceDaily.upsert({
    where: { assetId_date: { assetId, date: gun(tarih) } },
    create: { assetId, date: gun(tarih), usd, source: kaynak },
    update: { usd, source: kaynak, fetchedAt: new Date() },
  });
  if (mevcut) rapor.guncellenenDeger++;
  else rapor.yeniDeger++;
}

export async function fiyatYoklamasiYaz(
  assetId: number,
  tarih: string,
  outcome: YoklamaSonucu,
  kaynak: string,
  detay: string | null,
  rapor: YazmaRaporu,
): Promise<void> {
  if (!rapor.uygulandi) return;
  await prisma.priceLookup.upsert({
    where: { assetId_date: { assetId, date: gun(tarih) } },
    create: { assetId, date: gun(tarih), outcome, source: kaynak, detail: detay },
    update: { outcome, source: kaynak, detail: detay, checkedAt: new Date() },
  });
  rapor.yoklamaKaydi++;
}

/**
 * Toplu yoklama kaydı — pencere DIŞINDA kalan 12 bin çift için.
 *
 * Bunlar ağa hiç gitmez: ölçülmüş bir sınırın dışındalar. Yine de KAYDA
 * geçerler, çünkü "sorulmadı" ile "kaynak veremiyor" ayrı cevaplardır.
 */
export async function topluFiyatYoklamasi(
  kayitlar: { assetId: number; tarih: string; outcome: YoklamaSonucu; detay: string }[],
  kaynak: string,
  rapor: YazmaRaporu,
): Promise<void> {
  if (!rapor.uygulandi || kayitlar.length === 0) return;
  const parcaBoyu = 1000;
  for (let i = 0; i < kayitlar.length; i += parcaBoyu) {
    const parca = kayitlar.slice(i, i + parcaBoyu);
    await prisma.priceLookup.createMany({
      data: parca.map((k) => ({
        assetId: k.assetId,
        date: gun(k.tarih),
        outcome: k.outcome,
        source: kaynak,
        detail: k.detay,
      })),
      skipDuplicates: true,
    });
    rapor.yoklamaKaydi += parca.length;
  }
}
