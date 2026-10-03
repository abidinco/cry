/**
 * GET /api/izleme/liste — Hetzner'daki izleme servisi buradan senkronlanır.
 *
 * Oturum çerezi İSTEMEZ (servis bir tarayıcı değil), paylaşılan bir jeton
 * ister. Jeton yoksa uç nokta AÇILMAZ: tanımsız bir sır "kontrol yok"
 * demektir, ve bu liste soruşturma konusu adresleri taşıyor.
 *
 * Liste EŞİKLERİ de taşır (kullanıcı kararı: eşik üstü mesaj, küçükler günlük
 * özete). Eşik servisin yanında DEĞİL burada durur; PC kapalıyken servis
 * elindeki son kopyayla çalışır, ama eşiği değiştiren insan tek bir yerden
 * değiştirir.
 */
import { NextResponse } from "next/server";
import { prisma } from "@cry/db";
import { jetonGecerliMi } from "@/lib/izleme";

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
      thresholds: { select: { assetSymbol: true, minAmount: true } },
    },
  });

  return NextResponse.json({
    watches: takipler.map((t) => ({
      chain: t.chain,
      address: t.address.address,
      label: t.label,
      lastSeenTxHash: t.lastSeenTxHash,
      thresholds: t.thresholds,
    })),
    ts: new Date().toISOString(),
  });
}
