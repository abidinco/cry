/**
 * Etiket tohumlama aracı.
 *
 *   npx tsx packages/etiket/src/cli.ts --kaynak=ofac          (kuru koşu)
 *   npx tsx packages/etiket/src/cli.ts --kaynak=ofac --uygula
 *   npx tsx packages/etiket/src/cli.ts --kaynak=aday --uygula
 *   npx tsx packages/etiket/src/cli.ts --kaynak=kesif [--esik=50]
 *   npx tsx packages/etiket/src/cli.ts --kaynak=kesif-blok [--esik=50] [--minGuven=0.7]   (ClickHouse ister)
 *   npx tsx packages/etiket/src/cli.ts --kaynak=tronscan [--kapsam=aday|hepsi] [--sinir=N] [--tazele]
 *
 * TronScan `TRONSCAN_API_KEY` ister; yanıtlar `.onbellek/tronscan/` altına
 * yazılır ve aynı adrese ikinci kez ağa çıkılmaz (`--tazele` yok sayar).
 *
 * `--dosya=<yol>` verilirse OFAC listesi ağdan değil o dosyadan okunur —
 * 83 MB'lık belgeyi her denemede yeniden indirmemek için.
 *
 * Varsayılan KURU: yazan bir tur açık bir bayrakla istenir.
 */

import { readFile } from "node:fs/promises";
import { prisma } from "@cry/db";
import { ADAY_ETIKETLER } from "./aday";
import { arsivdenAdaylar } from "./kesif-oku";
import { bloktanAdaylar } from "./kesif-blok-oku";
import { ofacAyristir, ofacIndir } from "./ofac";
import { tronscanEtiketleri } from "./tronscan-oku";
import type { TohumSonucu } from "./tipler";
import { etiketleriYaz } from "./yaz";

function bayrak(ad: string): string | null {
  const p = process.argv.find((a) => a.startsWith(`--${ad}=`));
  return p ? p.slice(ad.length + 3) : null;
}

async function kaynagiOku(kaynak: string): Promise<TohumSonucu> {
  if (kaynak === "aday") {
    return { etiketler: ADAY_ETIKETLER, atlananlar: [], kaynakSurumu: "elle, 2026-09-09" };
  }
  if (kaynak === "kesif") {
    const esik = Number(bayrak("esik") ?? 50);
    return arsivdenAdaylar({ karsiTarafEsigi: esik, gecisEsigi: esik * 2 });
  }
  if (kaynak === "kesif-blok") {
    const esik = Number(bayrak("esik") ?? 50);
    return bloktanAdaylar({ karsiTarafEsigi: esik, gecisEsigi: esik * 2 }, Number(bayrak("minGuven") ?? 0.7));
  }
  if (kaynak === "ofac") {
    const dosya = bayrak("dosya");
    const xml = dosya ? await readFile(dosya, "utf8") : await ofacIndir();
    return ofacAyristir(xml);
  }
  if (kaynak === "tronscan") {
    const kapsam = bayrak("kapsam") ?? "aday";
    if (kapsam !== "aday" && kapsam !== "hepsi") throw new Error(`bilinmeyen kapsam: ${kapsam}`);
    return tronscanEtiketleri({
      kapsam,
      sinir: Number(bayrak("sinir") ?? 0),
      tazele: process.argv.includes("--tazele"),
      onbellekDizini: ".onbellek/tronscan",
      anahtar: process.env.TRONSCAN_API_KEY ?? "",
    });
  }
  throw new Error(`bilinmeyen kaynak: ${kaynak} (ofac|aday|kesif|kesif-blok|tronscan)`);
}

async function main() {
  const kaynak = bayrak("kaynak") ?? "ofac";
  const uygula = process.argv.includes("--uygula");

  const sonuc = await kaynagiOku(kaynak);
  console.log(`kaynak: ${kaynak}${sonuc.kaynakSurumu ? ` (sürüm: ${sonuc.kaynakSurumu})` : ""}`);

  const zincirBasina = new Map<string, number>();
  for (const e of sonuc.etiketler) {
    zincirBasina.set(e.chain, (zincirBasina.get(e.chain) ?? 0) + 1);
  }
  console.log(
    `çözülen etiket: ${sonuc.etiketler.length} — ` +
      [...zincirBasina].map(([z, n]) => `${z}:${n}`).join(", "),
  );

  // Atlananlar SAYILIR ve sebebiyle görünür: sessizce atlanan kayıt
  // "kaynakta yoktu" sanılır.
  const sebepler = new Map<string, number>();
  for (const a of sonuc.atlananlar) sebepler.set(a.sebep, (sebepler.get(a.sebep) ?? 0) + 1);
  console.log(`atlanan: ${sonuc.atlananlar.length}`);
  for (const [sebep, n] of [...sebepler].sort((a, b) => b[1] - a[1])) {
    // Bir sebebe TEK kayıt düşüyorsa sayı bir şey anlatmaz; kaydın kendisi
    // anlatır (keşifte "1 — taranmamış" değil, "6.642 adres — taranmamış").
    const tekil = n === 1 ? sonuc.atlananlar.find((a) => a.sebep === sebep)?.ham : null;
    console.log(`  ⊘ ${(tekil ?? String(n)).padStart(12)} — ${sebep}`);
  }

  // "N kayıt yazılacak" bir doğrulama değildir: örneğe elle bakılır.
  console.log("\nörnek (ilk 5):");
  for (const e of sonuc.etiketler.slice(0, 5)) {
    console.log(
      `  ${e.chain.padEnd(9)} ${e.address}  ${e.category}  ${e.dogrulanmisMi ? "✓doğrulanmış" : "?doğrulanmamış"}  ${e.title}`,
    );
    // Gerekçe olmadan bir aday onaylanamaz: insan neye baktığını görmeli.
    if (e.description) console.log(`            ↳ ${e.description}`);
  }

  // Arşivde KARŞILIĞI olan etiketler: tohumun bugün işe yarayıp yaramadığı.
  const kesisim: string[] = [];
  for (const e of sonuc.etiketler) {
    const v = await prisma.address.findUnique({
      where: { chain_address: { chain: e.chain, address: e.address } },
      select: { id: true },
    });
    if (v) kesisim.push(`${e.chain} ${e.address} — ${e.title}`);
  }
  console.log(`\narşivde zaten duran adrese denk gelen etiket: ${kesisim.length}`);
  for (const s of kesisim.slice(0, 20)) console.log(`  • ${s}`);

  const rapor = await etiketleriYaz(sonuc.etiketler, { uygula });
  console.log(
    `\n${uygula ? "YAZILDI" : "KURU KOŞU"} — yeni adres ${rapor.yeniAdres} · ` +
      `yeni etiket ${rapor.yeniEtiket} · güncellenen ${rapor.guncellenen} · ` +
      `değişmeyen ${rapor.degismeyen}`,
  );

  if (uygula) {
    // Sayaç dizinin uzunluğu değil VERİTABANININ sayısıdır.
    const toplam = await prisma.label.count();
    const kategoriler = await prisma.label.groupBy({ by: ["category"], _count: true });
    console.log(
      `veritabanında etiket: ${toplam} — ` +
        kategoriler.map((k) => `${k.category}:${k._count}`).join(", "),
    );
  } else {
    console.log("(yazmak için --uygula)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
