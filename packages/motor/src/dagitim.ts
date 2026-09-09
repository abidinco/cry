/**
 * Atıf: bir düğüme giren izli para, çıkışlara nasıl dağıtılır.
 *
 * Hesap-bakiye modelinde paralar karışır ve "X'ten gelen 10k'nın hangisi
 * Z'ye gitti" sorusunun matematiksel kesin cevabı YOKTUR. Bu yüzden bir kural
 * SEÇİLİR, seçilen kural rapora metodoloji olarak yazılır, ve üç kural da
 * uygulanabilir kalır ki sonuçlar karşılaştırılabilsin.
 */

import type {
  DagitimSonucu,
  Hareket,
  IzliCikis,
  IzliGiris,
  KuralSecenekleri,
} from "./tipler";

/** Kuyruktaki bir dilim: paranın bir kısmı izli, bir kısmı temiz olabilir. */
type Dilim = { tutar: bigint; izli: bigint; ts: number };

/**
 * Varlık başına ayrı defter tutulur. TRX ile USDT aynı kuyruğa girerse
 * "10 USDT girdi, 10 TRX çıktı" gibi bir iz üretilir — anlamsız ve yanlış.
 */
function varlikBazindaAyir(hareketler: Hareket[]): Map<string, Hareket[]> {
  const defter = new Map<string, Hareket[]>();
  for (const h of hareketler) {
    const liste = defter.get(h.varlik) ?? [];
    liste.push(h);
    defter.set(h.varlik, liste);
  }
  for (const liste of defter.values()) {
    // Sıra ZAMANA göre; aynı anda olanlar tx içindeki sırayla.
    liste.sort((a, b) => a.ts - b.ts || a.index - b.index);
  }
  return defter;
}

/** İzli girişleri varlık+zaman anahtarıyla hızlı bulunur hâle getirir. */
function girisIndeksi(girisler: IzliGiris[]): Map<string, IzliGiris[]> {
  const m = new Map<string, IzliGiris[]>();
  for (const g of girisler) {
    const liste = m.get(g.varlik) ?? [];
    liste.push(g);
    m.set(g.varlik, liste);
  }
  return m;
}

/**
 * FIFO — varsayılan kural.
 *
 * Kuyruğa giren ilk para ilk çıkar. Adli muhasebede yerleşik olduğu ve tek
 * bir okunur zincir ürettiği için varsayılan bu; orantısal kural izi
 * binlerce kesire dağıtıp grafı okunmaz yapıyor.
 */
function fifoDagit(
  hareketler: Hareket[],
  izliGirisler: IzliGiris[],
): { cikislar: IzliCikis[]; kalan: bigint } {
  const kuyruk: Dilim[] = [];
  const cikislar: IzliCikis[] = [];

  // Aynı (ts) anındaki izli girişi eşlemek için: tutar+zaman ile ara.
  const izliKalan = izliGirisler.map((g) => ({ ...g, kullanildi: false }));

  for (const h of hareketler) {
    if (h.yon === "gelen") {
      // Bu giriş izli mi? Aynı tutar ve aynı ana denk gelen bir izli giriş
      // varsa evet. Eşleşmeyen giriş TEMİZ para olarak kuyruğa girer —
      // kuyruğa hiç girmezse FIFO sırası bozulur ve iz olduğundan hızlı akar.
      const eslesme = izliKalan.find(
        (g) => !g.kullanildi && g.ts === h.ts && g.tutar === h.tutar,
      );
      if (eslesme) {
        eslesme.kullanildi = true;
        const izli = (h.tutar * BigInt(Math.round(eslesme.pay * 1_000_000))) / 1_000_000n;
        kuyruk.push({ tutar: h.tutar, izli, ts: h.ts });
      } else {
        kuyruk.push({ tutar: h.tutar, izli: 0n, ts: h.ts });
      }
      continue;
    }

    // Çıkış: kuyruktan sırayla tüket.
    let kalanCikis = h.tutar;
    let izliPay = 0n;

    while (kalanCikis > 0n && kuyruk.length > 0) {
      const dilim = kuyruk[0]!;
      const alinan = dilim.tutar < kalanCikis ? dilim.tutar : kalanCikis;
      // Dilimin izli oranı kadarı ize atfedilir.
      const dilimIzli = dilim.tutar === 0n ? 0n : (dilim.izli * alinan) / dilim.tutar;

      izliPay += dilimIzli;
      dilim.tutar -= alinan;
      dilim.izli -= dilimIzli;
      kalanCikis -= alinan;
      if (dilim.tutar === 0n) kuyruk.shift();
    }

    // Kuyrukta karşılığı olmayan çıkış: bizim görmediğimiz bir girişten
    // besleniyor demektir (indeks eksik olabilir). İz ATFEDİLMEZ.
    if (izliPay > 0n && h.karsiTaraf) {
      cikislar.push({
        txHash: h.txHash,
        index: h.index,
        ts: h.ts,
        hedef: h.karsiTaraf,
        varlik: h.varlik,
        izliTutar: izliPay,
        toplamTutar: h.tutar,
      });
    }
  }

  const kalan = kuyruk.reduce((t, d) => t + d.izli, 0n);
  return { cikislar, kalan };
}

