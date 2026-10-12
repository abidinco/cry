/**
 * B3 geçmiş-doldurma durumu — saf katman (`tests/b3-durum.test.ts`).
 *
 * Aynı ölçüm iki yere yazılır: karar masası (artifact) ve ana sayfa. Rutin
 * ölçer ve ikisine de aynı alanları yollar; burası kapıdaki doğrulama ve
 * ekran için türetilen değerlerdir.
 *
 * Doğrulama sessizce düzeltmez, REDDEDER: bozuk bir sayıyı 0'a çekip yazmak
 * bakılmamış bir yeri "bitti" gösterirdi.
 */

export type Surec = "calisiyor" | "durdu" | "bilinmiyor";

export type B3Olcumu = {
  surec: Surec;
  yazilan: number | null;
  cephe: number | null;
  uc: number | null;
  kalan: number | null;
  bosluk: number | null;
  hiz: number | null;
  kalanSure: string | null;
  satir: number | null;
  satirMetni: string | null;
  indeksDiski: string | null;
  diskBos: string | null;
  not: string | null;
  kaynak: string | null;
  ts: string;
};

/** Masa 8 saatten eski ölçümü BAYAT işaretler (CLAUDE.md → karar masası). */
export const BAYAT_SAAT = 8;

const SAYILAR = ["yazilan", "cephe", "uc", "kalan", "bosluk", "hiz", "satir"] as const;
const METINLER = ["kalanSure", "satirMetni", "indeksDiski", "diskBos", "not", "kaynak"] as const;
const SUREC = new Set<string>(["calisiyor", "durdu", "bilinmiyor"]);
const METIN_SINIRI = 600;

export function b3Dogrula(ham: unknown): { olcum: B3Olcumu } | { hata: string } {
  if (typeof ham !== "object" || ham === null || Array.isArray(ham)) {
    return { hata: "gövde bir nesne olmalı" };
  }
  const g = ham as Record<string, unknown>;

  if (typeof g.surec !== "string" || !SUREC.has(g.surec)) {
    return { hata: "surec: calisiyor | durdu | bilinmiyor" };
  }
  if (typeof g.ts !== "string" || Number.isNaN(new Date(g.ts).getTime())) {
    return { hata: "ts: ölçümün ISO zamanı olmalı" };
  }
  const ts = new Date(g.ts);
  // Gelecekten ölçüm olmaz; saat sapması için 5 dk pay.
  if (ts.getTime() > Date.now() + 5 * 60_000) return { hata: "ts gelecekte" };

  const cikti: Record<string, unknown> = { surec: g.surec, ts: ts.toISOString() };
  for (const a of SAYILAR) {
    const v = g[a];
    if (v === undefined || v === null) {
      cikti[a] = null;
    } else if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      cikti[a] = v;
    } else {
      return { hata: `${a}: negatif olmayan sayı olmalı` };
    }
  }
  for (const a of METINLER) {
    const v = g[a];
    if (v === undefined || v === null) {
      cikti[a] = null;
    } else if (typeof v === "string" && v.length <= METIN_SINIRI) {
      cikti[a] = v;
    } else {
      return { hata: `${a}: en çok ${METIN_SINIRI} karakterlik metin olmalı` };
    }
  }
  return { olcum: cikti as unknown as B3Olcumu };
}

export type B3Gorunum = {
  surec: Surec;
  rozet: string;
  /** 0–1; uç bilinmiyorsa null (çubuk doldurulmaz). */
  oran: number | null;
  yuzde: string;
  yaslandi: number | null;
  bayat: boolean;
};

export function b3Gorunum(o: B3Olcumu, simdi: Date = new Date()): B3Gorunum {
  const oran =
    o.uc !== null && o.uc > 0 && o.yazilan !== null ? Math.min(o.yazilan / o.uc, 1) : null;
  const yas = (simdi.getTime() - new Date(o.ts).getTime()) / 3_600_000;
  const yaslandi = Number.isFinite(yas) ? Math.max(yas, 0) : null;
  return {
    surec: o.surec,
    rozet: o.surec === "calisiyor" ? "çalışıyor" : o.surec === "durdu" ? "durdu" : "durum bilinmiyor",
    oran,
    yuzde:
      oran === null
        ? "—"
        : (oran * 100).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%",
    yaslandi,
    bayat: yaslandi !== null && yaslandi > BAYAT_SAAT,
  };
}
