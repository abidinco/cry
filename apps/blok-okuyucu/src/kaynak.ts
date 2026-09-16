/**
 * TronGrid blok kaynağı — ağ tarafı. Ayrıştırma SAF paketde (`@cry/blok-indeks`), burada yok.
 *
 * Hız: istekler `@cry/chain`'in `RateGate`'inden ve `getJson`'undan geçer — adres taramasının
 * kullandığı kapının AYNISI (429/503 ve `Retry-After` tek yerde). B2 ölçüm kapısı
 * (scripts/olcum/b2-kapi.mts, 2026-09-16): 120 ms aralıkla 60 blok 14,4 sn, 0 yeniden deneme,
 * 4,16 blok/sn — zincirin üretim hızının 12,5 katı.
 * UYARI: kapı SÜREÇ içidir. Aynı anahtarı kullanan worker'la kota süreçler arasında paylaşılmaz;
 * sürekli çalışan okuyucuda (B4) bu ayrıca çözülür (yol haritası §4 "Kota paylaşımı").
 *
 * Kaynağın hatası veri gibi görünebilir (CLAUDE.md): TronGrid hız sınırını kimi zaman HTTP 200
 * gövdesinde yazıyor. Yanıtın ŞEKLİ doğrulanır, bozuksa yeniden denenir, sonunda HATA atılır —
 * bozuk yanıt asla "0 transferli blok" diye yazılmaz.
 */
import { getJson, RateGate } from "@cry/chain";

const TRONGRID = "https://api.trongrid.io";
const SEKIL_DENEME = 6;

const uyu = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type KaynakSayac = { istek: number; sekilHatasi: number };

export class TronBlokKaynagi {
  private readonly kapi: RateGate;
  private readonly basliklar: Record<string, string>;
  readonly sayac: KaynakSayac = { istek: 0, sekilHatasi: 0 };

  constructor(opts: { apiKey?: string; aralikMs?: number } = {}) {
    this.kapi = new RateGate(opts.aralikMs ?? 120);
    this.basliklar = { "Content-Type": "application/json", ...(opts.apiKey ? { "TRON-PRO-API-KEY": opts.apiKey } : {}) };
  }

  private async post<T>(yol: string, govde: unknown, sekilTamam: (j: unknown) => boolean): Promise<T> {
    let son: unknown;
    for (let d = 0; d < SEKIL_DENEME; d++) {
      await this.kapi.gec();
      this.sayac.istek++;
      const j = await getJson<unknown>(`${TRONGRID}${yol}`, { chain: "tron", method: "POST", headers: this.basliklar, body: JSON.stringify(govde) });
      if (sekilTamam(j)) return j as T;
      this.sayac.sekilHatasi++;
      son = j;
      await uyu(500 * 2 ** d);
    }
    throw new Error(`TronGrid ${yol} ${JSON.stringify(govde)}: ${SEKIL_DENEME} denemede şekli bozuk yanıt — ${JSON.stringify(son).slice(0, 200)}`);
  }

  /** KESİNLEŞMİŞ (solidified) en yüksek blok. Okuyucu bunun üstünü yazmaz. */
  async kesinlesmisBlok(): Promise<number> {
    const j = await this.post<{ block_header: { raw_data: { number: number } } }>("/walletsolidity/getnowblock", {}, blokSekli);
    return j.block_header.raw_data.number;
  }

  /** Bloğu ve işlem bilgilerini birlikte getirir; ikisi aynı blok numarasını taşımalı. */
  async blok(no: number): Promise<{ blok: unknown; bilgi: unknown[] }> {
    const [blok, bilgi] = await Promise.all([
      this.post<{ block_header: { raw_data: { number: number } } }>("/wallet/getblockbynum", { num: no }, blokSekli),
      this.post<unknown[]>("/wallet/gettransactioninfobyblocknum", { num: no }, Array.isArray),
    ]);
    if (blok.block_header.raw_data.number !== no) throw new Error(`TronGrid ${no} istendi, ${blok.block_header.raw_data.number} geldi`);
    return { blok, bilgi };
  }
}

function blokSekli(j: unknown): boolean {
  const n = (j as { block_header?: { raw_data?: { number?: unknown } } })?.block_header?.raw_data?.number;
  return typeof n === "number";
}
