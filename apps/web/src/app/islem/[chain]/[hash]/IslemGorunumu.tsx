"use client";

/**
 * Bir işlemin hareketleri ve "bu işlemden takip başlat".
 *
 * Neden ALICI seçtiriliyor: takip, köke GİREN paradan başlar (`tohumGirisleri`). Bir işlemin birden
 * çok alıcısı olabilir ve hangisinin izleneceği bir insan kararıdır — sayfa kök adresi kendi
 * seçmez, işlemin ne yaptığını gösterip sorar.
 *
 * Gönderen tarafa takip düğmesi konmaz: o adresin bu işlemde GİRİŞİ yoktur, koşu boş bir grafla
 * biterdi ("para hareket etmedi" diye okunurdu). Motor bu durumu yine de ölçüp yazıyor
 * (`stats.tohum`), ama ekran en baştan yanlış düğmeyi göstermemeli.
 */
import { useCallback, useEffect, useState } from "react";
import { Adres, Bos, Kayit, Rozet, Satir, Tarih, Tutar } from "@/components/ui";
import { tarih } from "@/lib/bicim";
import { islemGezgini } from "@/lib/gezgin";
import { kurCumlesi } from "@cry/fiyat";

type Hareket = {
  asset: { chain: string; contract: string | null; symbol: string; decimals: number };
  amountRaw: string;
  from: string | null;
  to: string | null;
  kind: string;
  success: boolean;
  /** Token'ın ondalığı bilinmiyor — tutar HAM basılır, çevrilmez. */
  ondalikBilinmiyor?: boolean;
};

/**
 * Bir hareketin TL karşılığı — `/api/fiyat`ın döndürdüğü şekil.
 *
 * İki kur birden taşınır (kullanıcı kararı): tek sayı hangi soruya cevap
 * verdiğini gizler. `gerekce` boş değilse EKSİK olan şey SÖYLENİR — boş bir
 * alan "TL karşılığı yok" diye okunurdu, oysa cevap "bakılamadı" olabilir.
 */
type Fiyat = {
  tutar: string | null;
  islemGunu: { usd: string; try: string; kurTarihi: string | null } | null;
  raporGunu: { usd: string; try: string; kurTarihi: string | null } | null;
  gerekce: string[];
};

type Islem = {
  bulundu: boolean;
  chain: string;
  hash: string;
  blockNumber?: number | null;
  ts?: string;
  success?: boolean;
  from?: string | null;
  to?: string | null;
  transfers?: Hareket[];
  /** Şekli tanınmayan olay günlüğü sayısı. */
  cozulemeyenLog?: number;
};

