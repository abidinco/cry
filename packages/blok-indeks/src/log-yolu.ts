/**
 * Blok indeksi — LOG YOLU: işlem bilgisini blok blok çekmek yerine USDT olaylarını `eth_getLogs` ile
 * bir blok ARALIĞI için tek istekte almak. SAF katman; ağ yok.
 *
 * Neden: eski yolda her blok bir `gettransactioninfobyblocknum` isteğiydi (blok başına ~1,05 istek) ve
 * TronGrid'in günlük istek kotası geçmiş doldurmanın tavanıydı (ölçüldü 2026-10-19: ~0,8 blok/sn).
 * Aralık sorgusu istek sayısını blok başına ~0,03'e indirir.
 *
 * Eski yolla BİREBİR aynı satırı üretmek zorunda (aynı `idx`): satırın `idx`i işlemin TÜM olay dizisindeki
 * sıradır (onay ve başka token olayları dahil). `eth_getLogs` ADRESSİZ sorulur ve blok içinde sıralı
 * `logIndex` taşır; bir işlemin olayları logIndex sırasıyla işlemin olay dizisidir (ölçüldü, 73.600.003:
 * 80 olay ⟷ işlem bilgisinde 80 olay, sıra aynı). Adres süzgeciyle sorulsaydı `idx` kayardı ve gap
 * kapatıcı (eski yol) aynı transferi İKİNCİ kez, farklı idx'le yazardı.
 *
 * Kayıp güvencesi: işlem bilgisinin "işlemlerle birebir eşleşir" kapısı bu yolda YOKTUR (olaysız işlem
 * normal). Yerine: (1) her olayın işlemi bloğun işlemlerinden biri olmalı, (2) aralıkta başarılı sözleşme
 * çağrısı var ama tek olay yoksa aralık ŞÜPHELİDİR ve eski yola düşer, (3) çağıran örnekleme ile eski yolla
 * çapraz denetim yapar.
 */
import { bloktanSatirlar, type AyristirmaSonucu } from "./ayristir.js";

/** `eth_getLogs` sonucundaki bir kayıt (TronGrid /jsonrpc). */
export type RpcLog = {
  address: string;
  topics: string[];
  data: string;
  transactionHash: string;
  /** Blok içinde sıralı, onaltılık. */
  logIndex: string;
  blockNumber: string;
};

type HamBlok = Parameters<typeof bloktanSatirlar>[0];

const sade = (h: string) => h.replace(/^0x/i, "").toLowerCase();
const sayiya = (h: string) => parseInt(sade(h), 16);

/** Aralık sonucunu blok numarasına göre böler. Aralık dışı bir blok numarası HATADIR. */
export function loglariBloklaraBol(loglar: RpcLog[], bas: number, son: number): Map<number, RpcLog[]> {
  const m = new Map<number, RpcLog[]>();
  for (const l of loglar) {
    const n = sayiya(l.blockNumber);
    if (!Number.isFinite(n) || n < bas || n > son) throw new Error(`eth_getLogs [${bas}, ${son}] aralığında olmayan blok döndürdü: ${l.blockNumber}`);
    (m.get(n) ?? m.set(n, []).get(n)!).push(l);
  }
  return m;
}

/**
 * Bir bloğu, gövdesi + o bloğun olaylarıyla satırlara çevirir. Çıktı `bloktanSatirlar(blok, bilgi)` ile
 * aynıdır: olaylar işlem başına gruplanıp `bilgi` biçimine çevrilir ve AYNI ayrıştırıcıdan geçer.
 */
export function bloktanSatirlarLogla(blok: HamBlok, loglar: RpcLog[]): AyristirmaSonucu {
  const no = blok.block_header?.raw_data?.number;
  const islemler = new Set((blok.transactions ?? []).map((t) => t.txID));
  const sirali = [...loglar].sort((x, y) => sayiya(x.logIndex) - sayiya(y.logIndex));
  const ids = new Set<number>();
  const grup = new Map<string, { address: string; topics: string[]; data: string }[]>();
  for (const l of sirali) {
    if (sayiya(l.blockNumber) !== no) throw new Error(`blok ${no}: başka bloğun olayı geldi (${l.blockNumber})`);
    const tx = sade(l.transactionHash);
    if (!islemler.has(tx)) throw new Error(`blok ${no}: olayın işlemi (${tx.slice(0, 12)}…) bloğun işlemlerinde yok`);
    const li = sayiya(l.logIndex);
    if (ids.has(li)) throw new Error(`blok ${no}: logIndex ${li} iki kez geldi`);
    ids.add(li);
    (grup.get(tx) ?? grup.set(tx, []).get(tx)!).push({ address: sade(l.address), topics: l.topics.map(sade), data: sade(l.data) });
  }
  const bilgi = (blok.transactions ?? []).map((t) => ({ id: t.txID, log: grup.get(t.txID ?? "") ?? [] }));
  return bloktanSatirlar(blok, bilgi);
}

/**
 * Aralık ŞÜPHELİ mi: bloklarda başarılı sözleşme çağrısı var ama aralığın tek olayı yok. Gerçekten olaysız
 * olabilir (2018'de); ama kaynağın o aralığı tutmayıp HTTP 200 + boş dizi vermesi de AYNI görünür.
 * Şüphede çağıran eski yola düşer — eski yol bilgiyi işlemlerle birebir eşleştirir.
 */
export function logsuzAraliksupheli(bloklar: HamBlok[], olaySayisi: number): boolean {
  if (olaySayisi > 0) return false;
  return bloklar.some((b) => (b.transactions ?? []).some((t) =>
    (t.ret?.[0]?.contractRet ?? "SUCCESS") === "SUCCESS" &&
    (t.raw_data?.contract ?? []).some((c) => c.type === "TriggerSmartContract")));
}
