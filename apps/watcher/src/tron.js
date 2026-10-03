/**
 * TRON okuma — izleme servisinin tek kaynağı (TronGrid).
 *
 * Neden ana yığının adaptörü kullanılmıyor: bu servis Hetzner'da DERLEME ADIMI
 * OLMADAN dönüyor, yani `@cry/chain`i içe aktaramaz. Bedeli iki kez yazılan
 * kod; kazancı PC kapalıyken de dönen bir izleme.
 *
 * Üç kural buraya da taşındı, çünkü **bir kural bir yerde uygulanıp kardeşinde
 * unutulabiliyor**:
 *  1. Tutar HAM TAM SAYI olarak taşınır, `Number`'a uğramaz.
 *  2. Ondalığı BİLİNMEYEN tutar çevrilmez; `ondalik: null` ile yükselir.
 *  3. 429 geri çekilmeyle karşılanır (kota canlı yığınla paylaşılıyor) ve
 *     sayfa bütçesi dolarsa bu SÖYLENİR — okunmamış bir aralık "hareket yok"
 *     diye yazılamaz.
 */
import { createHash } from "node:crypto";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function sha256(bayt) {
  return new Uint8Array(createHash("sha256").update(bayt).digest());
}

/** 21 baytlık TRON hex adresini base58check'e çevirir (bağımlılık yok). */
export function hexToBase58(hex) {
  const temiz = String(hex ?? "").replace(/^0x/i, "").toLowerCase();
  if (!/^41[0-9a-f]{40}$/.test(temiz)) return null;
  const govde = Uint8Array.from(temiz.match(/../g).map((b) => parseInt(b, 16)));
  const ozet = sha256(sha256(govde)).slice(0, 4);
  const tam = new Uint8Array(25);
  tam.set(govde);
  tam.set(ozet, 21);

  let sayi = 0n;
  for (const b of tam) sayi = sayi * 256n + BigInt(b);
  let metin = "";
  while (sayi > 0n) {
    metin = B58[Number(sayi % 58n)] + metin;
    sayi /= 58n;
  }
  // Baştaki sıfır baytlar base58'de '1' olur; TRON adresi 0x41 ile başladığı
  // için pratikte hiç yok, ama kural eksik yazılmaz.
  for (const b of tam) {
    if (b !== 0) break;
    metin = "1" + metin;
  }
  return metin;
}

const uyu = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Çağrılar arası EN AZ bu kadar beklenir. Ölçüldü (2026-10-03, gerçek yanıt):
 * TronGrid `getTrc20TransactionsByAccount` için `allowed_rps(1)` diyor ve
 * aşıldığında sorgu sunucusunu **5 sn** askıya alıyor. 5 sayfayı ardı ardına
 * istemek bu yüzden 429'a çarptı ve adres "bakılamadı" oldu.
 *
 * Kota ayrıca canlı yığınla PAYLAŞILIYOR: izleme 15 dakikada bir koşuyor, yani
 * yavaş olmasının bir bedeli yok; hızlı olmasının bedeli blok okuyucunun payı.
 */
const CAGRI_ARASI_MS = Number(process.env.WATCHER_CALL_GAP_MS ?? 1200);
let sonCagri = 0;

async function sira() {
  const bekle = sonCagri + CAGRI_ARASI_MS - Date.now();
  if (bekle > 0) await uyu(bekle);
  sonCagri = Date.now();
}

/**
 * TronGrid çağrısı: çağrılar arası pencere + 429'da geri çekilme (5, 10, 15,
 * 20 sn). Geri çekilmeyen bir ölçüm "kaynak boş döndü" sanılır ve ölçülmemiş
 * bir şey ölçülmüş gibi yazılır.
 *
 * Hız sınırı HATASI ayrı bir koddur (`hiz_siniri`): "bekle" denmesi gereken
 * yerde "boşuna deneme" demek, hareketi olan bir adresi sessizce atlamaktı.
 */
async function iste(url, anahtar) {
  const basliklar = anahtar ? { "TRON-PRO-API-KEY": anahtar } : {};
  for (let deneme = 1; deneme <= 5; deneme++) {
    await sira();
    const yanit = await fetch(url, { headers: basliklar, signal: AbortSignal.timeout(20000) });
    // Hız sınırı HTTP 429 ile gelebiliyor; aynı metin HTTP 200 + `Error`
    // alanıyla da geliyor (ölçüldü). Şekli farklı, anlamı aynı.
    if (yanit.status === 429) {
      if (deneme === 5) {
        const hata = new Error("TronGrid 429 — geri çekilme tükendi");
        hata.kod = "hiz_siniri";
        throw hata;
      }
      await uyu(5000 * deneme);
      continue;
    }
    if (!yanit.ok) throw new Error(`TronGrid ${yanit.status}`);
    const govde = await yanit.json();
    const metin = govde?.Error ?? govde?.error;
    if (typeof metin === "string" && /rate|suspend/i.test(metin)) {
      if (deneme === 5) {
        const hata = new Error(`TronGrid hız sınırı: ${metin.slice(0, 120)}`);
        hata.kod = "hiz_siniri";
        throw hata;
      }
      await uyu(5000 * deneme);
      continue;
    }
    if (typeof metin === "string") throw new Error(`TronGrid: ${metin.slice(0, 160)}`);
    return govde;
  }
  throw new Error("TronGrid: ulaşılamadı");
}

