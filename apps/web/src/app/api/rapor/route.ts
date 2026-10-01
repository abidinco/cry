/**
 * POST /api/rapor — bir koşudan KANIT PAKETİ üretir ve mühürler.
 *
 * Raporun kanonik hash'i bu paketin (JSON) SHA-256'sıdır; PDF ondan üretilir
 * ve kendi hash'i ikinci satır olarak yazılır (kullanıcı kararı, CLAUDE.md →
 * Kalan kararlar). Bu sıra ilk rapordan ÖNCE kurulmak zorundaydı: verilmiş
 * bir rapordaki hash geri alınamaz.
 *
 * İki kapı burada:
 *  1. Koşu bitmiş ya da durdurulmuş olmalı — yarım graf mühürlenmez.
 *  2. KARALAMA vakasından rapor alınmaz; vakanın adı rapor istenirken sorulur.
 */
import { NextResponse } from "next/server";
import { prisma } from "@cry/db";
import { apiOturum } from "@/lib/yetki";
import { kanitKaynagi } from "@/lib/rapor-kaynagi";

export async function POST(istek: Request) {
  const { oturum, yanit: kapi } = await apiOturum();
  if (kapi) return kapi;

  const govde = (await istek.json().catch(() => ({}))) as {
    traceRunId?: string;
    baslik?: string;
    vakaBasligi?: string;
  };

  if (!govde.traceRunId) {
    return NextResponse.json({ error: "traceRunId gerekli" }, { status: 400 });
  }
  let kosuId: bigint;
  try {
    kosuId = BigInt(govde.traceRunId);
  } catch {
    return NextResponse.json({ error: "geçersiz traceRunId" }, { status: 400 });
  }

  const baslik = govde.baslik?.trim();
  if (!baslik) {
    // Adsız rapor, bir dosyaya ait olmayan rapordur. Varsayılan bir ad
    // üretmek onu gizlerdi.
    return NextResponse.json({ error: "rapora bir başlık verin" }, { status: 400 });
  }

  const kaynak = await kanitKaynagi(kosuId, baslik, govde.vakaBasligi);
  if ("hata" in kaynak) {
    return NextResponse.json(
      { error: kaynak.hata, vakaAdiGerekli: kaynak.durum === 409 && kaynak.hata.includes("karalama") },
      { status: kaynak.durum },
    );
  }

  // Vaka adlandırıldıysa karalama bayrağı DÜŞER: bir daha sorulmaz.
  if (kaynak.vaka.karalamaMi && govde.vakaBasligi?.trim()) {
    await prisma.case.update({
      where: { id: kaynak.vaka.id },
      data: { title: govde.vakaBasligi.trim(), isDraft: false },
    });
  }

  const rapor = await prisma.report.create({
    data: {
      caseId: kaynak.vaka.id,
      traceRunId: kaynak.kosuId,
      title: baslik,
      snapshot: kaynak.paket as unknown as object,
      sha256: kaynak.sha256,
      createdById: oturum.userId,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: oturum.userId,
      action: "rapor.al",
      target: `takip:${kaynak.kosuId.toString()}`,
      meta: { raporId: rapor.id.toString(), sha256: kaynak.sha256, vaka: kaynak.vaka.slug },
    },
  });

  return NextResponse.json({
    raporId: rapor.id.toString(),
    sha256: kaynak.sha256,
    vaka: { slug: kaynak.vaka.slug, baslik: kaynak.vaka.baslik },
  });
}
