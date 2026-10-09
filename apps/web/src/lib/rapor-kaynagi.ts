/**
 * Kanıt paketinin GİRDİSİNİ toplayan katman — saf olmayan taraf.
 *
 * İş bölümü bilerek keskin: burada yalnızca okuma var (koşu, graf, fiyat,
 * kur, zincirin körlüğü), paketi KURAN ve mühürleyen taraf `@cry/rapor`'da
 * ve saf. Hash'i saf katmanın çıktısı belirlediği için, "aynı girdiden aynı
 * hash" ispatlanabilir bir cümle olarak kalıyor.
 */

import { prisma } from "@cry/db";
import { gorulemeyenler, registryFromEnv, type ChainId } from "@cry/chain";
import { fiyatlandir, gunVerisi, type GunVerisi } from "@cry/fiyat";
import { kanitPaketi, paketiMuhurle, type KanitKenari, type KanitPaketi } from "@cry/rapor";

const registry = registryFromEnv();

/** Bu zincirde NE GÖRÜLEMİYOR. Adaptör yoksa cevap "yok" değil BİLİNMİYOR'dur. */
function korluk(zincir: string): string[] | null {
  try {
    return gorulemeyenler(registry.get(zincir as ChainId).capabilities);
  } catch {
    return null;
  }
}

/**
 * Ondalığı bilinmeyen varlığın işareti.
 *
 * EVM adaptörü, kaynak token adını ve sembolünü BİRLİKTE boş döndüğünde
 * `tokenDecimal`i bir ölçüm değil dolgu sayıyor: varlık `?` olur, ondalık
 * 0'a çekilir ve tutar HAM taşınır (CLAUDE.md → EVM adaptörü). Rapor o
 * kaydı 0 ondalıkla basarsa 34 milyar kat yanlış bir büyüklük gösterir.
 */
const ONDALIK_BILINMIYOR_SEMBOLU = "?";

export type RaporKaynagi = {
  paket: KanitPaketi;
  metin: string;
  sha256: string;
  vaka: { id: number; slug: string; baslik: string; karalamaMi: boolean };
  kosuId: bigint;
};

export type KaynakHatasi = { hata: string; durum: number };

/**
 * Bir koşunun kanıt paketi.
 *
 * `baslik` raporun kendi adı. Karalama vakası burada ELENİR: rapor bir
 * dosyaya aittir ve adlandırma rapor istendiği anda sorulur — çağıran
 * `vakaBasligi` vermediyse 409 döner ve kullanıcıya sorulur.
 */