/**
 * İşlem İÇİNDEKİ kimliği ver: aynı (kimden, kime, varlık, tutar) dörtlüsünün
 * kaçıncı TEKRARI. Hareketin KİMLİĞİ kaynağa bağlı olamaz (ölçüldü: sıraya
 * bağlı kimlik 60 harekette uyuşmadı) ve bir işlemde birebir aynı 20 Transfer
 * olayı görüldü — yirmisi de gerçek.
 *
 * SAF; testi `tests/izleme-esik.test.ts` kardeşinde değil
 * `tests/izleme-tron.test.ts`de.
 */
export function kimlikVer(hareketler) {
  const sayac = new Map();
  return hareketler.map((h) => {
    const dortlu = `${h.txHash}\u0000${h.from}\u0000${h.to}\u0000${h.assetSymbol}\u0000${h.amountRaw}`;
    const tekrar = sayac.get(dortlu) ?? 0;
    sayac.set(dortlu, tekrar + 1);
    return { ...h, movementKey: `${h.assetSymbol ?? "?"}|${h.direction}|${tekrar}` };
  });
}

/** TRC20 kaydını hareket nesnesine çevir. Ondalık yoksa UYDURULMAZ. */
export function trc20Cevir(kayit, adres) {
  const bilgi = kayit.token_info ?? {};
  const ondalikHam = bilgi.decimals;
  // Kaynağın okuyamadığı metadata dolgu DEĞİLDİR: ad ve sembol birlikte boşsa
  // ondalık bir ölçüm değil (ölçüldü: boş ad/sembol + "1").
  const metadataVar = Boolean(bilgi.name || bilgi.symbol);
  return {
    txHash: kayit.transaction_id,
    ts: new Date(Number(kayit.block_timestamp ?? 0)).toISOString(),
    tsMs: Number(kayit.block_timestamp ?? 0),
    from: kayit.from,
    to: kayit.to,
    direction: kayit.to === adres ? "gelen" : "giden",
    assetSymbol: metadataVar ? (bilgi.symbol || "?") : "?",
    assetAddress: bilgi.address ?? null,
    ondalik: metadataVar && Number.isInteger(Number(ondalikHam)) ? Number(ondalikHam) : null,
    amountRaw: String(kayit.value ?? ""),
  };
}

/** Yerli (TRX) işlemini çevir. Yalnızca TransferContract tanınır. */
export function nativeCevir(kayit, adres) {
  const sozlesme = kayit.raw_data?.contract?.[0];
  if (sozlesme?.type !== "TransferContract") return null;
  const d = sozlesme.parameter?.value ?? {};
  const kimden = hexToBase58(d.owner_address);
  const kime = hexToBase58(d.to_address);
  if (!kimden || !kime) return null;
  const tsMs = Number(kayit.block_timestamp ?? 0);
  return {
    txHash: kayit.txID,
    ts: new Date(tsMs).toISOString(),
    tsMs,
    from: kimden,
    to: kime,
    direction: kime === adres ? "gelen" : "giden",
    assetSymbol: "TRX",
    assetAddress: null,
    ondalik: 6,
    amountRaw: String(d.amount ?? "0"),
    success: (kayit.ret?.[0]?.contractRet ?? "SUCCESS") === "SUCCESS",
  };
}

/**
 * Bir adresin `bastanMs`ten itibaren hareketleri.
 *
 * Dönen: `{ hareketler, butceDoldu, enBuyukTs }`. **`butceDoldu` sessiz
 * kalmaz:** kursör okunan EN BÜYÜK damgadan ileri taşınmaz, yoksa okunmamış
 * bir aralık "hareket yok" olarak geçerdi.
 */
export async function hareketleriOku(adres, bastanMs, ayar = {}) {
  const taban = ayar.taban ?? process.env.TRONGRID_URL ?? "https://api.trongrid.io";
  const anahtar = ayar.anahtar ?? process.env.TRONGRID_API_KEY;
  const sayfaBoyu = ayar.sayfaBoyu ?? 100;
  const sayfaButcesi = ayar.sayfaButcesi ?? 5;

  const hepsi = [];
  let butceDoldu = false;

  for (const tur of ["trc20", "native"]) {
    let url =
      tur === "trc20"
        ? `${taban}/v1/accounts/${adres}/transactions/trc20?limit=${sayfaBoyu}` +
          `&order_by=block_timestamp,asc&min_timestamp=${bastanMs}`
        : `${taban}/v1/accounts/${adres}/transactions?limit=${sayfaBoyu}` +
          `&order_by=block_timestamp,asc&min_timestamp=${bastanMs}`;

    for (let sayfa = 1; ; sayfa++) {
      const govde = await iste(url, anahtar);
      const veri = Array.isArray(govde.data) ? govde.data : [];
      for (const kayit of veri) {
        const h = tur === "trc20" ? trc20Cevir(kayit, adres) : nativeCevir(kayit, adres);
        // Değer taşımayan kayıt hareket DEĞİLDİR; onay (Approval) da öyle.
        if (h && h.amountRaw && h.amountRaw !== "0") hepsi.push(h);
      }
      const sonra = govde.meta?.links?.next;
      if (!sonra || veri.length === 0) break;
      if (sayfa >= sayfaButcesi) {
        butceDoldu = true;
        break;
      }
      url = sonra;
    }
  }

  hepsi.sort((a, b) => a.tsMs - b.tsMs || a.txHash.localeCompare(b.txHash));
  return {
    hareketler: kimlikVer(hepsi),
    butceDoldu,
    enBuyukTs: hepsi.length > 0 ? hepsi[hepsi.length - 1].tsMs : null,
  };
}