/**
 * Orantısal — havuzun %20'si izliyse çıkışın %20'si de izli sayılır.
 *
 * Zamanı umursamaz: düğüme giren toplam izli para / toplam giren para oranı
 * her çıkışa uygulanır. FIFO'dan farkı burada; sonuçlar karşılaştırılabilsin
 * diye ikisi de duruyor.
 */
function orantisalDagit(
  hareketler: Hareket[],
  izliGirisler: IzliGiris[],
): { cikislar: IzliCikis[]; kalan: bigint } {
  const toplamGiren = hareketler
    .filter((h) => h.yon === "gelen")
    .reduce((t, h) => t + h.tutar, 0n);
  const toplamIzli = izliGirisler.reduce(
    (t, g) => t + (g.tutar * BigInt(Math.round(g.pay * 1_000_000))) / 1_000_000n,
    0n,
  );
  if (toplamGiren === 0n || toplamIzli === 0n) return { cikislar: [], kalan: 0n };

  const cikislar: IzliCikis[] = [];
  let dagitilan = 0n;

  for (const h of hareketler) {
    if (h.yon !== "giden" || !h.karsiTaraf) continue;
    const izli = (h.tutar * toplamIzli) / toplamGiren;
    if (izli <= 0n) continue;
    dagitilan += izli;
    cikislar.push({
      txHash: h.txHash,
      index: h.index,
      ts: h.ts,
      hedef: h.karsiTaraf,
      varlik: h.varlik,
      izliTutar: izli,
      toplamTutar: h.tutar,
    });
  }

  const kalan = toplamIzli > dagitilan ? toplamIzli - dagitilan : 0n;
  return { cikislar, kalan };
}

/**
 * Zaman pencereli — izli giriş SONRASINDA, N saat içindeki çıkışlar takip
 * edilir. Pencere dışındaki çıkışa iz atfedilmez.
 *
 * Bu bir atıf kuralından çok bir SÜZGEÇTİR: "para girer girmez çıktı mı"
 * sorusunu sorar. Peel chain gibi desenlerde FIFO'dan daha okunur bir zincir
 * verir, ama uzun süre bekletilen parayı kaybeder — bu yüzden varsayılan değil.
 */
function zamanPencereliDagit(
  hareketler: Hareket[],
  izliGirisler: IzliGiris[],
  pencereSaat: number,
): { cikislar: IzliCikis[]; kalan: bigint } {
  const pencereMs = pencereSaat * 3600_000;
  const kuyruk = izliGirisler
    .map((g) => ({
      ts: g.ts,
      kalan: (g.tutar * BigInt(Math.round(g.pay * 1_000_000))) / 1_000_000n,
    }))
    .sort((a, b) => a.ts - b.ts);

  const cikislar: IzliCikis[] = [];

  for (const h of hareketler) {
    if (h.yon !== "giden" || !h.karsiTaraf) continue;
    let kalanCikis = h.tutar;
    let izli = 0n;

    for (const g of kuyruk) {
      if (kalanCikis <= 0n) break;
      if (g.kalan <= 0n) continue;
      // Çıkış girişten SONRA ve pencere İÇİNDE olmalı.
      if (h.ts < g.ts || h.ts - g.ts > pencereMs) continue;
      const alinan = g.kalan < kalanCikis ? g.kalan : kalanCikis;
      g.kalan -= alinan;
      kalanCikis -= alinan;
      izli += alinan;
    }

    if (izli > 0n) {
      cikislar.push({
        txHash: h.txHash,
        index: h.index,
        ts: h.ts,
        hedef: h.karsiTaraf,
        varlik: h.varlik,
        izliTutar: izli,
        toplamTutar: h.tutar,
      });
    }
  }

  const kalan = kuyruk.reduce((t, g) => t + (g.kalan > 0n ? g.kalan : 0n), 0n);
  return { cikislar, kalan };
}

/**
 * Bir düğümdeki izi çıkışlara dağıtır. Varlık başına ayrı defter tutulur.
 */
export function dagit(
  hareketler: Hareket[],
  izliGirisler: IzliGiris[],
  secenekler: KuralSecenekleri,
): DagitimSonucu {
  const defter = varlikBazindaAyir(hareketler);
  const girisler = girisIndeksi(izliGirisler);
  const cikislar: IzliCikis[] = [];
  const kalan = new Map<string, bigint>();

  for (const [varlik, liste] of defter) {
    const varlikGirisleri = girisler.get(varlik) ?? [];
    if (varlikGirisleri.length === 0) continue;

    const sonuc =
      secenekler.kural === "orantisal"
        ? orantisalDagit(liste, varlikGirisleri)
        : secenekler.kural === "zaman_pencereli"
          ? zamanPencereliDagit(liste, varlikGirisleri, secenekler.pencereSaat ?? 24)
          : fifoDagit(liste, varlikGirisleri);

    cikislar.push(...sonuc.cikislar);
    if (sonuc.kalan > 0n) kalan.set(varlik, sonuc.kalan);
  }

  cikislar.sort((a, b) => a.ts - b.ts || a.index - b.index);
  const bekleyenToplam = [...kalan.values()].reduce((t, v) => t + v, 0n);
  return { cikislar, kalan, bekleyenToplam };
}
