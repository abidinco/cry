/**
 * Rapor mührünün ÖLÇÜMÜ — gerçek koşu, gerçek fiyat arşivi.
 *
 * Üç şeyi ölçer, çünkü üçü de kod okunarak doğrulanamaz:
 *  1. Aynı koşudan iki kez üretilen paket (üretim zamanı hariç) AYNI hash'i
 *     veriyor mu — kanonik serileştirme gerçekten deterministik mi?
 *  2. Paket Postgres'e `jsonb` olarak yazılıp geri okunduğunda hash DEĞİŞİYOR
 *     mu? jsonb anahtar sırasını korumaz; mühür bunu kaldırmalı.
 *  3. Fiyatsız kenarlar raporda SEBEBİYLE mi görünüyor, yoksa sessizce 0 ₺ mi
 *     oluyor?
 *
 * Koşum:
 *   node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/rapor-olcum.mts [koşuId]
 */

import { prisma } from "@cry/db";
import { kanonikJson, sha256 } from "@cry/rapor";
import { kanitKaynagi } from "../apps/web/src/lib/rapor-kaynagi";

const kosuId = BigInt(process.argv[2] ?? "9");

const sure = async <T>(etiket: string, is: () => Promise<T>) => {
  const t0 = Date.now();
  const sonuc = await is();
  console.log(`${etiket}: ${Date.now() - t0} ms`);
  return sonuc;
};

const bir = await sure("1. paket", () => kanitKaynagi(kosuId, "Ölçüm raporu"));
if ("hata" in bir) throw new Error(bir.hata);
const iki = await sure("2. paket", () => kanitKaynagi(kosuId, "Ölçüm raporu"));
if ("hata" in iki) throw new Error(iki.hata);

// Üretim zamanı pakete GİRİYOR (rapor bir anın tutanağıdır), o yüzden iki
// paketin hash'i doğal olarak farklı. Determinizm ölçümü o alanı eşitler.
const esitle = (p: unknown) => ({ ...(p as object), uretildi: "sabit" });
const d1 = sha256(kanonikJson(esitle(bir.paket)));
const d2 = sha256(kanonikJson(esitle(iki.paket)));

console.log("");
console.log(`koşu            : ${kosuId} · ${bir.paket.kosu.zincir} · ${bir.paket.kosu.kok}`);
console.log(`düğüm / kenar   : ${bir.paket.ozet.dugum} / ${bir.paket.ozet.kenar}`);
console.log(`paket boyutu    : ${Buffer.byteLength(bir.metin, "utf8").toLocaleString("tr-TR")} bayt`);
console.log(`determinizm     : ${d1 === d2 ? "AYNI" : "FARKLI"} (${d1.slice(0, 16)}… / ${d2.slice(0, 16)}…)`);
console.log(`üretim zamanı farklı olduğu için mühürler: ${bir.sha256.slice(0, 16)}… / ${iki.sha256.slice(0, 16)}…`);

console.log("");
console.log("varlıklar:");
for (const v of bir.paket.ozet.varliklar) {
  console.log(
    `  ${v.sembol} (${v.sozlesme ?? "native"}) · ${v.kenar} kenar · ${v.tutar ?? v.hamToplam + " (ham)"} · ` +
      `işlem günü ${v.islemGunuTry ?? "—"} ₺ · rapor günü ${v.raporGunuTry ?? "—"} ₺ · fiyatsız ${v.fiyatsizKenar}`,
  );
}

console.log("");
console.log("bakılamayanlar:");
for (const e of bir.paket.ozet.eksikler) console.log(`  ${e.kenar} kenar · ${e.sebep}`);

console.log("");
console.log("uyarılar:");
for (const u of bir.paket.metodoloji.uyarilar) console.log(`  ${u}`);

