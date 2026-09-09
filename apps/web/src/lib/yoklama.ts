/**
 * Yoklama katmanının bağlantıları: hız kapısı ve kalıcı önbellek.
 *
 * `probe()` saf karar katmanı; ağa ve veritabanına buradan bağlanır. Böylece
 * ölçüt tek yerde kalır ve testte ağ olmadan çalıştırılabilir.
 */
import { prisma } from "@cry/db";
import { getJson, RateGate, probe, type ProbeDeps, type ProbeResult } from "@cry/chain";
import type { Detection } from "@cry/chain";

/** Etherscan ücretsiz katmanı 5 çağrı/sn; kapı bütün rotalarda ortak. */
const kapi = RateGate.perSecond(4);

/**
 * Önbellek ÖMRÜ sonuca göre değişir. Bulunan bir adres kalıcıdır; BULUNAMAYAN
 * bir adres yalnızca "şimdilik" yoktur — yarın ilk işlemini alabilir. Negatif
 * cevabı uzun süre saklamak, aktifleşmiş bir adresi "yok" diye göstermek olur.
 */
const OMUR_BULUNDU_MS = 30 * 24 * 3600 * 1000;
const OMUR_BULUNAMADI_MS = 60 * 60 * 1000;

function taze(sonuc: ProbeResult, yazilma: Date): boolean {
  const bulundu = sonuc.hits.some((h) => h.exists);
  const omur = bulundu ? OMUR_BULUNDU_MS : OMUR_BULUNAMADI_MS;
  return Date.now() - yazilma.getTime() < omur;
}

function baglantilar(kind: string): ProbeDeps {
  return {
    etherscanKey: process.env.ETHERSCAN_API_KEY ?? "",
    trongridKey: process.env.TRONGRID_API_KEY ?? "",

    // `init` AKTARILMALI: TronGrid'in işlem ucu POST + gövde istiyor ve bu
    // parametre düşürülünce GET gidip boş nesne dönüyordu — gerçek bir TRON
    // işlemi "TRON'da yok" diye raporlandı.
    fetchJson: async (url: string, init?: RequestInit) => {
      await kapi.gec();
      return getJson<unknown>(url, {
        chain: "ethereum", // yalnızca hata metni için; yoklama zincir bağımsız
        retries: 2,
        timeoutMs: 12_000,
        method: (init?.method as "GET" | "POST" | undefined) ?? "GET",
        body: typeof init?.body === "string" ? init.body : undefined,
        headers: init?.headers as Record<string, string> | undefined,
      });
    },

    cacheGet: async (k) => {
      const kayit = await prisma.probeCache.findUnique({ where: { input: k } });
      if (!kayit) return null;
      const sonuc = kayit.result as unknown as ProbeResult;
      return taze(sonuc, kayit.probedAt) ? sonuc : null;
    },

    cacheSet: async (k, v) => {
      await prisma.probeCache.upsert({
        where: { input: k },
        update: { result: v as never, probedAt: new Date(), kind },
        create: { input: k, kind, result: v as never },
      });
    },
  };
}

export async function yokla(
  tespit: Detection,
  ekZincirler: string[] = [],
): Promise<ProbeResult> {
  return probe(tespit, baglantilar(tespit.kind), ekZincirler as never);
}
