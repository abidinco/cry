/**
 * POST /api/fiyat — bir hareketin TL karşılığı, İKİ kurla.
 *
 * Neden POST ve neden toplu: bir işlemde onlarca hareket olabiliyor ve her
 * biri için ayrı istek atmak sayfayı yavaşlatırdı. Gövde bir liste alır,
 * sırasıyla bir liste döner.
 *
 * Uç ZİNCİRE GİTMEZ, arşive bakar: fiyat ve kur tabloları doldurucu
 * tarafından yazılır (`packages/fiyat`). Tablo boşsa cevap "0 ₺" değil
 * "bakılamadı"dır — bu ucun tek işi o farkı korumak.
 */
import { NextResponse } from "next/server";
import { prisma } from "@cry/db";
import { fiyatlandir, gunVerisi, type Fiyatlandirma } from "@cry/fiyat";
import { apiOturum } from "@/lib/yetki";

type Istek = {
  /** ISO gün (hareketin tarihi). */
  gun: string;
  chain: string;
  /** Native varlıkta boş dize. */
  contract: string;
  hamTutar: string;
  ondalik: number;
  ondalikBilinmiyor?: boolean;
};

const GUN_BICIMI = /^\d{4}-\d{2}-\d{2}$/;
const EN_COK = 200;

export async function POST(istek: Request) {
  const { yanit: kapi } = await apiOturum();
  if (kapi) return kapi;

  const govde = (await istek.json().catch(() => null)) as { hareketler?: Istek[] } | null;
  const hareketler = govde?.hareketler;
  if (!Array.isArray(hareketler)) {
    return NextResponse.json({ error: "gövde { hareketler: [...] } olmalı" }, { status: 400 });
  }
  if (hareketler.length > EN_COK) {
    return NextResponse.json({ error: `en çok ${EN_COK} hareket sorulabilir` }, { status: 400 });
  }

  const bugun = new Date().toISOString().slice(0, 10);
  const sonuc: Fiyatlandirma[] = [];

  /**
   * İstek boyunca yaşayan bellek. Bir işlemin hareketlerinin çoğu AYNI
   * varlık ve AYNI gündür (özellikle "rapor günü" hepsinde aynıdır); önbellek
   * olmadan aynı satır onlarca kez sorulurdu.
   */
  const varlikBellegi = new Map<string, number | null>();
  const gunBellegi = new Map<string, Awaited<ReturnType<typeof gunVerisi>>>();

  const varligiBul = async (chain: string, contract: string) => {
    const k = `${chain}|${contract}`;
    const onbellek = varlikBellegi.get(k);
    if (onbellek !== undefined) return onbellek;
    const satir = await prisma.asset.findUnique({
      where: { chain_contract: { chain, contract } },
      select: { id: true },
    });
    varlikBellegi.set(k, satir?.id ?? null);
    return satir?.id ?? null;
  };

  const gunuAl = async (assetId: number, gun: string) => {
    const k = `${assetId}|${gun}`;
    const onbellek = gunBellegi.get(k);
    if (onbellek) return onbellek;
    const v = await gunVerisi(assetId, gun);
    gunBellegi.set(k, v);
    return v;
  };

  for (const h of hareketler) {
    if (!GUN_BICIMI.test(h.gun ?? "")) {
      sonuc.push({
        tutar: null,
        islemGunu: null,
        raporGunu: null,
        gerekce: [`geçersiz gün: ${h.gun}`],
      });
      continue;
    }

    /**
     * Varlık arşivde yoksa fiyat SORULMAZ — ve bu "fiyat yok" değil "bu
     * varlığa hiç bakılmadı"dır. İşlem sayfası zincirden okuyor, yani
     * arşivimizde hiç görülmemiş bir token'la karşılaşabilir.
     */
    const assetId = await varligiBul(h.chain, h.contract ?? "");

    const bos = { usd: null, kur: null, kurTarihi: null };
    const yok = { ...bos, not: "bu varlık arşivde yok — fiyatına hiç bakılmadı" };
    const islemGunu = assetId === null ? yok : await gunuAl(assetId, h.gun);
    const raporGunu = assetId === null ? yok : await gunuAl(assetId, bugun);

    sonuc.push(
      fiyatlandir({
        hamTutar: h.hamTutar,
        ondalik: h.ondalik,
        ondalikBilinmiyor: h.ondalikBilinmiyor,
        islemGunu,
        raporGunu,
      }),
    );
  }

  return NextResponse.json({ raporGunu: bugun, fiyatlar: sonuc });
}
