/**
 * POST /api/takip — takip koşusu başlatır.
 *
 * Koşu HTTP isteği içinde yürütülmez: bir tarama dakikalarca sürebilir ve
 * sekme kapanınca yarım kalan bir graf "tamamlanmış" görünür.
 */
import { NextResponse } from "next/server";
import { prisma } from "@cry/db";
import { registryFromEnv, type ChainId } from "@cry/chain";
import { VARSAYILAN_ESIKLER } from "@cry/motor";
import { apiOturum } from "@/lib/yetki";
import { takipIstegi } from "@/lib/kuyruk";

const registry = registryFromEnv();
const KURALLAR = ["fifo", "orantisal", "zaman_pencereli"];

export async function POST(istek: Request) {
  const { oturum, yanit: kapi } = await apiOturum();
  if (kapi) return kapi;

  const govde = (await istek.json().catch(() => ({}))) as {
    chain?: string;
    address?: string;
    caseId?: number;
    vakaBasligi?: string;
    taintRule?: string;
    maxHop?: number;
    maxDugum?: number;
    dallanmaEsigi?: number;
    minTutar?: string;
    pencereSaat?: number;
    tohumTx?: string;
  };

  const { chain, address } = govde;
  if (!chain || !address) {
    return NextResponse.json({ error: "chain ve address gerekli" }, { status: 400 });
  }

  let kok: string;
  try {
    kok = registry.get(chain as ChainId).normalizeAddress(address);
  } catch (hata) {
    return NextResponse.json(
      { error: hata instanceof Error ? hata.message : "geçersiz adres" },
      { status: 400 },
    );
  }

  const kural = govde.taintRule ?? "fifo";
  if (!KURALLAR.includes(kural)) {
    return NextResponse.json({ error: `bilinmeyen atıf kuralı: ${kural}` }, { status: 400 });
  }

  // Vaka zorunlu (şema kararı): koşu bir dosyaya ait olmalı ki denetim kaydı
  // ve rapor bir yere bağlansın. Vaka verilmezse o adres için biri açılır.
  const vaka = govde.caseId
    ? await prisma.case.findUnique({ where: { id: govde.caseId } })
    : await prisma.case.create({
        data: {
          slug: `${chain}-${kok.slice(0, 8).toLowerCase()}-${Date.now().toString(36)}`,
          title: govde.vakaBasligi ?? `${kok.slice(0, 10)}… takibi`,
          ownerId: oturum.userId,
        },
      });
  if (!vaka) return NextResponse.json({ error: "vaka bulunamadı" }, { status: 404 });

  const kosu = await prisma.traceRun.create({
    data: {
      caseId: vaka.id,
      chain,
      rootAddress: kok,
      taintRule: kural,
      // Eşikler kayda YAZILIR: rapor hangi sınırlarla üretildiğini söylemeli.
      params: {
        maxHop: govde.maxHop ?? VARSAYILAN_ESIKLER.maxHop,
        maxDugum: govde.maxDugum ?? VARSAYILAN_ESIKLER.maxDugum,
        dallanmaEsigi: govde.dallanmaEsigi ?? VARSAYILAN_ESIKLER.dallanmaEsigi,
        minTutar: govde.minTutar ?? VARSAYILAN_ESIKLER.minTutar.toString(),
        pencereSaat: govde.pencereSaat ?? 24,
        tohumTx: govde.tohumTx ?? null,
      },
    },
  });

  await takipIstegi(kosu.id.toString());
  await prisma.auditLog.create({
    data: {
      userId: oturum.userId,
      action: "takip.baslat",
      target: `${chain}:${kok}`,
      meta: { traceRunId: kosu.id.toString(), kural },
    },
  });

  return NextResponse.json({
    traceRunId: kosu.id.toString(),
    caseSlug: vaka.slug,
    kural,
  });
}
