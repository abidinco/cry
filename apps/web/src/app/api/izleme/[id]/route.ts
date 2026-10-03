/**
 * /api/izleme/[id] — bir takibin eşikleri, etiketi ve aktifliği.
 *
 * PATCH eşik listesini BÜTÜN olarak değiştirir (verilen liste neyse o kalır);
 * kısmi birleştirme, silinmiş bir eşiğin yerinde kalmasına yol açardı ve
 * kaldırılmış bir sınırla filtrelemeye devam eden bir izleme, insanın
 * sandığından farklı davranır.
 *
 * DELETE takibi SİLER. Silmek bilerek seçildi: `watches` bir karar kaydı değil
 * bir iş listesidir, uyarı geçmişi ise `alerts`te durur ve onunla birlikte
 * gider (`onDelete: Cascade`). Geçmişi korumak isteyen takibi PASİFE çeker.
 */
import { NextResponse } from "next/server";
import { prisma } from "@cry/db";
import { apiOturum } from "@/lib/yetki";
import { esikleriDogrula, type EsikGirdisi } from "@/lib/izleme";

async function takipAl(id: string) {
  const sayi = Number(id);
  if (!Number.isInteger(sayi) || sayi <= 0) return null;
  return prisma.watch.findUnique({
    where: { id: sayi },
    select: { id: true, chain: true, address: { select: { address: true } } },
  });
}

export async function PATCH(istek: Request, ctx: { params: Promise<{ id: string }> }) {
  const { oturum, yanit: kapi } = await apiOturum();
  if (kapi) return kapi;

  const { id } = await ctx.params;
  const takip = await takipAl(id);
  if (!takip) return NextResponse.json({ error: "takip bulunamadı" }, { status: 404 });

  const govde = (await istek.json().catch(() => ({}))) as {
    label?: string | null;
    active?: boolean;
    thresholds?: EsikGirdisi[];
  };

  let esikler: { assetSymbol: string; minAmount: string }[] | null = null;
  if (govde.thresholds !== undefined) {
    const sonuc = esikleriDogrula(govde.thresholds);
    if ("hata" in sonuc) return NextResponse.json({ error: sonuc.hata }, { status: 400 });
    esikler = sonuc.esikler;
  }

  await prisma.$transaction(async (tx) => {
    await tx.watch.update({
      where: { id: takip.id },
      data: {
        label: govde.label === undefined ? undefined : govde.label?.trim() || null,
        active: govde.active === undefined ? undefined : Boolean(govde.active),
      },
    });
    if (esikler) {
      await tx.watchThreshold.deleteMany({ where: { watchId: takip.id } });
      if (esikler.length > 0) {
        await tx.watchThreshold.createMany({
          data: esikler.map((e) => ({ watchId: takip.id, ...e })),
        });
      }
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: oturum.userId,
      action: "izleme.guncelle",
      target: `${takip.chain}:${takip.address.address}`,
      meta: {
        watchId: takip.id,
        esikler: esikler ?? undefined,
        active: govde.active,
        label: govde.label,
      },
    },
  });

  const guncel = await prisma.watch.findUnique({
    where: { id: takip.id },
    select: {
      id: true,
      active: true,
      label: true,
      thresholds: { select: { assetSymbol: true, minAmount: true }, orderBy: { assetSymbol: "asc" } },
    },
  });
  return NextResponse.json(guncel);
}

export async function DELETE(_istek: Request, ctx: { params: Promise<{ id: string }> }) {
  const { oturum, yanit: kapi } = await apiOturum();
  if (kapi) return kapi;

  const { id } = await ctx.params;
  const takip = await takipAl(id);
  if (!takip) return NextResponse.json({ error: "takip bulunamadı" }, { status: 404 });

  await prisma.watch.delete({ where: { id: takip.id } });
  await prisma.auditLog.create({
    data: {
      userId: oturum.userId,
      action: "izleme.kaldir",
      target: `${takip.chain}:${takip.address.address}`,
      meta: { watchId: takip.id },
    },
  });

  return NextResponse.json({ silindi: takip.id });
}
