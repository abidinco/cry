/**
 * Adres indeksleyici — "vaka odaklı artımlı indeks"in uygulaması.
 *
 * Kural: bir adres bir kez tam çekilir, sonra yalnızca DELTA çekilir. Rate
 * limit yalnızca ilk taramada sorun olur; zamanla soruşturulan dünyanın
 * kendi indeksi oluşur.
 */
import { prisma } from "@cry/db";
import { registryFromEnv, type ChainAdapter, type ChainId, type Transfer } from "@cry/chain";
import { BlokIndeksliAdaptor } from "./blok-indeksli-adaptor.js";

const registry = registryFromEnv();

/**
 * TRON adaptörünün önüne blok indeksini koyar: pencere İÇİNDEKİ soruları kendi diskimizden
 * cevaplar, dışındakileri kaynağa bırakır (CLAUDE.md → M1). Sarmalayıcı adres başına DEĞİL süreç
 * başına tutuluyor; pencereyi 60 sn önbelleğe alıyor ve `occurrence` sayacını tur başında sıfırlıyor.
 */
const sarmalayicilar = new Map<ChainId, ChainAdapter>();
export function adaptorAl(chain: ChainId): ChainAdapter {
  const ham = registry.get(chain);
  if (chain !== "tron") return ham;
  let s = sarmalayicilar.get(chain);
  if (!s) {
    s = new BlokIndeksliAdaptor(ham);
    sarmalayicilar.set(chain, s);
  }
  return s;
}

/** Tek seferde veritabanına yazılan hareket sayısı. */
const YIGIN = 500;

export type IndeksSonucu = {
  address: string;
  chain: string;
  yeniHareket: number;
  okunanSayfa: number;
  /** Kaynak hız sınırına takıldıysa tur yarıda bitmiş olabilir. */
  tamamlandi: boolean;
  /** Bu turda görülen en yeni hareketin tarihi — sonraki tur buradan devam. */
  sonTarih?: string | null;
  /** Transfer sayılmayan onay kayıtları: sessizce atılan kayıt "yoktu" sanılır. */
  atlananOnay?: number;
  atlanmaSebebi?: string;
  /** Hareketler nereden geldi: kendi blok indeksimiz mi, kaynak mı — ve neden. */
  hareketKaynagi?: string;
};

export async function adresIndeksle(
  chain: ChainId,
  hamAdres: string,
  opts: { maxSayfa?: number; signal?: AbortSignal } = {},
): Promise<IndeksSonucu> {
  if (!registry.hazirMi(chain)) {
    return {
      address: hamAdres,
      chain,
      yeniHareket: 0,
      okunanSayfa: 0,
      tamamlandi: false,
      atlanmaSebebi: `${chain} adaptörü henüz doldurulmadı`,
    };
  }

  const adaptor = adaptorAl(chain);
  const adres = adaptor.normalizeAddress(hamAdres);
  const ozet = await adaptor.getAddressSummary(adres, opts.signal);

  const kayit = await prisma.address.upsert({
    where: { chain_address: { chain, address: adres } },
    update: {
      firstSeen: ozet.firstSeen ? new Date(ozet.firstSeen) : undefined,
      lastSeen: ozet.lastSeen ? new Date(ozet.lastSeen) : undefined,
      balanceRaw: ozet.balanceRaw,
      isContract: ozet.isContract ?? undefined,
    },
    create: {
      chain,
      address: adres,
      firstSeen: ozet.firstSeen ? new Date(ozet.firstSeen) : null,
      lastSeen: ozet.lastSeen ? new Date(ozet.lastSeen) : null,
      balanceRaw: ozet.balanceRaw,
      isContract: ozet.isContract ?? false,
      indexState: "bilinmiyor",
    },
  });

  // TRON: hesabı kimin aktive ettiği kümelemenin dayanağı; bir kez sorulur.
  if (adaptor.capabilities.activation && !kayit.activatedByAddress && adaptor.getActivation) {
    const aktivasyon = await adaptor.getActivation(adres, opts.signal);
    if (aktivasyon?.activatedBy) {
      await prisma.address.update({
        where: { id: kayit.id },
        data: {
          activatedByAddress: aktivasyon.activatedBy,
          activatedAt: aktivasyon.ts ? new Date(aktivasyon.ts) : null,
          activationTxHash: aktivasyon.txHash,
        },
      });
    }
  }

  // İMLEÇ TUR İÇİNDE geçerlidir, TURLAR ARASINDA değil: TronGrid'in
  // fingerprint'i kısa ömürlü ve süresi dolunca kaynak sessizce BAŞTAN
  // veriyor — tur 50 sayfa okuyup 200 yeni kayıt yazıyor ve "ilerledik"
  // sanılıyor. Turlar arası devam, kalıcı olan şeye bağlanır: son yazdığımız
  // hareketin TARİHİNE.
  let imlec: string | null = null;
  let sayfa = 0;
  let yeni = 0;
  let enSonTs: Date | null = kayit.indexedThroughTs ?? null;
  const maxSayfa = opts.maxSayfa ?? 50;
  const baslangicTs = kayit.indexedThroughTs?.toISOString() ?? null;

  while (sayfa < maxSayfa) {
    const { items, nextCursor } = await adaptor.listTransfers(adres, {
      cursor: imlec,
      signal: opts.signal,
      // Sınır DÂHİL okunur; aynı kayıt ikinci kez yazılmaz (skipDuplicates).
      // Süzgeç HER SAYFADA tekrarlanır: TronGrid fingerprint'i ilk sorgunun
      // parametreleriyle eşleşmezse "fingerprint does not match current set
      // of params" ile 400 döner ve tur ortasında kopar.
      fromTs: baslangicTs,
    });
    sayfa++;

    if (items.length > 0) {
      yeni += await hareketleriYaz(items);
      for (const h of items) {
        const t = new Date(h.ts);
        if (!enSonTs || t > enSonTs) enSonTs = t;
      }
    }

    imlec = nextCursor;
    if (!nextCursor) break;
  }

  const tamamlandi = imlec === null;
  await prisma.address.update({
    where: { id: kayit.id },
    data: {
      // İmleç SAKLANMAZ; sonraki tur tarihten devam eder.
      indexCursor: null,
      lastIndexedAt: new Date(),
      // "Şu ana kadar indeksledim" değil, "şu tarihe kadar VERİ gördüm".
      indexedThroughTs: enSonTs,
      indexState: tamamlandi ? "tam" : "kismi",
    },
  });

  return {
    address: adres,
    chain,
    yeniHareket: yeni,
    okunanSayfa: sayfa,
    tamamlandi,
    sonTarih: enSonTs?.toISOString() ?? null,
    atlananOnay:
      "atlananOnaySayisi" in adaptor
        ? (adaptor as { atlananOnaySayisi: number }).atlananOnaySayisi
        : undefined,
    // Yazılıp hiçbir yerin sormadığı bilgi, olmayan bilgidir (CLAUDE.md → Görev disiplini).
    hareketKaynagi:
      adaptor instanceof BlokIndeksliAdaptor
        ? `${adaptor.sonKullanim.kaynak} (${adaptor.sonKullanim.sebep})`
        : undefined,
  };
}

