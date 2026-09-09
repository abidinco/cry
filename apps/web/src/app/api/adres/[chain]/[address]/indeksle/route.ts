/**
 * POST /api/adres/[chain]/[address]/indeksle — tarama işini kuyruğa atar.
 */
import { NextResponse } from "next/server";
import { prisma } from "@cry/db";
import { registryFromEnv, type ChainId } from "@cry/chain";
import { apiOturum } from "@/lib/yetki";
import { indeksIstegi } from "@/lib/kuyruk";

const registry = registryFromEnv();

export async function POST(_istek: Request, ctx: { params: Promise<{ chain: string; address: string }> }) {
  const { oturum, yanit: kapi } = await apiOturum();
  if (kapi) return kapi;

  const { chain, address } = await ctx.params;

  if (!registry.hazirMi(chain as ChainId)) {
    // Yarım bir adaptörle "tarandı" demek, boş sonucu veri sanmaktır.
    return NextResponse.json(
      { error: `${chain} adaptörü henüz doldurulmadı` },
      { status: 501 },
    );
  }

  let adres: string;
  try {
    adres = registry.get(chain as ChainId).normalizeAddress(decodeURIComponent(address));
  } catch (hata) {
    return NextResponse.json(
      { error: hata instanceof Error ? hata.message : "geçersiz adres" },
      { status: 400 },
    );
  }

  const { isId, yeni } = await indeksIstegi({
    chain,
    address: adres,
    reason: "arama",
    userId: oturum.userId,
  });

  await prisma.auditLog.create({
    data: {
      userId: oturum.userId,
      action: "adres.indeksle",
      target: `${chain}:${adres}`,
      meta: { yeni },
    },
  });

  return NextResponse.json({ isId, yeni });
}
