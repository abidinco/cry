/**
 * GET /api/rapor/[id] — dondurulmuş raporu döndürür ve MÜHRÜNÜ DENETLER.
 *
 * Saklanan paket her okumada yeniden kanonikleştirilip hash'i alınır ve kayıtlı
 * hash ile karşılaştırılır. Sebebi ölçülebilir bir risk: paket Postgres'te
 * `jsonb` olarak duruyor ve jsonb anahtar sırasını KORUMAZ — kanonik
 * serileştirme tam bu yüzden sıralıyor. Denetim, "mühür tutuyor" cümlesini
 * koda değil ÖLÇÜME bağlar.
 *
 * Tutmazsa cevap "rapor yok" değil, mührün bozuk olduğunun SÖYLENMESİdir.
 */
import { NextResponse } from "next/server";
import { prisma } from "@cry/db";
import { kanonikJson, sha256 } from "@cry/rapor";
import { apiOturum } from "@/lib/yetki";

export async function GET(_istek: Request, ctx: { params: Promise<{ id: string }> }) {
  const { yanit: kapi } = await apiOturum();
  if (kapi) return kapi;

  const { id } = await ctx.params;
  let raporId: bigint;
  try {
    raporId = BigInt(id);
  } catch {
    return NextResponse.json({ error: "geçersiz id" }, { status: 400 });
  }

  const rapor = await prisma.report.findUnique({
    where: { id: raporId },
    include: { case: { select: { slug: true, title: true } } },
  });
  if (!rapor) return NextResponse.json({ error: "rapor bulunamadı" }, { status: 404 });

  const yenidenHash = sha256(kanonikJson(rapor.snapshot));

  return NextResponse.json({
    id: rapor.id.toString(),
    baslik: rapor.title,
    vaka: rapor.case,
    traceRunId: rapor.traceRunId?.toString() ?? null,
    olusturuldu: rapor.createdAt,
    sha256: rapor.sha256,
    pdfSha256: rapor.pdfSha256,
    muhur: {
      tutuyorMu: yenidenHash === rapor.sha256,
      yenidenHesaplanan: yenidenHash,
    },
    paket: rapor.snapshot,
  });
}
