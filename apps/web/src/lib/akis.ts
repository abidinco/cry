/**
 * Takip akışının SAF katmanı: hangi para nereye aktı, hangi şerit hangi
 * türden, ve ekranda nereye çizilir.
 *
 * Görünüm "sankey" benzeri (kullanıcı kararı 2026-09-14, seçenek A): sütunlar
 * sıçramalar, şerit kalınlığı aktarılan TUTAR. Graf görünümü para yoğunluğunu
 * göstermiyordu — düğümler eşit kutulardı ve 40 Mn USDT ile 1 USDT aynı çizgiyle
 * çiziliyordu.
 *
 * Yerleşim tamamen DETERMİNİSTİKTİR: aynı koşu aynı resmi verir (rapora giren
 * görsel için şart — `docs/arayuz.md`). Rastgelelik yok, eşitlikte adres sırası.
 *
 * Tutarlar iki ayrı biçimde taşınır: `ham` (bigint, metin olarak gösterilir)
 * ve `deger` (number, YALNIZCA geometri için). Ekrana yazılan tutar asla
 * `deger`den türetilmez — zincirde 2^256-1 gibi değerler var.
 */

import { yakmaAdresiMi } from "@cry/chain/yakma";

export type AkisEtiketi = {
  title: string;
  category: string;
  exchange: string | null;
  dogrulandi?: boolean;
};

export type AkisDugumu = {
  address: string;
  hop: number;
  terminalReason: string | null;
  etiketler: AkisEtiketi[];
};

export type AkisKenari = {
  txHash: string;
  from: string;
  to: string;
  symbol: string;
  decimals: number;
  amountRaw: string;
  ts: string;
  hop: number;
  taintShare: number;
};

export type DugumTuru = "kok" | "borsa" | "aday" | "yakildi" | "sinir" | "taranamadi" | "ara";
/** Şeridin anlattığı şey — renk kanalı yalnızca bunu taşır. */
export type SeritTuru = "borsa" | "aday" | "geri" | "akis";

export type ModelDugumu = AkisDugumu & {
  tur: DugumTuru;
  /** Doğrulanmış borsa etiketi varsa borsanın adı. */
  borsa: string | null;
  giren: bigint;
  cikan: bigint;
  /** Geometri için: max(giren, çıkan) ondalıklı büyüklük. */
  deger: number;
};

export type Serit = {
  anahtar: string;
  from: string;
  to: string;
  tur: SeritTuru;
  /** Hedef, kaynaktan daha ileri bir sıçramada DEĞİL: para geri ya da yana döndü. */
  geri: boolean;
  ham: bigint;
  deger: number;
  kenarlar: AkisKenari[];
};

export type AkisModeli = {
  varlik: string;
  decimals: number;
  dugumler: ModelDugumu[];
  seritler: Serit[];
  /** Seçilen varlık dışındaki kenarlar — çizilmez ama SAYILIR. */
  digerVarlikKenari: number;
};

/** Bizim koyduğumuz sınırlar: iz bitmedi, biz durduk. */
const SINIR = new Set(["butce", "dugum_siniri", "dallanma", "esik"]);

export function dugumTuru(d: AkisDugumu, kokAdres: string): DugumTuru {
  if (d.address === kokAdres) return "kok";
  // Adres de sorulur: sebep eklenmeden önce yazılmış koşularda "dallanma" kayıtlı.
  if (d.terminalReason === "yakildi" || yakmaAdresiMi(d.address)) return "yakildi";
  if (d.terminalReason === "terminal") return "borsa";
  if (d.terminalReason === "terminal_aday") return "aday";
  if (d.terminalReason === "indekssiz") return "taranamadi";
  if (d.terminalReason && SINIR.has(d.terminalReason)) return "sinir";
  // Kullanıcı bir adaydan takibe DEVAM ettiyse düğümün durma sebebi silinir,
  // ama adres hâlâ bir borsa adayıdır — kimliği etiketinden okunur.
  if (d.etiketler.some((e) => e.category.startsWith("exchange") && !e.dogrulandi)) return "aday";
  return "ara";
}

