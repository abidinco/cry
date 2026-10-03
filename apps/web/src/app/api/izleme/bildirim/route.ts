/**
 * POST /api/izleme/bildirim — izleme servisi gönderdiği uyarıları geri İTER.
 *
 * Neden var: servis Hetzner'da kendi SQLite'ına yazıyor ve o kayıt hiçbir
 * ekranda görünmüyordu. **Kurulu ama sorulmayan bir servis, `/etiket`ten
 * önceki etiketlerin aynısıdır** — yazılmış ama kimsenin sormadığı bilgi.
 * Bu uç, servisten PC'ye tek yönlü bir rapor kanalıdır.
 *
 * Oturum değil JETON ister (servis bir tarayıcı değil). İtilen kayıt bir
 * TALİMAT değil, bir ÖLÇÜMDÜR: yalnızca uyarı satırı ve o takibin son bakış
 * damgası yazılır; eşik, aktiflik ve liste üyeliği burada DEĞİŞTİRİLEMEZ.
 */
import { NextResponse } from "next/server";
import { prisma } from "@cry/db";
import { jetonGecerliMi } from "@/lib/izleme";

type GelenUyari = {
  chain?: string;
  address?: string;
  txHash?: string;
  movementKey?: string;
  ts?: string;
  assetSymbol?: string | null;
  amountRaw?: string | null;
  direction?: string | null;
  path?: string | null;
  reason?: string | null;
  sentAt?: string | null;
};

const ZAMAN = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t;
};

export async function POST(istek: Request) {
  if (!jetonGecerliMi(istek.headers.get("x-watcher-token"))) {
    return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  }

  const govde = (await istek.json().catch(() => ({}))) as {
    alerts?: GelenUyari[];
    tur?: { bitti?: string; bakilanlar?: { chain?: string; address?: string }[] };
  };
  const gelenler = Array.isArray(govde.alerts) ? govde.alerts.slice(0, 500) : [];
  const bakilanlar = Array.isArray(govde.tur?.bakilanlar)
    ? govde.tur.bakilanlar.slice(0, 1000)
    : [];
  if (gelenler.length === 0 && bakilanlar.length === 0) {
    return NextResponse.json({ yazildi: 0, atlanan: 0, bakisIsaretlendi: 0 });
  }

  // Takipler tek sorguda: uyarı başına gidiş dönüş, 500 kayıtta 500 sorgu olurdu.
  const takipler = await prisma.watch.findMany({
    select: { id: true, chain: true, address: { select: { address: true } } },
  });
  const anahtar = new Map(takipler.map((t) => [`${t.chain}\u0000${t.address.address}`, t.id]));

  let yazildi = 0;
  const atlananlar: string[] = [];
  const sonBakis = new Map<number, { ts: Date; txHash: string }>();

  for (const u of gelenler) {
    const watchId = anahtar.get(`${u.chain}\u0000${u.address}`);
    // Listede olmayan adres SESSİZCE yazılmaz: bu uç bir izleme listesi
    // DÜZENLEME kanalı değil, rapor kanalıdır.
    if (!watchId || !u.txHash) {
      atlananlar.push(`${u.chain}:${u.address}`);
      continue;
    }
    const zaman = ZAMAN(u.ts) ?? new Date();
    await prisma.alert.upsert({
      where: {
        watchId_txHash_movementKey: {
          watchId,
          txHash: u.txHash,
          movementKey: u.movementKey ?? "",
        },
      },
      update: { sentAt: ZAMAN(u.sentAt), path: u.path ?? "mesaj", reason: u.reason ?? null },
      create: {
        watchId,
        txHash: u.txHash,
        movementKey: u.movementKey ?? "",
        ts: zaman,
        amountRaw: u.amountRaw ?? null,
        assetSymbol: u.assetSymbol ?? null,
        direction: u.direction ?? null,
        path: u.path ?? "mesaj",
        reason: u.reason ?? null,
        sentAt: ZAMAN(u.sentAt),
      },
    });
    yazildi += 1;
    const onceki = sonBakis.get(watchId);
    if (!onceki || onceki.ts < zaman) sonBakis.set(watchId, { ts: zaman, txHash: u.txHash });
  }

  for (const [watchId, son] of sonBakis) {
    await prisma.watch.update({
      where: { id: watchId },
      data: { lastSeenTxHash: son.txHash, lastCheckedAt: new Date() },
    });
  }

  /* --- Turun kendisi: "baktım, hareket yok" bir BİLGİdir --- */
  //
  // Damga yalnızca uyarı geldiğinde ilerlerse, hareketsiz bir adres hiç
  // bakılmamış gibi görünür ve SESSİZ bir kopma fark edilmez. Canlı okuyucuda
  // ölçüldü: yalnızca damgaya bakan denetim, 45,6 saat geride "healthy" dedi.
  //
  // Bakılamayan adres listeye GİRMEZ (servis onu göndermiyor): "yok" ile
  // "bakılamadı" ayrı cevaplardır.
  const bakisId = bakilanlar
    .map((b) => anahtar.get(`${b.chain}\u0000${b.address}`))
    .filter((id): id is number => typeof id === "number");
  const bakisIsaretlendi =
    bakisId.length === 0
      ? 0
      : (
          await prisma.watch.updateMany({
            where: { id: { in: bakisId } },
            data: { lastCheckedAt: ZAMAN(govde.tur?.bitti) ?? new Date() },
          })
        ).count;

  return NextResponse.json({
    yazildi,
    atlanan: atlananlar.length,
    // Atlananın SEBEBİ söylenir: "0 yazıldı" tek başına arızayı gizler.
    atlananOrnek: atlananlar.slice(0, 5),
    bakisIsaretlendi,
  });
}
