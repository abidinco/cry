/**
 * EVM adaptörü — Etherscan V2 (Ethereum, Polygon, Arbitrum, Optimism, Base, Avalanche).
 *
 * Tek anahtar 60+ zincir, `chainid` parametresiyle ayrılıyor.
 *
 * ÖLÇÜLDÜ (2026-09-29): üç hesap ucu da veriyle dönüyor — `txlist`, `tokentx`, `txlistinternal`.
 * Yani engel bir erişim müzakeresi değildi; yazılacak şey TRON'daki aynı şeklin EVM karşılığıydı.
 *
 * **BSC BURADA YOK ve bu bilerek.** Ücretsiz plan `chainid=56`yı kapsamıyor
 * ("Free API access is not supported for this chain", ölçüldü 2026-09-09) ve Blockscout BSC
 * barındırmıyor (ölçüldü 2026-09-14). BSC'de yoklama katmanı herkese açık RPC'ye düşüyor;
 * o yol "var" diyebiliyor, "yok" DİYEMİYOR. Bu yüzden `registry.hazirMi` BSC'yi hazır saymaz:
 * yarım bir adaptör, bakılmamış bir yeri bakılmış gösterirdi.
 *
 * DÖRT TUZAK, dördü de ölçülmüş:
 *
 * 1. **Hata HTTP 200 ile gelir ve metni `result` alanındadır.** Anahtarsız çağrı
 *    `{"status":"0","message":"NOTOK","result":"Missing/Invalid API Key"}` döndürüyor;
 *    `!!result` diye bakan bir kontrol bunu "bulundu" sayar ve gerçek bir TRON işlemi
 *    "BSC'de var" diye raporlanmıştı. Kural: yanıtın ŞEKLİ doğrulanır, varlığı değil.
 * 2. **"Kayıt yok" bir HATA DEĞİLDİR.** Aynı `status:"0"` ile
 *    `{"message":"No transactions found","result":[]}` geliyor. Ayıran şey `result`ın TİPİ:
 *    metinse hata, diziyse boş cevap. İkisini birleştirmek "bakılamadı"yı "yok" gösterirdi.
 * 3. **HIZ SINIRI da HTTP 200 ile gelir** (`Max calls per sec rate limit reached (3/sec)`),
 *    yani `http.ts`in 429 yolu onu hiç görmez. Ayrıca gerçek sınır belgelerin dediği 5 değil
 *    **3 çağrı/sn** — ölçüldü.
 * 4. **Sayfalama blok numarasıyla ve bu KAYIP RİSKİ taşır.** `startblock = sonBlok + 1` demek,
 *    o blokta okunmamış kayıt kalmışsa onu sessizce atlamaktır. Bu yüzden imleç son bloğu ve
 *    o blokta ZATEN VERİLMİŞ kayıtların anahtarlarını taşır; sonraki sayfa aynı bloktan
 *    başlayıp görülenleri eler. TronGrid'in fingerprint'inin aksine bu imleç KALICIDIR.
 */

import { getJson, RateGate } from "../http";
import { EVM_CHAIN_IDS } from "../network-detect";
import { TekrarSayaci } from "../tekrar";
import {
  ChainSourceError,
  type AddressSummary,
  type Asset,
  type Capabilities,
  type ChainAdapter,
  type ChainId,
  type ListOptions,
  type Page,
  type Transfer,
  type TransferKind,
  type TxDetail,
} from "../types";

const ETHERSCAN = "https://api.etherscan.io/v2/api";
/** Ücretsiz katman istek başına 1.000 kayıt veriyor. */
const SAYFA_UST_SINIR = 1000;

const NATIVE: Record<string, { symbol: string }> = {
  ethereum: { symbol: "ETH" },
  bsc: { symbol: "BNB" },
  polygon: { symbol: "POL" },
  arbitrum: { symbol: "ETH" },
  optimism: { symbol: "ETH" },
  base: { symbol: "ETH" },
  avalanche: { symbol: "AVAX" },
};

