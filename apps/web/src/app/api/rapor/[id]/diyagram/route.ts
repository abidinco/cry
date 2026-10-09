/**
 * GET /api/rapor/[id]/diyagram — raporun akış diyagramı, SVG.
 *
 * Rapora ekran görüntüsü konulmaz (öneri 11): görsel, MÜHÜRLÜ paketin kendi
 * verisinden sunucuda üretilir, yani aynı paket her zaman aynı resmi verir.
 * Resmin doğruluğu paketten yeniden üretilerek denetlenebilir.
 *
 * Yerleşim ekranın yerleşimidir (`@cry/akis`) ve kırpma kuralı da aynı
 * (`cizilecekler`): ikinci bir yerleşim, aynı paranın iki farklı resmi demekti.
 *
 * Başlıklar resmin NE OLDUĞUNU söyler: çizilen düğüm/şerit, çizilmeyen düğüm
 * sayısı ve çizilmeyen başka varlık hareketleri. Bir resim, neyi göstermediğini
 * söylemiyorsa eksiksiz sanılır.
 */
import { NextResponse } from "next/server";
import { prisma } from "@cry/db";
import { diyagramSvg, type KanitPaketi } from "@cry/rapor";
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

  const rapor = await prisma.report.findUnique({ where: { id: raporId } });
  if (!rapor) return NextResponse.json({ error: "rapor bulunamadı" }, { status: 404 });

  const sonuc = diyagramSvg(rapor.snapshot as unknown as KanitPaketi);
  return new NextResponse(sonuc.svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "private, max-age=3600",
      "x-cry-dugum": String(sonuc.dugum),
      "x-cry-serit": String(sonuc.serit),
      "x-cry-kirpilan": String(sonuc.kirpilan),
      "x-cry-varlik": sonuc.varlik ?? "yok",
      "x-cry-diger-varlik-kenari": String(sonuc.digerVarlikKenari),
    },
  });
}
