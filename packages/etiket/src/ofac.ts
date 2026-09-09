/**
 * OFAC SDN listesi — yaptırımlı kripto adreslerinin resmî, makine okunur
 * kaynağı.
 *
 * Neden bu kaynak: ücretsiz, anahtarsız, ve kaynağın KENDİSİ yetkili. Bir
 * adresin yaptırım listesinde olması raporda ağır basan bir bulgudur ve
 * kaçırılması pahalıdır.
 *
 * Ayrıştırıcı SAF: metin girer, bulgu çıkar. Ağ ve veritabanı çağıranın işi —
 * böylece kural bir fixture üstünde sınanabiliyor.
 */

import { tronGecerliMi, tronNormalize } from "@cry/chain";
import type { ChainId } from "@cry/chain";
import type { Atlanan, TohumEtiket, TohumSonucu } from "./tipler";

export const OFAC_URL =
  "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN_ENHANCED.XML";

/** Bir kaydın kaynaktaki adresi — insanın gidip bakabileceği yer. */
export const OFAC_ARAMA = "https://sanctionssearch.ofac.treas.gov/";

/**
 * Sembol → EVM zinciri.
 *
 * Dikkat: sembol zinciri BELİRLEMEZ, yalnızca EVM ailesi içinde HANGİ zincir
 * olduğunu söyler. Ailenin kendisi ADRESİN BİÇİMİNDEN çıkar — OFAC "USDT"
 * diyip `T…` ile başlayan bir TRON adresi yazıyor (ölçüldü: 92 USDT kaydının
 * çoğu TRON). "Sembol kimlik değildir" kuralının bu dosyadaki karşılığı.
 */
const EVM_SEMBOLU: Record<string, ChainId> = {
  ETH: "ethereum",
  USDT: "ethereum",
  USDC: "ethereum",
  BSC: "bsc",
  BNB: "bsc",
  ARB: "arbitrum",
};

const FEATURE = /<feature\b[^>]*>([\s\S]*?)<\/feature>/g;
const TIP = /<type\b[^>]*>Digital Currency Address - ([A-Z0-9]+)<\/type>/;
const DEGER = /<value>([^<]*)<\/value>/;

/**
 * Bir varlığın adı: birincil isim bloğundaki Latin çevirisi.
 *
 * Kayıtta Kiril/Arap yazımlar da var; rapora giren ad okunabilir olmalı.
 */
function varlikAdi(blok: string): string | null {
  const isimler = blok.match(/<names>([\s\S]*?)<\/names>/);
  if (!isimler?.[1]) return null;
  const latin = isimler[1].match(
    /<isPrimary>true<\/isPrimary>\s*<script[^>]*>Latin<\/script>[\s\S]*?<formattedFullName>([^<]*)<\/formattedFullName>/,
  );
  if (latin?.[1]) return latin[1].trim();
  const ilk = isimler[1].match(/<formattedFullName>([^<]*)<\/formattedFullName>/);
  return ilk?.[1]?.trim() ?? null;
}

function programlar(blok: string): string[] {
  const kutu = blok.match(/<sanctionsPrograms>([\s\S]*?)<\/sanctionsPrograms>/);
  if (!kutu?.[1]) return [];
  return [...kutu[1].matchAll(/<sanctionsProgram\b[^>]*>([^<]*)<\/sanctionsProgram>/g)]
    .map((m) => m[1]?.trim() ?? "")
    .filter(Boolean);
}

/**
 * Adresin zincirini BİÇİMDEN çöz; sembol yalnızca EVM içinde ayırır.
 * Çözemezse sebebiyle birlikte null döner.
 */
