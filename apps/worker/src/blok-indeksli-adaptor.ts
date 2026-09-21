/**
 * Blok indeksinden besleyen adaptör sarmalayıcısı — takip koşuları kendi diskimizden okusun diye.
 *
 * Kullanıcı hedefi: "Kendi motorumuzdan istediğimiz takip koşularını yapalım. TronGrid'e ihtiyacımız
 * kalmasın." Bu sarmalayıcı `ChainAdapter`'ın ÖNÜNE geçiyor; `adresIndeksle` hiçbir şey bilmiyor.
 *
 * KURAL (CLAUDE.md → M1): indeks yalnızca PENCERENİN İÇİNDE hüküm verebilir — kapsam tablosunun
 * boşluksuz kapsadığı aralık. Ölçüldü (M1, 2026-09-21): orada TronGrid ile birebir aynı hareketleri
 * veriyor (13 adres, 560 hareket, eksik 0 / fazla 0) ve 17–67 kat hızlı.
 *
 * ÜÇ YOL:
 *   - `indeks`  — sorulan aralık tamamen pencerede. Kaynağa hiç gidilmez.
 *   - `melez`   — aralık pencereden ÖNCE başlıyor: pencere öncesi KAYNAKTAN, pencere içi İNDEKSTEN.
 *   - `kaynak`  — pencere yok/okunamıyor ya da aralık tamamen pencere öncesi.
 *
 * Melez neden GÜVENLİ (ve neden dün değildi): iki parça arasındaki dikiş, sınırda hareket kaybetme
 * ya da çiftleme riski taşıyordu. Şimdi parçalar bilerek ÖRTÜŞTÜRÜLÜYOR (`ORTAK_PAY`) — boşluk
 * kalmıyor — ve örtüşmede çıkan mükerrer satırlar zararsız, çünkü hareketin kimliği artık
 * `occurrence` ile KAYNAKTAN BAĞIMSIZ (göç 20260921160000). Sayaçlar ayrı: kaynak parçasını sarılan
 * adaptör kendi sayacıyla, indeks parçasını bu sınıf kendi sayacıyla numaralar; ortak bir sayaç
 * örtüşen kayda #3 deyip mükerrerliği kimlik düzeyinde bozar.
 *
 * NEDEN `firstSeen`'e GÜVENİLMİYOR: "adresin ömrü pencereye sığıyorsa ilk tarama da indeksten olur"
 * fikri ölçülüp ELENDİ (M2, 2026-09-22): TronGrid'in `create_time`'ı 8 adresin 6'sında ilk
 * hareketten SONRA (birinde 73 gün). TRC20 bakiyesi sözleşmenin deposunda; aktive edilmemiş adrese
 * USDT gidebiliyor. Bu yüzden pencere öncesi HER ZAMAN kaynağa sorulur.
 */