/** keccak256("Transfer(address,address,uint256)"). */
export const TRANSFER_KONUSU = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/* ---------------- saf katman: kaynağın cevabını okumak ---------------- */

/**
 * Etherscan'in HTTP 200 içine sakladığı hata metni — yoksa null.
 *
 * `result` bir METİNSE hatadır; DİZİYSE (boş olsa bile) cevaptır. Bu ayrım olmadan
 * "kayıt yok" ile "anahtar geçersiz" aynı kovaya düşer.
 */
export function etherscanHatasi(yanit: unknown): string | null {
  const r = yanit as { status?: unknown; result?: unknown; error?: { message?: unknown } } | null;
  if (r && r.status === "0" && typeof r.result === "string") return r.result;
  if (r && typeof r.error?.message === "string") return r.error.message;
  return null;
}

/**
 * Bu metin bir HIZ SINIRI mı? ÖLÇÜLDÜ (2026-09-29): Etherscan hız sınırını **HTTP 200** ile ve
 * `result` alanında METİN olarak döndürüyor — `Max calls per sec rate limit reached (3/sec)`.
 * Yani `http.ts`in 429 yolu bunu HİÇ görmüyor.
 *
 * Ayırt etmek şart: hız sınırı "bekle, yeniden dene" demektir, kalıcı kaynak hatası ise
 * "yeniden denemek işe yaramayabilir". İkisini birleştirmek kullanıcıya yanlış eylemi önerirdi
 * (aynı kusur §12'de ölçülmüştü — bir kural bir yerde uygulanıp kardeşinde unutulabiliyor).
 */
export function hizSinirimi(metin: string): boolean {
  return /rate limit|too many (requests|invocations)|max calls per sec/i.test(metin);
}

/**
 * Yanıttan kayıt dizisini çıkarır; şekli beklenmedikse HATA verir, boş dizi SAYMAZ.
 *
 * "Kayıt yok" metinleri KAPALI bir listeyle boş cevaba çevrilir. Liste açık olsaydı, kaynağın
 * yarın yazacağı yeni bir hata metni sessizce "bu adreste hareket yok" diye okunurdu.
 */
export function etherscanKayitlari(
  yanit: unknown,
  zincir: ChainId,
  nerede: string,
): Record<string, unknown>[] {
  const hata = etherscanHatasi(yanit);
  if (hata) {
    if (/^no (transactions|records|internal transactions) found$/i.test(hata.trim())) return [];
    throw new ChainSourceError(`etherscan ${nerede}: ${hata}`, {
      chain: zincir,
      rateLimited: hizSinirimi(hata),
    });
  }
  const r = (yanit as { result?: unknown })?.result;
  if (!Array.isArray(r)) {
    throw new ChainSourceError(`etherscan ${nerede}: beklenen dizi, gelen ${typeof r}`, {
      chain: zincir,
    });
  }
  return r as Record<string, unknown>[];
}

/**
 * `eth_getCode` cevabı bir SÖZLEŞME mi gösteriyor?
 *
 * Basit bir "kod var mı" kontrolü YANLIŞ cevap veriyor. ÖLÇÜLDÜ (2026-09-29):
 * `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` (vitalik.eth, sıradan bir cüzdan) için kod
 * `0xef01005a7fc11397e9a8ad41bf10bf13f22b0a63f96f6d` dönüyor. Bu bir sözleşme değil, bir
 * **EIP-7702 yetki devri işareti**: `0xef0100` + 20 baytlık hedef adres, toplam 23 bayt.
 * Kodu devretmiş bir EOA hâlâ bir cüzdandır.
 *
 * Neden önemli: `isContract` takip motorunda `kontrat` durma sebebini ateşliyor. Sıradan bir
 * cüzdanı sözleşme saymak, olmayan bir duvarda durup rapora yanlış bir SEBEP yazmak olurdu.
 * Karşılaştırma: USDT sözleşmesi 22.152 karakter kod, boş adres `0x` (ölçüldü).
 */