export async function kanitKaynagi(
  kosuId: bigint,
  baslik: string,
  vakaBasligi?: string,
): Promise<RaporKaynagi | KaynakHatasi> {
  const kosu = await prisma.traceRun.findUnique({
    where: { id: kosuId },
    include: {
      case: true,
      nodes: { orderBy: [{ hop: "asc" }, { id: "asc" }] },
      edges: { orderBy: [{ hop: "asc" }, { ts: "asc" }] },
    },
  });
  if (!kosu) return { hata: "koşu bulunamadı", durum: 404 };

  // Kuyrukta ya da çalışan bir koşudan rapor alınmaz: yarım bir grafı
  // mühürlemek, eksik olduğunu söylemeyen bir kanıt üretir. "durduruldu"
  // ALINABİLİR — paket onun eksik olduğunu uyarı olarak yazıyor.
  if (kosu.status !== "bitti" && kosu.status !== "durduruldu") {
    return { hata: `koşunun durumu "${kosu.status}" — rapor bitmiş ya da durdurulmuş koşudan alınır`, durum: 409 };
  }

  if (kosu.case.isDraft && !vakaBasligi?.trim()) {
    return {
      hata: "karalama vakasından rapor alınamaz: vakaya bir ad verin",
      durum: 409,
    };
  }

  const bugun = new Date().toISOString().slice(0, 10);

  // Düğümlerin TARANMA durumu `addresses`te yaşıyor, `trace_nodes`ta değil:
  // rapor izlenen yolu sayıyordu, izlenmeyeni saymıyordu. Arşivde kaydı
  // OLMAYAN adres de "bilinmiyor"dur — yokluk, bakılmışlık değildir.
  const indeksler = new Map<string, { durum: string; not: string | null }>();
  if (kosu.nodes.length) {
    const satirlar = await prisma.address.findMany({
      where: {
        OR: [...new Set(kosu.nodes.map((d) => d.chain))].map((zincir) => ({
          chain: zincir,
          address: { in: kosu.nodes.filter((d) => d.chain === zincir).map((d) => d.address) },
        })),
      },
      select: { chain: true, address: true, indexState: true, indexNote: true },
    });
    for (const a of satirlar) {
      indeksler.set(`${a.chain}|${a.address}`, { durum: a.indexState, not: a.indexNote });
    }
  }

  // İstek boyunca yaşayan bellek. 1.342 kenarlık bir koşunun kenarlarının
  // çoğu AYNI varlık ve çoğu zaman aynı gündür; "rapor günü" hepsinde aynı.
  const varlikBellegi = new Map<string, number | null>();
  const gunBellegi = new Map<string, GunVerisi>();

  const varligiBul = async (zincir: string, sozlesme: string) => {
    const k = `${zincir}|${sozlesme}`;
    const onbellek = varlikBellegi.get(k);
    if (onbellek !== undefined) return onbellek;
    const satir = await prisma.asset.findUnique({
      where: { chain_contract: { chain: zincir, contract: sozlesme } },
      select: { id: true },
    });
    varlikBellegi.set(k, satir?.id ?? null);
    return satir?.id ?? null;
  };

  const gunuAl = async (assetId: number, gun: string) => {
    const k = `${assetId}|${gun}`;
    const onbellek = gunBellegi.get(k);
    if (onbellek) return onbellek;
    const v = await gunVerisi(assetId, gun);
    gunBellegi.set(k, v);
    return v;
  };

  const kenarlar: KanitKenari[] = [];
  for (const k of kosu.edges) {
    // Native varlıkta sözleşme BOŞ DİZE: `assets` tablosunun tekilliği
    // nullable bir kolonla korunamıyor (Postgres'te NULL != NULL).
    const sozlesme = k.assetContract ?? "";
    const assetId = await varligiBul(k.chain, sozlesme);
    const gun = k.ts.toISOString().slice(0, 10);

    const bos = { usd: null, kur: null, kurTarihi: null };
    const yok = { ...bos, not: "bu varlık arşivde yok — fiyatına hiç bakılmadı" };
    const ondalikBilinmiyor = k.assetSymbol === ONDALIK_BILINMIYOR_SEMBOLU;
    const islemGunu = assetId === null ? yok : await gunuAl(assetId, gun);
    const raporGunu = assetId === null ? yok : await gunuAl(assetId, bugun);

    kenarlar.push({
      txHash: k.txHash,
      txIndex: k.txIndex,
      kimden: k.fromAddress,
      kime: k.toAddress,
      sembol: k.assetSymbol,
      sozlesme: k.assetContract,
      ondalik: k.decimals,
      ondalikBilinmiyor: ondalikBilinmiyor || undefined,
      hamTutar: k.amountRaw,
      zamanUtc: k.ts.toISOString(),
      hop: k.hop,
      // Float biçimi serileştirmeye göre değişebilir; pay METİN olarak donar.
      izliPay: k.taintShare.toFixed(6),
      fiyat: fiyatlandir({
        hamTutar: k.amountRaw,
        ondalik: k.decimals,
        ondalikBilinmiyor,
        islemGunu,
        raporGunu,
      }),
    });
  }

  const paket = kanitPaketi({
    baslik,
    uretildi: new Date().toISOString(),
    raporGunu: bugun,
    vaka: { slug: kosu.case.slug, baslik: vakaBasligi?.trim() || kosu.case.title },
    kosu: {
      id: kosu.id.toString(),
      zincir: kosu.chain,
      kok: kosu.rootAddress,
      yon: kosu.direction,
      atifKurali: kosu.taintRule,
      esikler: kosu.params,
      durum: kosu.status,
      durmaSebebi: kosu.stopReason,
      baslangic: kosu.startedAt.toISOString(),
      bitis: kosu.finishedAt?.toISOString() ?? null,
      istatistik: kosu.stats,
    },
    gorulemeyenler: korluk(kosu.chain),
    dugumler: kosu.nodes.map((d) => ({
      adres: d.address,
      hop: d.hop,
      hamTutar: d.amountRaw,
      terminalMi: d.isTerminal,
      terminalSebebi: d.terminalReason,
      indeksDurumu: indeksler.get(`${d.chain}|${d.address}`)?.durum ?? "bilinmiyor",
      indeksNotu: indeksler.get(`${d.chain}|${d.address}`)?.not ?? null,
      etiketler: ((d.labelSnapshot as { etiketler?: unknown[] } | null)?.etiketler ?? []) as unknown[],
    })),
    kenarlar,
  });

  const { metin, sha256 } = paketiMuhurle(paket);
  return {
    paket,
    metin,
    sha256,
    vaka: {
      id: kosu.case.id,
      slug: kosu.case.slug,
      baslik: vakaBasligi?.trim() || kosu.case.title,
      karalamaMi: kosu.case.isDraft,
    },
    kosuId: kosu.id,
  };
}
