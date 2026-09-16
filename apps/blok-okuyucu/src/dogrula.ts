/**
 * B2 doğrulama kapısı — blok indeksini ADRES TARAMASIYLA (Katman 2) karşılaştırır.
 *
 *   node --env-file=.env --env-file=apps/web/.env.local --import tsx apps/blok-okuyucu/src/dogrula.ts \
 *     --aralik=86000000-86000999 [--adres=20] [--yogun=5] [--tohum=1] [--sayfaSiniri=50]
 *
 * Seçilen her adres için aynı zaman penceresinde iki cevap alınır:
 *   indeks  — ClickHouse, `blok_indeks FINAL`, adres kimden YA DA kime;
 *   tarama  — TronAdapter.listTransfers (motorun kullandığı yol), USDT sözleşmesi + başarılı TRX.
 * Karar eşiksiz verildiği için beklenen fark SIFIRDIR: sayı da tutar toplamı da birebir.
 *
 * "Yok" ile "bakılamadı" ayrı: aralıkta kapsam kaydı eksikse komut karşılaştırma YAPMAZ; sayfa
 * sınırına takılan adres "uyuşmuyor" değil "bakılamadı" diye raporlanır.
 *
 * Ayrıca B1'in açık bıraktığı uç ölçülür: aynı (tx, idx, varlık) iki farklı zamanla yazılmış mı
 * (tekillik sıralamadan geçtiği için öyle bir satır ReplacingMergeTree'de İKİ kez kalırdı).
 */
import {
  ayarOku, sorgu, araligiCoz, aralikBoyu, eksikAraliklar, TABLO, KAPSAM_TABLO, USDT_TRC20_HEX, type Ayar,
} from "@cry/blok-indeks";
import { TronAdapter, hexToBase58 } from "@cry/chain";

const deger = (ad: string) => process.argv.find((x) => x.startsWith(`--${ad}=`))?.split("=")[1];
const aralikMetni = deger("aralik");
if (!aralikMetni) { console.error("kullanım: dogrula.ts --aralik=BAS-SON [--adres=20] [--tohum=1] [--sayfaSiniri=50]"); process.exit(2); }
const ARALIK = araligiCoz(aralikMetni);
const ADRES = Number(deger("adres") ?? 20);
/**
 * Yoğun adres: aralıkta 20–2.000 hareketi olan. Düz rastgele seçim neredeyse hep 1–3 hareketli
 * adres getiriyor (ölçüldü: iki tohumda 40/40) ve sayfalamayı hiç sınamıyor.
 */
const YOGUN = Number(deger("yogun") ?? 5);
const TOHUM = Number(deger("tohum") ?? 1);
const SAYFA_SINIRI = Number(deger("sayfaSiniri") ?? 50);
const USDT_B58 = hexToBase58("41" + USDT_TRC20_HEX);

const a: Ayar = ayarOku();
const tsv = async (sql: string) => (await sorgu(a, `${sql} FORMAT TSV`)).trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
const W = `blok BETWEEN ${ARALIK.bas} AND ${ARALIK.son}`;

// 1) Kapsam tam mı? Değilse karşılaştırma anlamsız: eksik blok "transfer yok" gibi görünürdü.
const okunan = new Set((await tsv(`SELECT blok FROM ${KAPSAM_TABLO} WHERE ${W}`)).map((r) => Number(r[0])));
const eksik = eksikAraliklar(ARALIK, okunan);
if (eksik.length) {
  console.error(`aralık TAM okunmamış (${eksik.length} öbek, ilk: ${JSON.stringify(eksik[0])}); önce oku.ts --uygula. Karşılaştırma yapılmadı.`);
  process.exit(1);
}
const [zmin, zmax] = (await tsv(`SELECT toUnixTimestamp(min(zaman)), toUnixTimestamp(max(zaman)) FROM ${KAPSAM_TABLO} FINAL WHERE ${W}`))[0]!.map(Number) as [number, number];

// 2) Toplam ve tekillik ölçümleri.
const [ham] = (await tsv(`SELECT count() FROM ${TABLO} WHERE ${W}`))[0]!;
const [final] = (await tsv(`SELECT count() FROM ${TABLO} FINAL WHERE ${W}`))[0]!;
const [kapsamSatir] = (await tsv(`SELECT sum(satir) FROM ${KAPSAM_TABLO} FINAL WHERE ${W}`))[0]!;
const [cokZaman] = (await tsv(`SELECT count() FROM (SELECT tx, idx, varlik FROM ${TABLO} WHERE ${W} GROUP BY tx, idx, varlik HAVING uniqExact(zaman) > 1)`))[0]!;
const [ayniAnahtar] = (await tsv(`SELECT count() FROM (SELECT tx, idx, varlik FROM ${TABLO} FINAL WHERE ${W} GROUP BY tx, idx, varlik HAVING count() > 1)`))[0]!;
console.log(`aralık ${ARALIK.bas}–${ARALIK.son} (${aralikBoyu(ARALIK)} blok, kapsam TAM) · ${new Date(zmin * 1000).toISOString()} → ${new Date(zmax * 1000).toISOString()}`);
console.log(`satır: ham ${ham} · FINAL ${final} · kapsamın saydığı ${kapsamSatir} · ${final === kapsamSatir ? "TUTARLI" : "UYUŞMUYOR"}`);
console.log(`tekillik: iki farklı zamanla yazılmış anahtar ${cokZaman} · FINAL sonrası aynı (tx, idx, varlık) ${ayniAnahtar}`);
let hata = final !== kapsamSatir || cokZaman !== "0" || ayniAnahtar !== "0";

