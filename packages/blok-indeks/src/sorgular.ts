/**
 * Blok indeksinin OKUMA sorguları — keşif (etiket CLI'si) ve adres sayfası (web) aynı yerden sorar.
 *
 * İki katman kuralı (CLAUDE.md): buradan çıkan her sayı bir ADAYDIR. İz, takip ve rapor yalnızca adres
 * taramasından beslenir; bu sorgular onlara girmez.
 *
 * Her cevap bir PENCEREYE bağlıdır: kapsam tablosunun boşluksuz kapsadığı son aralık. Pencere dışında
 * blok indeksi "yok" diyemez, "bakılmadı" der.
 */
import { sorgu, ekle, type Ayar } from "./istemci.js";
import { TABLO, KAPSAM_TABLO, GIDEN_TABLO } from "./sema.js";
import type { Varlik } from "./ayristir.js";

/**
 * Toz sınırı: 1 TRX / 1 USDT (ikisi de 6 ondalık, ham 1.000.000). Sayımdan ELENMEZ (kullanıcı kararı
 * 2026-09-17: eşiksiz); ayrı sayılır ve ayrı gösterilir. B5 kapısında arşiv adreslerinin 1.221'i pencerede
 * görünüyordu, tozu saymayınca 237'si kalıyordu.
 */
export const TOZ_SINIRI = 1_000_000n;

export type Pencere = {
  bas: number;
  son: number;
  /** Unix saniye — pencerenin ilk ve son bloğunun zamanı. */
  zamanBas: number;
  zamanSon: number;
};

const tsv = async (a: Ayar, sql: string) =>
  (await sorgu(a, `${sql} FORMAT TSV`)).trim().split("\n").filter(Boolean).map((l) => l.split("\t"));

/** Hex (40 hane, 41 öneksiz) doğrulaması — SQL'e giden tek kullanıcı girdisi bu. */
export function hexDenetle(hex: string): string {
  if (!/^[0-9a-f]{40}$/.test(hex)) throw new Error(`adres gövdesi 40 hane küçük hex olmalı: "${hex}"`);
  return hex;
}

/**
 * Boşluksuz son pencere: en yüksek okunmuş bloktan geriye, ilk boşluğa kadar.
 * `lagInFrame` sıralı okur; kapsamdaki mükerrer satır (aynı blok iki kez) boşluk sayılmaz.
 * Kapsam boşsa null.
 */
export async function pencereOku(a: Ayar): Promise<Pencere | null> {
  const [[son]] = (await tsv(a, `SELECT max(blok) FROM ${KAPSAM_TABLO}`)) as [[string]];
  if (!son || son === "0") return null;
  const [[bas]] = (await tsv(a, `
    SELECT max(blok) FROM (
      SELECT blok, lagInFrame(blok) OVER (ORDER BY blok ROWS BETWEEN 1 PRECEDING AND CURRENT ROW) AS onceki
      FROM ${KAPSAM_TABLO})
    WHERE blok > onceki + 1`)) as [[string]];
  const [[zb, zs]] = (await tsv(a, `SELECT toUnixTimestamp(min(zaman)), toUnixTimestamp(max(zaman)) FROM ${KAPSAM_TABLO} WHERE blok IN (${Number(bas)}, ${Number(son)})`)) as [[string, string]];
  return { bas: Number(bas), son: Number(son), zamanBas: Number(zb), zamanSon: Number(zs) };
}

export type KarsiTaraf = { adres: string; hareket: number; toplam: string };

export type YonOzeti = {
  varlik: Varlik;
  /** Farklı karşı taraf — toz DAHİL. */
  karsiTaraf: number;
  /** Bunlardan YALNIZCA toz tutarla görünenler. */
  tozKarsiTaraf: number;
  hareket: number;
  tozHareket: number;
  /** Ham tam sayı, metin (CLAUDE.md: tutar Number'a uğramaz). */
  toplam: string;
  ilk: number;
  son: number;
  /** Toplam tutara göre en büyük karşı taraflar (hex gövde). */
  enBuyukler: KarsiTaraf[];
};

export type AdresOzeti = { pencere: Pencere; gelen: YonOzeti[]; giden: YonOzeti[] };

/**
 * Tek adresin blok indeksi özeti. Gelen yön ana tablodan (`kime` sıralı), giden yön aynadan (`kimden`
 * sıralı) okunur — ikisi de sıralı anahtarla, tablo büyüdükçe yavaşlamaz. Sayımlar `FINAL`.
 */
