/**
 * http.ts — kaynak API'lerine giden tek kapı.
 *
 * Neden tek kapı: hız sınırı (429) bu projede BEKLENEN durumdur, hata değil.
 * Her adaptör kendi yeniden deneme mantığını yazsaydı, biri unutur ve o
 * kaynağın kayıtları sessizce eksik gelirdi — "atlandı" ile "yok" ayırt
 * edilemez hâle gelir.
 */

import { ChainSourceError, type ChainId } from "./types";

export type FetchOptions = {
  chain: ChainId;
  headers?: Record<string, string>;
  /** TronGrid'in işlem uçları POST istiyor; varsayılan GET. */
  method?: "GET" | "POST";
  body?: string;
  /** Toplam deneme sayısı (ilk deneme dâhil). */
  retries?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
};

const VARSAYILAN_TIMEOUT = 20_000;
const VARSAYILAN_DENEME = 4;

const uyu = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Beklenecek süre: kaynak `Retry-After` diyorsa ONA uyulur (kaynağın kendi
 * beyanı bizim tahminimizden güçlüdür), yoksa üstel geri çekilme + jitter.
 * Jitter şart: paralel worker'lar aynı anda uyanıp sınırı yeniden dövmesin.
 */
function bekleme(deneme: number, retryAfter: string | null): number {
  if (retryAfter) {
    const saniye = Number(retryAfter);
    if (Number.isFinite(saniye) && saniye >= 0) return Math.min(saniye * 1000, 60_000);
  }
  const taban = Math.min(1000 * 2 ** deneme, 30_000);
  return taban + Math.random() * 250;
}

export async function getJson<T>(url: string, opts: FetchOptions): Promise<T> {
  const denemeSayisi = opts.retries ?? VARSAYILAN_DENEME;
  let sonHata: unknown;

  for (let deneme = 0; deneme < denemeSayisi; deneme++) {
    const kontrol = new AbortController();
    const zamanlayici = setTimeout(() => kontrol.abort(), opts.timeoutMs ?? VARSAYILAN_TIMEOUT);
    const disaridanIptal = () => kontrol.abort();
    opts.signal?.addEventListener("abort", disaridanIptal, { once: true });

    try {
      const yanit = await fetch(url, {
        method: opts.method ?? "GET",
        headers: { accept: "application/json", ...opts.headers },
        body: opts.body,
        signal: kontrol.signal,
      });

      if (yanit.status === 429 || yanit.status === 503) {
        sonHata = new ChainSourceError(`hız sınırı (${yanit.status})`, {
          chain: opts.chain,
          status: yanit.status,
          rateLimited: true,
        });
        await uyu(bekleme(deneme, yanit.headers.get("retry-after")));
        continue;
      }

      if (!yanit.ok) {
        // 4xx kalıcıdır; yeniden denemek sınır bütçesini boşa harcar.
        const govde = await yanit.text().catch(() => "");
        throw new ChainSourceError(`HTTP ${yanit.status}: ${govde.slice(0, 200)}`, {
          chain: opts.chain,
          status: yanit.status,
        });
      }

      return (await yanit.json()) as T;
    } catch (hata) {
      if (hata instanceof ChainSourceError && !hata.opts.rateLimited) throw hata;
      if (opts.signal?.aborted) throw hata;
      sonHata = hata;
      if (deneme < denemeSayisi - 1) await uyu(bekleme(deneme, null));
    } finally {
      clearTimeout(zamanlayici);
      opts.signal?.removeEventListener("abort", disaridanIptal);
    }
  }

  throw new ChainSourceError(`${denemeSayisi} denemede alınamadı: ${url}`, {
    chain: opts.chain,
    cause: sonHata,
  });
}

/**
 * Saniyede N istek kapısı. Kaynakların ücretsiz katmanı saniye bazlı sınırlar
 * koyuyor (Etherscan 5/sn, TronGrid ~20/sn); worker'lar bu kapıdan geçer.
 */
export class RateGate {
  private siradaki = 0;
  constructor(private readonly aralikMs: number) {}

  static perSecond(n: number): RateGate {
    return new RateGate(Math.ceil(1000 / n));
  }

  async gec(): Promise<void> {
    const simdi = Date.now();
    const hedef = Math.max(simdi, this.siradaki);
    this.siradaki = hedef + this.aralikMs;
    const bekle = hedef - simdi;
    if (bekle > 0) await uyu(bekle);
  }
}
