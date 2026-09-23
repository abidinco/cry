/**
 * POST /api/etiket/[id]/karar — doğrulanmamış bir borsa iddiasını insan karara bağlar.
 *
 * Neden bir uç nokta gerekti: motor doğrulanmış borsada `terminal` (iz BİTER), doğrulanmamışta
 * `terminal_aday` (devam edilebilir) diyor. Bugün 764 doğrulanmamış iddia var ve hiçbirini
 * onaylayacak bir yer yoktu — yani keşif çalışıyor, TronScan çalışıyor, ama son sözü söyleyecek
 * insanın eli klavyeye değmiyordu. "Yazıldı ama hiçbir sayfa sormuyor" bitmiş sayılmaz.
 *
 * Karar KAYNAĞI EZER ve bir daha ezilmez: imza `kullanici:` önekiyle yazılır, `etiketleriYaz` o
 * önekli satırlara dokunmaz (bkz. INSAN_IMZASI). Aksi hâlde bir sonraki `--kaynak=tronscan --uygula`
 * turu insanın kararını sessizce geri alırdı.
 */
import { NextResponse } from "next/server";
import { prisma, INSAN_IMZASI } from "@cry/db";
import { apiOturum } from "@/lib/yetki";
import { kararinVerisi, type Karar } from "@/lib/etiket-inceleme";

export async function POST(istek: Request, ctx: { params: Promise<{ id: string }> }) {
  const { oturum, yanit: kapi } = await apiOturum();
  if (kapi) return kapi;

  const { id } = await ctx.params;
  const etiketId = Number(id);
  if (!Number.isInteger(etiketId)) {
    return NextResponse.json({ error: "geçersiz id" }, { status: 400 });
  }

  const govde = (await istek.json().catch(() => ({}))) as { karar?: string; borsaAdi?: string };
  if (govde.karar !== "borsa" && govde.karar !== "borsa_degil") {
    return NextResponse.json({ error: "karar 'borsa' ya da 'borsa_degil' olmalı" }, { status: 400 });
  }
  const karar = govde.karar as Karar;

  const etiket = await prisma.label.findUnique({
    where: { id: etiketId },
    select: {
      id: true, chain: true, title: true, category: true, source: true,
      verifiedAt: true, verifiedBy: true, evidence: true,
      address: { select: { address: true } },
    },
  });
  if (!etiket) return NextResponse.json({ error: "etiket bulunamadı" }, { status: 404 });

  const simdi = new Date();
  const kim = `${INSAN_IMZASI}${oturum.username}`;
  const veri = kararinVerisi(karar, kim, simdi, govde.borsaAdi);

  // Kanıt, kararın GEREKÇESİNİ de taşır: rapora "doğrulanmış" diye giren bir etiketin kim
  // tarafından ve neyin üstüne onaylandığı sorulabilmeli. Önceki durum da yazılır — bir karar
  // geri alınacaksa nereye dönüleceği bilinsin.
  const kanit = (etiket.evidence ?? {}) as Record<string, unknown>;
  const insanKarari = {
    karar,
    kim: oturum.username,
    tarih: simdi.toISOString(),
    oncekiKategori: etiket.category,
    oncekiDogrulama: etiket.verifiedBy ?? null,
  };

  await prisma.label.update({
    where: { id: etiketId },
    data: { ...veri, evidence: { ...kanit, insanKarari } },
  });

  await prisma.auditLog.create({
    data: {
      userId: oturum.userId,
      action: "etiket.karar",
      target: `${etiket.chain}:${etiket.address.address}`,
      meta: {
        etiketId,
        karar,
        baslik: etiket.title,
        kaynak: etiket.source,
        borsaAdi: veri.exchange,
        oncekiKategori: etiket.category,
      },
    },
  });

  return NextResponse.json({ ok: true, karar, borsaAdi: veri.exchange });
}