/**
 * Şerit kalınlığı TEK bir varlığın ölçeğidir: "1 TRX + 1 USDT" diye bir
 * büyüklük yok. Varsayılan varlık en çok hareketi olan; eşitlikte sembol sırası.
 */
export function anaVarlik(kenarlar: AkisKenari[]): string | null {
  const say = new Map<string, number>();
  for (const k of kenarlar) say.set(k.symbol, (say.get(k.symbol) ?? 0) + 1);
  return [...say].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

export function varliklar(kenarlar: AkisKenari[]): string[] {
  return [...new Set(kenarlar.map((k) => k.symbol))].sort();
}

function ondalik(ham: bigint, decimals: number): number {
  return Number(ham) / 10 ** decimals;
}

export function akisModeli(
  dugumler: AkisDugumu[],
  kenarlar: AkisKenari[],
  kokAdres: string,
  varlik: string,
): AkisModeli {
  const harita = new Map<string, ModelDugumu>();
  for (const d of dugumler) {
    const borsaEtiketi = d.etiketler.find(
      (e) => e.category.startsWith("exchange") && e.dogrulandi && e.exchange,
    );
    harita.set(d.address, {
      ...d,
      tur: dugumTuru(d, kokAdres),
      borsa: borsaEtiketi?.exchange ?? null,
      giren: 0n,
      cikan: 0n,
      deger: 0,
    });
  }

  const secilen = kenarlar.filter((k) => k.symbol === varlik);
  const decimals = secilen[0]?.decimals ?? 0;
  const ciftler = new Map<string, Serit>();
  for (const k of secilen) {
    const f = harita.get(k.from);
    const t = harita.get(k.to);
    // Ucu çizilmeyen kenar şerit olmaz; çağıran onu kırpılan olarak sayar.
    if (!f || !t) continue;
    const anahtar = `${k.from}>${k.to}`;
    let s = ciftler.get(anahtar);
    if (!s) {
      const geri = t.hop <= f.hop;
      s = {
        anahtar,
        from: k.from,
        to: k.to,
        geri,
        tur: geri ? "geri" : t.tur === "borsa" ? "borsa" : t.tur === "aday" ? "aday" : "akis",
        ham: 0n,
        deger: 0,
        kenarlar: [],
      };
      ciftler.set(anahtar, s);
    }
    const ham = BigInt(k.amountRaw);
    s.ham += ham;
    s.kenarlar.push(k);
    f.cikan += ham;
    t.giren += ham;
  }

  const seritler = [...ciftler.values()]
    .filter((s) => s.ham > 0n)
    .map((s) => ({ ...s, deger: ondalik(s.ham, decimals) }))
    .sort((a, b) => a.anahtar.localeCompare(b.anahtar));

  const modelDugumleri = [...harita.values()].map((d) => ({
    ...d,
    deger: ondalik(d.giren > d.cikan ? d.giren : d.cikan, decimals),
  }));

  return {
    varlik,
    decimals,
    dugumler: modelDugumleri,
    seritler,
    digerVarlikKenari: kenarlar.length - secilen.length,
  };
}

/* ------------------------------------------------------------------ */
/* Özet: sağ paneldeki "para nereye ulaştı"                            */
/* ------------------------------------------------------------------ */

export type AkisOzeti = {
  kokCikan: bigint;
  borsalar: { address: string; ad: string; ham: bigint }[];
  adaylar: { address: string; ham: bigint; etiket: string | null }[];
  /** Kök adrese GERİ gelen para. */
  kokeGeri: bigint;
  /** Yakma adresine giden — yok edilen — para. */
  yakilan: bigint;
  sinirda: number;
  taranamadi: number;
};

export function akisOzeti(model: AkisModeli, kokAdres: string): AkisOzeti {
  const kok = model.dugumler.find((d) => d.address === kokAdres);
  const buyukten = <T extends { ham: bigint; address: string }>(a: T, b: T) =>
    a.ham === b.ham ? a.address.localeCompare(b.address) : a.ham > b.ham ? -1 : 1;
  return {
    kokCikan: kok?.cikan ?? 0n,
    borsalar: model.dugumler
      .filter((d) => d.tur === "borsa")
      .map((d) => ({ address: d.address, ad: d.borsa ?? d.etiketler[0]?.title ?? "borsa", ham: d.giren }))
      .sort(buyukten),
    adaylar: model.dugumler
      .filter((d) => d.tur === "aday")
      .map((d) => ({ address: d.address, ham: d.giren, etiket: d.etiketler[0]?.title ?? null }))
      .sort(buyukten),
    kokeGeri: model.seritler.filter((s) => s.to === kokAdres).reduce((t, s) => t + s.ham, 0n),
    yakilan: model.dugumler.filter((d) => d.tur === "yakildi").reduce((t, d) => t + d.giren, 0n),
    sinirda: model.dugumler.filter((d) => d.tur === "sinir").length,
    taranamadi: model.dugumler.filter((d) => d.tur === "taranamadi").length,
  };
}

/* ------------------------------------------------------------------ */
/* Yerleşim                                                            */
/* ------------------------------------------------------------------ */

export type YerlesimAyari = {
  genislik: number;
  yukseklik: number;
  dugumGenisligi: number;
  solBosluk: number;
  /** Son sütunun etiketleri için. */
  sagBosluk: number;
  ustBosluk: number;
  araBosluk: number;
  enAzYukseklik: number;
};

export const VARSAYILAN_YERLESIM: Omit<YerlesimAyari, "genislik" | "yukseklik"> = {
  dugumGenisligi: 12,
  solBosluk: 46,
  sagBosluk: 150,
  ustBosluk: 26,
  araBosluk: 7,
  enAzYukseklik: 3,
};

export type Kutu = { x: number; y: number; g: number; h: number; orta: number };

export type Yerlesim = {
  kutular: Map<string, Kutu>;
  yollar: Map<string, { d: string; kalinlik: number }>;
  kolonX: number[];
  /** Geri dönen şeritlerin dolaştığı alt şeridin üst kenarı. */
  geriSeritY: number | null;
};

export function yerlesim(model: AkisModeli, ayar: YerlesimAyari): Yerlesim {
  const kolonSay = Math.max(0, ...model.dugumler.map((d) => d.hop)) + 1;
  const kolonlar: ModelDugumu[][] = Array.from({ length: kolonSay }, () => []);
  for (const d of model.dugumler) kolonlar[d.hop]!.push(d);

  const adim =
    kolonSay > 1
      ? (ayar.genislik - ayar.solBosluk - ayar.sagBosluk - ayar.dugumGenisligi) / (kolonSay - 1)
      : 0;
  const kolonX = kolonlar.map((_, i) => ayar.solBosluk + i * adim);

  const geriler = model.seritler.filter((s) => s.geri);

  // İki geçiş: alt şeridin yüksekliği geri şeritlerin GERÇEK kalınlığına
  // bağlı, kalınlık da ölçeğe — ölçek de kullanılabilir yüksekliğe.
  let altBosluk = 30;
  let olcek = 0;
  for (let gecis = 0; gecis < 2; gecis++) {
    const kullanilir = ayar.yukseklik - ayar.ustBosluk - altBosluk;
    const oranlar = kolonlar
      .filter((k) => k.length > 0)
      .map((k) => {
        const toplam = k.reduce((t, d) => t + d.deger, 0);
        const yer = kullanilir - ayar.araBosluk * (k.length - 1) - ayar.enAzYukseklik * k.length;
        return toplam > 0 ? Math.max(0, yer) / toplam : Infinity;
      });
    olcek = Math.min(...oranlar);
    if (!Number.isFinite(olcek)) olcek = 0;
    altBosluk = geriler.length === 0 ? 8 : 30 + geriler.reduce((t, s) => t + kalin(s.deger) + 6, 0);
  }
  function kalin(deger: number) {
    return Math.max(1, deger * olcek);
  }

  const kutular = new Map<string, Kutu>();
  const seritlerByDugum = new Map<string, { giren: Serit[]; cikan: Serit[] }>();
  for (const d of model.dugumler) seritlerByDugum.set(d.address, { giren: [], cikan: [] });
  for (const s of model.seritler) {
    seritlerByDugum.get(s.from)!.cikan.push(s);
    seritlerByDugum.get(s.to)!.giren.push(s);
  }

  const altSinir = ayar.yukseklik - altBosluk;
  kolonlar.forEach((kolon, i) => {
    if (i > 0) {
      // Kesişmeyi azaltmak için kaynakların ağırlıklı ortalama konumuna göre dizilir.
      const agirlik = new Map<string, number>();
      for (const d of kolon) {
        const ileri = seritlerByDugum.get(d.address)!.giren.filter((s) => !s.geri);
        const toplam = ileri.reduce((t, s) => t + s.deger, 0);
        agirlik.set(
          d.address,
          toplam > 0
            ? ileri.reduce((t, s) => t + (kutular.get(s.from)?.orta ?? 0) * s.deger, 0) / toplam
            : Number.MAX_SAFE_INTEGER,
        );
      }
      kolon.sort(
        (a, b) =>
          agirlik.get(a.address)! - agirlik.get(b.address)! ||
          b.deger - a.deger ||
          a.address.localeCompare(b.address),
      );
    } else {
      kolon.sort((a, b) => b.deger - a.deger || a.address.localeCompare(b.address));
    }

    let y = ayar.ustBosluk;
    for (const d of kolon) {
      const s = seritlerByDugum.get(d.address)!;
      const giren = s.giren.reduce((t, x) => t + kalin(x.deger), 0);
      const cikan = s.cikan.reduce((t, x) => t + kalin(x.deger), 0);
      const h = Math.max(ayar.enAzYukseklik, giren, cikan);
      kutular.set(d.address, { x: kolonX[i]!, y, g: ayar.dugumGenisligi, h, orta: y + h / 2 });
      y += h + ayar.araBosluk;
    }
    // Kısa sütun tepede yığılmasın: dikeyde ortalanır.
    const fazla = altSinir - (y - ayar.araBosluk);
    if (fazla > 0) {
      for (const d of kolon) {
        const k = kutular.get(d.address)!;
        k.y += fazla / 2;
        k.orta += fazla / 2;
      }
    }
  });

  // Şerit uçları düğümün kenarında sırayla dizilir; geri şeritler en altta.
  const cikisY = new Map<string, number>();
  const girisY = new Map<string, number>();
  for (const d of model.dugumler) {
    const k = kutular.get(d.address)!;
    const s = seritlerByDugum.get(d.address)!;
    const diz = (liste: Serit[], karsi: (x: Serit) => string, hedef: Map<string, number>) => {
      const sirali = [...liste].sort(
        (a, b) =>
          Number(a.geri) - Number(b.geri) ||
          kutular.get(karsi(a))!.orta - kutular.get(karsi(b))!.orta ||
          a.anahtar.localeCompare(b.anahtar),
      );
      let y = k.orta - sirali.reduce((t, x) => t + kalin(x.deger), 0) / 2;
      for (const x of sirali) {
        const w = kalin(x.deger);
        hedef.set(x.anahtar, y + w / 2);
        y += w;
      }
    };
    diz(s.cikan, (x) => x.to, cikisY);
    diz(s.giren, (x) => x.from, girisY);
  }

  const yollar = new Map<string, { d: string; kalinlik: number }>();
  let serit = altSinir + 22;
  const r = 22;
  for (const s of [...model.seritler].sort((a, b) => Number(a.geri) - Number(b.geri) || b.deger - a.deger || a.anahtar.localeCompare(b.anahtar))) {
    const a = kutular.get(s.from)!;
    const b = kutular.get(s.to)!;
    const w = kalin(s.deger);
    const x0 = a.x + a.g;
    const x1 = b.x;
    const y0 = cikisY.get(s.anahtar)!;
    const y1 = girisY.get(s.anahtar)!;
    const yuvarla = (n: number) => Math.round(n * 10) / 10;
    let d: string;
    if (!s.geri) {
      const orta = (x0 + x1) / 2;
      d = `M${yuvarla(x0)},${yuvarla(y0)} C${yuvarla(orta)},${yuvarla(y0)} ${yuvarla(orta)},${yuvarla(y1)} ${yuvarla(x1)},${yuvarla(y1)}`;
    } else {
      // Geri dönen para diyagramın ALTINDAN dolaşır: yönü tartışmasız okunur
      // ve ileri akışın şeritleriyle karışmaz.
      const ly = serit + w / 2;
      serit += w + 6;
      const sagX = x0 + r;
      const solX = x1 - r;
      d =
        `M${yuvarla(x0)},${yuvarla(y0)} L${yuvarla(sagX - r / 2)},${yuvarla(y0)} ` +
        `Q${yuvarla(sagX)},${yuvarla(y0)} ${yuvarla(sagX)},${yuvarla(y0 + r / 2)} L${yuvarla(sagX)},${yuvarla(ly - r / 2)} ` +
        `Q${yuvarla(sagX)},${yuvarla(ly)} ${yuvarla(sagX - r / 2)},${yuvarla(ly)} L${yuvarla(solX + r / 2)},${yuvarla(ly)} ` +
        `Q${yuvarla(solX)},${yuvarla(ly)} ${yuvarla(solX)},${yuvarla(ly - r / 2)} L${yuvarla(solX)},${yuvarla(y1 + r / 2)} ` +
        `Q${yuvarla(solX)},${yuvarla(y1)} ${yuvarla(solX + r / 2)},${yuvarla(y1)} L${yuvarla(x1)},${yuvarla(y1)}`;
    }
    yollar.set(s.anahtar, { d, kalinlik: w });
  }

  return { kutular, yollar, kolonX, geriSeritY: geriler.length ? altSinir + 10 : null };
}

/* ------------------------------------------------------------------ */
/* Gizleme                                                             */
/* ------------------------------------------------------------------ */

export type Gizlenenler = { seritler: ReadonlySet<string>; dugumler: ReadonlySet<string> };

export const gizliYok = (): Gizlenenler => ({ seritler: new Set(), dugumler: new Set() });

/**
 * Kullanıcının gizlediği şeritleri ve adresleri ÇİZİMDEN çıkarır
 * (kullanıcı isteği 2026-09-14). Kalınlık ölçeği görünen akışa göre yeniden
 * kurulur: yoğun bir aday hesabı gizlenince küçük şeritler okunur hâle gelir.
 *
 * Yalnızca görünümü değiştirir, veriyi değil — özet ve defter koşunun
 * tamamını söylemeye devam eder. Kök gizlenemez: akışın başlangıcıdır.
 * Gizlenen adresin şeritleri de onunla gider.
 */
export function gizleneniAyikla(
  dugumler: AkisDugumu[],
  kenarlar: AkisKenari[],
  kokAdres: string,
  gizli: Gizlenenler,
): { dugumler: AkisDugumu[]; kenarlar: AkisKenari[] } {
  const gizliDugum = (a: string) => a !== kokAdres && gizli.dugumler.has(a);
  return {
    dugumler: dugumler.filter((d) => !gizliDugum(d.address)),
    kenarlar: kenarlar.filter(
      (k) => !gizliDugum(k.from) && !gizliDugum(k.to) && !gizli.seritler.has(`${k.from}>${k.to}`),
    ),
  };
}

/**
 * Tıklanan şerit ve ONA GELENE KADARKİ yol (kullanıcı isteği 2026-09-14):
 * şeridin kaynağına giren ileri şeritler, onların kaynağına girenler… köke
 * kadar. "Bu para buraya hangi yoldan geldi" sorusunun cevabı.
 *
 * Geri dönen şeritler yola alınmaz: döngü açarlar ve para o yoldan
 * GELMEDİ, oradan döndü.
 */
export function seritYolu(model: AkisModeli, anahtar: string): Set<string> {
  const yol = new Set<string>();
  const serit = model.seritler.find((s) => s.anahtar === anahtar);
  if (!serit) return yol;
  yol.add(anahtar);
  const gelen = new Map<string, Serit[]>();
  for (const s of model.seritler) {
    if (s.geri) continue;
    const liste = gelen.get(s.to) ?? [];
    liste.push(s);
    gelen.set(s.to, liste);
  }
  const gorulen = new Set<string>();
  const kuyruk = [serit.from];
  while (kuyruk.length > 0) {
    const adres = kuyruk.shift()!;
    if (gorulen.has(adres)) continue;
    gorulen.add(adres);
    for (const s of gelen.get(adres) ?? []) {
      yol.add(s.anahtar);
      kuyruk.push(s.from);
    }
  }
  return yol;
}


/* ------------------------------------------------------------------ */
/* Defter satırları                                                    */
/* ------------------------------------------------------------------ */

export type DefterSatiri = {
  /** Şerit anahtarı (`from>to`) — vurgu ve gizleme bununla. */
  anahtar: string;
  /** Satırın kendi kimliği (React anahtarı). */
  kimlik: string;
  hop: number;
  from: string;
  to: string;
  tur: SeritTuru;
  ham: bigint;
  /** Şerit satırında kaç hareketin toplandığı; hareket satırında 1. */
  adet: number;
  /** Yalnızca hareket satırında: çıkışın ize atfedilen payı. */
  pay: number | null;
  ilk: string;
  son: string;
  txHash: string | null;
};

/**
 * Defter iki yoğunlukta okunur (kullanıcı bildirimi 2026-09-15: "defter
 * dağınık"). Koşu 9'da tek bir çift arasında 706 küçük transfer vardı ve
 * defter onları 706 satır basıyordu; diyagram zaten tek şerit çiziyor.
 *
 * - Bir ŞERİT seçiliyse o şeridin HAREKETLERİ tek tek (tarih, işlem, pay).
 * - Değilse (hepsi ya da bir adres) her şerit TEK satır: toplam ve adet.
 *
 * Sıra: sıçrama, sonra büyükten küçüğe, sonra anahtar — deterministik.
 */
export function defterSatirlari(
  model: AkisModeli,
  secim: { dugum?: string; serit?: string } | null,
): DefterSatiri[] {
  if (secim?.serit) {
    const s = model.seritler.find((x) => x.anahtar === secim.serit);
    if (!s) return [];
    return [...s.kenarlar]
      .sort((a, b) => a.ts.localeCompare(b.ts) || a.txHash.localeCompare(b.txHash))
      .map((k, i) => ({
        anahtar: s.anahtar,
        kimlik: `${k.txHash}-${i}`,
        hop: k.hop,
        from: s.from,
        to: s.to,
        tur: s.tur,
        ham: BigInt(k.amountRaw),
        adet: 1,
        pay: k.taintShare,
        ilk: k.ts,
        son: k.ts,
        txHash: k.txHash,
      }));
  }
  return model.seritler
    .filter((s) => !secim?.dugum || s.from === secim.dugum || s.to === secim.dugum)
    .map((s) => {
      const zamanlar = s.kenarlar.map((k) => k.ts).sort();
      return {
        anahtar: s.anahtar,
        kimlik: s.anahtar,
        hop: Math.min(...s.kenarlar.map((k) => k.hop)),
        from: s.from,
        to: s.to,
        tur: s.tur,
        ham: s.ham,
        adet: s.kenarlar.length,
        pay: null,
        ilk: zamanlar[0]!,
        son: zamanlar[zamanlar.length - 1]!,
        txHash: null,
      };
    })
    .sort((a, b) => a.hop - b.hop || (a.ham === b.ham ? a.anahtar.localeCompare(b.anahtar) : a.ham > b.ham ? -1 : 1));
}

/* ------------------------------------------------------------------ */
/* Kaydırma ve yakınlaştırma                                           */
/* ------------------------------------------------------------------ */

/** Diyagramın görünümü: önce kaydırma (x, y), sonra ölçek (k). */
export type Gorunum = { k: number; x: number; y: number };

export const GORUNUM_SIFIR: Gorunum = { k: 1, x: 0, y: 0 };
export const OLCEK_SINIRI = { en_az: 0.5, en_cok: 8 } as const;

/**
 * İmlecin ALTINDAKİ nokta yerinde kalacak şekilde yakınlaştırır — haritalarda
 * alışılan davranış. Aksi hâlde yakınlaşan kısım ekrandan kaçar ve kullanıcı
 * baktığı adresi kaybeder.
 */
export function yakinlastir(g: Gorunum, px: number, py: number, carpan: number): Gorunum {
  const k = Math.min(OLCEK_SINIRI.en_cok, Math.max(OLCEK_SINIRI.en_az, g.k * carpan));
  const oran = k / g.k;
  return { k, x: px - (px - g.x) * oran, y: py - (py - g.y) * oran };
}
