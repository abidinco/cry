/**
 * Adres indeksleyici — "vaka odaklı artımlı indeks"in uygulaması.
 *
 * Kural: bir adres bir kez tam çekilir, sonra yalnızca DELTA çekilir. Rate
 * limit yalnızca ilk taramada sorun olur; zamanla soruşturulan dünyanın
 * kendi indeksi oluşur.
 */
import { prisma } from "@cry/db";
import { registryFromEnv, type ChainId, type Transfer } from "@cry/chain";

const registry = registryFromEnv();

/** Tek seferde veritabanına yazılan hareket sayısı. */
const YIGIN = 500;

export type IndeksSonucu = {
  address: string;
  chain: string;
  yeniHareket: number;
  okunanSayfa: number;
  /** Kaynak hız sınırına takıldıysa tur yarıda bitmiş olabilir. */
  tamamlandi: boolean;
  atlanmaSebebi?: string;
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

  const adaptor = registry.get(chain);
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

  let imlec: string | null = kayit.indexCursor ?? null;
  let sayfa = 0;
  let yeni = 0;
  const maxSayfa = opts.maxSayfa ?? 50;

  while (sayfa < maxSayfa) {
    const { items, nextCursor } = await adaptor.listTransfers(adres, {
      cursor: imlec,
      signal: opts.signal,
      // Artımlı: en son gördüğümüz andan sonrası. Kaynak imleci taşıyorsa o
      // yeter; taşımıyorsa zaman damgası kapısı devreye girer.
      fromTs: imlec ? null : (kayit.indexedThroughTs?.toISOString() ?? null),
    });
    sayfa++;

    if (items.length > 0) yeni += await hareketleriYaz(items);

    imlec = nextCursor;
    if (!nextCursor) break;
  }

  const tamamlandi = imlec === null;
  await prisma.address.update({
    where: { id: kayit.id },
    data: {
      indexCursor: imlec,
      lastIndexedAt: new Date(),
      indexedThroughTs: tamamlandi ? new Date() : kayit.indexedThroughTs,
      indexState: tamamlandi ? "tam" : "kismi",
    },
  });

  return { address: adres, chain, yeniHareket: yeni, okunanSayfa: sayfa, tamamlandi };
}

/** Hareketleri yazar; aynı (chain, txHash, index) ikinci kez yazılmaz. */
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
