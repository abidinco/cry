/**
 * Blok indeksinden HAREKET okuma — takip motorunun beslendiği yol.
 *
 * İki katman kuralı 2026-09-21'de pencere İÇİNDE kalktı (CLAUDE.md → M1). Ölçüldü: 13 adres,
 * 560 hareket, TronGrid'le eksik 0 / fazla 0. Pencere DIŞI değişmedi — orası TronGrid'in işi ve
 * indeks orada "yok" değil "bakılamadı" der.
 *
 * Sorgu yolu ÖLÇÜLEREK seçildi (M1-D); iki tuzak 300 kat fark ediyor:
 *   - `kime OR kimden` TEK sorguda yazılmaz: birincil anahtarı tamamen düşürüyor ve 596 Mn satır
 *     taranıyor (26–47 sn). Yönler AYRI sorgudur.
 *   - Giden yönün gerçek tx'ini JOIN ile çözme: `INNER JOIN ... FINAL` sağ tablonun TAMAMINI
 *     belleğe alıyor (26,4 sn). Aynanın verdiği (kime, zaman) çiftleriyle ön ek okuması 15–98 ms.
 * Üç sorgunun toplamı 326–871 ms; aynı adres TronGrid'de 8.764 ms.
 */
import { sorgu, type Ayar } from "./istemci.js";
import { TABLO, GIDEN_TABLO } from "./sema.js";
import type { Varlik } from "./ayristir.js";
import { hexDenetle, type Pencere } from "./sorgular.js";

/** Bir indeks satırı, gösterim sınırına çevrilmeden önce. Tutar HAM metin. */
export type IndeksHareketi = {
  /** 64 hane hex, küçük harf. */
  tx: string;
  /** Unix saniye. */
  zaman: number;
  blok: number;
  /** İşlem içindeki konum: TRX'te sözleşmenin, USDT'de OLAY dizisinin indeksi. */
  idx: number;
  varlik: Varlik;
  /** 40 hane hex, 41 öneki olmadan. */
  kimden: string;
  kime: string;
  tutar: string;
};

/** Yön başına nereye kadar okunduğu. `null` = hiç başlanmadı, `"bitti"` = tükendi. */
export type HareketImleci = { gelen: string | null | "bitti"; giden: string | null | "bitti" };

export type HareketSayfasi = { satirlar: IndeksHareketi[]; imlec: HareketImleci };

const tsv = async (a: Ayar, sql: string): Promise<string[][]> =>
  (await sorgu(a, `${sql} FORMAT TSV`)).trim().split("\n").filter(Boolean).map((l) => l.split("\t"));

/** İmleç metni `zaman|tx|idx`; sıralama bu üçlüye göre KARARLI (aynı sayfa aynı satırları verir). */
const imlecCoz = (m: string | null | "bitti"): { zaman: number; tx: string; idx: number } | null => {
  if (!m || m === "bitti") return null;
  const [z, tx, i] = m.split("|");
  return { zaman: Number(z), tx: String(tx), idx: Number(i) };
};

/** `(zaman, tx, idx) > (…)` — ClickHouse demet karşılaştırması sıralamayı kullanabiliyor. */
const sonraKosulu = (m: string | null | "bitti", txSutunu: string): string => {
  const k = imlecCoz(m);
  return k ? ` AND (zaman, ${txSutunu}, idx) > (${k.zaman}, unhex('${k.tx}'), ${k.idx})` : "";
};

const imlecKur = (satirlar: IndeksHareketi[], limit: number, txAlani: (s: IndeksHareketi) => string): string | "bitti" => {
  if (satirlar.length < limit) return "bitti";
  const son = satirlar[satirlar.length - 1]!;
  return `${son.zaman}|${txAlani(son)}|${son.idx}`;
};

/**
 * Adresin pencere içindeki hareketleri, ESKİDEN YENİYE, yön başına en çok `limit` satır.
 *
 * `bas`/`son` unix saniye ve ÇAĞIRAN pencerenin içinde olduklarını doğrulamış olmalıdır: bu işlev
 * pencereyi bilmez, yalnızca sorulan aralığı okur. Pencere dışını sormak sessizce eksik cevap verir.
 */
