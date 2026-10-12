/**
 * POST /api/durum/b3 — B3 doldurma ölçümünü ana sayfadaki karta yazar.
 *
 * `cry-b3-doldurma-bitti-mi` rutini ölçer ve AYNI sayıları hem karar masasına
 * hem buraya yollar; ikisi aynı ölçümün iki yüzüdür. Oturum değil JETON ister
 * (rutin bir tarayıcı değil) ve izleme servisiyle aynı jetonu kullanır:
 * `jetonGecerliMi` tanımsız jetonda ucu KAPALI tutar.
 *
 * Yazılan bir ÖLÇÜMDÜR: eski bir ölçüm yenisinin üstüne yazılmaz, çünkü geç
 * gelen bir tekrar durumu geri sardırırdı.
 */
import { NextResponse } from "next/server";
import { prisma } from "@cry/db";
import { jetonGecerliMi } from "@/lib/izleme";
import { b3Dogrula } from "@/lib/b3-durum";

export async function POST(istek: Request) {
  if (!jetonGecerliMi(istek.headers.get("x-watcher-token"))) {
    return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  }
  const ham = await istek.json().catch(() => null);
  const sonuc = b3Dogrula(ham);
  if ("hata" in sonuc) return NextResponse.json({ error: sonuc.hata }, { status: 400 });

  const olculdu = new Date(sonuc.olcum.ts);
  const mevcut = await prisma.durumOlcumu.findUnique({ where: { anahtar: "b3" } });
  if (mevcut && mevcut.olculdu > olculdu) {
    return NextResponse.json({ yazildi: false, sebep: "daha yeni ölçüm var", olculdu: mevcut.olculdu });
  }
  await prisma.durumOlcumu.upsert({
    where: { anahtar: "b3" },
    update: { veri: sonuc.olcum, olculdu },
    create: { anahtar: "b3", veri: sonuc.olcum, olculdu },
  });
  return NextResponse.json({ yazildi: true, olculdu });
}
