/**
 * GET /api/izleme/liste — Hetzner'daki izleme servisi buradan senkronlanır.
 *
 * Oturum çerezi İSTEMEZ (servis bir tarayıcı değil), paylaşılan bir jeton
 * ister. Jeton yoksa uç nokta AÇILMAZ: tanımsız bir sır "kontrol yok"
 * demektir, ve bu liste soruşturma konusu adresleri taşıyor.
 */
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@cry/db";

function jetonGecerliMi(gelen: string | null): boolean {
  const beklenen = process.env.WATCHER_TOKEN;
  if (!beklenen || !gelen) return false;
  const a = Buffer.from(gelen);
  const b = Buffer.from(beklenen);
  // Uzunluk farkı timingSafeEqual'ı patlatır; önce ayrı kontrol.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(istek: Request) {
  if (!jetonGecerliMi(istek.headers.get("x-watcher-token"))) {
    return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  }

  const takipler = await prisma.watch.findMany({
    where: { active: true },
    select: {
      chain: true,
      label: true,
      lastSeenTxHash: true,
      address: { select: { address: true } },
    },
  });

  return NextResponse.json({
    watches: takipler.map((t) => ({
      chain: t.chain,
      address: t.address.address,
      label: t.label,
      lastSeenTxHash: t.lastSeenTxHash,
    })),
    ts: new Date().toISOString(),
  });
}
