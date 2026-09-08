/**
 * Worker süreci — BullMQ tüketicileri.
 *
 * Ağır işin tamamı burada döner (evdeki makine: 14 çekirdek, 32 GB). Sunucu
 * yalnızca proxy ve izleme yapıyor.
 */
import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { KUYRUK, type IndeksIsi } from "./kuyruklar";
import { adresIndeksle } from "./indeksle";
import type { ChainId } from "@cry/chain";

const baglanti = new IORedis(process.env.REDIS_URL ?? "redis://redis:6379", {
  // BullMQ şartı: bloklayan komutlar için yeniden deneme sınırı olmamalı.
  maxRetriesPerRequest: null,
});

/** Paralellik: kaynak hız sınırı zaten kapıda, burada CPU sınırı önemli. */
const ESZAMANLI = Number(process.env.WORKER_CONCURRENCY ?? 4);

const indeksWorker = new Worker<IndeksIsi>(
  KUYRUK.indeks,
  async (is: Job<IndeksIsi>) => {
    const { chain, address } = is.data;
    const sonuc = await adresIndeksle(chain as ChainId, address);
    // Atlanan iş SESSİZ kalmamalı: "veri yok" ile "bakılmadı" ayrı sorular.
    if (sonuc.atlanmaSebebi) {
      console.warn(`⊘ ${chain}:${address} atlandı — ${sonuc.atlanmaSebebi}`);
    } else {
      console.log(
        `✓ ${chain}:${sonuc.address} — ${sonuc.yeniHareket} yeni hareket, ` +
          `${sonuc.okunanSayfa} sayfa${sonuc.tamamlandi ? "" : " (devam edecek)"}`,
      );
    }
    return sonuc;
  },
  { connection: baglanti, concurrency: ESZAMANLI },
);

indeksWorker.on("failed", (is, hata) => {
  console.error(`✗ ${is?.id ?? "?"} başarısız:`, hata?.message);
});

console.log(`worker ayakta — kuyruk: ${KUYRUK.indeks}, eşzamanlı: ${ESZAMANLI}`);

for (const sinyal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinyal, async () => {
    console.log(`${sinyal} — kuyruk kapatılıyor`);
    await indeksWorker.close();
    await baglanti.quit();
    process.exit(0);
  });
}