export function sozlesmeKodu(kodHex: unknown): { sozlesme: boolean; devrettigi: string | null } {
  const s = String(kodHex ?? "").toLowerCase();
  if (!/^0x[0-9a-f]*$/.test(s) || s === "0x") return { sozlesme: false, devrettigi: null };
  // 0x + "ef0100" (3 bayt) + 40 (20 bayt) = 48 karakter.
  if (s.startsWith("0xef0100") && s.length === 48) {
    return { sozlesme: false, devrettigi: "0x" + s.slice(8) };
  }
  return { sozlesme: true, devrettigi: null };
}

/**
 * Token kaydından varlık — kaynağın METADATA'yı okuyamadığı hâli SÖYLEYEREK.
 *
 * ÖLÇÜLDÜ (2026-09-29): `0xd654bdd3…` için Etherscan `tokenName: ""`, `tokenSymbol: ""`,
 * `tokenDecimal: "1"` döndürüyor. Yani sözleşmenin metadata'sını okuyamamış; "1" bir ÖLÇÜM
 * değil, bir dolgu. O sayıyla çevrilen 340000000000000000000, ekrana 34 milyar kat yanlış bir
 * BÜYÜKLÜK olarak düşerdi.
 *
 * Kural (CLAUDE.md): ondalığı BİLİNMEYEN tutar çevrilmez; ham sayı, ham olduğu SÖYLENEREK
 * taşınır. Sembol ve ad birlikte boşsa varlık "?" olur ve ondalık 0'a çekilir — ikisi birlikte
 * "bu token tanınmadı" demektir. Kimliği zaten sembol değil SÖZLEŞME taşıyor.
 */
export function tokenVarligi(
  k: Record<string, unknown>,
  chain: ChainId,
): { varlik: Asset; metaEksik: boolean } {
  const sembol = String(k.tokenSymbol ?? "").trim();
  const ad = String(k.tokenName ?? "").trim();
  const contract = String(k.contractAddress ?? "").toLowerCase() || null;
  const metaEksik = sembol === "" && ad === "";
  const ondalikHam = Number(k.tokenDecimal);
  return {
    varlik: {
      chain,
      // Sembol kimlik değildir, SÖZLEŞME kimliktir.
      contract,
      symbol: sembol || ad || "?",
      decimals: metaEksik ? 0 : Number.isFinite(ondalikHam) ? ondalikHam : 18,
    },
    metaEksik,
  };
}

/** 32 baytlık log konusundan EVM adresi: sağa yaslı son 20 bayt. */
export function konudanAdres(konu: unknown): string | null {
  const s = String(konu ?? "").replace(/^0x/, "");
  if (s.length !== 64 || !/^[0-9a-fA-F]+$/.test(s)) return null;
  return "0x" + s.slice(24).toLowerCase();
}

/** Ham hex tutarı ondalıksız tam sayı metnine çevirir. */
export function hexTutar(veri: unknown): string | null {
  const s = String(veri ?? "").replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{1,64}$/.test(s)) return null;
  try {
    return BigInt("0x" + s).toString();
  } catch {
    return null;
  }
}

const sayiya = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Etherscan saniye cinsinden `timeStamp` veriyor. */
const zaman = (v: unknown): string => new Date(Number(v ?? 0) * 1000).toISOString();

/* ---------------- imleç ---------------- */

/**
 * Tek bir ucun imleci: nereden devam edilecek ve o blokta NE ZATEN VERİLDİ.
 *
 * `gorulen` olmadan `startblock = sonBlok` yerinde sayardı, `sonBlok + 1` ise o blokta kalan
 * kayıtları sessizce atlardı. İkisi de kabul edilemez: biri sonsuz döngü, öteki sessiz kayıp.
 */
export type UcImleci = { blok: number; gorulen: string[] } | "bitti" | null;

