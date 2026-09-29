/**
 * Fiyat ve kur doldurucu.
 *
 *   node --env-file=... --import tsx packages/fiyat/src/cli.ts --kaynak=tcmb
 *   node --env-file=... --import tsx packages/fiyat/src/cli.ts --kaynak=tcmb --uygula
 *   node --env-file=... --import tsx packages/fiyat/src/cli.ts --kaynak=coingecko --uygula
 *
 * Varsayılan KURU koşu: ne yapılacağını yazar, yazmaz.
 */

import { prisma } from "@cry/db";
import { CG_YERLI, cgSozlesmeUrl, pencereIcinde } from "./coingecko";
import { cgCek, Kapi, tcmbCek } from "./cek";
import { TCMB_KAYNAK, yazilacakKur } from "./tcmb";
import type { YoklamaSonucu } from "./tipler";
import {
  bosRapor,
  fiyatYaz,
  fiyatYoklamasiYaz,
  kurYoklamasiYaz,
  kuruYaz,
  topluFiyatYoklamasi,
  type YazmaRaporu,
} from "./yaz";

const CG_KAYNAK = "coingecko";

/** Ölçülmüş kimlikler — bu ikisi için sözleşme çözümüne çağrı harcanmaz. */
const BILINEN_COIN: Record<string, string> = {
  "tron|TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t": "tether",
  "ethereum|0xdac17f958d2ee523a2206206994597c13d831ec7": "tether",
};

const argv = process.argv.slice(2);
const bayrak = (ad: string): string | undefined =>
  argv
    .find((a) => a.startsWith(`--${ad}=`))
    ?.split("=")
    .slice(1)
    .join("=");
const acik = (ad: string) => argv.includes(`--${ad}`);

const iso = (d: Date) => d.toISOString().slice(0, 10);
const sayi = (n: number) => n.toLocaleString("tr-TR");

/** Arşivdeki hareketlerin düştüğü farklı günler (+ bugün: "rapor günü" kuru). */
async function gerekenGunler(): Promise<string[]> {
  const satir = await prisma.$queryRaw<{ gun: Date }[]>`
    select distinct ts::date as gun from transfers order by 1`;
  const kume = new Set(satir.map((s) => iso(s.gun)));
  kume.add(iso(new Date()));
  return [...kume].sort();
}

async function tcmbTuru(rapor: YazmaRaporu, limit: number): Promise<void> {
  const gunler = await gerekenGunler();
  const varKur = new Set(
    (await prisma.fxRateDaily.findMany({ select: { date: true } })).map((r) => iso(r.date)),
  );
  const varYoklama = new Set(
    (
      await prisma.fxLookup.findMany({
        where: { outcome: { in: ["yayinlanmadi"] } },
        select: { date: true },
      })
    ).map((r) => iso(r.date)),
  );
  // Kalıcı cevabı olan gün yeniden SORULMAZ: kur da "yayınlanmadı" da kalıcı.
  const kalan = gunler.filter((g) => !varKur.has(g) && !varYoklama.has(g)).slice(0, limit);

  console.log(
    `TCMB · arşiv ${sayi(gunler.length)} farklı gün · kurlu ${sayi(varKur.size)} · ` +
      `yayınlanmadığı bilinen ${sayi(varYoklama.size)} · bu turda ${sayi(kalan.length)}`,
  );
  if (!rapor.uygulandi) {
    console.log("KURU koşu — yazmak için --uygula");
    console.log("ilk 5:", kalan.slice(0, 5).join(", ") || "(yok)");
    return;
  }

  const kapi = new Kapi(320); // ~3/sn: kaynak 25-170 ms'de cevap veriyor, yüklemeyelim
  const sayac: Record<string, number> = {};
  let i = 0;
  for (const g of kalan) {
    const y = await tcmbCek(g, kapi);
    sayac[y.sonuc] = (sayac[y.sonuc] ?? 0) + 1;
    if (y.sonuc === "bulundu") {
      // Bültenin KENDİ tarihine yazılır; istenen güne değil.
      await kuruYaz(y.kur.tarih, yazilacakKur(y.kur), TCMB_KAYNAK, rapor);
      await kurYoklamasiYaz(g, "bulundu", TCMB_KAYNAK, `bülten ${y.kur.tarih}`, rapor);
      if (y.kur.tarih !== g) {
        console.log(`  DİKKAT ${g} istendi, bülten ${y.kur.tarih} döndü`);
      }
    } else {
      await kurYoklamasiYaz(g, y.sonuc, TCMB_KAYNAK, y.detay, rapor);
    }
    if (++i % 200 === 0) {
      console.log(`  ${sayi(i)}/${sayi(kalan.length)} · ${JSON.stringify(sayac)}`);
    }
  }
  console.log("TCMB turu bitti:", JSON.stringify(sayac));
}

