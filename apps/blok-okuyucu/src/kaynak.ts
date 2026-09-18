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
 * bozuk yanıt asla "0 transferli blok" diye yazılmaz. Şekli doğru ama İÇERİĞİ eksik yanıtı (bilgisini
 * tutmadığı blokta boş dizi) ayrıştırıcı yakalar: işlem bilgisi işlemlerle birebir eşleşmeli.
 *
 * Kaynaklar (B3 kapısı, 2026-09-17): TronGrid (anahtarlı, tam geçmiş), tronstack (anahtarsız, tam
 * geçmiş, 200 ms'de hatasız), publicnode (anahtarsız, yalnızca son ~92 gün; kısa patlamada 24,6 blok/sn ama SÜREKLİ yükte 60 ms × 4 eşzaman 5,9 blok/sn hatasız, 25 ms × 8 ise 7,7 blok/sn ve 800 blokta 3 hata).
 */
import { getJson, RateGate } from "@cry/chain";

const TRONGRID = "https://api.trongrid.io";
const SEKIL_DENEME = 6;

export type KaynakTanimi = {
  ad: string;
  url: string;
  basliklar?: Record<string, string>;
  aralikMs: number;
  /** Şekli bozuk yanıtta toplam deneme. Geçmişi kısa kaynakta düşük tutulur: yok olan blok beklemekle gelmez. */
  sekilDeneme?: number;
};

/** Bilinen kaynaklar ve B3 kapısında hatasız ölçülen hızları. */
export const KAYNAKLAR = {
  trongrid: (apiKey?: string, aralikMs = 120): KaynakTanimi => ({ ad: "trongrid", url: TRONGRID, aralikMs, basliklar: apiKey ? { "TRON-PRO-API-KEY": apiKey } : {} }),
  tronstack: (aralikMs = 200): KaynakTanimi => ({ ad: "tronstack", url: "https://api.tronstack.io", aralikMs, sekilDeneme: 3 }),
  publicnode: (aralikMs = 60): KaynakTanimi => ({ ad: "publicnode", url: "https://tron-rpc.publicnode.com", aralikMs, sekilDeneme: 2 }),
};

const uyu = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type KaynakSayac = { istek: number; sekilHatasi: number };

export class TronBlokKaynagi {
  readonly ad: string;
  private readonly url: string;
  private readonly kapi: RateGate;
  private readonly basliklar: Record<string, string>;
  private readonly sekilDeneme: number;
  readonly sayac: KaynakSayac = { istek: 0, sekilHatasi: 0 };

  /** Tanımsız çağrı TronGrid'dir (B2'nin okuyucusu). */
  constructor(opts: { apiKey?: string; aralikMs?: number } | KaynakTanimi = {}) {
    const t = "url" in opts ? opts : KAYNAKLAR.trongrid(opts.apiKey, opts.aralikMs);
    this.ad = t.ad;
    this.url = t.url;
    this.kapi = new RateGate(t.aralikMs);
    this.basliklar = { "Content-Type": "application/json", ...t.basliklar };
    this.sekilDeneme = t.sekilDeneme ?? SEKIL_DENEME;
  }

  private async post<T>(yol: string, govde: unknown, sekilTamam: (j: unknown) => boolean): Promise<T> {
    let son: unknown;
    for (let d = 0; d < this.sekilDeneme; d++) {
      await this.kapi.gec();
      this.sayac.istek++;
      const j = await getJson<unknown>(`${this.url}${yol}`, { chain: "tron", method: "POST", headers: this.basliklar, body: JSON.stringify(govde) });
      if (sekilTamam(j)) return j as T;
      this.sayac.sekilHatasi++;
      son = j;
      if (d < this.sekilDeneme - 1) await uyu(500 * 2 ** d);
    }
    throw new Error(`${this.ad} ${yol} ${JSON.stringify(govde)}: ${this.sekilDeneme} denemede şekli bozuk yanıt — ${JSON.stringify(son).slice(0, 200)}`);
  }

  /** Bu blok kaynakta var mı — tek istek, yeniden deneme yok. Geçmişi kısa kaynağın sınırını bulmak için. */
  async blokVarMi(no: number): Promise<boolean> {
    await this.kapi.gec();
    this.sayac.istek++;
    const j = await getJson<unknown>(`${this.url}/wallet/getblockbynum`, { chain: "tron", method: "POST", headers: this.basliklar, body: JSON.stringify({ num: no }) });
    return blokSekli(j);
  }

  /**
   * Kaynağın tuttuğu en eski bloğu ikili aramayla bulur (±`hassasiyet`), `null` = blok 1 de var.
   * Sonuç YUKARI yuvarlanır: sınır zamanla ilerliyor ve fazladan bir blok sormak boş cevap riskidir.
   */
  async enEskiBlok(ust: number, hassasiyet = 1_000): Promise<number | null> {
    if (await this.blokVarMi(1)) return null;
    if (!(await this.blokVarMi(ust))) throw new Error(`${this.ad}: ${ust} bloğu da yok`);
    let yok = 1, var_ = ust;
    while (var_ - yok > hassasiyet) {
      const orta = Math.floor((yok + var_) / 2);
      (await this.blokVarMi(orta)) ? (var_ = orta) : (yok = orta);
    }
    return var_;
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
    if (blok.block_header.raw_data.number !== no) throw new Error(`${this.ad}: ${no} istendi, ${blok.block_header.raw_data.number} geldi`);
    return { blok, bilgi };
  }

  /**
   * [bas, son] aralığındaki blokları TEK istekte getirir (`getblockbylimitnext`, bitiş HARİÇ gönderilir).
   *
   * Doldurucunun blok başına iki isteğinden birini kaldırır. Kaynaklar istek hızıyla sınırlı olduğu için eski
   * geçmişte hız ~2 kat olur. Ölçüm (2026-09-18, blok 80.000.000): tronstack ve TronGrid'de 10/50/100 blok
   * döndü; döndürülen blok `getblockbynum`'la BAYT BAYT aynı. 50 blok 1,6–2,2 sn, ~15 MB. publicnode 100'de
   * 429 verdi. Dönen her blok numarasıyla eşlenir; aralıkta olup dönmeyen blok haritada YOKTUR ve çağıran onu
   * tekli istekle okur — eksik cevap "0 transferli blok" olamaz.
   */
  async bloklar(bas: number, son: number): Promise<Map<number, unknown>> {
    const j = await this.post<{ block: { block_header: { raw_data: { number: number } } }[] }>(
      "/wallet/getblockbylimitnext",
      { startNum: bas, endNum: son + 1 },
      (x) => Array.isArray((x as { block?: unknown })?.block) && (x as { block: unknown[] }).block.every(blokSekli),
    );
    const m = new Map<number, unknown>();
    for (const b of j.block) {
      const n = b.block_header.raw_data.number;
      if (n >= bas && n <= son) m.set(n, b);
    }
    return m;
  }

  /** Tek bloğun işlem bilgisi. Toplu blok isteğinin yanında blok başına kalan tek istek budur. */
  async bilgi(no: number): Promise<unknown[]> {
    return this.post<unknown[]>("/wallet/gettransactioninfobyblocknum", { num: no }, Array.isArray);
  }
}

function blokSekli(j: unknown): boolean {
  const n = (j as { block_header?: { raw_data?: { number?: unknown } } })?.block_header?.raw_data?.number;
  return typeof n === "number";
}