import {
  adresHareketleri,
  ayarOku,
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

/**
 * Melez taramada iki parçanın ÖRTÜŞME payı (saniye). Pencere sınırı blok hassasiyetinde, TronGrid'in
 * TRC20 ucu blok numarası vermiyor; pay olmadan sınırdaki hareket iki parçanın arasına düşebilir.
 * Örtüşmenin bedeli mükerrer satır ve o zararsız — kimlik `occurrence` ile kaynaktan bağımsız.
 */
const ORTAK_PAY_SN = 300;

type Imlec =
  | { indeks: HareketImleci }
  | { kaynak: string | null }
  /** Melezin BİRİNCİ parçası: pencere öncesi, kaynaktan. Bitince indeks parçasına geçilir. */
  | { oncesi: string | null };

const imlecYaz = (i: Imlec): string => Buffer.from(JSON.stringify(i), "utf8").toString("base64url");
const imlecOku = (m: string | null | undefined): Imlec | null => {
  if (!m) return null;
  try {
    return JSON.parse(Buffer.from(m, "base64url").toString("utf8")) as Imlec;
  } catch {
    return null;
  }
};

export type IndeksKullanimi = { kaynak: "blok-indeksi" | "melez" | "trongrid"; sebep: string };

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
    const p = await this.pencereyiAl();

    // Tur başı: yol BİR KEZ seçilir. Tur ortasında yol değiştirmek sayaçları bölerdi.
    if (!onceki) {
      this.tekrar.sifirla();
      this.sonKullanim = this.yolSec(p, opts);
    }

    // Melezin BİRİNCİ parçası: pencere öncesi, kaynaktan, üst sınır pencerenin başı + ortak pay.
    if ((onceki && "oncesi" in onceki) || (!onceki && this.sonKullanim.kaynak === "melez")) {
      const imlec = onceki && "oncesi" in onceki ? onceki.oncesi : null;
      const sayfa = await this.ic.listTransfers(adres, {
        ...opts,
        cursor: imlec,
        toTs: new Date((p!.zamanBas + ORTAK_PAY_SN) * 1000).toISOString(),
      });
      // Parça bitince tur BİTMEZ: imleç ikinci parçaya (indeks) geçer.
      return {
        items: sayfa.items,
        nextCursor:
          sayfa.nextCursor !== null
            ? imlecYaz({ oncesi: sayfa.nextCursor })
            : imlecYaz({ indeks: { gelen: null, giden: null } }),
      };
    }

    if ((onceki && "kaynak" in onceki) || (!onceki && this.sonKullanim.kaynak === "trongrid")) {
      return this.kaynaktan(adres, opts, onceki && "kaynak" in onceki ? onceki.kaynak : null);
    }

    if (!p) return this.kaynaktan(adres, opts, null); // pencere kaybolduysa kaynağa düş
    return this.indekstenSayfa(adres, p, opts, onceki && "indeks" in onceki ? onceki.indeks : { gelen: null, giden: null });
  }

  /** Aralığın pencereyle ilişkisine göre yolu seçer; sebebi günlüğe ve `IndeksSonucu`'na düşer. */
  private yolSec(p: Pencere | null, opts: ListOptions): IndeksKullanimi {
    if (this.chain !== "tron") return { kaynak: "trongrid", sebep: "blok indeksi yalnızca TRON" };
    if (!p) return { kaynak: "trongrid", sebep: "pencere okunamadı" };
    const gun = ((p.zamanSon - p.zamanBas) / 86400).toFixed(1);
    // `fromTs` yoksa soru "bütün geçmiş"tir: başlangıç bilinmiyor, pencereden ÖNCE varsayılır.
    const bas = opts.fromTs ? Math.floor(Date.parse(opts.fromTs) / 1000) : Number.NEGATIVE_INFINITY;
    const son = opts.toTs ? Math.floor(Date.parse(opts.toTs) / 1000) : p.zamanSon;
    if (son <= p.zamanBas) return { kaynak: "trongrid", sebep: "aralık tamamen pencere öncesi" };
    if (bas >= p.zamanBas && son <= p.zamanSon) return { kaynak: "blok-indeksi", sebep: `pencere içi (${gun} gün)` };
    return { kaynak: "melez", sebep: `pencere öncesi kaynaktan, pencere içi (${gun} gün) indeksten` };
  }

  private async kaynaktan(adres: string, opts: ListOptions, imlec: string | null): Promise<Page<Transfer>> {
    const s = await this.ic.listTransfers(adres, { ...opts, cursor: imlec });
    return { items: s.items, nextCursor: s.nextCursor === null ? null : imlecYaz({ kaynak: s.nextCursor }) };
  }

  private async indekstenSayfa(adres: string, p: Pencere, opts: ListOptions, imlec: HareketImleci): Promise<Page<Transfer>> {
    const hex = base58ToHex(adres).replace(/^41/, "").toLowerCase();
    // Alt sınır pencerenin başından ÖNCE olamaz: indeks orada veri tutmuyor. Üst sınır da pencereyi
    // aşamaz — aşan kısım "bakılamadı"dır ve bu yolun işi değildir.
    const bas = Math.max(p.zamanBas, opts.fromTs ? Math.floor(Date.parse(opts.fromTs) / 1000) : p.zamanBas);
    const son = Math.min(p.zamanSon, opts.toTs ? Math.floor(Date.parse(opts.toTs) / 1000) : p.zamanSon);
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
