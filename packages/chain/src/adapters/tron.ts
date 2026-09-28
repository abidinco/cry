/**
 * TRON adaptörü — Faz 1'in ana zinciri (Türkiye dosyalarının çoğu USDT-TRC20).
 * Kaynak: TronGrid (ücretsiz katman, key ile ~20 sorgu/sn).
 */

import { getJson, RateGate } from "../http";
import { TekrarSayaci } from "../tekrar";
import { base58ToHex, tronGecerliMi, tronNormalize, hexToBase58 } from "../tron-address";
import {
  ChainSourceError,
  type Activation,
  type AddressSummary,
  type Asset,
  type Capabilities,
  type ChainAdapter,
  type ListOptions,
  type Page,
  type Transfer,
  type TxDetail,
} from "../types";

const TRONGRID = "https://api.trongrid.io";
/** TronGrid tek istekte en çok 200 kayıt veriyor. */
const SAYFA_UST_SINIR = 200;

const TRX: Asset = { chain: "tron", contract: null, symbol: "TRX", decimals: 6 };

/** keccak256("Transfer(address,address,uint256)") — TRC20/ERC20 ortak olay imzası. */
export const TRANSFER_KONUSU = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/**
 * USDT-TRC20 sözleşmesi (TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t), hex, `41` öneki OLMADAN.
 *
 * Sembol kimlik değildir, SÖZLEŞME kimliktir: arşivde "U S D T" adlı (boşluklu) taklit bir token
 * var ve gerçeğinden ayıran tek şey bu adres. Blok indeksindeki `USDT_TRC20_HEX` ile aynı değer;
 * kopyalanmasının sebebi zincir adaptörünün indeks paketine bağımlı OLMAMASI.
 */
const USDT_SOZLESME_HEX = "a614f803b6fd780986a42c78ec9c7f77e6ded13c";

type TronGridYanit<T> = {
  data?: T[];
  success?: boolean;
  error?: string;
  meta?: { fingerprint?: string; links?: { next?: string } };
};

/** Zaman damgası TronGrid'de milisaniye. */
const isoZaman = (ms: number | undefined | null): string => new Date(ms ?? 0).toISOString();

/** TronGrid adresi kimi uçta hex, kimi uçta base58 döndürüyor. */
function adresNormalize(deger: string | null | undefined): string | null {
  if (!deger) return null;
  try {
    if (/^(0x)?41[0-9a-fA-F]{40}$/.test(deger)) return hexToBase58(deger);
    return tronNormalize(deger);
  } catch {
    return null;
  }
}

export type TronAdapterOptions = {
  apiKey?: string;
  baseUrl?: string;
  /** Anahtarsız sınır çok dar; varsayılan muhafazakâr. */
  requestsPerSecond?: number;
};

export class TronAdapter implements ChainAdapter {
  readonly chain = "tron" as const;
  readonly family = "tron" as const;
  readonly nativeAsset = TRX;
  readonly capabilities: Capabilities = {
    internalTransfers: true,
    tokenTransfers: true,
    activation: true,
    utxo: false,
    contractDetection: true,
  };

  private readonly baseUrl: string;
  private readonly kapi: RateGate;
  private readonly basliklar: Record<string, string>;
  /**
   * İşlem başına kayıt sayacı — TUR BOYUNCA yaşar, sayfa başına DEĞİL.
   * Bir işlemin kayıtları sayfa sınırında bölünebiliyor; sayfa başına
   * sıfırlanan sayaç o işlemi ikinci sayfada 0'dan saymaya başlıyor ve aynı
   * hareket ikinci kez yazılıyordu (ölçüldü). Tur başında sıfırlanır.
   */
  private txSayaci = new Map<string, number>();
  /** `occurrence` kuralı TEK yerde (`../tekrar`); blok indeksi okuyucusu da onu kullanıyor. */
  private tekrarSayaci = new TekrarSayaci();
  /**
   * Atlanan onay sayısı. Sessizce atılan kayıt "yoktu" sanılır; tur bunu
   * raporlayabilsin diye sayılıyor.
   */
  private atlananOnay = 0;

