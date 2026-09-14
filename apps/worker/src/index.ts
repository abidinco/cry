/**
 * Worker süreci — BullMQ tüketicileri.
 *
 * Ağır işin tamamı burada döner (evdeki makine: 14 çekirdek, 32 GB). Sunucu
 * yalnızca proxy ve izleme yapıyor.
 */
import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@cry/db";
import { KUYRUK, KUYRUK_ONEKI, type IndeksIsi, type TakipIsi } from "@cry/kuyruk";
import { adresIndeksle } from "./indeksle";
import { takipDevam, takipKos } from "./takip";
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
          `${sonuc.okunanSayfa} sayfa` +
          (sonuc.sonTarih ? `, ${sonuc.sonTarih.slice(0, 10)} tarihine kadar` : "") +
          (sonuc.atlananOnay ? `, ${sonuc.atlananOnay} onay atlandı` : "") +
          (sonuc.tamamlandi ? "" : " (devam edecek)"),
      );
    }
    return sonuc;
  },
  { connection: baglanti, concurrency: ESZAMANLI, prefix: KUYRUK_ONEKI },
);

/**
 * Takip koşusu ayrı bir kuyrukta ve eşzamanlılığı 1: bir koşu düğüm düğüm
 * ilerlerken aynı adresleri indeksleyebiliyor, iki koşunun aynı anda aynı
 * adresi taraması boşuna kaynak harcar.
 */
const takipWorker = new Worker<TakipIsi>(
  KUYRUK.takip,
  async (is: Job<TakipIsi>) => {
    const { devam } = is.data;
    if (devam) {
      // Devam hatası koşunun TAMAMINI "hata"ya çekmemeli: önceki graf sağlam.
      // Koşu "bitti"ye döner, hata devam kaydına yazılır.
      try {
        const sonuc = await takipDevam(BigInt(is.data.traceRunId), devam.adres, devam.ekHop, devam.userId ?? null);
        console.log(`✓ takip ${is.data.traceRunId} devam ${devam.adres} — ${sonuc.dugum} düğüm, ${sonuc.kenar} kenar`);
        return sonuc;
      } catch (hata) {
        const mesaj = hata instanceof Error ? hata.message : String(hata);
        console.error(`✗ takip ${is.data.traceRunId} devam ${devam.adres}:`, mesaj);
        const id = BigInt(is.data.traceRunId);
        const kosu = await prisma.traceRun.findUnique({ where: { id }, select: { stats: true } });
        const stats = (kosu?.stats ?? {}) as { devamHatalari?: unknown[] };
        await prisma.traceRun.update({
          where: { id },
          data: {
            status: "bitti",
            stats: {
              ...stats,
              devamHatalari: [
                ...(stats.devamHatalari ?? []),
                { adres: devam.adres, mesaj: mesaj.slice(0, 200), zaman: new Date().toISOString() },
              ],
            } as object,
          },
        });
        return { hata: mesaj };
      }
    }
    const sonuc = await takipKos(BigInt(is.data.traceRunId));
    console.log(
      `✓ takip ${is.data.traceRunId} — ${sonuc.dugum} düğüm, ${sonuc.kenar} kenar, ` +
        `durma: ${JSON.stringify(sonuc.durma)}`,
    );
    return sonuc;
  },
  { connection: baglanti, concurrency: 1, prefix: KUYRUK_ONEKI },
);

takipWorker.on("failed", async (is, hata) => {
  console.error(`✗ takip ${is?.data?.traceRunId} başarısız:`, hata?.message);
  // Koşu KAYDA "hata" diye geçer: yarım kalan bir taramanın "bitti"
  // görünmesi, eksik bir grafı tam sanmak demektir.
  if (is?.data?.traceRunId) {
    await prisma.traceRun
      .update({
        where: { id: BigInt(is.data.traceRunId) },
        data: { status: "hata", finishedAt: new Date(), stopReason: hata?.message?.slice(0, 200) },
      })
      .catch(() => {});
  }
});

indeksWorker.on("failed", (is, hata) => {
  console.error(`✗ ${is?.id ?? "?"} başarısız:`, hata?.message);
});

console.log(
  `worker ayakta — kuyruklar: ${KUYRUK.indeks} (${ESZAMANLI}), ${KUYRUK.takip} (1)`,
);

for (const sinyal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinyal, async () => {
    console.log(`${sinyal} — kuyruk kapatılıyor`);
    await indeksWorker.close();
    await takipWorker.close();
    await baglanti.quit();
    process.exit(0);
  });
}
