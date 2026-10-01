/**
 * Ekranda bakılacak bir rapor üretir (tek seferlik, elle çalıştırılır).
 *
 * Neden ayrı bir betik: "rapor al" düğmesi oturum ister ve oturumu KULLANICI
 * açar. Betik aynı yolu (`kanitKaynagi` → mühür → `reports`) kullanıyor, yani
 * sayfanın göstereceği şey arayüzden alınacak raporla aynı yoldan geliyor.
 *
 *   node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/rapor-ornek.mts <koşuId> "<başlık>"
 */

import { prisma } from "@cry/db";
import { kanitKaynagi } from "../apps/web/src/lib/rapor-kaynagi";

const kosuId = BigInt(process.argv[2] ?? "9");
const baslik = process.argv[3] ?? `Koşu ${kosuId} — kanıt paketi`;

const kaynak = await kanitKaynagi(kosuId, baslik);
if ("hata" in kaynak) {
  console.error(`rapor alınamadı: ${kaynak.hata} (${kaynak.durum})`);
  process.exitCode = 1;
} else {
  const rapor = await prisma.report.create({
    data: {
      caseId: kaynak.vaka.id,
      traceRunId: kaynak.kosuId,
      title: baslik,
      snapshot: kaynak.paket as unknown as object,
      sha256: kaynak.sha256,
    },
  });
  console.log(`rapor ${rapor.id}  ·  mühür ${kaynak.sha256}`);
  console.log(`sayfa: /rapor/${rapor.id}`);
  console.log(`kanıt: /api/rapor/${rapor.id}/kanit`);
}

await prisma.$disconnect();
