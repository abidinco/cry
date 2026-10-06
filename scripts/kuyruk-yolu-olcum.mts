/**
 * KUYRUK yolunun ölçümü — koşu, CANLI worker konteynerinde yürüyor mu?
 *
 * Betikten `takipKos`u doğrudan çağırmak kodu sınar, YOLU sınamaz: canlı yığında koşu
 * Redis'e atılır ve `cry-worker` konteyneri alır. Aradaki fark bir kez pahalıya patladı
 * (sekiz worker birikti, bir tur ESKİ KODLA koştu). Burada sınanan şey tam olarak budur:
 * işi API'nin attığı gibi atıp, işi KİMİN yaptığına ve sonucun ne dediğine bakmak.
 *
 * Oturum gerektiren HTTP ucu (`POST /api/takip`) bu betikte YOK: ajan parola girmiyor.
 * Ölçülen, o ucun gövdesinden sonraki her şey.
 *
 * Koşum:
 *   node --env-file=.env --env-file=apps/web/.env.local --import tsx \
 *     scripts/kuyruk-yolu-olcum.mts <adres> [--kaynakli]
 */
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@cry/db";
import { KUYRUK, KUYRUK_ONEKI, takipIsAnahtari, type TakipIsi } from "@cry/kuyruk";

const ADRES = process.argv.find((a) => a.startsWith("T") && a.length > 30) ?? "TBJSNuiCtUeypr3AMeTBoTGMeu8SbS7ZxV";
const KAYNAKLI = process.argv.includes("--kaynakli");
const satir = (a: string, b: string) => console.log(`${a.padEnd(24)} ${b}`);
const uyu = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const kullanici = await prisma.user.findFirstOrThrow({ where: { active: true }, select: { id: true } });
  const vaka = await prisma.case.create({
    data: {
      slug: `kuyruk-olcum-${Date.now().toString(36)}`,
      title: "ÖLÇÜM — kuyruk yolu",
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
      // API'nin yazdığı alanların aynısı.
      params: { maxHop: 3, maxDugum: 25, dallanmaEsigi: 50, pencereSaat: 24, yalnizYerel: !KAYNAKLI },
    },
  });
  satir("kök", ADRES);
  satir("kip", KAYNAKLI ? "KAYNAKLI" : "YALNIZCA YEREL");
  satir("koşu", `#${kosu.id}`);

  // API'nin kullandığı kuyruk ve ayarların aynısı; iş kimliği de aynı kurala göre.
  const baglanti = new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:16379", {
    maxRetriesPerRequest: null,
  });
  const kuyruk = new Queue<TakipIsi>(KUYRUK.takip, { connection: baglanti, prefix: KUYRUK_ONEKI });
  const anahtar = takipIsAnahtari(kosu.id.toString());
  const basladi = Date.now();
  const is = await kuyruk.add(KUYRUK.takip, { traceRunId: kosu.id.toString() }, { jobId: anahtar, attempts: 1 });
  satir("kuyruğa atıldı", `iş ${is.id}`);

  // Koşuyu DIŞARIDAN izliyoruz: durum veritabanından okunur, worker'ın içine bakılmaz.
  let durum = "kuyrukta";
  let son = "";
  for (let i = 0; i < 300; i++) {
    await uyu(1000);
    const k = await prisma.traceRun.findUniqueOrThrow({
      where: { id: kosu.id },
      select: { status: true, stats: true },
    });
    durum = k.status;
    const ilerleme = (k.stats as { ilerleme?: { islenen?: number; sirada?: number } } | null)?.ilerleme;
    const metin = ilerleme ? `islenen ${ilerleme.islenen ?? "?"} · sırada ${ilerleme.sirada ?? "?"}` : "";
    if (metin && metin !== son) {
      son = metin;
      console.log(`   ${((Date.now() - basladi) / 1000).toFixed(0)} sn · ${durum} · ${metin}`);
    }
    if (durum === "bitti" || durum === "hata" || durum === "durduruldu") break;
  }

  const bitmis = await prisma.traceRun.findUniqueOrThrow({
    where: { id: kosu.id },
    select: { status: true, stopReason: true, stats: true, startedAt: true, finishedAt: true },
  });
  const isDurumu = await (await kuyruk.getJob(anahtar))?.getState();

  satir("süre", `${((Date.now() - basladi) / 1000).toFixed(1)} sn`);
  satir("işin durumu (BullMQ)", String(isDurumu));
  satir("koşu durumu", `${bitmis.status} · ${bitmis.stopReason ?? "—"}`);
  satir("stats", JSON.stringify(bitmis.stats));

  const sayim = await prisma.traceNode.count({ where: { traceRunId: kosu.id } });
  const kenar = await prisma.traceEdge.count({ where: { traceRunId: kosu.id } });
  satir("graf", `${sayim} düğüm · ${kenar} kenar`);
  satir("ekran", `/takip/${kosu.id}`);

  await kuyruk.close();
  await baglanti.quit();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("ÖLÇÜM HATASI:", e);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
