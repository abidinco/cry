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
