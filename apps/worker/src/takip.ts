/**
 * Takip koşusu — grafı yürüten katman.
 *
 * Atıf kuralı ve durma ölçütleri SAF katmanda (@cry/motor) ve testli; burada
 * yalnızca veri okunur, sıra kurulur ve sonuç yazılır.
 *
 * Tohum kuralı: kök adrese GİREN paralar takip edilen paradır ("bu adrese
 * gelen para nereye gitti"). Kullanıcı bir işlemden başlatırsa tohum yalnızca
 * o işlemdir. İkisi de kaydın parametrelerinde yazılı kalır.
 */
import { prisma } from "@cry/db";
import {
  dagit,
  durmaSebebi,
  VARSAYILAN_ESIKLER,
  type AtifKurali,
  type DurmaSebebi,
  type Esikler,
  type Hareket,
  type IzliGiris,
} from "@cry/motor";
import { adresIndeksle } from "./indeksle";
import type { ChainId } from "@cry/chain";

type Parametreler = {
  maxHop?: number;
  maxDugum?: number;
  dallanmaEsigi?: number;
  minTutar?: string;
  pencereSaat?: number;
  /** Tohum bir işlemse yalnızca o işlem takip edilir. */
  tohumTx?: string;
};

/** Bir düğümün işlenmek üzere bekleyen hâli. */
type Sira = { adres: string; hop: number; girisler: IzliGiris[] };

export async function takipKos(traceRunId: bigint): Promise<{
  dugum: number;
  kenar: number;
  durma: Record<string, number>;
}> {
  const kosu = await prisma.traceRun.findUniqueOrThrow({ where: { id: traceRunId } });
  const p = (kosu.params ?? {}) as Parametreler;

  const esikler: Esikler = {
    maxHop: p.maxHop ?? VARSAYILAN_ESIKLER.maxHop,
    maxDugum: p.maxDugum ?? VARSAYILAN_ESIKLER.maxDugum,
    dallanmaEsigi: p.dallanmaEsigi ?? VARSAYILAN_ESIKLER.dallanmaEsigi,
    minTutar: p.minTutar ? BigInt(p.minTutar) : VARSAYILAN_ESIKLER.minTutar,
  };

  await prisma.traceRun.update({
    where: { id: traceRunId },
    data: { status: "calisiyor", startedAt: new Date() },
  });

  const zincir = kosu.chain;
  const kural = kosu.taintRule as AtifKurali;
  const gorulen = new Set<string>();
  const durmaSayaci: Record<string, number> = {};
  let kenarSayisi = 0;

  const tohum = await tohumGirisleri(zincir, kosu.rootAddress, p.tohumTx);
  let sira: Sira[] = [{ adres: kosu.rootAddress, hop: 0, girisler: tohum }];
  gorulen.add(kosu.rootAddress);

  while (sira.length > 0) {
    const sonraki: Sira[] = [];

    for (const dugum of sira) {
      const bilgi = await dugumBilgisi(zincir, dugum.adres);

      // Taranmamış düğüm KENDİLİĞİNDEN taranır: atlanırsa graf kısa kalır ve
      // "iz burada bitti" sanılır.
      if (!bilgi.indekslendiMi && gorulen.size <= esikler.maxDugum) {
        await adresIndeksle(zincir as ChainId, dugum.adres, { maxSayfa: 10 }).catch(() => {});
      }

      const guncel = await dugumBilgisi(zincir, dugum.adres);
      // Varlık başına ayrı toplam: TRX ile USDT toplanmaz. Tek varlık varsa
      // düğüme yazılır, birden çok varlık varsa YAZILMAZ — çünkü karşılığı
      // olmayan bir sayı, okuyanı yanlış bir büyüklüğe inandırır.
      const varlikToplami = new Map<string, bigint>();
      for (const g of dugum.girisler) {
        const pay = (g.tutar * BigInt(Math.round(g.pay * 1e6))) / 1_000_000n;
        varlikToplami.set(g.varlik, (varlikToplami.get(g.varlik) ?? 0n) + pay);
      }
      // Durma ölçütündeki tutar eşiği için: en büyük tek varlık tutarı.
      const izliToplam = [...varlikToplami.values()].reduce(
        (en, v) => (v > en ? v : en),
        0n,
      );

      const sebep = durmaSebebi(
        {
          adres: dugum.adres,
          hop: dugum.hop,
          cikisSayisi: guncel.cikisSayisi,
          izliTutar: izliToplam,
          borsaMi: guncel.borsaMi,
          sozlesmeMi: guncel.sozlesmeMi,
          indekslendiMi: guncel.indekslendiMi,
        },
        esikler,
        gorulen.size,
      );

      await dugumYaz(traceRunId, zincir, dugum, varlikToplami, sebep, guncel.etiketler);
      if (sebep) {
        durmaSayaci[sebep] = (durmaSayaci[sebep] ?? 0) + 1;
        continue;
      }

      const hareketler = await hareketleriOku(zincir, dugum.adres);
      const sonuc = dagit(hareketler, dugum.girisler, {
        kural,
        pencereSaat: p.pencereSaat,
      });

      const hedefler = new Map<string, IzliGiris[]>();
      for (const c of sonuc.cikislar) {
        await kenarYaz(traceRunId, zincir, dugum, c);
        kenarSayisi++;
        const liste = hedefler.get(c.hedef) ?? [];
        liste.push({ varlik: c.varlik, tutar: c.izliTutar, ts: c.ts, pay: 1, kaynakTx: c.txHash });
        hedefler.set(c.hedef, liste);
      }

      for (const [hedef, girisler] of hedefler) {
        if (gorulen.has(hedef)) continue; // döngü: aynı düğüm iki kez açılmaz
        if (gorulen.size >= esikler.maxDugum) break;
        gorulen.add(hedef);
        sonraki.push({ adres: hedef, hop: dugum.hop + 1, girisler });
      }
    }

    sira = sonraki;
  }

  await prisma.traceRun.update({
    where: { id: traceRunId },
    data: {
      status: "bitti",
      finishedAt: new Date(),
      stopReason: enCokDurma(durmaSayaci),
      stats: { dugum: gorulen.size, kenar: kenarSayisi, durma: durmaSayaci },
    },
  });

  return { dugum: gorulen.size, kenar: kenarSayisi, durma: durmaSayaci };
}

