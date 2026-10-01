/**
 * GET /api/takip/[id] — koşunun durumu ve ürettiği graf.
 *
 * Graf hop hop döner: okuyan kişi "para kaç sıçramada nereye vardı" sorusunu
 * sırayla takip ediyor.
 */
import { NextResponse } from "next/server";
import { prisma } from "@cry/db";
import { gorulemeyenler, registryFromEnv, type ChainId } from "@cry/chain";
import { apiOturum } from "@/lib/yetki";

const registry = registryFromEnv();

/**
 * Bu zincirde NE GÖRÜLEMİYOR. Adaptör yoksa cevap "yok" değil BİLİNMİYOR'dur (null) — bakılmamış
 * bir yeri temiz göstermemek bu projenin en çok tekrarlanan kuralı.
 */
function korluk(zincir: string): string[] | null {
  try {
    return gorulemeyenler(registry.get(zincir as ChainId).capabilities);
  } catch {
    return null;
  }
}

export async function GET(_istek: Request, ctx: { params: Promise<{ id: string }> }) {
  const { yanit: kapi } = await apiOturum();
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
    include: {
      case: { select: { slug: true, title: true, isDraft: true } },
      nodes: { orderBy: [{ hop: "asc" }, { id: "asc" }] },
      edges: { orderBy: [{ hop: "asc" }, { ts: "asc" }] },
    },
  });
  if (!kosu) return NextResponse.json({ error: "koşu bulunamadı" }, { status: 404 });

  return NextResponse.json({
    id: kosu.id.toString(),
    chain: kosu.chain,
    rootAddress: kosu.rootAddress,
    taintRule: kosu.taintRule,
    direction: kosu.direction,
    params: kosu.params,
    status: kosu.status,
    stopReason: kosu.stopReason,
    stats: kosu.stats,
    gorulemeyenler: korluk(kosu.chain),
    startedAt: kosu.startedAt,
    finishedAt: kosu.finishedAt,
    // `isDraft`: vaka koşu açılırken otomatik açıldı ve kimse adlandırmadı.
    // Ekran bunu rapor düğmesinde soruyor — karalamadan rapor alınmaz.
    vaka: kosu.case,
    dugumler: kosu.nodes.map((d) => ({
      address: d.address,
      hop: d.hop,
      amountRaw: d.amountRaw,
      isTerminal: d.isTerminal,
      terminalReason: d.terminalReason,
      etiketler: (d.labelSnapshot as { etiketler?: unknown[] })?.etiketler ?? [],
    })),
    kenarlar: kosu.edges.map((k) => ({
      txHash: k.txHash,
      from: k.fromAddress,
      to: k.toAddress,
      symbol: k.assetSymbol,
      decimals: k.decimals,
      amountRaw: k.amountRaw,
      ts: k.ts,
      hop: k.hop,
      taintShare: k.taintShare,
    })),
  });
}
