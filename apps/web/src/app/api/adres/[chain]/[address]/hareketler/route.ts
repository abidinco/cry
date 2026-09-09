/**
 * GET /api/adres/[chain]/[address]/hareketler — sayfalı işlem listesi.
 *
 * Tutar HAM tam sayı olarak döner, ondalık gösterim çağıranın işidir.
 */
import { NextResponse } from "next/server";
import { prisma } from "@cry/db";
import { registryFromEnv, type ChainId } from "@cry/chain";
import { apiOturum } from "@/lib/yetki";

const registry = registryFromEnv();
const SAYFA = 50;

export async function GET(istek: Request, ctx: { params: Promise<{ chain: string; address: string }> }) {
  const { yanit: kapi } = await apiOturum();
  if (kapi) return kapi;

  const { chain, address } = await ctx.params;
  let adres: string;
  try {
    adres = registry.get(chain as ChainId).normalizeAddress(decodeURIComponent(address));
  } catch {
    return NextResponse.json({ error: "geçersiz adres" }, { status: 400 });
  }

  const url = new URL(istek.url);
  const yon = url.searchParams.get("yon"); // gelen | giden | (ikisi)
  const sayfa = Math.max(0, Number(url.searchParams.get("sayfa") ?? 0) || 0);

  const kayit = await prisma.address.findUnique({
    where: { chain_address: { chain, address: adres } },
    select: { id: true },
  });
  if (!kayit) return NextResponse.json({ hareketler: [], toplam: 0, sayfa });

  const kosul =
    yon === "gelen"
      ? { toAddressId: kayit.id }
      : yon === "giden"
        ? { fromAddressId: kayit.id }
        : { OR: [{ fromAddressId: kayit.id }, { toAddressId: kayit.id }] };

  const [toplam, hareketler] = await Promise.all([
    prisma.transfer.count({ where: kosul }),
    prisma.transfer.findMany({
      where: kosul,
      orderBy: [{ ts: "desc" }, { id: "desc" }],
      skip: sayfa * SAYFA,
      take: SAYFA,
      select: {
        txHash: true, ts: true, amountRaw: true, kind: true, success: true,
        blockNumber: true,
        asset: { select: { symbol: true, decimals: true, contract: true } },
        fromAddress: { select: { address: true } },
        toAddress: { select: { address: true } },
      },
    }),
  ]);

  return NextResponse.json({
    toplam,
    sayfa,
    sayfaBoyutu: SAYFA,
    hareketler: hareketler.map((h) => ({
      txHash: h.txHash,
      ts: h.ts,
      amountRaw: h.amountRaw,
      kind: h.kind,
      success: h.success,
      blockNumber: h.blockNumber,
      symbol: h.asset.symbol,
      decimals: h.asset.decimals,
      contract: h.asset.contract || null,
      from: h.fromAddress?.address ?? null,
      to: h.toAddress?.address ?? null,
      // Yön, bakılan adrese GÖRE hesaplanır; ekranda ok yönü buna bakar.
      yon: h.toAddress?.address === adres ? "gelen" : "giden",
    })),
  });
}