function enCokDurma(sayac: Record<string, number>): string | null {
  const siralı = Object.entries(sayac).sort((a, b) => b[1] - a[1]);
  return siralı[0]?.[0] ?? null;
}

/* ---------------- veri okuma ---------------- */

/** Kök tohumu: adrese giren paralar ya da yalnızca seçilen işlem. */
async function tohumGirisleri(
  zincir: string,
  kok: string,
  tohumTx?: string,
): Promise<IzliGiris[]> {
  const kayit = await prisma.address.findUnique({
    where: { chain_address: { chain: zincir, address: kok } },
    select: { id: true },
  });
  if (!kayit) return [];

  const girisler = await prisma.transfer.findMany({
    where: { toAddressId: kayit.id, success: true, ...(tohumTx ? { txHash: tohumTx } : {}) },
    select: { amountRaw: true, ts: true, txHash: true, asset: { select: { id: true } } },
    orderBy: { ts: "asc" },
  });

  return girisler.map((g) => ({
    varlik: String(g.asset.id),
    tutar: BigInt(g.amountRaw),
    ts: g.ts.getTime(),
    pay: 1,
    kaynakTx: g.txHash,
  }));
}

type DugumBilgisi = {
  cikisSayisi: number;
  borsaMi: boolean;
  sozlesmeMi: boolean;
  indekslendiMi: boolean;
  etiketler: { title: string; category: string; exchange: string | null }[];
};

