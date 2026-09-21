/**
 * Blok indeksinden besleyen adaptör sarmalayıcısı — takip koşuları kendi diskimizden okusun diye.
 *
 * Kullanıcı hedefi: "Kendi motorumuzdan istediğimiz takip koşularını yapalım. TronGrid'e ihtiyacımız
 * kalmasın." Bu sarmalayıcı `ChainAdapter`'ın ÖNÜNE geçiyor; `adresIndeksle` hiçbir şey bilmiyor.
 *
 * KURAL (CLAUDE.md → M1): indeks yalnızca PENCERENİN İÇİNDE hüküm verebilir — kapsam tablosunun
 * boşluksuz kapsadığı aralık. Sorulan aralığın bir ucu bile dışarıdaysa soru TronGrid'e gider.
 * Yarısını indeksten yarısını kaynaktan birleştirmek YOK: pencere sınırı bir blok hassasiyetinde,
 * TronGrid'in TRC20 ucu ise blok numarası vermiyor (zaman üzerinden dikiş, sınırda hareket kaybeder
 * ya da çiftler). Kapsanmayan aralık "bakılamadı"dır ve kaynağa sorulur.
 *
 * Ölçüldü (M1, 2026-09-21): pencere içinde indeks TronGrid ile birebir aynı hareketleri veriyor
 * (13 adres, 560 hareket, eksik 0 / fazla 0) ve 17–26 kat hızlı (498 ms ⟷ 8.764 ms).
 */
import {
  adresHareketleri,
  ayarOku,
  pencereKarsilarMi,
  pencereOku,
  USDT_TRC20_HEX,
  type Ayar,
  type HareketImleci,
  type IndeksHareketi,
  type Pencere,
} from "@cry/blok-indeks";
import {
  TekrarSayaci,
  base58ToHex,
  hexToBase58,
  type Asset,
  type ChainAdapter,
  type ListOptions,
  type Page,
  type Transfer,
} from "@cry/chain";

const TRX: Asset = { chain: "tron", contract: null, symbol: "TRX", decimals: 6 };
const USDT: Asset = { chain: "tron", contract: hexToBase58("41" + USDT_TRC20_HEX), symbol: "USDT", decimals: 6 };

/** Pencere sorgusu her çağrıda atılmaz; canlı uç ilerledikçe tazelenir. */
const PENCERE_TAZE_MS = 60_000;

type Imlec = { indeks: HareketImleci } | { kaynak: string | null };

const imlecYaz = (i: Imlec): string => Buffer.from(JSON.stringify(i), "utf8").toString("base64url");
const imlecOku = (m: string | null | undefined): Imlec | null => {
  if (!m) return null;
  try {
    return JSON.parse(Buffer.from(m, "base64url").toString("utf8")) as Imlec;
  } catch {
    return null;
  }
};

export type IndeksKullanimi = { kaynak: "blok-indeksi" | "trongrid"; sebep: string };

/**
 * `listTransfers` dışındaki her şeyi sarılan adaptöre devreder — bakiye, aktivasyon, tek işlem ve
 * adres doğrulama hâlâ kaynağın işi. Blok indeksi yalnızca HAREKET tutuyor.
 */
export class BlokIndeksliAdaptor implements ChainAdapter {
  readonly chain;
  readonly family;
  readonly nativeAsset;
  readonly capabilities;

  private pencere: Pencere | null = null;
  private pencereZamani = 0;
  private readonly tekrar = new TekrarSayaci();
  /** Son turun hangi yoldan beslendiği — çağıran raporlayabilsin diye. */
  sonKullanim: IndeksKullanimi = { kaynak: "trongrid", sebep: "henüz sorulmadı" };

  constructor(
    private readonly ic: ChainAdapter,
    private readonly a: Ayar = ayarOku(),
  ) {
    this.chain = ic.chain;
    this.family = ic.family;
    this.nativeAsset = ic.nativeAsset;
    this.capabilities = ic.capabilities;
    if (ic.getActivation) this.getActivation = (adres, sinyal) => ic.getActivation!(adres, sinyal);
  }

  normalizeAddress(input: string): string {
    return this.ic.normalizeAddress(input);
  }
  isValidAddress(input: string): boolean {
    return this.ic.isValidAddress(input);
  }
  getAddressSummary(address: string, signal?: AbortSignal) {
    return this.ic.getAddressSummary(address, signal);
  }
  getTransaction(hash: string, signal?: AbortSignal) {
    return this.ic.getTransaction(hash, signal);
  }
  /** Sarılan adaptörde yoksa BURADA DA yok: `capabilities.activation` bir iddiadır, uydurulmaz. */
  getActivation?: (address: string, signal?: AbortSignal) => ReturnType<NonNullable<ChainAdapter["getActivation"]>>;

