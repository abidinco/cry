/**
 * Kuyruk üreticisi — web tarafı yalnızca İŞ ATAR, iş yapmaz.
 *
 * Uzun tarama isteği HTTP isteği içinde koşturulmaz: kullanıcı sekmeyi
 * kapatınca yarım kalır ve yarım kalan tarama "tamamlandı" sanılır.
 */
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { KUYRUK, KUYRUK_ONEKI, indeksIsAnahtari, type IndeksIsi } from "@cry/kuyruk";

const kure = globalThis as unknown as { __cryKuyruk?: Queue<IndeksIsi> };

function baglanti() {
  return new IORedis(process.env.REDIS_URL ?? "redis://redis:6379", {
    maxRetriesPerRequest: null,
  });
}

export function indeksKuyrugu(): Queue<IndeksIsi> {
  // Dev modunda modüller yeniden yükleniyor; her yüklemede yeni bir Redis
  // bağlantısı açılırsa havuz birkaç dakikada tükenir.
  kure.__cryKuyruk ??= new Queue<IndeksIsi>(KUYRUK.indeks, {
    connection: baglanti(),
    prefix: KUYRUK_ONEKI,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 3600, count: 200 },
      removeOnFail: { age: 86400 },
    },
  });
  return kure.__cryKuyruk;
}

export type IsDurumu = "yok" | "bekliyor" | "calisiyor" | "bitti" | "hata";

/**
 * İşi kuyruğa atar. Aynı adres için bekleyen bir iş varsa İKİNCİSİ AÇILMAZ —
 * kullanıcı düğmeye üç kez basınca üç tur tarama yapılmamalı.
 */
export async function indeksIstegi(is: IndeksIsi): Promise<{ isId: string; yeni: boolean }> {
  const kuyruk = indeksKuyrugu();
  const anahtar = indeksIsAnahtari(is.chain, is.address);

  const mevcut = await kuyruk.getJob(anahtar);
  if (mevcut) {
    const durum = await mevcut.getState();
    if (durum === "waiting" || durum === "active" || durum === "delayed") {
      return { isId: anahtar, yeni: false };
    }
    // Bitmiş ya da hatalı iş aynı anahtarı tutuyor; yenisi için yer açılır.
    await mevcut.remove();
  }

  await kuyruk.add(KUYRUK.indeks, is, {
    jobId: anahtar,
    priority: is.reason === "arama" ? 1 : 5,
  });
  return { isId: anahtar, yeni: true };
}

export async function isDurumu(chain: string, address: string): Promise<IsDurumu> {
  const is = await indeksKuyrugu().getJob(indeksIsAnahtari(chain, address));
  if (!is) return "yok";
  const durum = await is.getState();
  if (durum === "completed") return "bitti";
  if (durum === "failed") return "hata";
  if (durum === "active") return "calisiyor";
  return "bekliyor";
}
