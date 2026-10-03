/**
 * İzleme ölçümü — eşik yolunun gerçek veriyle ÖLÇÜLMESİ.
 *
 * Neden böyle: bu projedeki ciddi kusurların hepsi gerçek veriyle koşturulunca
 * çıktı. Ölçülenler:
 *   1. `/api/izleme/liste` eşikleri taşıyor mu (servis onları oradan alıyor),
 *   2. kuru koşu gerçek bir adreste hareketleri hangi yola ayırıyor,
 *   3. `/api/izleme/bildirim` uyarıyı Postgres'e yazıyor mu ve listede OLMAYAN
 *      adresi atlayıp sebebini söylüyor mu.
 *
 * Koşum:
 *   node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/izleme-olcum.mts [adres]
 *
 * Açtığı deneme kayıtlarını sonunda SİLER (`--kalsin` derse bırakır).
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "@cry/db";

const ADRES = process.argv.find((a) => a.startsWith("T")) ?? "TAUN6FwrnwwmaEqYcckffC7wYmbaS6cBiX";
const KALSIN = process.argv.includes("--kalsin");
const TABAN = process.env.OLCUM_TABANI ?? "http://127.0.0.1:3005";
const JETON = process.env.WATCHER_TOKEN ?? "";
const SAAT = process.env.WATCHER_DRY_HOURS ?? "1";

const satir = (a: string, b: string) => console.log(`${a.padEnd(34)} ${b}`);

async function main() {
  if (!JETON) throw new Error("WATCHER_TOKEN yok — ölçüm jetonsuz yapılamaz");

  /* --- 1. Deneme takibi: adres + eşikler --- */
  const adresKaydi = await prisma.address.upsert({
    where: { chain_address: { chain: "tron", address: ADRES } },
    update: {},
    create: { chain: "tron", address: ADRES, indexState: "bilinmiyor" },
    select: { id: true, indexState: true },
  });
  const takip = await prisma.watch.upsert({
    where: { chain_addressId: { chain: "tron", addressId: adresKaydi.id } },
    update: { active: true, label: "ÖLÇÜM" },
    create: { chain: "tron", addressId: adresKaydi.id, label: "ÖLÇÜM", active: true },
    select: { id: true },
  });
  await prisma.watchThreshold.deleteMany({ where: { watchId: takip.id } });
  await prisma.watchThreshold.createMany({
    data: [
      { watchId: takip.id, assetSymbol: "USDT", minAmount: "1000" },
      { watchId: takip.id, assetSymbol: "*", minAmount: "1" },
    ],
  });
  satir("takip", `#${takip.id} ${ADRES} (indeks durumu ${adresKaydi.indexState})`);

  /* --- 2. Liste ucu eşikleri taşıyor mu --- */
  const liste = await fetch(`${TABAN}/api/izleme/liste`, {
    headers: { "x-watcher-token": JETON },
  });
  const listeGovde = (await liste.json()) as {
    watches?: { address: string; thresholds?: { assetSymbol: string; minAmount: string }[] }[];
  };
  const bizim = listeGovde.watches?.find((w) => w.address === ADRES);
  satir(
    "liste ucu",
    `HTTP ${liste.status} · ${listeGovde.watches?.length ?? 0} adres · eşikler: ` +
      (bizim?.thresholds?.map((e) => `${e.assetSymbol}=${e.minAmount}`).join(" ") ?? "YOK"),
  );
  const jetonsuz = await fetch(`${TABAN}/api/izleme/liste`);
  satir("liste ucu — jetonsuz", `HTTP ${jetonsuz.status} (401 beklenir)`);

  /* --- 3. Kuru koşu: gerçek TronGrid, Telegram KAPALI, hiçbir şey yazılmaz --- */
  const gecici = join(mkdtempSync(join(tmpdir(), "cry-watcher-")), "olcum.sqlite");
  const basladi = Date.now();
  const cikti = await new Promise<string>((coz, hata) => {
    const p = spawn(process.execPath, ["apps/watcher/src/index.js", "--kuru"], {
      env: {
        ...process.env,
        WATCHER_DB_PATH: gecici,
        WATCHER_DRY: "1",
        WATCHER_DRY_HOURS: SAAT,
        PC_BASE_URL: TABAN,
      },
    });
    let metin = "";
    p.stdout.on("data", (d) => (metin += d));
    p.stderr.on("data", (d) => (metin += d));
    p.on("error", hata);
    p.on("close", () => coz(metin));
  });
  // Kuru koşu listeyi senkronlamıyor (yazmıyor), o yüzden kendi deposunu
  // doldurmak için listeyi bir kez elle yazdıralım demiyoruz: servis canlıda
  // senkronluyor. Burada ölçülen şey, senkron sonrası ilk turun kararı.
  satir("kuru koşu", `${Date.now() - basladi} ms`);
  for (const l of cikti.trim().split(/\r?\n/)) console.log(`   ${l}`);

  /* --- 4. Bildirim ucu: uyarı Postgres'e yazılıyor mu --- */
  const uyarilar = [
    {
      chain: "tron",
      address: ADRES,
      txHash: `olcum${Date.now().toString(36)}`,
      movementKey: "USDT|gelen|0",
      ts: new Date().toISOString(),
      assetSymbol: "USDT",
      amountRaw: "2500000000",
      direction: "gelen",
      path: "mesaj",
      reason: "esik_ustu",
      sentAt: new Date().toISOString(),
    },
    {
      chain: "tron",
      address: "TListedeOlmayanAdres",
      txHash: "yok",
      movementKey: "X|gelen|0",
      ts: new Date().toISOString(),
      path: "mesaj",
      reason: "esik_ustu",
      sentAt: new Date().toISOString(),
    },
  ];
  const bildirim = await fetch(`${TABAN}/api/izleme/bildirim`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-watcher-token": JETON },
    body: JSON.stringify({ alerts: uyarilar }),
  });
  const bGovde = (await bildirim.json()) as Record<string, unknown>;
  satir("bildirim ucu", `HTTP ${bildirim.status} · ${JSON.stringify(bGovde)}`);

  // İkinci kez aynı uyarı: tekillik hareket bazında mı?
  const tekrar = await fetch(`${TABAN}/api/izleme/bildirim`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-watcher-token": JETON },
    body: JSON.stringify({ alerts: uyarilar }),
  });
  satir("aynı uyarı ikinci kez", `HTTP ${tekrar.status} · ${JSON.stringify(await tekrar.json())}`);

  const kayitli = await prisma.alert.findMany({
    where: { watchId: takip.id },
    select: { txHash: true, movementKey: true, path: true, reason: true, assetSymbol: true },
  });
  satir("Postgres'teki uyarı", `${kayitli.length} satır · ${JSON.stringify(kayitli)}`);
  const guncelTakip = await prisma.watch.findUnique({
    where: { id: takip.id },
    select: { lastSeenTxHash: true, lastCheckedAt: true },
  });
  satir("son bakış ilerledi mi", JSON.stringify(guncelTakip));

  /* --- 5. Temizlik: deneme kaydı bırakılmaz --- */
  if (!KALSIN) {
    await prisma.watch.delete({ where: { id: takip.id } });
    satir("temizlik", `takip #${takip.id} ve uyarıları silindi`);
  } else {
    satir("temizlik", "--kalsin: kayıt BIRAKILDI");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (hata) => {
    console.error("ÖLÇÜM HATASI:", hata);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
