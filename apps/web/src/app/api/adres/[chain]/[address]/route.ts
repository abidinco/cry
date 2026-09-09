/**
 * GET /api/adres/[chain]/[address] — özet, etiketler, indeks durumu.
 *
 * Zincire GİTMEZ: cevap arşivdeki kayıttan verilir. Zincirden çekme işi
 * kuyruğun işidir; kullanıcı beklerken HTTP isteği içinde tarama yapılmaz.
 */
import { NextResponse } from "next/server";
import { prisma } from "@cry/db";
import { registryFromEnv, type ChainId } from "@cry/chain";
import { apiOturum } from "@/lib/yetki";
import { isDurumu } from "@/lib/kuyruk";

const registry = registryFromEnv();

export async function GET(_istek: Request, ctx: { params: Promise<{ chain: string; address: string }> }) {
  const { yanit: kapi } = await apiOturum();
  if (kapi) return kapi;

  const { chain, address } = await ctx.params;
  let adres: string;
  try {
    adres = registry.get(chain as ChainId).normalizeAddress(decodeURIComponent(address));
  } catch (hata) {
    // Checksum'ı bozuk adres SESSİZCE kabul edilmez.
    return NextResponse.json(
      { error: hata instanceof Error ? hata.message : "geçersiz adres" },
      { status: 400 },
    );
  }

  const kayit = await prisma.address.findUnique({
    where: { chain_address: { chain, address: adres } },
    include: {
      labels: {
        select: {
          id: true, title: true, category: true, exchange: true,
          source: true, confidence: true, verifiedAt: true,
        },
      },
    },
  });

  const [gelen, giden, ucNoktalar] = kayit
    ? await Promise.all([
        prisma.transfer.count({ where: { toAddressId: kayit.id } }),
        prisma.transfer.count({ where: { fromAddressId: kayit.id } }),
        // Kaynak tarih vermeyebiliyor (bu adreste vermedi) ama tarih bizim
        // indekslediğimiz hareketlerin üstünde duruyor.
        prisma.transfer.aggregate({
          where: { OR: [{ fromAddressId: kayit.id }, { toAddressId: kayit.id }] },
          _min: { ts: true },
          _max: { ts: true },
        }),
      ])
    : [0, 0, null];

  // Kaynağın beyanı önce gelir; yoksa indeksten türetilir. Hangisi olduğu
  // SÖYLENİR: indeks kısmiyse "ilk hareket" gördüğümüz ilk harekettir,
  // adresin gerçek ilki değil — ikisini aynı şey saymak yanlış iddia olur.
  const kaynaktanTarih = Boolean(kayit?.firstSeen || kayit?.lastSeen);
  const ilk = kayit?.firstSeen ?? ucNoktalar?._min.ts ?? null;
  const son = kayit?.lastSeen ?? ucNoktalar?._max.ts ?? null;

  return NextResponse.json({
    chain,
    address: adres,
    // "Hiç kayıt yok" ile "bakılmadı" AYRI sorulardır; ikisi ayrı alanda.
    biliniyor: Boolean(kayit),
    indexState: kayit?.indexState ?? "bilinmiyor",
    lastIndexedAt: kayit?.lastIndexedAt ?? null,
    firstSeen: ilk,
    lastSeen: son,
    tarihKaynagi: ilk === null ? null : kaynaktanTarih ? "kaynak" : "indeks",
    balanceRaw: kayit?.balanceRaw ?? null,
    isContract: kayit?.isContract ?? null,
    activatedByAddress: kayit?.activatedByAddress ?? null,
    activatedAt: kayit?.activatedAt ?? null,
    hareketSayisi: { gelen, giden },
    etiketler: kayit?.labels ?? [],
    isDurumu: await isDurumu(chain, adres),
    adaptorHazir: registry.hazirMi(chain as ChainId),
  });
}
