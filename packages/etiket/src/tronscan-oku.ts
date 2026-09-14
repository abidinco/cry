/**
 * TronScan kaynağının ağ + veritabanı tarafı: hangi adreslere sorulacağını
 * seçer, yanıtı önbellekten ya da ağdan alır, saf katmana (`tronscan.ts`)
 * verir.
 *
 * Kapsam neden SEÇİLİR: arşivde 23 bin TRON adresi var ve ezici çoğunluğu
 * yalnızca bir karşı taraf olarak geçiyor. Hepsine sormak saatler sürer;
 * kimliği ASIL gereken adresler üç kümede duruyor ve varsayılan onlardır:
 *
 * - doğrulanmamış borsa etiketi taşıyanlar (keşif/kullanıcı adayları) —
 *   kimlik gelirse `terminal_aday` → `terminal` olur,
 * - bir takip koşusunun düğümleri — raporun gerçekten değdiği adresler,
 * - taranmış adresler (`index_state` ≠ bilinmiyor).
 *
 * Önbellek: yanıt adres başına dosyaya yazılır ve aynı adrese ikinci kez ağa
 * çıkılmaz. Etiketler zamanla değiştiği için `tazele` önbelleği yok sayar;
 * kanıttaki `olcumTarihi` yanıtın ALINDIĞI günü taşır, okunduğu günü değil.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@cry/db";
import type { Atlanan, TohumEtiket, TohumSonucu } from "./tipler";
import { TRONSCAN_API, tronscanCoz, type TronscanYaniti } from "./tronscan";

export type TronscanKapsami = "aday" | "hepsi";

export type TronscanSecenekleri = {
  kapsam: TronscanKapsami;
  /** En çok kaç adrese sorulsun (0 = sınırsız). */
  sinir: number;
  tazele: boolean;
  onbellekDizini: string;
  anahtar: string;
};

type Kayitli = { alindi: string; yanit: TronscanYaniti };

const BEKLEME_MS = 250;

async function adresleriSec(kapsam: TronscanKapsami): Promise<string[]> {
  if (kapsam === "hepsi") {
    const hepsi = await prisma.address.findMany({
      where: { chain: "tron" },
      select: { address: true },
      orderBy: { address: "asc" },
    });
    return hepsi.map((a) => a.address);
  }
  const satirlar = await prisma.$queryRaw<{ address: string }[]>`
    select a.address from addresses a
      join labels l on l.address_id = a.id
     where a.chain = 'tron' and l.category like 'exchange%' and l.verified_at is null
    union
    select n.address from trace_nodes n where n.chain = 'tron'
    union
    select a.address from addresses a where a.chain = 'tron' and a.index_state <> 'bilinmiyor'
    order by 1
  `;
  return satirlar.map((s) => s.address);
}

async function yanitAl(
  adres: string,
  s: TronscanSecenekleri,
): Promise<{ kayit: Kayitli; agdan: boolean } | { hata: string }> {
  const dosya = path.join(s.onbellekDizini, `${adres}.json`);
  if (!s.tazele) {
    try {
      return { kayit: JSON.parse(await readFile(dosya, "utf8")) as Kayitli, agdan: false };
    } catch {
      // önbellekte yok — ağa çık
    }
  }

  for (let deneme = 1; deneme <= 4; deneme++) {
    const yanit = await fetch(`${TRONSCAN_API}?address=${adres}`, {
      headers: { "TRON-PRO-API-KEY": s.anahtar },
    });
    // Hız sınırı beklenen bir durumdur, hata değil: atlanırsa adres sessizce
    // "etiketsiz" görünür.
    if (yanit.status === 429) {
      await new Promise((r) => setTimeout(r, 2000 * deneme));
      continue;
    }
    if (!yanit.ok) return { hata: `HTTP ${yanit.status}` };
    const govde = (await yanit.json()) as TronscanYaniti;
    const kayit: Kayitli = { alindi: new Date().toISOString().slice(0, 10), yanit: govde };
    await writeFile(dosya, JSON.stringify(kayit));
    return { kayit, agdan: true };
  }
  return { hata: "hız sınırı — 4 denemede geçmedi" };
}

export async function tronscanEtiketleri(s: TronscanSecenekleri): Promise<TohumSonucu> {
  if (!s.anahtar) {
    // Anahtarsız API 401 veriyor (ölçüldü 2026-09-09); sessiz bir "0 etiket"
    // kaynağın boş olduğu sanılır.
    throw new Error("TRONSCAN_API_KEY tanımlı değil — .env'e ekle");
  }
  await mkdir(s.onbellekDizini, { recursive: true });

  const tumu = await adresleriSec(s.kapsam);
  const adresler = s.sinir > 0 ? tumu.slice(0, s.sinir) : tumu;
  console.log(
    `kapsam: ${s.kapsam} — ${tumu.length} adres` +
      (adresler.length < tumu.length ? `, sınır ${adresler.length}` : ""),
  );

  const etiketler: TohumEtiket[] = [];
  const atlananlar: Atlanan[] = [];
  let agdan = 0;

  for (const [i, adres] of adresler.entries()) {
    const sonuc = await yanitAl(adres, s);
    if ("hata" in sonuc) {
      atlananlar.push({ ham: adres, sebep: "TronScan yanıt vermedi", ayrinti: sonuc.hata });
    } else {
      if (sonuc.agdan) {
        agdan++;
        await new Promise((r) => setTimeout(r, BEKLEME_MS));
      }
      const coz = tronscanCoz(adres, sonuc.kayit.yanit, sonuc.kayit.alindi);
      if (coz.tur === "etiket") etiketler.push(...coz.etiketler);
      else atlananlar.push(coz.atlanan);
    }
    if ((i + 1) % 100 === 0) console.log(`  … ${i + 1}/${adresler.length} (ağdan ${agdan})`);
  }

  console.log(`ağdan alınan: ${agdan}, önbellekten: ${adresler.length - agdan}`);
  return { etiketler, atlananlar, kaynakSurumu: `TronScan accountv2, kapsam ${s.kapsam}` };
}
