/**
 * Arşivden fiyat/kur okuma — raporun sorduğu taraf.
 *
 * Buradaki tek zor karar **hafta sonu**: TCMB cumartesi-pazar ve resmî
 * tatilde bülten yayınlamıyor (ölçüldü: HTTP 404), ama para o günlerde de
 * hareket ediyor. Seçim: **o günden geriye, yayınlanmış EN SON bülten**
 * kullanılır ve kullanılan bültenin TARİHİ cevapla birlikte döner.
 *
 * Bu bir SEÇİMDİR, bir gerçek değil — ve o yüzden rapora yazılır. Kuru
 * söylemeyen bir TL tutarı savunulamaz; hangi GÜNÜN kuru olduğunu söylemeyen
 * de savunulamaz.
 */

import { prisma } from "@cry/db";
import type { GunVerisi } from "./cevir";

/**
 * Geriye kaç gün yürünür.
 *
 * ÖLÇÜLDÜ (2026-09-30, 2.842 günlük kur kaydı): en uzun kesintisiz
 * yayınlanmama **9 gün** — 2018-08-18→26 ve 2021-07-17→25, Kurban Bayramı +
 * hafta sonu. Ve bu bir ALT SINIRDIR: yalnızca arşivde hareketi olan günler
 * soruldu, aradaki sorulmamış bir gün diziyi böler. O yüzden pay bırakıldı.
 *
 * Yeniden üretimi:
 *   with g as (select date, date - (row_number() over (order by date))::int
 *              * interval '1 day' as grup
 *              from fx_lookups where outcome='yayinlanmadi')
 *   select count(*), min(date), max(date) from g group by grup order by 1 desc;
 */
export const GERIYE_GUN = 14;

const gun = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export type KurCevabi = { kur: string; kurTarihi: string } | { kur: null; not: string };

/**
 * Bir günün USD/TRY kuru.
 *
 * "Yok" ile "bakılamadı" burada da ayrılır: geriye yürüyüşte hiç bülten
 * bulunamazsa cevap, o günlerin SORULUP sorulmadığına bakarak verilir.
 */
export async function kurAl(isoGun: string): Promise<KurCevabi> {
  const alt = new Date(gun(isoGun));
  alt.setUTCDate(alt.getUTCDate() - GERIYE_GUN);
  const satir = await prisma.fxRateDaily.findFirst({
    where: { date: { lte: gun(isoGun), gte: alt } },
    orderBy: { date: "desc" },
  });
  // `toFixed()`, `toString()` DEĞİL: Decimal 1e-6 altını ÜSTEL yazıyor
  // (ölçüldü: "3.72575e-7") ve üstel bir metin ondalık aritmetiğine girmez.
  if (satir) return { kur: satir.usdTry.toFixed(), kurTarihi: iso(satir.date) };

  const yoklandi = await prisma.fxLookup.count({
    where: { date: { lte: gun(isoGun), gte: alt } },
  });
  return {
    kur: null,
    not: yoklandi
      ? `${isoGun} ve öncesi ${GERIYE_GUN} gün soruldu, TCMB bülteni bulunamadı`
      : `${isoGun} için TCMB'ye HİÇ bakılmadı`,
  };
}

export type FiyatCevabi = { usd: string } | { usd: null; not: string };

/**
 * Bir varlığın bir günkü USD fiyatı.
 *
 * Fiyatta geriye yürüme YOK: kur bir kurumun yayınladığı resmî sayıdır ve
 * cuma kuru cumartesi için savunulabilir; kripto fiyatı 7/24 oynar ve dünün
 * fiyatını bugüne yazmak ölçüm değil uydurmadır.
 */
export async function fiyatAl(assetId: number, isoGun: string): Promise<FiyatCevabi> {
  const satir = await prisma.priceDaily.findUnique({
    where: { assetId_date: { assetId, date: gun(isoGun) } },
  });
  if (satir) return { usd: satir.usd.toFixed() };

  const yoklama = await prisma.priceLookup.findUnique({
    where: { assetId_date: { assetId, date: gun(isoGun) } },
  });
  if (!yoklama) return { usd: null, not: `${isoGun} fiyatına HİÇ bakılmadı` };
  return { usd: null, not: `${isoGun} fiyatı alınamadı (${yoklama.outcome}): ${yoklama.detail ?? "-"}` };
}

/** Bir günün fiyat + kur çifti — `fiyatlandir` bunu bekliyor. */
export async function gunVerisi(assetId: number, isoGun: string): Promise<GunVerisi> {
  const [f, k] = await Promise.all([fiyatAl(assetId, isoGun), kurAl(isoGun)]);
  const notlar = [
    "usd" in f && f.usd === null ? f.not : null,
    "kur" in k && k.kur === null ? k.not : null,
  ].filter((x): x is string => x !== null);
  return {
    usd: f.usd ?? null,
    kur: k.kur ?? null,
    kurTarihi: "kurTarihi" in k ? k.kurTarihi : null,
    not: notlar.length ? notlar.join(" · ") : undefined,
  };
}
