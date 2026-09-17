/**
 * GET /api/adres/[chain]/[address]/blok-indeksi — adresin YEREL BLOK İNDEKSİNE göre özeti (B5).
 *
 * Bu bir ADAY bilgidir (CLAUDE.md → iki katman): takip, iz ve rapor bunu kullanmaz. Cevap her zaman
 * pencereyle gelir — indeksin boşluksuz kapsadığı aralık — ve pencere dışı için bir şey söylemez.
 *
 * Üç ayrı cevap, "yok ≠ bakılamadı":
 *   durum "desteklenmiyor" — zincir için blok indeksi yok (bugün yalnızca TRON);
 *   durum "bakilamadi"     — ClickHouse'a ulaşılamadı ya da kapsam boş;
 *   durum "tamam"          — pencerede ölçüldü (gelen/giden boşsa pencerede hareket YOK).
 */
import { NextResponse } from "next/server";
import { registryFromEnv, base58ToHex, hexToBase58, type ChainId } from "@cry/chain";
import { ayarOku, pencereOku, adresOzeti, type Pencere, type YonOzeti } from "@cry/blok-indeks";
import { apiOturum } from "@/lib/yetki";

const registry = registryFromEnv();

/** Pencere tüm kapsam tablosunu sıralı okur; her sayfa açılışında değil, dakikada bir hesaplanır. */
let pencereOnbellek: { deger: Pencere; zaman: number } | null = null;
const PENCERE_OMRU_MS = 60_000;

export async function GET(_istek: Request, ctx: { params: Promise<{ chain: string; address: string }> }) {
  const { yanit: kapi } = await apiOturum();
  if (kapi) return kapi;

  const { chain, address } = await ctx.params;
  if (chain !== "tron") return NextResponse.json({ durum: "desteklenmiyor" });
  let adres: string;
  try {
    adres = registry.get(chain as ChainId).normalizeAddress(decodeURIComponent(address));
  } catch {
    return NextResponse.json({ error: "geçersiz adres" }, { status: 400 });
  }

  try {
    const a = ayarOku();
    if (!pencereOnbellek || Date.now() - pencereOnbellek.zaman > PENCERE_OMRU_MS) {
      const p = await pencereOku(a);
      if (!p) return NextResponse.json({ durum: "bakilamadi", sebep: "blok indeksinin kapsamı boş" });
      pencereOnbellek = { deger: p, zaman: Date.now() };
    }
    const ozet = await adresOzeti(a, base58ToHex(adres).slice(2).toLowerCase(), pencereOnbellek.deger);
    // Gösterim sınırında base58: indeks 20 baytlık gövde tutuyor.
    const cevir = (y: YonOzeti[]) => y.map((v) => ({ ...v, enBuyukler: v.enBuyukler.map((k) => ({ ...k, adres: hexToBase58("41" + k.adres) })) }));
    return NextResponse.json({ durum: "tamam", pencere: ozet.pencere, gelen: cevir(ozet.gelen), giden: cevir(ozet.giden) });
  } catch (hata) {
    // Ulaşılamayan indeks "hareket yok" DEĞİLDİR.
    return NextResponse.json({ durum: "bakilamadi", sebep: hata instanceof Error ? hata.message.slice(0, 200) : "bilinmeyen hata" });
  }
}