export type EvmImleci = { native: UcImleci; token: UcImleci; internal: UcImleci };

export function imlecCoz(ham: string | null | undefined): EvmImleci {
  if (!ham) return { native: null, token: null, internal: null };
  try {
    const o = JSON.parse(ham) as Partial<EvmImleci>;
    return { native: o.native ?? null, token: o.token ?? null, internal: o.internal ?? null };
  } catch {
    throw new Error(`EVM imleci okunamadı: ${ham.slice(0, 80)}`);
  }
}

export function imlecKur(i: EvmImleci): string | null {
  const bitti = (u: UcImleci) => u === "bitti";
  if (bitti(i.native) && bitti(i.token) && bitti(i.internal)) return null;
  return JSON.stringify(i);
}

/**
 * Bir sayfanın sonucundan sonraki imleci kurar.
 *
 * Sayfa dolu değilse uç BİTMİŞTİR. Doluysa son bloktan devam edilir ve o bloktaki bütün
 * kayıtların anahtarları taşınır; sonraki sayfa onları eler.
 */
export function sonrakiUcImleci(
  kayitlar: readonly Record<string, unknown>[],
  anahtar: (k: Record<string, unknown>) => string,
  limit: number,
): UcImleci {
  if (kayitlar.length < limit) return "bitti";
  const sonBlok = sayiya(kayitlar[kayitlar.length - 1]?.blockNumber);
  if (sonBlok === null) return "bitti";
  const ayniBlokta = kayitlar.filter((k) => sayiya(k.blockNumber) === sonBlok);
  // Sayfanın TAMAMI tek bloktan geliyorsa ilerleyemeyiz: sonraki sayfa da aynı bloktan başlar,
  // aynı kayıtları eler ve yerinde sayarız. Sessizce eksik veri vermek yerine SÖYLENİR.
  if (ayniBlokta.length === kayitlar.length) {
    throw new Error(`tek blokta ${limit}+ kayıt (blok ${sonBlok}) — sayfalama ilerleyemiyor`);
  }
  return { blok: sonBlok, gorulen: ayniBlokta.map(anahtar) };
}

/** Bir kaydın kaynak içindeki kimliği — imlecin "bunu zaten verdim" listesi bunu taşır. */
export const kayitAnahtari = (k: Record<string, unknown>): string =>
  `${String(k.hash ?? "")}#${String(k.logIndex ?? k.traceId ?? "")}`;

/* ---------------- adaptör ---------------- */

export class EvmAdapter implements ChainAdapter {
  readonly family = "evm" as const;
  readonly nativeAsset: Asset;
  readonly capabilities: Capabilities = {
    // Üçü de okunuyor (`txlistinternal` dâhil). Bayrak bir İDDİADIR: okunmayan uç için false
    // yazılır, çünkü doğrulanmamış bayrak bakılmamış bir yeri kapsanmış gösterir.
    internalTransfers: true,
    tokenTransfers: true,
    activation: false,
    utxo: false,
    contractDetection: true,
  };

  readonly chainId: number;
  private readonly kapi: RateGate;
  private readonly anahtar?: string;
  private readonly taban: string;

  /** `occurrence` kuralı TEK yerde (`../tekrar`). */
  private tekrarSayaci = new TekrarSayaci();
  /** Değer taşımayan (salt sözleşme çağrısı) kayıtlar: atlanan kayıt SAYILIR. */
  atlananSifirSayisi = 0;
  /** Kaynağın metadata'sını okuyamadığı token kayıtları: tutarları HAM taşınıyor. */
  metasiOkunamayan = 0;