function zinciriCoz(
  ham: string,
  sembol: string,
): { chain: ChainId; address: string } | { sebep: string } {
  const s = ham.trim();

  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(s)) {
    // Checksum'ı tesadüfen tutturma ihtimali 4 milyarda bir; geçmiyorsa
    // kaynakta bir yazım hatası vardır ve tahmin edilmez.
    if (!tronGecerliMi(s)) return { sebep: "TRON adresi checksum'dan geçmedi" };
    // Sembol TRON ailesinde bir şey AYIRMAZ (TRX de USDT de aynı zincirde);
    // biçim zaten cevabı vermiş durumda. Sembol yine de kanıta yazılır, ki
    // "kaynak buna USDT demişti" sorusu sonradan sorulabilsin.
    return { chain: "tron", address: tronNormalize(s) };
  }

  if (/^0x[0-9a-fA-F]{40}$/.test(s)) {
    const chain = EVM_SEMBOLU[sembol];
    if (!chain) return { sebep: `EVM adresi ama "${sembol}" hangi EVM zinciri bilinmiyor` };
    return { chain, address: s.toLowerCase() };
  }

  // Biçim tanınıyor ama adaptörü yok: "bakılamadı" ile "yok" ayrı cevaplar.
  // Kaynağın sembolü burada YANILTIYOR — Omni USDT bir BITCOIN adresidir
  // (ölçüldü: 7 kayıt "USDT" diyor ve hepsi 1…/3… ile başlıyor).
  if (/^(1|3)[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(s) || /^bc1[0-9a-z]{20,}$/.test(s)) {
    return { sebep: `bitcoin biçimi — adaptör yok (kaynak sembolü: ${sembol})` };
  }
  if (/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(s)) {
    return { sebep: `solana biçimi — adaptör yok (kaynak sembolü: ${sembol})` };
  }
  return { sebep: `tanınmayan adres biçimi (kaynak sembolü: ${sembol})` };
}

/**
 * SDN_ENHANCED.XML metnini bulgulara çevirir.
 *
 * Bir varlık birden çok adres taşıyabiliyor (aynı kişi TRX + ETH + XBT);
 * her adres AYRI bir etikettir, çünkü her biri ayrı bir düğümdür.
 */
export function ofacAyristir(xml: string): TohumSonucu {
  const etiketler: TohumEtiket[] = [];
  const atlananlar: Atlanan[] = [];

  const surum =
    xml.match(/<dataAsOf>([^<]*)<\/dataAsOf>/)?.[1]?.trim() ??
    xml.match(/<publishDate>([^<]*)<\/publishDate>/)?.[1]?.trim() ??
    null;

  // Varlık bloğu: <entity …> … </entity>. Bloğa bölmeden yalnızca feature
  // taransaydı adres bir varlığa BAĞLANAMAZDI — "kim yaptırımlı" cevapsız
  // kalırdı ve etiket bir başlık taşımazdı.
  for (const parca of xml.split(/<entity\b[^>]*>/).slice(1)) {
    const blok = parca.split("</entity>")[0] ?? "";
    if (!blok.includes("Digital Currency Address")) continue;

    const ad = varlikAdi(blok) ?? "(adsız SDN kaydı)";
    const prog = programlar(blok);

    for (const m of blok.matchAll(FEATURE)) {
      const govde = m[1] ?? "";
      const sembol = govde.match(TIP)?.[1];
      if (!sembol) continue;
      const ham = govde.match(DEGER)?.[1]?.trim();
      if (!ham) {
        atlananlar.push({ ham: `${ad} / ${sembol}`, sebep: "kayıtta adres değeri boş" });
        continue;
      }

      const cozum = zinciriCoz(ham, sembol);
      if ("sebep" in cozum) {
        atlananlar.push({ ham, sebep: cozum.sebep, ayrinti: ad });
        continue;
      }

      etiketler.push({
        chain: cozum.chain,
        address: cozum.address,
        title: `OFAC SDN: ${ad}`,
        description: prog.length ? `Yaptırım programı: ${prog.join(", ")}` : "OFAC SDN listesi",
        category: "sanction",
        exchange: null,
        source: "ofac",
        sourceUrl: OFAC_ARAMA,
        confidence: 1,
        dogrulanmisMi: true,
        dogrulayan: "ofac-sdn",
        evidence: {
          varlik: ad,
          programlar: prog,
          kaynakSembolu: sembol,
          hamAdres: ham,
          listeSurumu: surum,
          liste: OFAC_URL,
        },
      });
    }
  }

  return { etiketler, atlananlar, kaynakSurumu: surum };
}

/** Listeyi indirir. Ağ katmanı ayrı tutuldu ki ayrıştırıcı testlenebilsin. */
export async function ofacIndir(url: string = OFAC_URL): Promise<string> {
  const yanit = await fetch(url, {
    headers: { "user-agent": "cry-arastirma/0.1 (adli analiz aracı)" },
    redirect: "follow",
  });
  if (!yanit.ok) throw new Error(`OFAC listesi indirilemedi: HTTP ${yanit.status}`);
  const metin = await yanit.text();
  // Kaynağın HATASI veri gibi görünebilir: 200 dönen bir hata sayfası da
  // metindir. Yanıtın ŞEKLİ doğrulanır, varlığı değil.
  if (!metin.includes("<sanctionsData") && !metin.includes("Digital Currency Address")) {
    throw new Error("OFAC yanıtı SDN belgesine benzemiyor (şekil doğrulaması başarısız)");
  }
  return metin;
}
