/**
 * GET /api/rapor/[id]/pdf — mühürlü raporun PDF'i.
 *
 * PDF kanıt DEĞİLDİR, kanıt paketinin okunur hâlidir: kanonik hash paketin
 * (JSON) hash'i, PDF'in kendi hash'i `reports.pdf_sha256`. O sütun bir
 * taahhüt: aynı rapordan üretilen PDF her zaman aynı baytları vermeli. Bu
 * yüzden üretim deterministik (tarihler paketin `uretildi` anından) ve
 * ilk üretimde hash KAYDA yazılıyor.
 *
 * Sonraki üretimler kayıttakiyle KARŞILAŞTIRILIR ve uyuşmazlık sessizce
 * geçmez: başlıkta hem üretilenin hem kayıtlının hash'i durur. Yazı tipi ya
 * da kütüphane sürümü değişirse fark buradan görünür — "yazdı, oldu" demek,
 * mühür iddiası olan bir çıktıda yeterli değil.
 */
import { NextResponse } from "next/server";
import { prisma } from "@cry/db";
import { kanonikJson, raporPdfi, sha256, yaziTipleriniOku, type KanitPaketi } from "@cry/rapor";
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

  const paket = rapor.snapshot as unknown as KanitPaketi;
  const yenidenHash = sha256(kanonikJson(rapor.snapshot));

  let sonuc;
  try {
    sonuc = await raporPdfi(
      {
        paket,
        raporId: rapor.id.toString(),
        sha256: rapor.sha256,
        // Mühür tutmuyorsa PDF bunu İLK SAYFADA yazar; üretimi engellemez,
        // çünkü "bozuk mühür" de bir bulgudur ve kâğıda geçmesi gerekir.
        muhurTutuyor: yenidenHash === rapor.sha256,
        olusturuldu: rapor.createdAt.toISOString(),
        kanitAdresi: `/api/rapor/${rapor.id}/kanit`,
      },
      yaziTipleriniOku(),
    );
  } catch (hata) {
    // Yazı tipi bulunamadıysa sebep yolları sayar: "PDF alınamadı" tek başına
    // hangi kurulumun bozuk olduğunu söylemiyor.
    return NextResponse.json(
      { error: `PDF üretilemedi: ${hata instanceof Error ? hata.message : String(hata)}` },
      { status: 500 },
    );
  }

  if (!rapor.pdfSha256) {
    await prisma.report.update({ where: { id: rapor.id }, data: { pdfSha256: sonuc.sha256 } });
  }
  const uyusuyor = !rapor.pdfSha256 || rapor.pdfSha256 === sonuc.sha256;

  return new NextResponse(Buffer.from(sonuc.bayt), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="cry-rapor-${rapor.id}.pdf"`,
      // İndirilen baytların hash'i, ve kayıtta duran hash: ikisi ayrı satır.
      "x-cry-pdf-sha256": sonuc.sha256,
      "x-cry-kayitli-pdf-sha256": rapor.pdfSha256 ?? sonuc.sha256,
      "x-cry-pdf-uyusuyor": uyusuyor ? "evet" : "HAYIR",
      "x-cry-sha256": rapor.sha256,
      "x-cry-sayfa": String(sonuc.sayfa),
      "x-cry-basilamayan": String(sonuc.basilamayan),
    },
  });
}
