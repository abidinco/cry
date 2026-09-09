/**
 * POST /api/probe — biçimden çözülemeyen girdiyi ağa sorar.
 *
 * Maliyet kuralı: zincir başına EN FAZLA 2 çağrı, ve sonuç önbelleğe yazılır.
 * Bu uç nokta ancak tespit "yoklanmalı" dediğinde çağrılır; kesin sonucu olan
 * bir girdi için ağa gitmek boşuna harcamadır.
 */
import { NextResponse } from "next/server";
import { detectNetwork, SECONDARY_EVM_CHAINS } from "@cry/chain";
import { prisma } from "@cry/db";
import { apiOturum } from "@/lib/yetki";
import { yokla } from "@/lib/yoklama";

export async function POST(istek: Request) {
  const { oturum, yanit: kapi } = await apiOturum();
  if (kapi) return kapi;

  const { input, dahaFazlaZincir } = (await istek.json().catch(() => ({}))) as {
    input?: unknown;
    dahaFazlaZincir?: boolean;
  };

  if (typeof input !== "string" || input.trim().length === 0) {
    return NextResponse.json({ error: "input alanı gerekli" }, { status: 400 });
  }
  if (input.length > 500) {
    return NextResponse.json({ error: "girdi çok uzun" }, { status: 400 });
  }

  const tespit = detectNetwork(input);
  if (!tespit.candidates.some((a) => a.needsProbe)) {
    // Biçim zaten kesin: yoklamaya gerek yok ve yapılmaz.
    return NextResponse.json({ tespit, gerekmiyor: true });
  }

  const sonuc = await yokla(tespit, dahaFazlaZincir ? [...SECONDARY_EVM_CHAINS] : []);

  await prisma.auditLog.create({
    data: {
      userId: oturum.userId,
      action: "yokla",
      target: tespit.normalized,
      meta: { autoSelected: sonuc.autoSelected, dahaFazlaZincir: Boolean(dahaFazlaZincir) },
    },
  });

  return NextResponse.json({ tespit, sonuc });
}