export async function adresHareketleri(
  a: Ayar,
  hex: string,
  bas: number,
  son: number,
  imlec: HareketImleci = { gelen: null, giden: null },
  limit = 2_000,
): Promise<HareketSayfasi> {
  const h = hexDenetle(hex);
  const aralik = `zaman BETWEEN ${Math.floor(bas)} AND ${Math.floor(son)}`;
  const alanlar = `lower(hex(tx)), toUnixTimestamp(zaman), blok, idx, toString(varlik), lower(hex(kimden)), lower(hex(kime)), toString(tutar)`;
  const satirYap = (r: string[]): IndeksHareketi => ({
    tx: r[0]!, zaman: Number(r[1]), blok: Number(r[2]), idx: Number(r[3]),
    varlik: r[4] as Varlik, kimden: r[5]!, kime: r[6]!, tutar: r[7]!,
  });

  // 1) GELEN — ana tablonun birincil anahtar ön eki (kime, zaman, tx, idx). Ölçüldü: 68–140 ms.
  const gelen =
    imlec.gelen === "bitti"
      ? []
      : (await tsv(a, `SELECT ${alanlar} FROM ${TABLO} FINAL
           WHERE kime = unhex('${h}') AND ${aralik}${sonraKosulu(imlec.gelen, "tx")}
           ORDER BY zaman, tx, idx LIMIT ${limit}`)).map(satirYap);

  // 2) GİDEN — ayna, `kimden` ön ekiyle. Ana tabloda aynı soru TAM TARAMA (29,5 sn).
  //    Aynada tx yerine cityHash64 var; bu adım yalnızca satırın YERİNİ bulur.
  const aynaSatirlari =
    imlec.giden === "bitti"
      ? []
      : await tsv(a, `SELECT toUnixTimestamp(zaman), lower(hex(txh)), idx, lower(hex(kime))
           FROM ${GIDEN_TABLO} FINAL
           WHERE kimden = unhex('${h}') AND ${aralik}${sonraKosulu(imlec.giden, "txh")}
           ORDER BY zaman, txh, idx LIMIT ${limit}`);

  // 3) Gerçek tx — aynanın verdiği (kime, zaman) çiftleriyle ana tabloda NOKTA okuma.
  //    Defterin blok gezgini bağlantısı gerçek hash'i istiyor; cityHash64 gösterilemez.
  let giden: IndeksHareketi[] = [];
  if (aynaSatirlari.length) {
    const ciftler = [...new Set(aynaSatirlari.map((r) => `(unhex('${hexDenetle(r[3]!)}'), ${Number(r[0])})`))].join(",");
    giden = (await tsv(a, `SELECT ${alanlar} FROM ${TABLO} FINAL
      WHERE (kime, toUnixTimestamp(zaman)) IN (${ciftler}) AND kimden = unhex('${h}') AND ${aralik}
      ORDER BY zaman, tx, idx`)).map(satirYap);
    // Nokta okuma aynanın sayfasından FAZLASINI getirebilir (aynı (kime, zaman) çiftinde birden çok
    // satır olabilir); aynanın son satırından sonrasını kesmek sayfalamayı tutarlı tutar.
    const sonAyna = aynaSatirlari[aynaSatirlari.length - 1]!;
    const sinir = [Number(sonAyna[0]), Number(sonAyna[2])] as const;
    giden = giden.filter((s) => s.zaman < sinir[0] || (s.zaman === sinir[0] && s.idx <= sinir[1]));
  }

  return {
    satirlar: [...gelen, ...giden.filter((s) => s.kime !== h)].sort(
      (x, y) => x.zaman - y.zaman || x.tx.localeCompare(y.tx) || x.idx - y.idx,
    ),
    imlec: {
      gelen: imlec.gelen === "bitti" ? "bitti" : imlecKur(gelen, limit, (s) => s.tx),
      giden: imlec.giden === "bitti" ? "bitti" : (aynaSatirlari.length < limit ? "bitti" : `${Number(aynaSatirlari[aynaSatirlari.length - 1]![0])}|${aynaSatirlari[aynaSatirlari.length - 1]![1]}|${Number(aynaSatirlari[aynaSatirlari.length - 1]![2])}`),
    },
  };
}

/** Sorulan aralık pencerenin TAMAMEN içinde mi — dışarıdaysa indeks cevap veremez. */
export function pencereKarsilarMi(p: Pencere | null, bas: number, son: number): boolean {
  return !!p && bas >= p.zamanBas && son <= p.zamanSon;
}
