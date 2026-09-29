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
      <Kayit
        koken="kaynak"
        baslik="işlem"
        sag={
          gezgin ? (
            <a href={gezgin} target="_blank" rel="noopener noreferrer">
              gezginde aç
            </a>
          ) : null
        }
      >
        <div className="panel satirlar">
          <Satir ad="hash">
            <span className="veri" style={{ wordBreak: "break-all" }}>{islem.hash}</span>
          </Satir>
          <Satir ad="zincir">
            <span className="veri">{islem.chain}</span>
          </Satir>
          <Satir ad="zaman">
            <Tarih deger={islem.ts ?? null} metin={tarih(islem.ts ?? null)} />
          </Satir>
          <Satir ad="blok">
            <span className="veri">{islem.blockNumber ?? "—"}</span>
          </Satir>
          <Satir ad="sonuç">
            {islem.success ? (
              <span className="veri">başarılı</span>
            ) : (
              <Rozet ton="dikkat" baslik="Başarısız işlemde para hareket etmedi.">
                başarısız
              </Rozet>
            )}
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
          <div className="panel satirlar">
            {hareketler.map((h, i) => (
              <Satir key={i} ad={h.asset.symbol}>
                <span className="veri">
                  <Adres deger={h.from ?? "—"} zincir={chain} />
                  {" → "}
                  <Adres deger={h.to ?? "—"} zincir={chain} />
                </span>
                {h.ondalikBilinmiyor ? (
                  // Ondalığı bilinmeyen tutar ÇEVRİLMEZ: 0 ondalıkla basmak yanlış bir büyüklük
                  // gösterir. Ham sayı, ham olduğu söylenerek basılır; kimlik sözleşmede durur.
                  <span className="veri" title={`sözleşme: ${h.asset.contract ?? "?"}`}>
                    {h.amountRaw} <span className="koken-notu">ham · ondalık bilinmiyor</span>
                  </span>
                ) : (
                  <Tutar ham={h.amountRaw} ondalik={h.asset.decimals} sembol={h.asset.symbol} />
                )}
                {!h.success && <Rozet ton="dikkat">başarısız</Rozet>}
                <FiyatSatiri fiyat={fiyatlar?.[i]} />
              </Satir>
            ))}
          </div>
        )}
        <p className="koken-notu">
          TL karşılıkları işlemin <strong>UTC</strong> gününe göre hesaplanır; yukarıdaki saat
          TSİ'dir, yani gece yarısına yakın bir işlem bir önceki günün kuruyla çevrilmiş olabilir.
          Kur TCMB döviz alışıdır ve kullanılan bültenin tarihi satırda yazar.
        </p>
        <p className="koken-notu">
          Bu liste bir EKSİKSİZLİK iddiası değildir: kaynağın işlem uçlarının döndürdüğü
          hareketlerdir. Sözleşme çağrısının taşıdığı TRX ve sözleşme içi (internal) transferler
          görünmez.
          {(islem.cozulemeyenLog ?? 0) > 0 &&
            ` Şekli tanınmayan ${islem.cozulemeyenLog} olay günlüğü atlandı.`}
        </p>
      </Kayit>

      {alicilar.length > 0 && (
        <Kayit koken="yok" baslik="bu işlemden takip">
          <p className="koken-notu">
            Takip köke GİREN paradan başlar. Aşağıdaki adresler bu işlemin alıcılarıdır; birini
            seçtiğinizde koşu yalnızca <strong>bu işlemin getirdiği parayı</strong> izler — adresin
            bütün geçmişini değil.
          </p>
          <div className="panel satirlar">
            {alicilar.map((a) => (
              <Satir key={a} ad="alıcı">
                <Adres deger={a} zincir={chain} />
                <button
                  className="birincil"
                  onClick={() => void takipBaslat(a)}
                  disabled={baslatilan !== null}
                  title="Bu adrese, bu işlemle gelen parayı takip eder"
                >
                  {baslatilan === a ? "başlatılıyor…" : "bu işlemden takip"}
                </button>
              </Satir>
            ))}
          </div>
        </Kayit>
      )}

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
    <span className="koken-notu" title={fiyat.gerekce.join(" · ") || undefined}>
      {kurCumlesi(fiyat)}
    </span>
  );
}