// 3) Adres seçimi, tohumlu karma sırasıyla (tekrarlanabilir rastgele). İki küme: aralıkta geçen
// herhangi bir adres, ve sayfalamayı sınamak için yoğun adresler.
const HEPSI = `SELECT kime AS x FROM ${TABLO} FINAL WHERE ${W} UNION ALL SELECT kimden AS x FROM ${TABLO} FINAL WHERE ${W}`;
const rastgele = (await tsv(`SELECT lower(hex(x)) FROM (SELECT DISTINCT x FROM (${HEPSI})) ORDER BY cityHash64(x, ${TOHUM}) LIMIT ${ADRES}`)).map((r) => r[0]!);
const yogun = (await tsv(`
  SELECT lower(hex(x)) FROM (SELECT x, count() AS n FROM (${HEPSI}) GROUP BY x HAVING n BETWEEN 20 AND 2000)
  ORDER BY cityHash64(x, ${TOHUM}) LIMIT ${YOGUN}`)).map((r) => r[0]!);
const adresler = [...new Set([...rastgele, ...yogun])];

const tron = new TronAdapter({ apiKey: process.env.TRONGRID_API_KEY });
const fromTs = new Date(zmin * 1000).toISOString();
const toTs = new Date(zmax * 1000 + 999).toISOString();

type Olcu = { TRX: [number, bigint]; USDT: [number, bigint] };
const bos = (): Olcu => ({ TRX: [0, 0n], USDT: [0, 0n] });
let uyusan = 0, uyusmayan = 0, bakilamadi = 0;

console.log(`\n${adresler.length} adres (${rastgele.length} rastgele + ${yogun.length} yoğun, tohum ${TOHUM}) · tarama penceresi ${fromTs} → ${toTs}`);
console.log("adres                               | TRX indeks/tarama | USDT indeks/tarama | sonuç");
for (const hex of adresler) {
  const b58 = hexToBase58("41" + hex);

  const indeks = bos();
  for (const [v, n, t] of await tsv(`SELECT toString(varlik), count(), toString(sum(tutar)) FROM ${TABLO} FINAL WHERE ${W} AND (kime = unhex('${hex}') OR kimden = unhex('${hex}')) GROUP BY varlik`)) {
    indeks[v as keyof Olcu] = [Number(n), BigInt(t!)];
  }

  const tarama = bos();
  let imlec: string | null = null, sayfa = 0, tamam = true;
  do {
    if (++sayfa > SAYFA_SINIRI) { tamam = false; break; }
    const p = await tron.listTransfers(b58, { fromTs, toTs, cursor: imlec });
    for (const t of p.items) {
      if (t.kind === "token" && t.asset.contract === USDT_B58) { tarama.USDT[0]++; tarama.USDT[1] += BigInt(t.amountRaw); }
      else if (t.kind === "native" && t.asset.contract === null && t.success) { tarama.TRX[0]++; tarama.TRX[1] += BigInt(t.amountRaw); }
    }
    imlec = p.nextCursor;
  } while (imlec);

  const esit = (k: keyof Olcu) => indeks[k][0] === tarama[k][0] && indeks[k][1] === tarama[k][1];
  const sonuc = !tamam ? "BAKILAMADI (sayfa sınırı)" : esit("TRX") && esit("USDT") ? "uyuşuyor" : "UYUŞMUYOR";
  if (!tamam) bakilamadi++; else if (sonuc === "uyuşuyor") uyusan++; else uyusmayan++;
  const hucre = (k: keyof Olcu) => `${indeks[k][0]}/${tarama[k][0]}${indeks[k][0] === tarama[k][0] && indeks[k][1] !== tarama[k][1] ? " (tutar farklı)" : ""}`;
  console.log(`${b58.padEnd(35)} | ${hucre("TRX").padEnd(17)} | ${hucre("USDT").padEnd(18)} | ${sonuc}`);
}

console.log(`\nsonuç: ${uyusan} uyuşuyor · ${uyusmayan} UYUŞMUYOR · ${bakilamadi} bakılamadı`);
if (uyusmayan || bakilamadi) hata = true;
process.exit(hata ? 1 : 0);
