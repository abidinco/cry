/**
 * Ölçüm: raporun diyagramı mühürlü paketten üretiliyor mu, DETERMİNİSTİK mi?
 *
 * Üç şey kod okunarak doğrulanamaz:
 *  1. Aynı paket aynı baytları mı veriyor (rapora giren görsel için ŞART).
 *  2. Resim paketin SAYILARIYLA tutuyor mu — çizilen + kırpılan = paketin düğümü.
 *  3. SVG gerçekten ayrıştırılabilir mi (kapanmayan etiket, kaçırılmamış & vb.).
 *
 * Koşum:
 *   node --env-file=.env --env-file=apps/web/.env.local --import tsx \
 *     scripts/rapor-diyagram-olcum.mts [raporId...]
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { prisma } from "@cry/db";
import { diyagramSvg, type KanitPaketi } from "@cry/rapor";

const idler = (process.argv.slice(2).filter((a) => /^\d+$/.test(a)) || []).map((x) => BigInt(x));
const satir = (a: string, b: string) => console.log(`${a.padEnd(24)} ${b}`);

const raporlar = idler.length
  ? await prisma.report.findMany({ where: { id: { in: idler } }, orderBy: { id: "asc" } })
  : await prisma.report.findMany({ orderBy: { id: "asc" } });

for (const r of raporlar) {
  const paket = r.snapshot as unknown as KanitPaketi;
  const bir = diyagramSvg(paket);
  const iki = diyagramSvg(paket);
  const h = (s: string) => createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);

  console.log(`\n=== rapor ${r.id} · ${r.title}`);
  satir("paket", `${paket.surum} · ${paket.ozet.dugum} düğüm / ${paket.ozet.kenar} hareket`);
  satir("determinizm", bir.svg === iki.svg ? `AYNI (${h(bir.svg)})` : "FARKLI — HATA");
  satir("boyut", `${bir.svg.length.toLocaleString("tr-TR")} bayt`);
  satir("çizilen", `${bir.dugum} düğüm · ${bir.serit} şerit · varlık ${bir.varlik ?? "yok"}`);
  satir("kırpılan", `${bir.kirpilan} düğüm · başka varlık ${bir.digerVarlikKenari} hareket`);
  // Çizilen + kırpılan, paketin düğüm sayısını vermeli: eksik bir resim
  // "hepsi bu" diye okunur.
  satir(
    "çizilen+kırpılan",
    `${bir.dugum + bir.kirpilan} ⟷ paket ${paket.ozet.dugum} ${
      bir.dugum + bir.kirpilan === paket.ozet.dugum ? "(tutuyor)" : "(TUTMUYOR)"
    }`,
  );
  // Kaba ama yeterli bir yapı denetimi: etiketler dengeli mi, yasak ham & var mı.
  const acilan = (bir.svg.match(/<(?!\/)[a-zA-Z]/g) ?? []).length;
  const kapanan = (bir.svg.match(/<\/[a-zA-Z]/g) ?? []).length + (bir.svg.match(/\/>/g) ?? []).length;
  const hamAmper = (bir.svg.match(/&(?!amp;|lt;|gt;|quot;|#)/g) ?? []).length;
  satir("yapı", `açılan ${acilan} · kapanan ${kapanan} · kaçırılmamış & ${hamAmper}`);
  const yol = `C:/srv/cry/diyagram-${r.id}.svg`;
  writeFileSync(yol, bir.svg, "utf8");
  satir("dosya", yol);
}

await prisma.$disconnect();
