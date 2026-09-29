/**
 * Kaynaklardan çekme — ağ katmanı.
 *
 * Tasarımı iki ÖLÇÜM belirledi (2026-09-30):
 *
 * - **TCMB hızlı ve tam geçmişli**: 2005'e kadar HTTP 200, 25–170 ms. Arşivin
 *   2.841 günü tek turda kapanabilir.
 * - **CoinGecko dar ve inatçı**: 6 ardışık çağrının 6'sı 429 döndü ve sınır
 *   ISRAR etti. Tur yavaş, geri çekilmeli ve her sonucu KALICI yazan bir tur
 *   olmak zorunda; aynı günü ikinci kez sormanın bedeli yüksek.
 */

import { cgDurumu, cgGecmisUrl } from "./coingecko";
import { tcmbDurumu, tcmbUrl } from "./tcmb";
import type { FiyatYoklamasi, TcmbYoklama } from "./tipler";

const uyu = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Kaynağa saniyede bir istekten fazlasını götürmeyen basit kapı. */
export class Kapi {
  private siradaki = 0;
  constructor(private readonly aralikMs: number) {}
  async gec(): Promise<void> {
    const simdi = Date.now();
    const hedef = Math.max(simdi, this.siradaki);
    this.siradaki = hedef + this.aralikMs;
    if (hedef > simdi) await uyu(hedef - simdi);
  }
}

async function iste(url: string, timeoutMs = 20_000): Promise<{ status: number; govde: string }> {
  const kontrol = new AbortController();
  const z = setTimeout(() => kontrol.abort(), timeoutMs);
  try {
    const y = await fetch(url, { headers: { accept: "application/json" }, signal: kontrol.signal });
    return { status: y.status, govde: await y.text() };
  } finally {
    clearTimeout(z);
  }
}

/** TCMB: bir günün bültenini çek. */
export async function tcmbCek(isoGun: string, kapi: Kapi): Promise<TcmbYoklama> {
  await kapi.gec();
  try {
    const { status, govde } = await iste(tcmbUrl(isoGun));
    return tcmbDurumu(status, govde);
  } catch (e) {
    return { sonuc: "kaynak_hatasi", detay: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * CoinGecko: bir coin'in bir günkü fiyatı.
 *
 * 429'da geri çekilir. Geri çekilme burada, `http.ts`te değil: o katman
 * `ChainSourceError` ve `ChainId` istiyor, bu kaynağın ikisi de yok.
 */
export async function cgCek(
  coinId: string,
  isoGun: string,
  kapi: Kapi,
  denemeler = 4,
): Promise<FiyatYoklamasi> {
  let son: FiyatYoklamasi = { sonuc: "kaynak_hatasi", detay: "hiç denenmedi" };
  for (let d = 0; d < denemeler; d++) {
    await kapi.gec();
    try {
      const { status, govde } = await iste(cgGecmisUrl(coinId, isoGun));
      son = cgDurumu(coinId, isoGun, status, govde);
    } catch (e) {
      son = { sonuc: "kaynak_hatasi", detay: e instanceof Error ? e.message : String(e) };
    }
    if (son.sonuc !== "hiz_siniri") return son;
    // Sınır israr ediyor (ölçüldü): üstel ve uzun bekle.
    await uyu(Math.min(15_000 * 2 ** d, 120_000) + Math.random() * 500);
  }
  return son;
}
