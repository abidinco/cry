/**
 * POST /api/takip/[id]/durdur — süren ya da bekleyen bir koşuyu durdurur.
 *
 * İki hâl var ve ikisi ayrı ele alınır:
 * - Kuyrukta BEKLEYEN iş hemen kaldırılır; koşu işlenmeye hiç başlamadıysa
 *   burada kapatılır.
 * - O an İŞLENEN iş kuyruktan çekilemez: iptal bayrağı konur, worker bir
 *   sonraki adreste görür ve koşuyu "durduruldu" diye kapatır.
 *
 * Durdurulan koşu EKSİK bir graftır ve öyle işaretlenir; sırada kalan adres
 * sayısı kayda geçer.
 */
import { NextResponse } from "next/server";
import { prisma } from "@cry/db";
import { apiOturum } from "@/lib/yetki";
import { takipIsleriniKaldir, zamanAsimi } from "@/lib/kuyruk";

export async function POST(_istek: Request, ctx: { params: Promise<{ id: string }> }) {
  const { oturum, yanit: kapi } = await apiOturum();
  if (kapi) return kapi;

  const { id } = await ctx.params;
  let kosuId: bigint;
  try {
    kosuId = BigInt(id);
  } catch {
    return NextResponse.json({ error: "geçersiz id" }, { status: 400 });
  }

  const kosu = await prisma.traceRun.findUnique({
    where: { id: kosuId },
    select: { status: true, chain: true, rootAddress: true },
  });
  if (!kosu) return NextResponse.json({ error: "koşu bulunamadı" }, { status: 404 });
  if (kosu.status !== "kuyrukta" && kosu.status !== "calisiyor") {
    return NextResponse.json({ error: "koşu zaten durmuş" }, { status: 409 });
  }

  // Bayrak ÖNCE konur: iş tam şimdi başlıyorsa worker onu ilk yoklamada görür.
  await prisma.$executeRaw`
    update trace_runs
       set stats = jsonb_set(coalesce(stats, '{}'::jsonb), '{iptal}', 'true'::jsonb)
     where id = ${kosuId}`;

  let kaldirilan = 0;
  let aktif = false;
  try {
    ({ kaldirilan, aktif } = await zamanAsimi(takipIsleriniKaldir(id)));
  } catch {
    // Kuyruğa ulaşılamıyorsa bekleyen iş de İŞLENEMEZ: koşu burada kapatılır.
    // Worker ayağa kalkıp iptal bayrağını görürse zaten duracaktır.
    aktif = false;
  }

  if (!aktif) {
    // İşlenen iş yok: worker bayrağı hiç görmeyecek, koşu burada kapanır.
    const dugum = await prisma.traceNode.count({ where: { traceRunId: kosuId } });
    await prisma.$executeRaw`
      update trace_runs
         set status = ${dugum > 0 ? "bitti" : "durduruldu"},
             finished_at = now(),
             stats = jsonb_set(
               coalesce(stats, '{}'::jsonb) - 'iptal' - 'ilerleme',
               '{durdurmalar}',
               coalesce(stats->'durdurmalar', '[]'::jsonb) || jsonb_build_array(
                 jsonb_build_object('kaldirilanIs', ${kaldirilan}::int, 'baslamadan', true, 'zaman', now())
               )
             )
       where id = ${kosuId}`;
  }

  await prisma.auditLog.create({
    data: {
      userId: oturum.userId,
      action: "takip.durdur",
      target: `${kosu.chain}:${kosu.rootAddress}`,
      meta: { traceRunId: id, kaldirilanIs: kaldirilan, aktifti: aktif },
    },
  });

  return NextResponse.json({ ok: true, kaldirilan, aktif });
}
