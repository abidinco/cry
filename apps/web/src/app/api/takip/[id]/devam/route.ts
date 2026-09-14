/**
 * POST /api/takip/[id]/devam — durmuş bir düğümden takibe devam.
 *
 * Kural motorda (`devamEdilebilir`): doğrulanmış borsada devam YOK, çünkü
 * borsaya giren para havuza karışır ve zincirdeki çıkışı bu paranın devamı
 * değildir. İstemci düğmeyi göstermese de kapı burada da sorulur — arayüz
 * bir güvence değildir.
 */
import { NextResponse } from "next/server";
import { prisma } from "@cry/db";
import { DEVAM_EK_HOP, devamEdilebilir } from "@cry/motor";
import { apiOturum } from "@/lib/yetki";
import { takipDevamIstegi } from "@/lib/kuyruk";

export async function POST(istek: Request, ctx: { params: Promise<{ id: string }> }) {
  const { oturum, yanit: kapi } = await apiOturum();
  if (kapi) return kapi;

  const { id } = await ctx.params;
  let kosuId: bigint;
  try {
    kosuId = BigInt(id);
  } catch {
    return NextResponse.json({ error: "geçersiz id" }, { status: 400 });
  }

  const govde = (await istek.json().catch(() => ({}))) as { adres?: string; ekHop?: number };
  if (!govde.adres) return NextResponse.json({ error: "adres gerekli" }, { status: 400 });
  const ekHop = Number(govde.ekHop ?? DEVAM_EK_HOP.varsayilan);
  if (!Number.isInteger(ekHop) || ekHop < DEVAM_EK_HOP.en_az || ekHop > DEVAM_EK_HOP.en_cok) {
    return NextResponse.json(
      { error: `ek sıçrama ${DEVAM_EK_HOP.en_az}–${DEVAM_EK_HOP.en_cok} arasında olmalı` },
      { status: 400 },
    );
  }

  const kosu = await prisma.traceRun.findUnique({
    where: { id: kosuId },
    select: { id: true, chain: true, status: true },
  });
  if (!kosu) return NextResponse.json({ error: "koşu bulunamadı" }, { status: 404 });
  // Süren bir koşunun grafına ikinci bir yürüyüş eklemek aynı düğümleri iki
  // kez açabilir; önce o bitmeli.
  if (kosu.status === "kuyrukta" || kosu.status === "calisiyor") {
    return NextResponse.json({ error: "koşu hâlâ sürüyor — bitince devam edilebilir" }, { status: 409 });
  }

  const dugum = await prisma.traceNode.findUnique({
    where: { traceRunId_chain_address: { traceRunId: kosuId, chain: kosu.chain, address: govde.adres } },
    select: { terminalReason: true },
  });
  if (!dugum) return NextResponse.json({ error: "bu adres koşuda yok" }, { status: 404 });

  const karar = devamEdilebilir(dugum.terminalReason);
  if (!karar.olur) return NextResponse.json({ error: karar.neden }, { status: 400 });

  await prisma.traceRun.update({ where: { id: kosuId }, data: { status: "kuyrukta" } });
  const { yeni } = await takipDevamIstegi(id, { adres: govde.adres, ekHop, userId: oturum.userId });
  await prisma.auditLog.create({
    data: {
      userId: oturum.userId,
      action: "takip.devam",
      target: `${kosu.chain}:${govde.adres}`,
      meta: { traceRunId: id, ekHop, oncekiSebep: dugum.terminalReason },
    },
  });

  return NextResponse.json({ ok: true, yeni, ekHop });
}