/**
 * Hareketleri yazar; aynı hareket ikinci kez yazılmaz.
 *
 * Tekillik (chain, txHash, from, to, asset, amountRaw, occurrence) — KAYNAKTAN BAĞIMSIZ.
 * Eskiden (chain, txHash, index) idi ve `index`'i TronGrid'in kendi sırasından alıyordu; blok
 * indeksi aynı sayıyı üretemediği için aynı para iki satır olurdu (ölçüm M1-E: 2.270'te 60).
 */
async function hareketleriYaz(hareketler: Transfer[]): Promise<number> {
  let yazilan = 0;

  for (let i = 0; i < hareketler.length; i += YIGIN) {
    const dilim = hareketler.slice(i, i + YIGIN);
    const varlikIdleri = await varliklariCoz(dilim);
    const adresIdleri = await adresleriCoz(dilim);

    const sonuc = await prisma.transfer.createMany({
      data: dilim.map((h) => ({
        chain: h.chain,
        txHash: h.txHash,
        index: h.index,
        occurrence: h.occurrence,
        blockNumber: h.blockNumber,
        ts: new Date(h.ts),
        fromAddressId: h.from ? (adresIdleri.get(anahtar(h.chain, h.from)) ?? null) : null,
        toAddressId: h.to ? (adresIdleri.get(anahtar(h.chain, h.to)) ?? null) : null,
        assetId: varlikIdleri.get(varlikAnahtari(h))!,
        amountRaw: h.amountRaw,
        kind: h.kind,
        success: h.success,
        feeRaw: h.feeRaw ?? null,
      })),
      skipDuplicates: true,
    });
    yazilan += sonuc.count;
  }

  return yazilan;
}

const anahtar = (chain: string, adres: string) => `${chain}|${adres}`;
const varlikAnahtari = (h: Transfer) => `${h.asset.chain}|${h.asset.contract ?? ""}`;

/** Karşı taraf adresleri de kayıt açar — graf düğümleri onlar. */
async function adresleriCoz(hareketler: Transfer[]): Promise<Map<string, bigint>> {
  const istenen = new Map<string, { chain: string; address: string }>();
  for (const h of hareketler) {
    for (const a of [h.from, h.to]) {
      if (a) istenen.set(anahtar(h.chain, a), { chain: h.chain, address: a });
    }
  }

  await prisma.address.createMany({
    data: [...istenen.values()].map((a) => ({ chain: a.chain, address: a.address })),
    skipDuplicates: true,
  });

  const kayitlar = await prisma.address.findMany({
    where: { OR: [...istenen.values()] },
    select: { id: true, chain: true, address: true },
  });
  return new Map(kayitlar.map((k) => [anahtar(k.chain, k.address), k.id]));
}

async function varliklariCoz(hareketler: Transfer[]): Promise<Map<string, number>> {
  const istenen = new Map<string, Transfer["asset"]>();
  for (const h of hareketler) istenen.set(varlikAnahtari(h), h.asset);

  for (const v of istenen.values()) {
    // Native varlıkta sözleşme yok; veritabanında BOŞ DİZE ile temsil edilir
    // (null olsaydı tekillik kısıtı çalışmazdı — bkz. şemadaki not).
    const contract = v.contract ?? "";
    await prisma.asset.upsert({
      where: { chain_contract: { chain: v.chain, contract } },
      // Sembol/ondalık kaynaktan sonradan düzelebiliyor; bilinen değeri
      // "?" ile EZME — bir kez doğru yazıldıysa öyle kalsın.
      update: v.symbol === "?" ? {} : { symbol: v.symbol, decimals: v.decimals },
      create: { chain: v.chain, contract, symbol: v.symbol, decimals: v.decimals },
    });
  }

  const kayitlar = await prisma.asset.findMany({
    where: {
      OR: [...istenen.values()].map((v) => ({ chain: v.chain, contract: v.contract ?? "" })),
    },
    select: { id: true, chain: true, contract: true },
  });
  return new Map(kayitlar.map((k) => [`${k.chain}|${k.contract}`, k.id]));
}
