/**
 * GET /api/rapor/[id]/kanit — kanıt paketinin KANONİK BAYTLARI.
 *
 * Hash'i basan taraf, hash'i ürettiği metni de verebilmeli: bu uç, hash'i
 * alınan metnin ta kendisini indirir. Okuyan kişi `sha256sum` ile kendi
 * başına doğrulayabilir — doğrulanamayan bir mühür, mühür değildir.
 *
 * Bu yüzden `NextResponse.json` KULLANILMAZ: o, nesneyi kendi biçimiyle
 * yeniden yazar ve baytlar hash'in alındığı metinden ayrılırdı.
 */
import { NextResponse } from "next/server";
import { prisma } from "@cry/db";
import { kanonikJson, sha256 } from "@cry/rapor";
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

  const metin = kanonikJson(rapor.snapshot);
  return new NextResponse(metin, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="cry-kanit-${rapor.id}.json"`,
      // Başlıkta duran hash, indirilen baytların hash'idir.
      "x-cry-sha256": sha256(metin),
      "x-cry-kayitli-sha256": rapor.sha256,
    },
  });
}
