/**
 * Blok indeksi — SAF ayrıştırıcı: TronGrid'in blok + işlem bilgisi JSON'undan indeks satırları.
 * Ağ yok, veritabanı yok; girdi JSON, çıktı satır. (Motorun saf katmanlarıyla aynı düzen.)
 *
 * Kapsam ve gerekçeleri (B0 ölçümleri, docs/yol-haritasi-blok-indeks.md):
 * - USDT-TRC20 ve TRX. TRC20 hacminin ~%98'i USDT; varlık kimliği SEMBOL değil SÖZLEŞME adresidir,
 *   o yüzden USDT sözleşmesi sabit olarak tanınır ve başka token'ın Transfer olayı ALINMAZ.
 * - Başarısız işlem transfer DEĞİLDİR ve elenir; ama sayılır ("yok" ile "bakılamadı" ayrı).
 * - ONAY (Approval) bir para hareketi değildir: yalnızca Transfer konusu olan olay alınır.
 * - Tutar HAM TAM SAYIDIR (bigint), gösterim sınırına kadar ondalığa çevrilmez.
 * - İç (internal) TRX transferleri bu blok uç noktasında GÖRÜNMEZ; indeks onları KAÇIRIR
 *   ve bunu kapsam notunda söyler (docs/cozulmesi-gerekenler §4).
 */

/** USDT-TRC20 sözleşmesi (TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t) — hex, 41 öneki OLMADAN. */
export const USDT_TRC20_HEX = "a614f803b6fd780986a42c78ec9c7f77e6ded13c";
/** ERC20/TRC20 `Transfer(address,address,uint256)` olayının konu imzası. */
export const TRANSFER_KONUSU = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export type Varlik = "TRX" | "USDT";

export type IndeksSatiri = {
  blok: number;
  /** Unix saniye (blok başlığının zaman damgası). */
  zaman: number;
  /** İşlem hash'i, 64 hane hex. */
  tx: string;
  /** İşlem İÇİNDEKİ sıra: TRX transferinde sözleşmenin, TRC20'de olayın indeksi. */
  idx: number;
  varlik: Varlik;
  /** 40 hane hex, 41 öneki OLMADAN (kaydın kendisi 20 bayt; gösterimde base58'e çevrilir). */
  kimden: string;
  kime: string;
  /** Ham tam sayı. */
  tutar: bigint;
};

export type AyristirmaSonucu = {
  satirlar: IndeksSatiri[];
  blok: number;
  zaman: number;
  sayac: {
    islem: number;
    /** Başarısız olduğu için elenen işlem (transfer değildir). */
    basarisizIslem: number;
    /** Transfer konusu taşımayan olay (onay vb.). */
    transferOlmayanOlay: number;
    /** USDT dışı bir sözleşmenin Transfer olayı — kapsam dışı. */
    kapsamDisiToken: number;
  };
};

type HamOlay = { address?: string; topics?: string[]; data?: string };
type HamBilgi = { id?: string; receipt?: { result?: string }; log?: HamOlay[] };
type HamIslem = {
  txID?: string;
  ret?: { contractRet?: string }[];
  raw_data?: { contract?: { type?: string; parameter?: { value?: { owner_address?: string; to_address?: string; amount?: number | string } } }[] };
};
type HamBlok = { block_header?: { raw_data?: { number?: number; timestamp?: number } }; transactions?: HamIslem[] };

/** Konudaki 32 baytlık adresin son 20 baytı; 41 öneki taşınmaz. */
function konudanAdres(konu: string): string {
  return konu.replace(/^0x/i, "").toLowerCase().slice(24);
}

/** `41…` önekli hex adresten 20 baytlık gövde. */
function govde(adres: string): string {
  const t = adres.replace(/^0x/i, "").toLowerCase();
  return t.length === 42 && t.startsWith("41") ? t.slice(2) : t;
}

/**
 * Bir bloğu satırlara çevirir. `bilgi`, aynı bloğun `gettransactioninfobyblocknum` yanıtıdır.
 * Blok başlığı okunamıyorsa hata atar: eksik bir bloğu sessizce "0 satır" saymak,
 * yazılmamış bir aralığı yazılmış göstermek olurdu.
 */
export function bloktanSatirlar(blok: HamBlok, bilgi: HamBilgi[]): AyristirmaSonucu {
  const no = blok.block_header?.raw_data?.number;
  const zamanMs = blok.block_header?.raw_data?.timestamp;
  if (typeof no !== "number" || typeof zamanMs !== "number") throw new Error("blok başlığı okunamadı (number/timestamp yok)");
  const zaman = Math.floor(zamanMs / 1000);

  // İşlem bilgisi HER işlem için bir kayıt taşır (ölçüldü, B3 kapısı: 2018–2026'ya yayılmış 180 blokta
  // 180/180). Bir kaynak bilgiyi tutmuyorsa HTTP 200 ile BOŞ dizi döndürüyor — publicnode 92 günden
  // eski, tronstack 2018'de bir blok — ve o blok hatasız "0 USDT" diye yazılırdı. Eşleşme şarttır.
  const txIdler = new Set((blok.transactions ?? []).map((t) => t.txID));
  if (bilgi.length !== txIdler.size || bilgi.some((b) => !b.id || !txIdler.has(b.id))) {
    throw new Error(`blok ${no}: işlem bilgisi bloğun işlemleriyle eşleşmiyor (işlem ${txIdler.size}, bilgi ${bilgi.length}) — kaynak bu bloğun bilgisini tutmuyor olabilir`);
  }

  const satirlar: IndeksSatiri[] = [];
  const sayac = { islem: 0, basarisizIslem: 0, transferOlmayanOlay: 0, kapsamDisiToken: 0 };

  for (const t of blok.transactions ?? []) {
    sayac.islem++;
    // Alan YOKSA başarılı sayılır: TRON bunu yalnızca sözleşme çağrılarında yazıyor (ölçüldü).
    if ((t.ret?.[0]?.contractRet ?? "SUCCESS") !== "SUCCESS") { sayac.basarisizIslem++; continue; }
    (t.raw_data?.contract ?? []).forEach((c, i) => {
      if (c.type !== "TransferContract") return;
      const v = c.parameter?.value;
      if (!v?.owner_address || !v.to_address) return;
      satirlar.push({ blok: no, zaman, tx: t.txID ?? "", idx: i, varlik: "TRX", kimden: govde(v.owner_address), kime: govde(v.to_address), tutar: BigInt(v.amount ?? 0) });
    });
  }

  for (const b of bilgi) {
    // Başarısız çağrı olay üretmez, ama alan varsa yine de kapı kapalı kalsın.
    if ((b.receipt?.result ?? "SUCCESS") !== "SUCCESS") continue;
    (b.log ?? []).forEach((l, i) => {
      if (l.topics?.[0] !== TRANSFER_KONUSU || l.topics.length !== 3) { sayac.transferOlmayanOlay++; return; }
      if (l.address?.toLowerCase() !== USDT_TRC20_HEX) { sayac.kapsamDisiToken++; return; }
      satirlar.push({
        blok: no, zaman, tx: b.id ?? "", idx: i, varlik: "USDT",
        kimden: konudanAdres(l.topics[1]!), kime: konudanAdres(l.topics[2]!),
        tutar: BigInt("0x" + (l.data && /^[0-9a-f]+$/i.test(l.data.replace(/^0x/i, "")) ? l.data.replace(/^0x/i, "") : "0")),
      });
    });
  }

  return { satirlar, blok: no, zaman, sayac };
}