async function dugumBilgisi(zincir: string, adres: string): Promise<DugumBilgisi> {
  const kayit = await prisma.address.findUnique({
    where: { chain_address: { chain: zincir, address: adres } },
    select: {
      id: true,
      isContract: true,
      indexState: true,
      labels: { select: { title: true, category: true, exchange: true } },
    },
  });
  if (!kayit) {
    return { cikisSayisi: 0, borsaMi: false, sozlesmeMi: false, indekslendiMi: false, etiketler: [] };
  }

  // Dallanma ölçüsü: kaç FARKLI adrese çıkış yapılmış.
  const hedefler = await prisma.transfer.groupBy({
    by: ["toAddressId"],
    where: { fromAddressId: kayit.id },
  });

  return {
    cikisSayisi: hedefler.length,
    borsaMi: kayit.labels.some((e) => e.category.startsWith("exchange")),
    sozlesmeMi: kayit.isContract === true,
    indekslendiMi: kayit.indexState !== "bilinmiyor",
    etiketler: kayit.labels,
  };
}

async function hareketleriOku(zincir: string, adres: string): Promise<Hareket[]> {
  const kayit = await prisma.address.findUnique({
    where: { chain_address: { chain: zincir, address: adres } },
    select: { id: true },
  });
  if (!kayit) return [];

  const satirlar = await prisma.transfer.findMany({
    where: {
      success: true,
      OR: [{ fromAddressId: kayit.id }, { toAddressId: kayit.id }],
    },
    orderBy: [{ ts: "asc" }, { index: "asc" }],
    select: {
      txHash: true,
      index: true,
      ts: true,
      amountRaw: true,
      assetId: true,
      fromAddressId: true,
      fromAddress: { select: { address: true } },
      toAddress: { select: { address: true } },
    },
  });

  return satirlar.map((s) => {
    const giden = s.fromAddressId === kayit.id;
    return {
      txHash: s.txHash,
      index: s.index,
      ts: s.ts.getTime(),
      yon: giden ? ("giden" as const) : ("gelen" as const),
      karsiTaraf: (giden ? s.toAddress?.address : s.fromAddress?.address) ?? null,
      varlik: String(s.assetId),
      tutar: BigInt(s.amountRaw),
    };
  });
}

/* ---------------- yazma ---------------- */

async function dugumYaz(
  traceRunId: bigint,
  zincir: string,
  dugum: Sira,
  varlikToplami: Map<string, bigint>,
  sebep: DurmaSebebi | null,
  etiketler: DugumBilgisi["etiketler"],
) {
  // Tek varlık varsa tutar yazılır; birden çoksa null — toplamı ekrana basmak
  // "1 TRX + 1 USDT = 2" demek olurdu.
  const tekVarlik = varlikToplami.size === 1 ? [...varlikToplami.values()][0] : null;
  await prisma.traceNode.upsert({
    where: {
      traceRunId_chain_address: { traceRunId, chain: zincir, address: dugum.adres },
    },
    update: {},
    create: {
      traceRunId,
      chain: zincir,
      address: dugum.adres,
      hop: dugum.hop,
      amountRaw: tekVarlik?.toString() ?? null,
      isTerminal: sebep !== null,
      terminalReason: sebep,
      // Etiket görüntüsü DONDURULUR: rapor alındıktan sonra etiket değişse
      // bile o rapordaki hüküm değişmemeli.
      labelSnapshot: { etiketler },
    },
  });
}

async function kenarYaz(
  traceRunId: bigint,
  zincir: string,
  dugum: Sira,
  c: { txHash: string; index: number; ts: number; hedef: string; varlik: string; izliTutar: bigint; toplamTutar: bigint },
) {
  const varlik = await prisma.asset.findUnique({
    where: { id: Number(c.varlik) },
    select: { symbol: true, decimals: true, contract: true },
  });

  await prisma.traceEdge.create({
    data: {
      traceRunId,
      chain: zincir,
      txHash: c.txHash,
      txIndex: c.index,
      fromAddress: dugum.adres,
      toAddress: c.hedef,
      assetSymbol: varlik?.symbol ?? "?",
      assetContract: varlik?.contract || null,
      decimals: varlik?.decimals ?? 0,
      amountRaw: c.izliTutar.toString(),
      ts: new Date(c.ts),
      hop: dugum.hop + 1,
      // Bu kenarın taşıdığı atıf oranı: çıkışın ne kadarı ize ait.
      taintShare: c.toplamTutar === 0n ? 0 : Number(c.izliTutar) / Number(c.toplamTutar),
    },
  });
}