type Cift = {
  assetId: number;
  chain: string;
  contract: string;
  symbol: string;
  gun: string;
  hareket: number;
};

async function cgCiftleri(): Promise<Cift[]> {
  const satir = await prisma.$queryRaw<
    {
      asset_id: number;
      chain: string;
      contract: string;
      symbol: string;
      gun: Date;
      hareket: bigint;
    }[]
  >`
    select t.asset_id, a.chain, a.contract, a.symbol, t.ts::date as gun, count(*) as hareket
    from transfers t join assets a on a.id = t.asset_id
    group by 1,2,3,4,5
    order by count(*) desc`;
  const ciftler = satir.map((s) => ({
    assetId: s.asset_id,
    chain: s.chain,
    contract: s.contract,
    symbol: s.symbol,
    gun: iso(s.gun),
    hareket: Number(s.hareket),
  }));

  /**
   * BUGÜN her varlık için ayrıca istenir.
   *
   * Rapor "işlem günü X ₺ (rapor günü Y ₺)" diyor; ikinci kur bugünün
   * FİYATINI da gerektiriyor. Bugün hareket olmadığı için bu çift yukarıdaki
   * sorgudan ÇIKMIYOR ve eklenmezse `raporGunu` her satırda boş kalırdı —
   * kararın yarısı sessizce uygulanmamış olurdu.
   */
  const bugun = iso(new Date());
  const gorulen = new Set<number>();
  const bugunkuler: Cift[] = [];
  for (const c of ciftler) {
    if (gorulen.has(c.assetId) || !pencereIcinde(c.gun)) continue;
    gorulen.add(c.assetId);
    if (c.gun !== bugun) bugunkuler.push({ ...c, gun: bugun });
  }
  // Bugünküler ÖNE alınır: tur yarıda kesilse bile rapor günü kuru elde olsun.
  return [...bugunkuler, ...ciftler];
}

/** Sözleşme → CoinGecko coin kimliği. Bir çağrı harcar; sonuç tur boyunca saklanır. */
async function coinKimligi(
  c: Cift,
  kapi: Kapi,
  bellek: Map<string, string | null>,
): Promise<string | null> {
  const anahtar = `${c.chain}|${c.contract}`;
  const bilinen = BILINEN_COIN[anahtar];
  if (bellek.has(anahtar)) return bellek.get(anahtar) ?? null;
  if (bilinen) {
    bellek.set(anahtar, bilinen);
    return bilinen;
  }
  if (c.contract === "") {
    const yerli = CG_YERLI[c.chain] ?? null;
    bellek.set(anahtar, yerli);
    return yerli;
  }
  // TRC10 gibi sözleşmesiz sanal kimlikler CoinGecko'da aranmaz.
  if (c.contract.startsWith("trc10:")) {
    bellek.set(anahtar, null);
    return null;
  }
  const url = cgSozlesmeUrl(c.chain, c.contract);
  if (!url) {
    bellek.set(anahtar, null);
    return null;
  }
  await kapi.gec();
  try {
    const y = await fetch(url, { headers: { accept: "application/json" } });
    if (y.status !== 200) {
      bellek.set(anahtar, null);
      return null;
    }
    const j = (await y.json()) as { id?: string };
    const id = j.id ?? null;
    bellek.set(anahtar, id);
    return id;
  } catch {
    bellek.set(anahtar, null);
    return null;
  }
}