  constructor(opts: TronAdapterOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? TRONGRID).replace(/\/$/, "");
    this.kapi = RateGate.perSecond(opts.requestsPerSecond ?? (opts.apiKey ? 10 : 2));
    this.basliklar = opts.apiKey ? { "TRON-PRO-API-KEY": opts.apiKey } : {};
  }

  /** Bu turda kaç onay kaydı transfer sayılmadı. */
  get atlananOnaySayisi(): number {
    return this.atlananOnay;
  }

  normalizeAddress(input: string): string {
    return tronNormalize(input);
  }

  isValidAddress(input: string): boolean {
    return tronGecerliMi(input);
  }

  private async iste<T>(yol: string, signal?: AbortSignal): Promise<TronGridYanit<T>> {
    await this.kapi.gec();
    const yanit = await getJson<TronGridYanit<T>>(`${this.baseUrl}${yol}`, {
      chain: "tron",
      headers: this.basliklar,
      signal,
    });
    if (yanit.success === false) {
      throw new ChainSourceError(`TronGrid: ${yanit.error ?? "bilinmeyen hata"}`, { chain: "tron" });
    }
    return yanit;
  }

  async getAddressSummary(address: string, signal?: AbortSignal): Promise<AddressSummary> {
    const adres = this.normalizeAddress(address);
    const yanit = await this.iste<any>(`/v1/accounts/${adres}`, signal);
    const hesap = yanit.data?.[0];

    if (!hesap) {
      // Hiç görülmemiş adres geçerlidir, sadece boştur — hata değil.
      return {
        chain: "tron",
        address: adres,
        exists: false,
        firstSeen: null,
        lastSeen: null,
        balanceRaw: null,
        txCount: null,
      };
    }

    const tokenler = (hesap.trc20 ?? []) as Record<string, string>[];
    const tokenBakiyeleri = tokenler.flatMap((kayit) =>
      Object.entries(kayit).map(([sozlesme, miktar]) => ({
        asset: {
          chain: "tron" as const,
          contract: adresNormalize(sozlesme) ?? sozlesme,
          // Sembol/ondalık token meta'sından ayrıca çözülür; burada varsayım yapılmaz.
          symbol: "?",
          decimals: 0,
        },
        balanceRaw: String(miktar),
      })),
    );

    return {
      chain: "tron",
      address: adres,
      exists: true,
      firstSeen: hesap.create_time ? isoZaman(hesap.create_time) : null,
      lastSeen: hesap.latest_opration_time ? isoZaman(hesap.latest_opration_time) : null,
      balanceRaw: String(hesap.balance ?? 0),
      txCount: null, // TronGrid hesap uçunda toplam sayı vermiyor; uydurulmaz.
      tokenBalances: tokenBakiyeleri,
      isContract: Boolean(hesap.type === "Contract" || hesap.is_contract),
      raw: hesap,
    };
  }

  /**
   * Native (TRX/TRC10) ve TRC20 hareketleri AYRI uç noktalarda duruyor.
   * İkisini tek akışta birleştiriyoruz; imleç bu yüzden iki fingerprint
   * taşıyan bileşik bir değer.
   */
  async listTransfers(address: string, opts: ListOptions = {}): Promise<Page<Transfer>> {
    const adres = this.normalizeAddress(address);
    const limit = Math.min(opts.limit ?? SAYFA_UST_SINIR, SAYFA_UST_SINIR);
    const imlec = imlecCoz(opts.cursor);
    const turler = opts.kinds;

    // İmleç yoksa bu turun İLK sayfasıdır; sayaç oradan başlar.
    if (!opts.cursor) {
      this.txSayaci.clear();
      this.tekrarSayaci.sifirla();
      this.atlananOnay = 0;
    }

    const nativeIstensin = !turler || turler.includes("native") || turler.includes("internal");
    const tokenIstensin = !turler || turler.includes("token");
    const bos = { items: [] as Transfer[], next: null as string | null };

    const [nativeSonuc, tokenSonuc] = await Promise.all([
      nativeIstensin && imlec.native !== "bitti"
        ? this.sayfaCek(adres, "native", limit, imlec.native, opts)
        : Promise.resolve(bos),
      tokenIstensin && imlec.token !== "bitti"
        ? this.sayfaCek(adres, "token", limit, imlec.token, opts)
        : Promise.resolve(bos),
    ]);

    const hepsi = [...nativeSonuc.items, ...tokenSonuc.items].sort(
      (a, b) => a.ts.localeCompare(b.ts) || a.index - b.index,
    );

    const sonrakiImlec = imlecKur({
      native: nativeIstensin ? (nativeSonuc.next ?? "bitti") : imlec.native,
      token: tokenIstensin ? (tokenSonuc.next ?? "bitti") : imlec.token,
    });

    return { items: hepsi, nextCursor: sonrakiImlec };
  }

  private async sayfaCek(
    adres: string,
    tur: "native" | "token",
    limit: number,
    fingerprint: string | null | "bitti",
    opts: ListOptions,
  ): Promise<{ items: Transfer[]; next: string | null }> {
    const parametreler = new URLSearchParams({
      limit: String(limit),
      order_by: "block_timestamp,asc",
    });
    // Sıra ÖNEMLİ: süzgeçler fingerprint ile BİRLİKTE gönderilir; kaynak
    // ikisinin tutarlı olmasını şart koşuyor.
    if (fingerprint && fingerprint !== "bitti") parametreler.set("fingerprint", fingerprint);
    if (opts.fromTs) parametreler.set("min_timestamp", String(Date.parse(opts.fromTs)));
    if (opts.toTs) parametreler.set("max_timestamp", String(Date.parse(opts.toTs)));

    const yol =
      tur === "token"
        ? `/v1/accounts/${adres}/transactions/trc20?${parametreler}`
        : `/v1/accounts/${adres}/transactions?${parametreler}`;

    const yanit = await this.iste<any>(yol, opts.signal);
    const kayitlar = yanit.data ?? [];

    // İNDEKS SAYFA KONUMUNDAN TÜRETİLMEZ. Aynı hareket başka bir turda
    // başka konuma düşer ve (chain, txHash, index) tekilliği onu göremez —
    // ölçüldü: 201 mükerrer öbek. Kararlı olan şey, hareketin İŞLEM
    // İÇİNDEKİ sırasıdır; kaynak TRC20 için log indeksi vermiyor, o yüzden
    // aynı tx'in kayıtları kendi aralarında sayılır.
    //
    // Aynı işlemde BİREBİR AYNI transferin birden çok kez bulunması gerçek
    // bir durumdur (ölçüldü: bir tx'te 20 özdeş Transfer olayı), o yüzden
    // içerik tek başına anahtar olamaz — sıra numarası şart.
    // ONAY (Approval) BİR PARA HAREKETİ DEĞİLDİR: harcama izni verir, değer
    // taşımaz. TRC20 ucu ikisini aynı listede döndürüyor (ölçüldü: 200
    // kaydın 27'si onay) ve "sonsuz onay" 2^256-1 tutarıyla geliyor. Transfer
    // sayılsalardı graf hayalet kenarlarla ve absürt tutarlarla dolardı.
    const onaylar = kayitlar.filter((k: any) => k.type && k.type !== "Transfer").length;
    if (onaylar > 0) this.atlananOnay += onaylar;

    const items: Transfer[] =
      tur === "token"
        ? kayitlar
            .filter((k: any) => !k.type || k.type === "Transfer")
            .map((k: any) => {
              const tx = String(k.transaction_id);
              const sira = this.txSayaci.get(tx) ?? 0;
              this.txSayaci.set(tx, sira + 1);
              return this.trc20Cevir(k, sira);
            })
        : kayitlar.flatMap((k: any) => this.nativeCevir(k));

    // Fingerprint sayfa dolduğu sürece anlamlı; kayıt bittiyse akış da bitti.
    const next = kayitlar.length === limit ? (yanit.meta?.fingerprint ?? null) : null;
    return { items, next };
  }

  private trc20Cevir(k: any, i: number): Transfer {
    const ondalik = Number(k.token_info?.decimals ?? 0);
    const from = adresNormalize(k.from);
    const to = adresNormalize(k.to);
    const sozlesme = adresNormalize(k.token_info?.address) ?? null;
    const tutar = String(k.value ?? "0");
    return {
      chain: "tron",
      txHash: k.transaction_id,
      index: i,
      occurrence: this.tekrarSayaci.sonraki(String(k.transaction_id), from, to, sozlesme, tutar),
      blockNumber: null, // Bu uç blok numarası vermiyor; uydurulmaz.
      ts: isoZaman(k.block_timestamp),
      from,
      to,
      asset: {
        chain: "tron",
        contract: sozlesme,
        symbol: k.token_info?.symbol ?? "?",
        decimals: Number.isFinite(ondalik) ? ondalik : 0,
      },
      amountRaw: tutar,
      kind: "token",
      success: true, // bu uç yalnızca gerçekleşmiş transferleri döndürür
      raw: k,
    };
  }

  /**
   * Bir TRON tx'i birden çok sözleşme taşıyabilir; her biri ayrı harekettir.
   *
   * `sayac` verilmezse adaptörün TUR sayacı kullanılır (sayfalanan okumada doğrusu odur). Tek bir
   * işlem okunurken YEREL bir sayaç verilir: orada bütün tx elde olduğu için numaralar kendi
   * içinde tamdır ve aynı işlem ikinci kez okunduğunda AYNI numaraları verir — tur sayacı
   * kullanılsaydı ikinci okuma 0,1 yerine 2,3 derdi.
   */
  private nativeCevir(k: any, sayac: TekrarSayaci = this.tekrarSayaci): Transfer[] {
    const sozlesmeler = k.raw_data?.contract ?? [];
    const basarili = k.ret?.[0]?.contractRet === "SUCCESS";
    const ucret = k.ret?.[0]?.fee ?? null;

    return sozlesmeler.flatMap((s: any, i: number): Transfer[] => {
      const deger = s.parameter?.value;
      if (!deger) return [];
      // Yalnızca değer taşıyan sözleşme türleri kayda girer.
      const trc10 = s.type === "TransferAssetContract";
      if (s.type !== "TransferContract" && !trc10) return [];

      const from = adresNormalize(deger.owner_address);
      const to = adresNormalize(deger.to_address);
      const varlik = trc10
        ? { chain: "tron" as const, contract: `trc10:${trc10AdCoz(deger.asset_name)}`, symbol: "TRC10", decimals: 0 }
        : TRX;
      const tutar = String(deger.amount ?? 0);

      return [
        {
          chain: "tron",
          txHash: k.txID,
          // Sözleşmenin işlem içindeki sırası — sayfadan bağımsız, kararlı.
          index: i,
          occurrence: sayac.sonraki(String(k.txID), from, to, varlik.contract, tutar),
          blockNumber: k.blockNumber ?? null,
          ts: isoZaman(k.block_timestamp ?? k.raw_data?.timestamp),
          from,
          to,
          asset: varlik,
          amountRaw: tutar,
          kind: "native",
          success: basarili,
          feeRaw: ucret === null ? null : String(ucret),
          raw: k,
        },
      ];
    });
  }

  async getTransaction(hash: string, signal?: AbortSignal): Promise<TxDetail | null> {
    await this.kapi.gec();
    const yanit = await getJson<any>(
      `${this.baseUrl}/wallet/gettransactionbyid?value=${encodeURIComponent(hash)}`,
      { chain: "tron", headers: this.basliklar, signal },
    );
    if (!yanit || !yanit.txID) return null;

    // Tek işlem okuması KENDİ İÇİNDE tamdır: yerel sayaç, aynı işlemin her okumasında aynı
    // `occurrence` numaralarını verir.
    const sayac = new TekrarSayaci();
    const yerli = this.nativeCevir(yanit, sayac);

    // TRC20 hareketleri BU uçta YOK: `gettransactionbyid` yalnızca sözleşme çağrısını döndürüyor,
    // token transferi bir OLAYdır ve `gettransactioninfobyid`nin log'larında durur. Ölçüldü
    // (2026-09-28): bir USDT transferi burada 0 hareketle dönüyordu ve ekran onu "bu işlem değer
    // hareketi üretmemiş" diye gösterecekti — kaynağın EKSİĞİ veri gibi görünüyordu.
    const bilgi = await this.islemBilgisi(hash, signal);
    const { transfers: tokenlar, cozulemeyen } = this.trc20LoglariCevir(yanit, bilgi, sayac);

    const transfers = [...yerli, ...tokenlar];
    return {
      chain: "tron",
      hash: yanit.txID,
      blockNumber: yanit.blockNumber ?? bilgi?.blockNumber ?? null,
      ts: isoZaman(yanit.raw_data?.timestamp),
      success: yanit.ret?.[0]?.contractRet === "SUCCESS",
      from: transfers[0]?.from ?? null,
      to: transfers[0]?.to ?? null,
      feeRaw: yanit.ret?.[0]?.fee == null ? null : String(yanit.ret[0].fee),
      transfers,
      // Çözülemeyen log SAYILIR: "0 hareket" ile "hareketi çözemedim" ayrı cevaplardır. Bunu
      // yutan bir ekran, bakılmamış bir işlemi temiz gösterirdi.
      raw: { ...yanit, bilgi, cozulemeyenLog: cozulemeyen },
    };
  }

  /** `gettransactioninfobyid`: olay günlükleri burada. Ulaşılamazsa `null` — uydurma boş dizi DEĞİL. */
  private async islemBilgisi(hash: string, signal?: AbortSignal): Promise<any | null> {
    await this.kapi.gec();
    try {
      const b = await getJson<any>(
        `${this.baseUrl}/wallet/gettransactioninfobyid?value=${encodeURIComponent(hash)}`,
        { chain: "tron", headers: this.basliklar, signal },
      );
      return b && (b.id || b.log) ? b : null;
    } catch {
      return null;
    }
  }

  /**
   * TRC20 `Transfer(address,address,uint256)` olaylarını harekete çevirir.
   *
   * Sözleşme KİMLİKTİR: USDT sözleşmesi adıyla değil adresiyle tanınır (arşivde "U S D T" adlı
   * taklit bir token var). Tanınmayan token'ın ondalığı bilinmiyor — uydurulmaz, `decimals: 0` ve
   * `symbol: "?"` ile geçer ve sözleşme adresi kayıtta kalır, böylece kimlik kaybolmaz.
   */
  private trc20LoglariCevir(
    tx: any,
    bilgi: any | null,
    sayac: TekrarSayaci,
  ): { transfers: Transfer[]; cozulemeyen: number } {
    const loglar = (bilgi?.log ?? []) as any[];
    if (!Array.isArray(loglar) || loglar.length === 0) return { transfers: [], cozulemeyen: 0 };

    const basarili = tx.ret?.[0]?.contractRet === "SUCCESS";
    const zaman = isoZaman(tx.raw_data?.timestamp);
    const transfers: Transfer[] = [];
    let cozulemeyen = 0;

    loglar.forEach((l, i) => {
      const konular = (l.topics ?? []) as string[];
      if (konular[0]?.toLowerCase() !== TRANSFER_KONUSU) return;
      // from/to 32 baytlık konuda sağa yaslı 20 bayt; sözleşme 41 öneksiz hex geliyor.
      const from = hexKonudanAdres(konular[1]);
      const to = hexKonudanAdres(konular[2]);
      const tutar = hexTutar(l.data);
      if (from === null || to === null || tutar === null) {
        cozulemeyen++;
        return;
      }
      const sozlesmeHex = String(l.address ?? "").toLowerCase();
      const usdt = sozlesmeHex === USDT_SOZLESME_HEX;
      const sozlesme = adresNormalize("41" + sozlesmeHex) ?? null;
      transfers.push({
        chain: "tron",
        txHash: tx.txID,
        index: i,
        occurrence: sayac.sonraki(String(tx.txID), from, to, sozlesme, tutar),
        blockNumber: bilgi?.blockNumber ?? null,
        ts: zaman,
        from,
        to,
        asset: {
          chain: "tron",
          contract: sozlesme,
          symbol: usdt ? "USDT" : "?",
          decimals: usdt ? 6 : 0,
        },
        amountRaw: tutar,
        kind: "token",
        success: basarili,
        raw: l,
      });
    });

    return { transfers, cozulemeyen };
  }

  /**
   * TRON'da bir hesabın var olabilmesi için birinin ona TRX göndermesi
   * gerekir; o ilk GELEN işlem aktivasyondur. "Aynı adresin aktive ettiği
   * cüzdanlar aynı kişiye aittir" sezgiselinin dayanağı budur.
   */
  async getActivation(address: string, signal?: AbortSignal): Promise<Activation | null> {
    const adres = this.normalizeAddress(address);
    const parametreler = new URLSearchParams({
      limit: "1",
      only_to: "true",
      order_by: "block_timestamp,asc",
    });
    const yanit = await this.iste<any>(`/v1/accounts/${adres}/transactions?${parametreler}`, signal);
    const ilk = yanit.data?.[0];
    if (!ilk) return { address: adres, activatedBy: null, ts: null, txHash: null };

    const deger = ilk.raw_data?.contract?.[0]?.parameter?.value;
    return {
      address: adres,
      activatedBy: adresNormalize(deger?.owner_address),
      ts: isoZaman(ilk.block_timestamp ?? ilk.raw_data?.timestamp),
      txHash: ilk.txID ?? null,
    };
  }
}