export default function IslemGorunumu({ chain, hash }: { chain: string; hash: string }) {
  const [islem, setIslem] = useState<Islem | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [baslatilan, setBaslatilan] = useState<string | null>(null);
  const [fiyatlar, setFiyatlar] = useState<Fiyat[] | null>(null);

  const yukle = useCallback(async () => {
    setHata(null);
    const yanit = await fetch(`/api/islem/${chain}/${encodeURIComponent(hash)}`);
    const govde = (await yanit.json().catch(() => ({}))) as Islem & { error?: string };
    if (!yanit.ok) {
      setHata(govde.error ?? "işlem okunamadı");
      return;
    }
    setIslem(govde);
  }, [chain, hash]);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  /**
   * Hareketler geldikten SONRA TL karşılıkları sorulur.
   *
   * Ayrı bir istek olmasının sebebi: işlem ucu ZİNCİRE gider, fiyat ucu
   * ARŞİVE. Birini ötekinin gecikmesine bağlamak, fiyat tablosu boşken işlem
   * sayfasını da yavaşlatırdı.
   */
  useEffect(() => {
    const hareketler = islem?.transfers;
    const gun = islem?.ts?.slice(0, 10);
    if (!hareketler?.length || !gun) return;
    let iptal = false;
    void (async () => {
      const yanit = await fetch("/api/fiyat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hareketler: hareketler.map((h) => ({
            gun,
            chain: h.asset.chain,
            contract: h.asset.contract ?? "",
            hamTutar: h.amountRaw,
            ondalik: h.asset.decimals,
            ondalikBilinmiyor: h.ondalikBilinmiyor,
          })),
        }),
      });
      if (iptal || !yanit.ok) return;
      const govde = (await yanit.json().catch(() => ({}))) as { fiyatlar?: Fiyat[] };
      if (!iptal && govde.fiyatlar) setFiyatlar(govde.fiyatlar);
    })();
    return () => {
      iptal = true;
    };
  }, [islem]);

  /** Seçilen alıcı kök olur, işlem de tohum: koşu yalnızca bu işlemin getirdiği parayı izler. */
  async function takipBaslat(alici: string) {
    setHata(null);
    setBaslatilan(alici);
    const yanit = await fetch("/api/takip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chain, address: alici, taintRule: "fifo", tohumTx: hash }),
    });
    const govde = (await yanit.json().catch(() => ({}))) as { traceRunId?: string; error?: string };
    if (!yanit.ok || !govde.traceRunId) {
      setHata(govde.error ?? "takip başlatılamadı");
      setBaslatilan(null);
      return;
    }
    window.location.href = `/takip/${govde.traceRunId}`;
  }

  if (hata && !islem) {
    return (
      <Kayit koken="yok" baslik="işlem">
        <Bos>{hata}</Bos>
      </Kayit>
    );
  }
  if (!islem) return <Kayit koken="yok" baslik="işlem"><Bos>okunuyor…</Bos></Kayit>;

  if (!islem.bulundu) {
    return (
      <Kayit koken="kaynak" baslik="işlem">
        <Bos>
          Bu işlem {chain} zincirinde bulunamadı. Başka bir zincirde olabilir — aynı biçimdeki bir
          hash birden çok zincirde geçerlidir. &quot;Bulunamadı&quot; ile &quot;bakılamadı&quot; ayrı
          cevaplardır: burada bakıldı ve yok.
        </Bos>
      </Kayit>
    );
  }

  const hareketler = islem.transfers ?? [];
  // Aynı adres birden çok kez alıcı olabilir; her biri için tek düğme yeter.
  const alicilar = [...new Set(hareketler.filter((h) => h.to).map((h) => h.to as string))];
  const gezgin = islemGezgini(chain, islem.hash);

  return (
    <>
      <div className="tepe">
        <div style={{ minWidth: 0 }}>
          <div className="etiket">işlem · {islem.chain}</div>
          <h1 className="veri" style={{ fontSize: 15, wordBreak: "break-all", marginTop: 3 }}>
            {islem.hash}
          </h1>
        </div>
        <span className="tepe-sag">
          <span className="cip" data-ton={islem.success ? "iyi" : "dikkat"}>
            {islem.success ? "✓ başarılı" : "başarısız — para hareket etmedi"}
          </span>
          {gezgin && (
            <a className="dugme" href={gezgin} target="_blank" rel="noopener noreferrer">
              gezginde aç ↗
            </a>
          )}
        </span>
      </div>

      <div className="ikili">
        <div className="sutun">

      <Kayit koken="kaynak" baslik="işlem">
        <div className="panel satirlar">
          <Satir ad="blok">
            <span className="veri">{islem.blockNumber ?? "—"}</span>
          </Satir>
          <Satir ad="zaman" not="ipucunda UTC — gün sınırı UTC'dir">
            <Tarih deger={islem.ts ?? null} metin={tarih(islem.ts ?? null)} />
          </Satir>
          <Satir ad="sonuç">
            {islem.success ? (
              <Rozet ton="gelen">başarılı</Rozet>
            ) : (
              <Rozet ton="dikkat" baslik="Başarısız işlemde para hareket etmedi.">
                başarısız
              </Rozet>
            )}
          </Satir>
          <Satir ad="hareket">
            <span className="veri">{hareketler.length}</span>
            <span className="koken-notu">
              TRC20 transferi bir OLAYdır; log dizisinden okunur
            </span>
          </Satir>
        </div>
      </Kayit>

      <Kayit koken="kaynak" baslik={`hareketler (${hareketler.length})`}>
        {hareketler.length === 0 ? (
          <Bos>
            Bu işlemde çözülebilen bir değer hareketi YOK. Bu &quot;para hareket etmedi&quot; demek
            değildir: onay (approval) ya da sözleşme çağrısı olabilir, ama sözleşme çağrısının
            taşıdığı TRX ve iç transferler bu uçta zaten görünmüyor.
            {(islem.cozulemeyenLog ?? 0) > 0 &&
              ` Ayrıca ${islem.cozulemeyenLog} olay günlüğü çözülemedi.`}
          </Bos>
        ) : (
          <div className="panel" style={{ padding: 0 }}>
            {hareketler.map((h, i) => (
              <div
                key={i}
                className="islem-hareket"
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: 12,
                  padding: "11px 14px",
                  borderTop: i === 0 ? undefined : "1px solid var(--cizgi-2)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
                  >
                    <span className="veri">
                      <Adres deger={h.from ?? "—"} zincir={chain} />
                      <span className="m3"> → </span>
                      <Adres deger={h.to ?? "—"} zincir={chain} />
                    </span>
                    <Rozet baslik={h.asset.contract ?? "native varlık"}>
                      {h.asset.symbol}
                      {h.asset.contract ? " · token" : ""}
                    </Rozet>
                    {!h.success && <Rozet ton="dikkat">başarısız</Rozet>}
                  </div>
                  <FiyatSatiri fiyat={fiyatlar?.[i]} />
                </div>
                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {h.ondalikBilinmiyor ? (
                    // Ondalığı bilinmeyen tutar ÇEVRİLMEZ: 0 ondalıkla basmak yanlış bir büyüklük
                    // gösterir. Ham sayı, ham olduğu söylenerek basılır; kimlik sözleşmede durur.
                    <span
                      className="veri"
                      style={{ fontSize: 15, wordBreak: "break-all", whiteSpace: "normal" }}
                      title={`sözleşme: ${h.asset.contract ?? "?"}`}
                    >
                      {h.amountRaw}{" "}
                      <span className="koken-notu" data-koken="supheli">
                        ham · ondalık bilinmiyor
                      </span>
                    </span>
                  ) : (
                    <span style={{ fontSize: 15 }}>
                      <Tutar ham={h.amountRaw} ondalik={h.asset.decimals} sembol={h.asset.symbol} />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Kayit>

      <div className="uyari">
        <span aria-hidden>⚠</span>
        <span>
          <b>Bu liste bir EKSİKSİZLİK iddiası değildir:</b> kaynağın işlem uçlarının döndürdüğü
          hareketlerdir. Sözleşme çağrısının taşıdığı TRX (<span className="veri">call_value</span>)
          ve sözleşme içi (internal) transferler görünmez.
          {(islem.cozulemeyenLog ?? 0) > 0 &&
            ` Şekli tanınmayan ${islem.cozulemeyenLog} olay günlüğü atlandı.`}
        </span>
      </div>

        </div>

        <div className="sutun">

      {alicilar.length > 0 && (
        <Kayit koken="yok" baslik="bu işlemden takip">
          <div className="panel satirlar">
            <p className="koken-notu" style={{ display: "block", margin: 0 }}>
              Takip köke GİREN paradan başlar; kök adresi <b>insan seçer</b>. Aşağıdakiler bu
              işlemin alıcılarıdır — birini seçince koşu yalnızca{" "}
              <strong>bu işlemin getirdiği parayı</strong> izler, adresin bütün geçmişini değil.
              Gönderene düğme konmaz: o adresin bu işlemde girişi yoktur.
            </p>
            {alicilar.map((a) => (
              <div key={a} style={{ display: "grid", gap: 6 }}>
                <Adres deger={a} zincir={chain} />
                <button
                  className="birincil"
                  onClick={() => void takipBaslat(a)}
                  disabled={baslatilan !== null}
                  title="Bu adrese, bu işlemle gelen parayı takip eder"
                >
                  {baslatilan === a ? "başlatılıyor…" : "bu işlemden takip ▸"}
                </button>
              </div>
            ))}
          </div>
        </Kayit>
      )}

      <Kayit koken="indeks" baslik="fiyat ve kur">
        <div className="panel">
          <p className="koken-notu" style={{ display: "block", margin: 0 }}>
            TL karşılıkları işlemin <strong>UTC</strong> gününe göre hesaplanır; yukarıdaki saat
            TSİ&apos;dir, yani gece yarısına yakın bir işlem bir ÖNCEKİ günün kuruyla çevrilmiş
            olabilir. Kur TCMB <span className="veri">döviz alış</span>, ve kullanılan bültenin
            tarihi satırda yazar. Fiyat bulunamadıysa sebebi yazılır — boş bir alan
            &laquo;TL karşılığı yok&raquo; diye okunurdu, oysa cevap &laquo;bakılamadı&raquo;
            olabilir.
          </p>
        </div>
      </Kayit>

        </div>
      </div>

      {hata && <Bos>{hata}</Bos>}
    </>
  );
}


/**
 * Bir hareketin TL karşılığı.
 *
 * Cümlenin KURALI burada değil `@cry/fiyat`ta (`kurCumlesi`) — saf, testli ve
 * rapor metniyle ORTAK. İki kopya olsaydı biri değişir öteki kalırdı; bu
 * dosyanın işi yalnızca onu ekrana koymak.
 *
 * Görünür hâle gelen üç kural: iki kur birden · hangi kurun hangi TARİHTEN
 * geldiği · "yok" ile "bakılamadı"nın ayrı olduğu.
 */
function FiyatSatiri({ fiyat }: { fiyat: Fiyat | undefined }) {
  if (!fiyat) return null;
  return (
    <span
      className="koken-notu"
      data-koken={fiyat.islemGunu ? undefined : "supheli"}
      style={{ display: "block", margin: "5px 0 0", whiteSpace: "normal" }}
      title={fiyat.gerekce.join(" · ") || undefined}
    >
      {kurCumlesi(fiyat)}
    </span>
  );
}