// --- jsonb turu: yaz, geri oku, yeniden hash'le ---------------------------
const vaka = await prisma.traceRun.findUniqueOrThrow({ where: { id: kosuId }, select: { caseId: true } });
const yazilan = await prisma.report.create({
  data: {
    caseId: vaka.caseId,
    traceRunId: kosuId,
    title: "ÖLÇÜM — silinecek",
    snapshot: bir.paket as unknown as object,
    sha256: bir.sha256,
  },
});
const okunan = await prisma.report.findUniqueOrThrow({ where: { id: yazilan.id } });
const turSonrasi = sha256(kanonikJson(okunan.snapshot));
console.log("");
console.log(`jsonb turu      : ${turSonrasi === bir.sha256 ? "MÜHÜR TUTUYOR" : "MÜHÜR BOZULDU"}`);
console.log(`  yazılan: ${bir.sha256}`);
console.log(`  okunan : ${turSonrasi}`);

// Deneme kaydı iş bitince SİLİNİR (CLAUDE.md → deneme koşusu açıldıysa sil).
await prisma.report.delete({ where: { id: yazilan.id } });
console.log(`deneme raporu ${yazilan.id} silindi`);

/**
 * --- İkinci ölçüm: fiyatın GERÇEKTEN olduğu bir gün -----------------------
 *
 * Koşu 9'un kenarları 2019–2022 arası ve CoinGecko ücretsiz katmanı 365
 * günden eskisini vermiyor, yani o koşu TL yolunu hiç ateşlemiyor. Fiyat
 * arşivinin dolu olduğu bir güne denk gelen DENEME koşusu açılır, ölçülür ve
 * SİLİNİR (CLAUDE.md → deneme koşusu açıldıysa iş bitince sil).
 */
const fiyatliGun = await prisma.priceDaily.findFirst({
  where: { assetId: 2 },
  orderBy: { date: "desc" },
});
if (fiyatliGun) {
  const deneme = await prisma.traceRun.create({
    data: {
      caseId: vaka.caseId,
      chain: "tron",
      rootAddress: "TOLCUM0000000000000000000000000000",
      taintRule: "fifo",
      params: { maxHop: 1, maxDugum: 2 },
      status: "bitti",
      finishedAt: new Date(),
      stopReason: "butce",
      stats: { durma: { butce: 1 } },
    },
  });
  await prisma.traceNode.createMany({
    data: [
      { traceRunId: deneme.id, chain: "tron", address: "TOLCUM0000000000000000000000000000", hop: 0 },
      { traceRunId: deneme.id, chain: "tron", address: "TOLCUM1111111111111111111111111111", hop: 1 },
    ],
  });
  await prisma.traceEdge.createMany({
    data: [1, 2].map((i) => ({
      traceRunId: deneme.id,
      chain: "tron",
      txHash: `olcum${i}`.padEnd(64, "0"),
      txIndex: 0,
      fromAddress: "TOLCUM0000000000000000000000000000",
      toAddress: "TOLCUM1111111111111111111111111111",
      assetSymbol: "USDT",
      assetContract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      decimals: 6,
      amountRaw: String(1_500_000 * i),
      ts: fiyatliGun.date,
      hop: 1,
      taintShare: 1,
    })),
  });

  const ucuncu = await kanitKaynagi(deneme.id, "Ölçüm — fiyatlı gün");
  if ("hata" in ucuncu) throw new Error(ucuncu.hata);
  const v = ucuncu.paket.ozet.varliklar[0]!;
  console.log("");
  console.log(`fiyatlı gün     : ${fiyatliGun.date.toISOString().slice(0, 10)} · USD ${fiyatliGun.usd.toFixed()}`);
  console.log(`  2 kenar · ${v.tutar} USDT · işlem günü ${v.islemGunuTry ?? "—"} ₺ · rapor günü ${v.raporGunuTry ?? "—"} ₺`);
  console.log(`  kullanılan bülten: ${ucuncu.paket.defter[0]?.fiyat.islemGunu?.kurTarihi ?? "—"}`);
  for (const e of ucuncu.paket.ozet.eksikler) console.log(`  eksik: ${e.kenar} kenar · ${e.sebep}`);
  for (const u of ucuncu.paket.metodoloji.uyarilar) console.log(`  uyarı: ${u}`);

  await prisma.traceRun.delete({ where: { id: deneme.id } });
  console.log(`deneme koşusu ${deneme.id} silindi`);
}

await prisma.$disconnect();
