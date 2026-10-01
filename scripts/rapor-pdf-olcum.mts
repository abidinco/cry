/**
 * Rapor PDF'inin ÖLÇÜMÜ — gerçek koşu, gerçek fiyat arşivi, gerçek yazı tipi.
 *
 * Dört şey ölçülüyor, çünkü dördü de kod okunarak doğrulanamaz:
 *  1. **Determinizm:** aynı rapordan iki kez üretilen PDF birebir aynı baytlar
 *     mı? `reports.pdf_sha256` sütunu bunu TAAHHÜT ediyor.
 *  2. **Boyut ve süre:** 1.300+ hareketli bir defter kaç sayfa, kaç bayt,
 *     kaç ms?
 *  3. **Basılamayan karakter:** yazı tipi raporun bastığı her karakteri
 *     kapsıyor mu? Kapsamayan karakter `?` olur ve SAYILIR.
 *  4. **Paketin kendisi bozulmadan geçiyor mu:** PDF'in bastığı mühür,
 *     paketin yeniden hash'lenmesiyle aynı mı?
 *
 * Koşum (dosya `C:\srv\cry\pdf-olcum-<id>.pdf` olarak da yazılır):
 *   node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/rapor-pdf-olcum.mts [raporId]
 */

import { writeFileSync } from "node:fs";
import { prisma } from "@cry/db";
import { kanonikJson, raporPdfi, sha256, yaziTipleriniOku, type KanitPaketi } from "@cry/rapor";

const raporId = BigInt(process.argv[2] ?? "3");

const rapor = await prisma.report.findUnique({ where: { id: raporId } });
if (!rapor) throw new Error(`rapor ${raporId} yok`);

const paket = rapor.snapshot as unknown as KanitPaketi;
const yenidenHash = sha256(kanonikJson(rapor.snapshot));
const girdi = {
  paket,
  raporId: rapor.id.toString(),
  sha256: rapor.sha256,
  muhurTutuyor: yenidenHash === rapor.sha256,
  olusturuldu: rapor.createdAt.toISOString(),
  kanitAdresi: `/api/rapor/${rapor.id}/kanit`,
};

const yazilar = yaziTipleriniOku();

const t0 = Date.now();
const bir = await raporPdfi(girdi, yazilar);
const sure1 = Date.now() - t0;
const t1 = Date.now();
const iki = await raporPdfi(girdi, yazilar);
const sure2 = Date.now() - t1;

const yol = `C:/srv/cry/pdf-olcum-${rapor.id}.pdf`;
writeFileSync(yol, bir.bayt);

console.log("");
console.log(`rapor            : ${rapor.id} · ${rapor.title}`);
console.log(`koşu             : ${paket.kosu.id} · ${paket.kosu.zincir} · ${paket.kosu.kok}`);
console.log(`graf             : ${paket.ozet.dugum} düğüm · ${paket.ozet.kenar} hareket`);
console.log(`mühür (paket)    : ${rapor.sha256}`);
console.log(`mühür denetimi   : ${girdi.muhurTutuyor ? "TUTUYOR" : "TUTMUYOR"}`);
console.log("");
console.log(`sayfa            : ${bir.sayfa}`);
console.log(`bayt             : ${bir.bayt.length.toLocaleString("tr-TR")}`);
console.log(`süre             : ${sure1} ms · ikinci üretim ${sure2} ms`);
console.log(`determinizm      : ${bir.sha256 === iki.sha256 ? "AYNI" : "FARKLI"}`);
console.log(`pdf sha256       : ${bir.sha256}`);
console.log(`kayıttaki        : ${rapor.pdfSha256 ?? "(henüz yazılmadı)"}`);
console.log(`basılamayan      : ${bir.basilamayan} karakter`);
console.log(`dosya            : ${yol}`);
console.log("");

await prisma.$disconnect();
