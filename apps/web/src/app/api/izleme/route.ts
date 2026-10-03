/**
 * /api/izleme — izleme listesi (oturumlu).
 *
 * GET: liste + eşikler + son uyarılar.
 * POST: adres ekler. Eşik VERİLMEZSE yazılmaz ve bu bir eksik değil bir
 * BİLGİdir: eşiksiz takipte her hareket mesaj olur (`esik_yok`), yani toz da
 * mesaj olur. Ölçüldü: bir adrese gönderen 3.069 adresin 3.053'ü yalnızca
 * tozdu. Ekran bu yüzden eşiksiz takibi uyarıyla gösterir.
 */
import { NextResponse } from "next/server";
import { prisma } from "@cry/db";
import { registryFromEnv, type ChainId } from "@cry/chain";
import { apiOturum } from "@/lib/yetki";
import { esikleriDogrula, type EsikGirdisi } from "@/lib/izleme";

const registry = registryFromEnv();

export async function GET() {
  const { yanit: kapi } = await apiOturum();
  if (kapi) return kapi;

  const takipler = await prisma.watch.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      chain: true,
      label: true,
      active: true,
      lastSeenTxHash: true,
      lastCheckedAt: true,
      createdAt: true,
      address: { select: { address: true } },
      thresholds: { select: { assetSymbol: true, minAmount: true }, orderBy: { assetSymbol: "asc" } },
      _count: { select: { alerts: true } },
    },
  });

  return NextResponse.json({
    watches: takipler.map((t) => ({
      id: t.id,
      chain: t.chain,
      address: t.address.address,
      label: t.label,
      active: t.active,
      lastSeenTxHash: t.lastSeenTxHash,
      lastCheckedAt: t.lastCheckedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      thresholds: t.thresholds,
      uyariSayisi: t._count.alerts,
    })),
  });
}

export async function POST(istek: Request) {
  const { oturum, yanit: kapi } = await apiOturum();
  if (kapi) return kapi;

  const govde = (await istek.json().catch(() => ({}))) as {
    chain?: string;
    address?: string;
    label?: string;
    caseId?: number;
    thresholds?: EsikGirdisi[];
  };

  if (!govde.chain || !govde.address) {
    return NextResponse.json({ error: "chain ve address gerekli" }, { status: 400 });
  }

  let adres: string;
  try {
    adres = registry.get(govde.chain as ChainId).normalizeAddress(govde.address);
  } catch (hata) {
    return NextResponse.json(
      { error: hata instanceof Error ? hata.message : "geçersiz adres" },
      { status: 400 },
    );
  }

  const esikSonuc = esikleriDogrula(govde.thresholds);
  if ("hata" in esikSonuc) return NextResponse.json({ error: esikSonuc.hata }, { status: 400 });

  // İzlemek TARAMAK değildir: adres kaydı açılır ama `index_state` "bilinmiyor"
  // kalır. "Kayıt var" ile "bakıldı" ayrı cevaplardır.
  const kayit = await prisma.address.upsert({
    where: { chain_address: { chain: govde.chain, address: adres } },
    update: {},
    create: { chain: govde.chain, address: adres, indexState: "bilinmiyor" },
    select: { id: true },
  });

  const mevcut = await prisma.watch.findUnique({
    where: { chain_addressId: { chain: govde.chain, addressId: kayit.id } },
    select: { id: true },
  });
  if (mevcut) {
    return NextResponse.json(
      { error: "bu adres zaten izleniyor", watchId: mevcut.id },
      { status: 409 },
    );
  }

  const takip = await prisma.watch.create({
    data: {
      chain: govde.chain,
      addressId: kayit.id,
      caseId: govde.caseId ?? null,
      label: govde.label?.trim() || null,
      createdById: oturum.userId,
      thresholds: { create: esikSonuc.esikler },
    },
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: oturum.userId,
      action: "izleme.ekle",
      target: `${govde.chain}:${adres}`,
      meta: { watchId: takip.id, esikler: esikSonuc.esikler },
    },
  });

  return NextResponse.json({ watchId: takip.id, address: adres, esikler: esikSonuc.esikler });
}