  constructor(
    readonly chain: ChainId,
    opts: { apiKey?: string; baseUrl?: string; istekSn?: number } = {},
  ) {
    const id = (EVM_CHAIN_IDS as Record<string, number>)[chain];
    if (!id) throw new Error(`EVM zinciri tanınmıyor: ${chain}`);
    this.chainId = id;
    this.anahtar = opts.apiKey;
    this.taban = opts.baseUrl ?? ETHERSCAN;
    // ÖLÇÜLDÜ (2026-09-29): ücretsiz katmanın gerçek sınırı **3 çağrı/sn**, belgelerin dediği 5
    // değil — kaynak `Max calls per sec rate limit reached (3/sec)` diyor. Bir kaynağın sınırı
    // HATIRLANAN bir olgu değil, ÖLÇÜMDÜR. Kapı ORTAK: eşzamanlı işçiler sınırı dövmesin.
    this.kapi = RateGate.perSecond(opts.istekSn ?? 3);
    this.nativeAsset = {
      chain,
      contract: null,
      symbol: NATIVE[chain]?.symbol ?? "ETH",
      decimals: 18,
    };
  }

  normalizeAddress(input: string): string {
    const s = input.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(s)) throw new Error(`geçersiz EVM adresi: ${input}`);
    // EIP-55 büyütmesi network-detect tarafında doğrulanıyor; burada kanonik
    // biçim küçük harf — veritabanı anahtarı tek yazımda olmalı.
    return s.toLowerCase();
  }

  isValidAddress(input: string): boolean {
    return /^0x[0-9a-fA-F]{40}$/.test(input.trim());
  }

  /**
   * Tek çağrı. Hız sınırı HTTP 200 ile geldiği için `http.ts`in 429 yolu devreye girmiyor;
   * geri çekilme BURADA yapılır. Denemeler tükenirse hata `rateLimited` ile yükselir, yani
   * "bekle" cevabı kaybolmaz.
   */
  private async cagir(
    parametreler: Record<string, string>,
    signal?: AbortSignal,
    deneme = 0,
  ): Promise<unknown> {
    await this.kapi.gec();
    const p = new URLSearchParams({ chainid: String(this.chainId), ...parametreler });
    if (this.anahtar) p.set("apikey", this.anahtar);
    const yanit = await getJson<unknown>(`${this.taban}?${p}`, { chain: this.chain, signal });

    const hata = etherscanHatasi(yanit);
    if (hata && hizSinirimi(hata) && deneme < 3) {
      await new Promise<void>((cozumle) => {
        if (signal?.aborted) return cozumle();
        const bitir = () => {
          clearTimeout(z);
          signal?.removeEventListener("abort", bitir);
          cozumle();
        };
        const z = setTimeout(bitir, 400 * 2 ** deneme + Math.random() * 200);
        signal?.addEventListener("abort", bitir, { once: true });
      });
      if (signal?.aborted) {
        const e = new Error("iptal edildi");
        e.name = "AbortError";
        throw e;
      }
      return this.cagir(parametreler, signal, deneme + 1);
    }
    return yanit;
  }

  async getAddressSummary(address: string, signal?: AbortSignal): Promise<AddressSummary> {
    const adres = this.normalizeAddress(address);
    // Dört soru, dört çağrı: bakiye · sözleşme mi · ilk hareket · son hareket. Etherscan
    // "ilk/son görülme" diye bir alan VERMİYOR; ikisi de listenin uçlarından ÖLÇÜLÜR.
    const [bakiye, kod, ilk, son] = await Promise.all([
      this.cagir({ module: "account", action: "balance", address: adres, tag: "latest" }, signal),
      this.cagir({ module: "proxy", action: "eth_getCode", address: adres, tag: "latest" }, signal),
      this.cagir(
        { module: "account", action: "txlist", address: adres, page: "1", offset: "1", sort: "asc" },
        signal,
      ),
      this.cagir(
        { module: "account", action: "txlist", address: adres, page: "1", offset: "1", sort: "desc" },
        signal,
      ),
    ]);

    const bakiyeHatasi = etherscanHatasi(bakiye);
    if (bakiyeHatasi) {
      throw new ChainSourceError(`etherscan balance: ${bakiyeHatasi}`, {
        chain: this.chain,
        rateLimited: hizSinirimi(bakiyeHatasi),
      });
    }
    const bakiyeHam = (bakiye as { result?: unknown })?.result;

    const ilkler = etherscanKayitlari(ilk, this.chain, "txlist(asc)");
    const sonlar = etherscanKayitlari(son, this.chain, "txlist(desc)");
    // `eth_getCode` bir proxy ucudur: cevabı `result` içinde hex.
    const kodHex = String((kod as { result?: unknown })?.result ?? "");
    const kodu = sozlesmeKodu(kodHex);

    return {
      chain: this.chain,
      address: adres,
      // Hareketi olmayan adres de GEÇERLİDİR, sadece boştur. "Boş" ile "bakılamadı" ayrı
      // sorulardır: bakılamama hâli yukarıda HATA olarak yükseldi, buraya hiç gelmez.
      exists:
        ilkler.length > 0 ||
        sonlar.length > 0 ||
        (typeof bakiyeHam === "string" && bakiyeHam !== "0"),
      firstSeen: ilkler[0] ? zaman(ilkler[0].timeStamp) : null,
      lastSeen: sonlar[0] ? zaman(sonlar[0].timeStamp) : null,
      balanceRaw: typeof bakiyeHam === "string" ? bakiyeHam : null,
      txCount: null,
      isContract: kodu.sozlesme,
      // Devir bilgisi ATILMAZ: "bu cüzdan kodunu şuraya devretmiş" gerçek bir bilgidir.
      raw: { kodUzunlugu: kodHex.length, yetkiDevri: kodu.devrettigi },
    };
  }

  async listTransfers(address: string, opts: ListOptions = {}): Promise<Page<Transfer>> {
    const adres = this.normalizeAddress(address);
    const limit = Math.min(opts.limit ?? SAYFA_UST_SINIR, SAYFA_UST_SINIR);
    const imlec = imlecCoz(opts.cursor);
    const turler = opts.kinds;

    // İmleç yoksa bu turun İLK sayfasıdır; sayaç oradan başlar. Sayacın ömrü TURDUR:
    // bir işlemin kayıtları sayfa sınırında bölünebiliyor.
    if (!opts.cursor) {
      this.tekrarSayaci.sifirla();
      this.atlananSifirSayisi = 0;
      this.metasiOkunamayan = 0;
    }

    const istensin = (t: TransferKind) => !turler || turler.includes(t);
    const bos = { items: [] as Transfer[], next: "bitti" as UcImleci };

    const [n, t, i] = await Promise.all([
      istensin("native") && imlec.native !== "bitti"
        ? this.ucCek(adres, "native", limit, imlec.native, opts)
        : Promise.resolve(bos),
      istensin("token") && imlec.token !== "bitti"
        ? this.ucCek(adres, "token", limit, imlec.token, opts)
        : Promise.resolve(bos),
      istensin("internal") && imlec.internal !== "bitti"
        ? this.ucCek(adres, "internal", limit, imlec.internal, opts)
        : Promise.resolve(bos),
    ]);

    const hepsi = [...n.items, ...t.items, ...i.items].sort(
      (a, b) => a.ts.localeCompare(b.ts) || a.index - b.index,
    );

    return {
      items: hepsi,
      nextCursor: imlecKur({
        native: istensin("native") ? n.next : imlec.native,
        token: istensin("token") ? t.next : imlec.token,
        internal: istensin("internal") ? i.next : imlec.internal,
      }),
    };
  }

  private async ucCek(
    adres: string,
    tur: TransferKind,
    limit: number,
    imlec: UcImleci,
    opts: ListOptions,
  ): Promise<{ items: Transfer[]; next: UcImleci }> {
    const eylem = tur === "token" ? "tokentx" : tur === "internal" ? "txlistinternal" : "txlist";
    const baslangic = imlec && imlec !== "bitti" ? imlec.blok : (opts.fromBlock ?? 0);
    const yanit = await this.cagir(
      {
        module: "account",
        action: eylem,
        address: adres,
        startblock: String(baslangic),
        endblock: "99999999",
        page: "1",
        offset: String(limit),
        sort: "asc",
      },
      opts.signal,
    );

    const ham = etherscanKayitlari(yanit, this.chain, eylem);
    const next = sonrakiUcImleci(ham, kayitAnahtari, limit);

    // Önceki sayfada VERİLMİŞ kayıtlar elenir: imleç blok sınırında geriye dönük başlıyor.
    const gorulen = imlec && imlec !== "bitti" ? new Set(imlec.gorulen) : null;
    const yeni = gorulen ? ham.filter((k) => !gorulen.has(kayitAnahtari(k))) : ham;

    const items: Transfer[] = [];
    for (const k of yeni) {
      const d = this.kayitCevir(k, tur);
      if (d) items.push(d);
    }
    return { items, next };
  }

  /** Tek bir Etherscan kaydını harekete çevirir; değer taşımayan kayıt null döner ve SAYILIR. */
  private kayitCevir(k: Record<string, unknown>, tur: TransferKind): Transfer | null {
    const tutar = String(k.value ?? "");
    // Tutar HAM TAM SAYIDIR; `Number`'a uğrayan tutar rapora `1.15e+53` diye düşer.
    if (!/^\d+$/.test(tutar)) return null;
    // Değer taşımayan kayıt bir PARA HAREKETİ DEĞİLDİR (salt sözleşme çağrısı). Atılır ama
    // SAYILIR: sessizce atılan kayıt "yoktu" sanılır (CLAUDE.md → onay kayıtları).
    if (tutar === "0") {
      this.atlananSifirSayisi++;
      return null;
    }

    const token = tur === "token" ? tokenVarligi(k, this.chain) : null;
    const varlik: Asset = token ? token.varlik : this.nativeAsset;
    if (token?.metaEksik) this.metasiOkunamayan++;

    const from = String(k.from ?? "").toLowerCase() || null;
    const to = String(k.to ?? "").toLowerCase() || null;
    // `isError: "1"` başarısız işlemdir: para hareket etmedi ama NİYET bilgidir ve kayda girer.
    const basarili = String(k.isError ?? "0") !== "1" && String(k.txreceipt_status ?? "1") !== "0";

    return {
      chain: this.chain,
      txHash: String(k.hash ?? ""),
      // Kaynağın sırası SIRALAMA içindir, kimlik değil; kimliği `occurrence` taşır.
      index: sayiya(k.logIndex) ?? sayiya(k.transactionIndex) ?? 0,
      occurrence: this.tekrarSayaci.sonraki(String(k.hash ?? ""), from, to, varlik.contract, tutar),
      blockNumber: sayiya(k.blockNumber),
      ts: zaman(k.timeStamp),
      from,
      to,
      asset: varlik,
      amountRaw: tutar,
      kind: tur,
      success: basarili,
      feeRaw: null,
      raw:
        tur === "internal"
          ? { traceId: k.traceId ?? null }
          : token?.metaEksik
            ? { metaEksik: true, kaynaginDedigiOndalik: k.tokenDecimal ?? null }
            : undefined,
    };
  }

  async getTransaction(hash: string, signal?: AbortSignal): Promise<TxDetail | null> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash.trim())) throw new Error(`geçersiz işlem hash'i: ${hash}`);
    const h = hash.trim().toLowerCase();

    const [islem, makbuz] = await Promise.all([
      this.cagir({ module: "proxy", action: "eth_getTransactionByHash", txhash: h }, signal),
      this.cagir({ module: "proxy", action: "eth_getTransactionReceipt", txhash: h }, signal),
    ]);
    const tx = (islem as { result?: Record<string, unknown> | null })?.result ?? null;
    if (!tx) return null;
    const mk = (makbuz as { result?: Record<string, unknown> | null })?.result ?? null;

    // Sayaç YEREL olmak zorunda: tur sayacı olsaydı aynı işlemin ikinci okuması 0,1 yerine
    // 2,3 derdi ve aynı para iki satır olurdu.
    const sayac = new TekrarSayaci();
    const blokHam = hexTutar(tx.blockNumber);
    const blokNo = blokHam === null ? null : Number(blokHam);
    const basarili = String(mk?.status ?? "0x1") !== "0x0";

    // Zaman damgası işlem ucunda YOK; blok ucundan ölçülür.
    let ts = new Date(0).toISOString();
    if (blokNo !== null) {
      const b = await this.cagir(
        {
          module: "proxy",
          action: "eth_getBlockByNumber",
          tag: "0x" + blokNo.toString(16),
          boolean: "false",
        },
        signal,
      );
      const damga = hexTutar((b as { result?: { timestamp?: unknown } })?.result?.timestamp);
      if (damga !== null) ts = new Date(Number(damga) * 1000).toISOString();
    }

    const transfers: Transfer[] = [];
    const from = String(tx.from ?? "").toLowerCase() || null;
    const to = String(tx.to ?? "").toLowerCase() || null;
    const deger = hexTutar(tx.value);
    if (deger !== null && deger !== "0") {
      transfers.push({
        chain: this.chain,
        txHash: h,
        index: 0,
        occurrence: sayac.sonraki(h, from, to, null, deger),
        blockNumber: blokNo,
        ts,
        from,
        to,
        asset: this.nativeAsset,
        amountRaw: deger,
        kind: "native",
        success: basarili,
      });
    }

    // TOKEN hareketi AYRI bir yerdedir: bir OLAYdır ve makbuzun `logs` dizisinde durur.
    // TRON'da bu unutulmuştu ve gerçek bir USDT transferi 0 hareketle dönüyordu — bir kural
    // bir yerde uygulanıp kardeşinde unutulabiliyor.
    const loglar = Array.isArray(mk?.logs) ? (mk.logs as Record<string, unknown>[]) : [];
    for (const l of loglar) {
      const konular = Array.isArray(l.topics) ? (l.topics as unknown[]) : [];
      if (String(konular[0] ?? "").replace(/^0x/, "").toLowerCase() !== TRANSFER_KONUSU) continue;
      const lf = konudanAdres(konular[1]);
      const lt = konudanAdres(konular[2]);
      const tutar = hexTutar(l.data);
      if (lf === null || lt === null || tutar === null) continue;
      const sozlesme = String(l.address ?? "").toLowerCase() || null;
      transfers.push({
        chain: this.chain,
        txHash: h,
        index: Number(hexTutar(l.logIndex) ?? 0),
        occurrence: sayac.sonraki(h, lf, lt, sozlesme, tutar),
        blockNumber: blokNo,
        ts,
        from: lf,
        to: lt,
        // Sembol ve ondalık bu uçtan GELMİYOR ve uydurulmaz: ondalığı bilinmeyen tutar
        // çevrilmez, ham sayı ham olduğu SÖYLENEREK taşınır.
        asset: { chain: this.chain, contract: sozlesme, symbol: "?", decimals: 0 },
        amountRaw: tutar,
        kind: "token",
        success: basarili,
      });
    }

    const gaz = hexTutar(mk?.gasUsed);
    const fiyat = hexTutar(tx.gasPrice);
    return {
      chain: this.chain,
      hash: h,
      blockNumber: blokNo,
      ts,
      success: basarili,
      from,
      to,
      feeRaw: gaz !== null && fiyat !== null ? (BigInt(gaz) * BigInt(fiyat)).toString() : null,
      transfers,
      // İşlem listesi bir EKSİKSİZLİK iddiası DEĞİLDİR: iç transferler burada yok, ayrı uçta.
      raw: { loglar: loglar.length, icTransferOkunmadi: true },
    };
  }
}
