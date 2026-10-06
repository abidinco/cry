/**
 * YALNIZCA YEREL kipin ölçümü — gerçek ClickHouse, gerçek Postgres, gerçek koşu.
 *
 * "Kaynağa gitmiyor" bir iddia; burada ÖLÇÜLÜYOR: `fetch` sarmalanıp dışarı giden her
 * istek ana bilgisayarına göre sayılıyor. `api.trongrid.io` sayacı 0 değilse kip sözünü
 * tutmuyor demektir — kod okuyarak değil koşturarak doğrulanır.
 *
 * Koşum:
 *   node --env-file=.env --env-file=apps/web/.env.local --import tsx \
 *     scripts/yalniz-yerel-olcum.mts <adres> [--kaynakli] [--kalsin]
 */
import { prisma } from "@cry/db";
import { takipKos } from "../apps/worker/src/takip.js";

const ADRES = process.argv.find((a) => a.startsWith("T") && a.length > 30) ?? "TBJSNuiCtUeypr3AMeTBoTGMeu8SbS7ZxV";
const KAYNAKLI = process.argv.includes("--kaynakli");
const KALSIN = process.argv.includes("--kalsin");

/* --- Giden istek sayacı: kipin sözünü tutup tutmadığının ÖLÇÜSÜ --- */
const istek = new Map<string, number>();
const gercekFetch = globalThis.fetch;
globalThis.fetch = (async (girdi: RequestInfo | URL, baslik?: RequestInit) => {
  const url = typeof girdi === "string" ? girdi : girdi instanceof URL ? girdi.href : girdi.url;
  let ana = "?";
  try {
    ana = new URL(url).host;
  } catch {
    /* göreli adres: sayılmaz */
  }
  istek.set(ana, (istek.get(ana) ?? 0) + 1);
  return gercekFetch(girdi, baslik);
}) as typeof fetch;

const satir = (a: string, b: string) => console.log(`${a.padEnd(26)} ${b}`);

async function main() {
  const kullanici = await prisma.user.findFirstOrThrow({ where: { active: true }, select: { id: true } });
  const vaka = await prisma.case.create({
    data: {
      slug: `olcum-yerel-${Date.now().toString(36)}`,
      title: "ÖLÇÜM — yalnızca yerel",
      ownerId: kullanici.id,
      isDraft: true,
    },
  });
  const kosu = await prisma.traceRun.create({
    data: {
      caseId: vaka.id,
      chain: "tron",
      rootAddress: ADRES,
      taintRule: "fifo",
      params: {
        maxHop: 3,
        maxDugum: 25,
        dallanmaEsigi: 50,
        pencereSaat: 24,
        // Ölçümün konusu bu alan.
        yalnizYerel: !KAYNAKLI,
      },
    },
  });

  satir("kök", ADRES);
  satir("kip", KAYNAKLI ? "KAYNAKLI (eski yol)" : "YALNIZCA YEREL");
  satir("koşu", `#${kosu.id}`);

  const basladi = Date.now();
  let ozet: Awaited<ReturnType<typeof takipKos>> | null = null;
  let hata: string | null = null;
  try {
    ozet = await takipKos(kosu.id);
  } catch (e) {
    hata = (e as Error).message.slice(0, 200);
  }
  const sure = Date.now() - basladi;

  const son = await prisma.traceRun.findUniqueOrThrow({
    where: { id: kosu.id },
    select: { status: true, stopReason: true, stats: true },
  });

  satir("süre", `${(sure / 1000).toFixed(1)} sn`);
  satir("sonuç", hata ? `HATA: ${hata}` : `${ozet?.dugum} düğüm · ${ozet?.kenar} kenar`);
  satir("durum", `${son.status} · ${son.stopReason ?? "—"}`);
  satir("stats", JSON.stringify(son.stats));

  console.log("\nGİDEN İSTEKLER (ana bilgisayara göre):");
  if (istek.size === 0) console.log("  — hiç dış istek yok —");
  for (const [ana, n] of [...istek].sort((a, b) => b[1] - a[1])) {
    const not = ana.includes("trongrid") ? "  ← KAYNAK" : ana.includes("127.0.0.1") || ana.includes("localhost") ? "  (yerel)" : "";
    console.log(`  ${String(n).padStart(5)} × ${ana}${not}`);
  }

  // Pencere dışı kalan düğümlerin kaydı: "kaç adreste eksik baktık" ekranda görünmeli.
  const notlar = await prisma.address.groupBy({
    by: ["indexState", "indexNote"],
    where: { chain: "tron", lastIndexedAt: { gte: new Date(basladi) } },
    _count: true,
  });
  console.log("\nTARANAN ADRESLERİN KAPSAMI:");
  for (const n of notlar) console.log(`  ${n.indexState} / ${n.indexNote ?? "—"}: ${n._count}`);

  if (!KALSIN) {
    await prisma.traceRun.delete({ where: { id: kosu.id } });
    await prisma.case.delete({ where: { id: vaka.id } });
    console.log(`\ntemizlik: koşu #${kosu.id} ve vakası silindi`);
  } else {
    console.log(`\n--kalsin: koşu #${kosu.id} BIRAKILDI`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("ÖLÇÜM HATASI:", e);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