async function coingeckoTuru(
  rapor: YazmaRaporu,
  limit: number,
  sadece: string[] | null,
): Promise<void> {
  const hepsi = await cgCiftleri();
  const icinde = hepsi.filter((c) => pencereIcinde(c.gun));
  const disinda = hepsi.filter((c) => !pencereIcinde(c.gun));

  console.log(
    `CoinGecko · toplam ${sayi(hepsi.length)} (varlık,gün) çifti · ` +
      `ücretsiz pencerede ${sayi(icinde.length)} · dışında ${sayi(disinda.length)}`,
  );

  const varFiyat = new Set(
    (await prisma.priceDaily.findMany({ select: { assetId: true, date: true } })).map(
      (r) => `${r.assetId}|${iso(r.date)}`,
    ),
  );
  const kalici = new Set(
    (
      await prisma.priceLookup.findMany({
        where: { outcome: { in: ["aralik_disi", "kaynakta_yok"] } },
        select: { assetId: true, date: true },
      })
    ).map((r) => `${r.assetId}|${iso(r.date)}`),
  );

  const kalan = icinde
    .filter((c) => !varFiyat.has(`${c.assetId}|${c.gun}`) && !kalici.has(`${c.assetId}|${c.gun}`))
    .filter((c) => !sadece || sadece.includes(c.symbol.toUpperCase()))
    .slice(0, limit);

  console.log(
    `  zaten fiyatlı ${sayi(varFiyat.size)} · kalıcı olumsuz ${sayi(kalici.size)} · ` +
      `bu turda ${sayi(kalan.length)}`,
  );
  if (!rapor.uygulandi) {
    console.log("KURU koşu — yazmak için --uygula");
    for (const c of kalan.slice(0, 5)) {
      console.log(`  ${c.symbol} ${c.gun} (${sayi(c.hareket)} hareket)`);
    }
    console.log(`  pencere DIŞI ${sayi(disinda.length)} çifte 'aralik_disi' yazılacak`);
    return;
  }

  // Pencere dışı: ağa HİÇ gitmeden, sebebiyle kapatılır.
  const yeniDisinda = disinda.filter((c) => !kalici.has(`${c.assetId}|${c.gun}`));
  await topluFiyatYoklamasi(
    yeniDisinda.map((c) => ({
      assetId: c.assetId,
      tarih: c.gun,
      outcome: "aralik_disi" as YoklamaSonucu,
      detay: "CoinGecko ücretsiz katmanı 365 günden eskisini vermiyor (HTTP 401 / 10012)",
    })),
    CG_KAYNAK,
    rapor,
  );
  console.log(`  pencere dışı ${sayi(yeniDisinda.length)} çift 'aralik_disi' olarak kapatıldı`);

  const kapi = new Kapi(13_000); // ~4,6/dk - 6 ardışık çağrının 6'sı 429 yemişti
  const bellek = new Map<string, string | null>();
  const sayac: Record<string, number> = {};
  let i = 0;
  for (const c of kalan) {
    const coinId = await coinKimligi(c, kapi, bellek);
    if (!coinId) {
      await fiyatYoklamasiYaz(
        c.assetId,
        c.gun,
        "kaynakta_yok",
        CG_KAYNAK,
        "coin kimliği çözülemedi",
        rapor,
      );
      sayac["kaynakta_yok"] = (sayac["kaynakta_yok"] ?? 0) + 1;
      continue;
    }
    const y = await cgCek(coinId, c.gun, kapi);
    sayac[y.sonuc] = (sayac[y.sonuc] ?? 0) + 1;
    if (y.sonuc === "bulundu") {
      await fiyatYaz(c.assetId, c.gun, y.fiyat.usd, CG_KAYNAK, rapor);
      await fiyatYoklamasiYaz(c.assetId, c.gun, "bulundu", CG_KAYNAK, `coin ${coinId}`, rapor);
    } else {
      await fiyatYoklamasiYaz(c.assetId, c.gun, y.sonuc, CG_KAYNAK, y.detay, rapor);
    }
    if (++i % 25 === 0) {
      console.log(
        `  ${sayi(i)}/${sayi(kalan.length)} · ${JSON.stringify(sayac)} · son ${c.symbol} ${c.gun}`,
      );
    }
  }
  console.log("CoinGecko turu bitti:", JSON.stringify(sayac));
}

async function main() {
  const kaynak = bayrak("kaynak") ?? "tcmb";
  const limit = Number(bayrak("limit") ?? Number.MAX_SAFE_INTEGER);
  const sadece =
    bayrak("varlik")
      ?.split(",")
      .map((s) => s.trim().toUpperCase()) ?? null;
  const rapor = bosRapor(acik("uygula"));

  if (kaynak === "tcmb") await tcmbTuru(rapor, limit);
  else if (kaynak === "coingecko") await coingeckoTuru(rapor, limit, sadece);
  else throw new Error(`bilinmeyen kaynak: ${kaynak} (tcmb | coingecko)`);

  console.log(
    `\nözet: yeni ${sayi(rapor.yeniDeger)} · güncellenen ${sayi(rapor.guncellenenDeger)} · ` +
      `yoklama kaydı ${sayi(rapor.yoklamaKaydi)} · ${rapor.uygulandi ? "YAZILDI" : "kuru koşu"}`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
