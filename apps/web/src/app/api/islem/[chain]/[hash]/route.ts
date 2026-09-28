/**
 * GET /api/islem/[chain]/[hash] — bir işlemin ürettiği hareketler.
 *
 * Neden var (2026-09-28): motor tek bir işlemden takip başlatmayı destekliyordu (`tohumTx`) ama
 * hiçbir ekran SORMUYORDU — arama kutusu hash'i "işlem" diye tanıyıp orada kalıyordu. Bu, projenin
 * kendi teşhisi: "yazıldı ama hiçbir sayfa sormuyor".
 *
 * Bu uç ZİNCİRE GİDER (adres özetinin aksine): bir işlem tek bir okumadır, kuyruğa iş açmayı
 * gerektirmez. Kök adresi BİZ SEÇMEYİZ — işlemin birden çok alıcısı olabilir ve hangisinin
 * takip edileceği bir insan kararıdır; uç yalnızca hareketleri listeler.
 */
import { NextResponse } from "next/server";
import { registryFromEnv, type ChainId } from "@cry/chain";
import { apiOturum } from "@/lib/yetki";

const registry = registryFromEnv();

export async function GET(_istek: Request, ctx: { params: Promise<{ chain: string; hash: string }> }) {
  const { yanit: kapi } = await apiOturum();
  if (kapi) return kapi;

  const { chain, hash } = await ctx.params;
  const temiz = decodeURIComponent(hash).trim();
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(temiz)) {
    return NextResponse.json({ error: "işlem hash'i 64 onaltılık karakter olmalı" }, { status: 400 });
  }

  // Boş adaptör SESSİZ kalmaz: hazır olmayan zincirde "sonuç bulunamadı" demek, kapsanmayan
  // zinciri temiz gösterirdi ("yok" ≠ "bakılamadı").
  if (!registry.hazirMi(chain as ChainId)) {
    return NextResponse.json(
      { error: `${chain} için adaptör hazır değil — bu zincirde işlem okunamıyor` },
      { status: 501 },
    );
  }

  try {
    const tx = await registry.get(chain as ChainId).getTransaction(temiz);
    if (!tx) {
      // "Bulunamadı" bir CEVAPTIR: bu zincirde yok demektir, başka zincirde olabilir.
      return NextResponse.json({ bulundu: false, chain, hash: temiz });
    }
    return NextResponse.json({
      bulundu: true,
      chain: tx.chain,
      hash: tx.hash,
      blockNumber: tx.blockNumber,
      ts: tx.ts,
      success: tx.success,
      from: tx.from,
      to: tx.to,
      transfers: tx.transfers.map((h) => ({
        asset: h.asset,
        // Ham tam sayı, string olarak. Ondalığa çevirme yalnızca gösterim sınırında.
        amountRaw: h.amountRaw,
        from: h.from,
        to: h.to,
        kind: h.kind,
        // Başarısız işlem de listelenir: para hareket etmedi ama niyet bilgidir — ve o işlemden
        // takip başlatmanın anlamsız olduğunu ancak bunu görerek anlarsınız.
        success: h.success,
        /*
         * Token'ın ondalığı BİLİNMİYOR mu? Tek işlem ucu token meta verisi vermiyor; sözleşmeden
         * tanınan yalnızca USDT. Ondalığı bilinmeyen bir tutarı 0 ondalıkla basmak YANLIŞ bir
         * büyüklük gösterir (ölçüldü: 12300000000000000 → "12,3 katrilyon" gibi okunur). Ekran bu
         * bayrakla ham sayıyı ham olduğunu SÖYLEYEREK basar.
         */
        ondalikBilinmiyor: h.asset.contract !== null && h.asset.symbol === "?",
      })),
      /*
       * Şekli tanınmayan log SAYILIR: "0 hareket" ile "hareketi çözemedim" ayrı cevaplardır.
       * Ayrıca bu liste bir EKSİKSİZLİK iddiası değildir — `nativeCevir` yalnızca
       * TransferContract/TransferAssetContract tanıyor, sözleşme çağrısının taşıdığı TRX
       * (`call_value`) ve iç transferler burada GÖRÜNMÜYOR.
       */
      cozulemeyenLog: (tx.raw as { cozulemeyenLog?: number } | undefined)?.cozulemeyenLog ?? 0,
    });
  } catch (hata) {
    // Kaynağın hatası veri gibi görünmemeli: 200 + boş liste dönmek, işlemi "hareketsiz" gösterirdi.
    return NextResponse.json(
      { error: hata instanceof Error ? hata.message : "işlem okunamadı" },
      { status: 502 },
    );
  }
}
