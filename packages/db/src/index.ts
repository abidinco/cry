/**
 * Prisma istemcisi — tek örnek.
 *
 * Next.js dev modunda modüller yeniden yüklenir; her yüklemede yeni bir
 * istemci açılırsa bağlantı havuzu birkaç dakikada tükenir.
 */
import { PrismaClient } from "@prisma/client";

const kure = globalThis as unknown as { __cryPrisma?: PrismaClient };

export const prisma: PrismaClient =
  kure.__cryPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") kure.__cryPrisma = prisma;

export * from "@prisma/client";

/**
 * `labels.verified_by` sütununda İNSAN kararının imzası — `kullanici:<ad>`.
 *
 * Burada duruyor çünkü iki taraf da soruyor ve ikisi de `@cry/db`ye zaten bağlı: etiket yazıcısı
 * (`@cry/etiket`) bu önekli satırlara DOKUNMAZ, web'in karar uç noktası da bu önekle YAZAR. İki
 * kopya olsaydı biri değişir öteki kalır ve insanın kararı bir sonraki kaynak turunda sessizce
 * geri alınırdı. Yön tek taraflı: insan kaynağı ezer, kaynak insanı EZEMEZ.
 */
export const INSAN_IMZASI = "kullanici:";