  private async pencereyiAl(): Promise<Pencere | null> {
    if (Date.now() - this.pencereZamani < PENCERE_TAZE_MS) return this.pencere;
    try {
      this.pencere = await pencereOku(this.a);
    } catch {
      // ClickHouse'a ulaşılamamak "hareket yok" DEĞİLDİR (CLAUDE.md): pencere bilinmiyor sayılır ve
      // soru kaynağa gider. Sessizce boş cevap dönmek, bakılmamış bir yeri temiz gösterirdi.
      this.pencere = null;
    }
    this.pencereZamani = Date.now();
    return this.pencere;
  }

  async listTransfers(address: string, opts: ListOptions = {}): Promise<Page<Transfer>> {
    const adres = this.normalizeAddress(address);
    const onceki = imlecOku(opts.cursor);

    // Tur başı: yol bir kez seçilir. Tur ortasında yol değiştirmek `occurrence` sayacını bölerdi.
    if (!onceki) this.tekrar.sifirla();

    if (onceki && "kaynak" in onceki) return this.kaynaktan(adres, opts, onceki.kaynak);
    if (!onceki) {
      const karar = await this.yolSec(opts);
      this.sonKullanim = karar;
      if (karar.kaynak === "trongrid") return this.kaynaktan(adres, opts, null);
    }

    const p = await this.pencereyiAl();
    if (!p) return this.kaynaktan(adres, opts, null);
    return this.indekstenSayfa(adres, p, opts, onceki && "indeks" in onceki ? onceki.indeks : { gelen: null, giden: null });
  }

  /** Sorulan aralık pencerenin içinde mi? Cevap "hayır" ise sebebiyle birlikte döner. */
  private async yolSec(opts: ListOptions): Promise<IndeksKullanimi> {
    if (this.chain !== "tron") return { kaynak: "trongrid", sebep: "blok indeksi yalnızca TRON" };
    const p = await this.pencereyiAl();
    if (!p) return { kaynak: "trongrid", sebep: "pencere okunamadı" };
    // `fromTs` yoksa soru "bütün geçmiş"tir ve pencere onu karşılamaz.
    if (!opts.fromTs) return { kaynak: "trongrid", sebep: "ilk tam tarama — pencere geçmişin tamamını kapsamıyor" };
    const bas = Math.floor(Date.parse(opts.fromTs) / 1000);
    const son = opts.toTs ? Math.floor(Date.parse(opts.toTs) / 1000) : p.zamanSon;
    if (!pencereKarsilarMi(p, bas, son)) {
      return { kaynak: "trongrid", sebep: `aralık pencere dışında (pencere ${new Date(p.zamanBas * 1000).toISOString()} -> ${new Date(p.zamanSon * 1000).toISOString()})` };
    }
    return { kaynak: "blok-indeksi", sebep: `pencere içi (${((p.zamanSon - p.zamanBas) / 86400).toFixed(1)} gün)` };
  }

  private async kaynaktan(adres: string, opts: ListOptions, imlec: string | null): Promise<Page<Transfer>> {
    const s = await this.ic.listTransfers(adres, { ...opts, cursor: imlec });
    return { items: s.items, nextCursor: s.nextCursor === null ? null : imlecYaz({ kaynak: s.nextCursor }) };
  }

  private async indekstenSayfa(adres: string, p: Pencere, opts: ListOptions, imlec: HareketImleci): Promise<Page<Transfer>> {
    const hex = base58ToHex(adres).replace(/^41/, "").toLowerCase();
    const bas = opts.fromTs ? Math.floor(Date.parse(opts.fromTs) / 1000) : p.zamanBas;
    const son = opts.toTs ? Math.floor(Date.parse(opts.toTs) / 1000) : p.zamanSon;
    const sayfa = await adresHareketleri(this.a, hex, bas, son, imlec);
    const bitti = sayfa.imlec.gelen === "bitti" && sayfa.imlec.giden === "bitti";
    return {
      items: sayfa.satirlar.map((s) => this.hareketeCevir(s)),
      nextCursor: bitti ? null : imlecYaz({ indeks: sayfa.imlec }),
    };
  }

  private hareketeCevir(s: IndeksHareketi): Transfer {
    const varlik = s.varlik === "TRX" ? TRX : USDT;
    const from = hexToBase58("41" + s.kimden);
    const to = hexToBase58("41" + s.kime);
    return {
      chain: "tron",
      txHash: s.tx,
      // İndeksin `idx`'i işlem içindeki KONUM (TRX'te sözleşme, USDT'de olay dizisi). TronGrid'in
      // aynı alandaki sayısıyla AYNI ŞEY DEĞİL ve olmasına gerek yok: kimlik `occurrence`ta.
      index: s.idx,
      occurrence: this.tekrar.sonraki(s.tx, from, to, varlik.contract, s.tutar),
      blockNumber: s.blok,
      ts: new Date(s.zaman * 1000).toISOString(),
      from,
      to,
      asset: varlik,
      amountRaw: s.tutar,
      kind: varlik.contract === null ? "native" : "token",
      // İndeks yalnızca BAŞARILI işlemin transferini yazıyor (ayrıştırıcı başarısızı eler ve sayar).
      success: true,
    };
  }
}