export async function adresOzeti(a: Ayar, hex: string, p: Pencere, enBuyukSayisi = 10): Promise<AdresOzeti> {
  const h = hexDenetle(hex);
  const yon = async (tablo: string, biz: string, karsi: string, pencereKosulu: string): Promise<YonOzeti[]> => {
    const W = `${biz} = unhex('${h}') AND ${pencereKosulu}`;
    const ozet = await tsv(a, `
      SELECT varlik, uniqExact(${karsi}), uniqExact(${karsi}) - uniqExactIf(${karsi}, tutar >= ${TOZ_SINIRI}),
             count(), countIf(tutar < ${TOZ_SINIRI}), toString(sum(tutar)), toUnixTimestamp(min(zaman)), toUnixTimestamp(max(zaman))
      FROM ${tablo} FINAL WHERE ${W} GROUP BY varlik ORDER BY varlik`);
    const buyukler = await tsv(a, `
      SELECT varlik, lower(hex(${karsi})), count(), toString(sum(tutar)) AS s FROM ${tablo} FINAL WHERE ${W}
      GROUP BY varlik, ${karsi} ORDER BY varlik, sum(tutar) DESC LIMIT ${enBuyukSayisi} BY varlik`);
    return ozet.map(([v, kt, tkt, n, tn, t, ilk, son]) => ({
      varlik: v as Varlik,
      karsiTaraf: Number(kt), tozKarsiTaraf: Number(tkt), hareket: Number(n), tozHareket: Number(tn),
      toplam: t!, ilk: Number(ilk), son: Number(son),
      enBuyukler: buyukler.filter((r) => r[0] === v).map(([, ad, bn, bt]) => ({ adres: ad!, hareket: Number(bn), toplam: bt! })),
    }));
  };
  const [gelen, giden] = await Promise.all([
    yon(TABLO, "kime", "kimden", `blok BETWEEN ${p.bas} AND ${p.son}`),
    // Aynada blok sütunu yok; pencere zamanla daraltılır (bloklar 3 sn arayla, zaman bloğu belirler).
    yon(GIDEN_TABLO, "kimden", "kime", `zaman BETWEEN toDateTime(${p.zamanBas}) AND toDateTime(${p.zamanSon})`),
  ]);
  return { pencere: p, gelen, giden };
}

export type KesifSayilari = {
  gonderen: number; tozGonderen: number; alici: number; tozAlici: number; hareket: number;
};

/**
 * Keşfin toplu sorgusu: verilen adreslerin pencerede kaç farklı karşı tarafı var (varlık ayrımı yok —
 * arşiv keşfiyle aynı ölçü), bunların kaçı yalnızca toz. Adresler geçici bir Memory tablosuna yüklenir
 * (31.896 adres tek sorguda: gelen ~650 ms, B5 kapısı). Pencerede hiç görünmeyen adres sonuçta YOKTUR.
 */
export async function kesifSayilari(a: Ayar, hexler: readonly string[], p: Pencere): Promise<Map<string, KesifSayilari>> {
  const gecici = `kesif_gecici_${Date.now()}`;
  await sorgu(a, `CREATE TABLE ${gecici} (a FixedString(20)) ENGINE = Memory`);
  try {
    await ekle(a, `INSERT INTO ${gecici} SELECT unhex(a) FROM input('a String') FORMAT JSONCompactEachRow`, hexler.map((h) => [hexDenetle(h)]));
    const sayim = (tablo: string, biz: string, karsi: string, kosul: string) => tsv(a, `
      SELECT lower(hex(${biz})), uniqExact(${karsi}), uniqExact(${karsi}) - uniqExactIf(${karsi}, tutar >= ${TOZ_SINIRI}), count()
      FROM ${tablo} FINAL WHERE ${kosul} AND ${biz} IN (SELECT a FROM ${gecici}) GROUP BY ${biz}`);
    const [gelen, giden] = await Promise.all([
      sayim(TABLO, "kime", "kimden", `blok BETWEEN ${p.bas} AND ${p.son}`),
      sayim(GIDEN_TABLO, "kimden", "kime", `zaman BETWEEN toDateTime(${p.zamanBas}) AND toDateTime(${p.zamanSon})`),
    ]);
    const m = new Map<string, KesifSayilari>();
    const al = (h: string) => { let s = m.get(h); if (!s) m.set(h, (s = { gonderen: 0, tozGonderen: 0, alici: 0, tozAlici: 0, hareket: 0 })); return s; };
    for (const [h, u, t, n] of gelen) Object.assign(al(h!), { gonderen: Number(u), tozGonderen: Number(t) }).hareket += Number(n);
    for (const [h, u, t, n] of giden) Object.assign(al(h!), { alici: Number(u), tozAlici: Number(t) }).hareket += Number(n);
    return m;
  } finally {
    await sorgu(a, `DROP TABLE IF EXISTS ${gecici}`);
  }
}