/* ---------------- yardımcılar ---------------- */

/**
 * 32 baytlık bir olay konusundan TRON adresi: son 20 bayt, başına `41` eklenerek base58'e çevrilir.
 * Şekli tutmayan konu `null` döner — yanlış bir adres üretmektense hiç üretmemek gerekir.
 */
export function hexKonudanAdres(konu: unknown): string | null {
  const s = String(konu ?? "").replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(s)) return null;
  return adresNormalize("41" + s.slice(24));
}

/** Olay verisindeki 32 baytlık tutar, ONDALIK metin olarak. `BigInt` şart: 2^256-1 gerçekten var. */
export function hexTutar(veri: unknown): string | null {
  const s = String(veri ?? "").replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{1,64}$/.test(s)) return null;
  try {
    return BigInt("0x" + s).toString();
  } catch {
    return null;
  }
}

function trc10AdCoz(hexAd: unknown): string {
  const s = String(hexAd ?? "");
  if (!/^[0-9a-fA-F]+$/.test(s) || s.length % 2 !== 0) return s;
  return Buffer.from(s, "hex").toString("utf8");
}

type Imlec = { native: string | null | "bitti"; token: string | null | "bitti" };

function imlecCoz(ham: string | null | undefined): Imlec {
  if (!ham) return { native: null, token: null };
  try {
    const c = JSON.parse(ham) as Imlec;
    return { native: c.native ?? null, token: c.token ?? null };
  } catch {
    return { native: null, token: null };
  }
}

function imlecKur(c: Imlec): string | null {
  // İki akış da bittiyse sayfalama biter.
  if (c.native === "bitti" && c.token === "bitti") return null;
  return JSON.stringify(c);
}

export { base58ToHex, hexToBase58 };
