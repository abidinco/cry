"use client";

/**
 * Takip koşusu — tek ekran (kullanıcı kararı 2026-09-14, seçenek A).
 *
 * Eski sayfa sıçrama başına ayrı bloklar diziyordu ve "para nereye gitti"
 * sorusunun cevabı üç ekran aşağıdaydı. Şimdi: üstte koşunun kimliği ve
 * metodolojisi TEK satırda, solda akış, sağda "para nereye ulaştı" özeti ve
 * seçime göre süzülen hareket defteri. Hepsi bir dizüstü ekranında kaydırmadan.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { yuklemeIzle } from "@/lib/yukleme";
import { DEVAM_EK_HOP, devamEdilebilir } from "@cry/motor";
import TakipIskeleti from "./TakipIskeleti";
import TutarAraligi from "./TutarAraligi";
import { islemGezgini, kisaHash } from "@/lib/gezgin";
import { kokTaramasiSorunu, ilerlemeMetni, type Ilerleme } from "@/lib/kosu-durum";
import { Adres, Bos, Tarih, Tutar } from "@/components/ui";
import { kisaTutar, sayi, tarih, tutarParcala } from "@/lib/bicim";
import { cizilecekler } from "@/lib/graf-secim";
import {
  akisModeli,
  akisOzeti,
  anaVarlik,
  defterSatirlari,
  gizleneniAyikla,
  seritAraligi,
  seritYolu,
  tutarAraligiylaAyikla,
  varliklar,
  type AkisDugumu,
  type AkisKenari,
  type SeritTuru,
} from "@/lib/akis";
import Akis, { dugumAdi, SERIT_ADI, SERIT_RENK } from "./Akis";

type Kosu = {
  id: string;
  chain: string;
  rootAddress: string;
  taintRule: string;
  status: string;
  stopReason: string | null;
  stats: {
    dugum?: number;
    kenar?: number;
    durma?: Record<string, number>;
    devamlar?: { adres: string; oncekiSebep: string | null; ekHop: number; zaman: string }[];
    devamHatalari?: { adres: string; mesaj: string; zaman: string }[];
    ilerleme?: Ilerleme;
    durdurmalar?: { kalan?: number; devamAdres?: string; baslamadan?: boolean; zaman: string }[];
    /** Kök adres koşunun BAŞINDA tarandıysa sonucu; taranamadıysa sebebi. */
    kokTaramasi?: { yeniHareket?: number; tamamlandi?: boolean; kaynak?: string | null; atlanmaSebebi?: string | null; hata?: string };
  } | null;
  params: Record<string, unknown> | null;
  startedAt: string;
  finishedAt: string | null;
  vaka: { slug: string; title: string } | null;
  dugumler: (AkisDugumu & { amountRaw: string | null; isTerminal: boolean })[];
  kenarlar: AkisKenari[];
  error?: string;
};

const KURAL_ADI: Record<string, string> = {
  fifo: "FIFO",
  orantisal: "orantısal",
  zaman_pencereli: "zaman pencereli",
};

/** Durma sebebi: kullanıcının anlayacağı cümle. */
const SEBEP: Record<string, string> = {
  terminal: "doğrulanmış borsaya ulaşıldı",
  // Aynı cümleyi doğrulanmamış bir etiketle kurmak kaynağı olmayan bir hüküm olurdu.
  terminal_aday: "borsa ADAYINA ulaşıldı — etiket doğrulanmamış",
  yakildi: "para yakıldı — yakma adresine gitti, yok edildi",
  butce: "hop bütçesi doldu",
  dugum_siniri: "düğüm sınırı",
  dallanma: "çıkış sayısı eşiği aştı",
  esik: "tutar eşiğin altında",
  kontrat: "akıllı sözleşme",
  indekssiz: "taranamadı",
};

type Secim = { dugum?: string; serit?: string } | null;

export default function TakipGorunumu({ id }: { id: string }) {
  const [kosu, setKosu] = useState<Kosu | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [secim, setSecim] = useState<Secim>(null);
  const [varlik, setVarlik] = useState<string | null>(null);
  // Defter ↔ diyagram: birinin üzerine gelinen şerit ötekinde öne çıkar.
  const [defterVurgu, setDefterVurgu] = useState<Set<string> | null>(null);
  const [akisOdak, setAkisOdak] = useState<Set<string> | null>(null);
  // Gizlenen şeritler ve adresler — yalnızca GÖRÜNÜM; bu tarayıcıda koşu başına saklanır.
  const [gizliSerit, setGizliSerit] = useState<Set<string>>(new Set());
  const [gizliDugum, setGizliDugum] = useState<Set<string>>(new Set());
  // Şerit toplamına göre tutar aralığı — seçili varlığın biriminde.
  const [aralik, setAralik] = useState<{ alt: number; ust: number } | null>(null);
  const [devamIstek, setDevamIstek] = useState<{ adres: string; hata?: string } | null>(null);

  const gizliAnahtar = `takip-gizli-${id}`;
  useEffect(() => {
    try {
      const k = JSON.parse(localStorage.getItem(gizliAnahtar) ?? "null") as { s?: string[]; d?: string[] } | null;
      if (k) {
        setGizliSerit(new Set(k.s ?? []));
        setGizliDugum(new Set(k.d ?? []));
      }
    } catch {
      // saklama kapalıysa gizleme yalnızca bu oturumda yaşar
    }
  }, [gizliAnahtar]);
  useEffect(() => {
    try {
      localStorage.setItem(gizliAnahtar, JSON.stringify({ s: [...gizliSerit], d: [...gizliDugum] }));
    } catch {
      // yok say
    }
  }, [gizliAnahtar, gizliSerit, gizliDugum]);

  const degistir = (kume: Set<string>, oge: string) => {
    const yeni = new Set(kume);
    if (yeni.has(oge)) yeni.delete(oge);
    else yeni.add(oge);
    return yeni;
  };

  const yukle = useCallback(async () => {
    const yanit = await fetch(`/api/takip/${id}`);
    const govde = (await yanit.json().catch(() => ({}))) as Kosu;
    if (!yanit.ok) {
      setHata(govde.error ?? "koşu okunamadı");
      return;
    }
    setKosu(govde);
  }, [id]);

  // İlk yükleme üst çubuğa bildirilir; 3 saniyelik yoklama bildirilmez.
  useEffect(() => {
    void yuklemeIzle(yukle());
  }, [yukle]);

  // Koşu sürerken tazelenir, bitince yoklama DURUR.
  useEffect(() => {
    if (kosu?.status !== "kuyrukta" && kosu?.status !== "calisiyor") return;
    const z = setInterval(() => void yukle(), 3000);
    return () => clearInterval(z);
  }, [kosu?.status, yukle]);

  const secilenVarlik = varlik ?? (kosu ? anaVarlik(kosu.kenarlar) : null);
  // Varlık değişince aralık o varlığın kendi sınırlarına döner: 10.000 USDT
  // ile 10.000 TRX aynı büyüklük değil.
  useEffect(() => setAralik(null), [secilenVarlik]);

  const { model, gorunurModel, kirpilan, aralikDisi } = useMemo(() => {
    if (!kosu || !secilenVarlik) return { model: null, gorunurModel: null, kirpilan: 0, aralikDisi: 0 };
    // Rapora giren görselin okunabilir kalması için en çok 100 düğüm; seçim
    // deterministik ve BULGUYU kaybetmez (önce kök ve iz biten düğümler).
    const { secilen, kirpilan } = cizilecekler(
      kosu.dugumler.map((d) => ({ ...d, isTerminal: d.isTerminal })),
      kosu.rootAddress,
    );
    const cizilen = new Set(secilen.map((d) => d.address));
    const dugumler = kosu.dugumler.filter((d) => cizilen.has(d.address));
    // İki model: TAM olan özeti ve defteri besler (koşunun gerçeği), GÖRÜNEN
    // olan diyagramı — gizlenenler çıkınca kalınlık ölçeği kalan akışa göre kurulur.
    const g = gizleneniAyikla(dugumler, kosu.kenarlar, kosu.rootAddress, {
      seritler: gizliSerit,
      dugumler: gizliDugum,
    });
    const a = tutarAraligiylaAyikla(g.dugumler, g.kenarlar, kosu.rootAddress, secilenVarlik, aralik);
    return {
      model: akisModeli(dugumler, kosu.kenarlar, kosu.rootAddress, secilenVarlik),
      gorunurModel: akisModeli(a.dugumler, a.kenarlar, kosu.rootAddress, secilenVarlik),
      kirpilan,
      aralikDisi: a.disarida,
    };
  }, [kosu, secilenVarlik, gizliSerit, gizliDugum, aralik]);

  const [durduruluyor, setDurduruluyor] = useState(false);
  const durdur = useCallback(async () => {
    setDurduruluyor(true);
    await yuklemeIzle(fetch(`/api/takip/${id}/durdur`, { method: "POST" }));
    await yukle();
    setDurduruluyor(false);
  }, [id, yukle]);

  const devamEt = useCallback(
    async (adres: string, ekHop: number) => {
      setDevamIstek({ adres });
      const yanit = await yuklemeIzle(
        fetch(`/api/takip/${id}/devam`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adres, ekHop }),
        }),
      );
      const govde = (await yanit.json().catch(() => ({}))) as { error?: string };
      if (!yanit.ok) {
        setDevamIstek({ adres, hata: govde.error ?? "devam başlatılamadı" });
        return;
      }
      setDevamIstek(null);
      await yukle();
    },
    [id, yukle],
  );

  if (hata) return <p style={{ color: "var(--hata)" }}>{hata}</p>;
  if (!kosu) return <TakipIskeleti />;

  const suruyor = kosu.status === "kuyrukta" || kosu.status === "calisiyor";
  const params = (kosu.params ?? {}) as Record<string, unknown>;

  const baslik = (
    <div className="takip-serit">
      <div className="takip-kimlik">
        <span className="etiket">
          {kosu.vaka?.title ?? "vaka yok"} · koşu {kosu.id}
        </span>
        <Adres deger={kosu.rootAddress} zincir={kosu.chain} kisa={false} />
      </div>
      <span className="takip-bosluk" />
      <span className="veri m2" title="rapora yazılır">
        {kosu.chain} · {KURAL_ADI[kosu.taintRule] ?? kosu.taintRule} · en çok {String(params.maxHop)} sıçrama ·{" "}
        {String(params.maxDugum)} düğüm
      </span>
      <span className="veri m3">
        {sayi(kosu.dugumler.length)} adres · {sayi(kosu.kenarlar.length)} hareket
      </span>
      <span className="veri m3">
        <Tarih deger={kosu.startedAt} metin={tarih(kosu.startedAt)} />
      </span>
      {suruyor && (
        <span className="takip-ilerleme" data-uyari={ilerlemeMetni(kosu.status, kosu.stats?.ilerleme, new Date()).uyari}>
          {ilerlemeMetni(kosu.status, kosu.stats?.ilerleme, new Date()).metin}
        </span>
      )}
      {suruyor && (
        <button type="button" className="takip-gizle" disabled={durduruluyor} onClick={() => void durdur()}>
          {durduruluyor ? "durduruluyor…" : "durdur"}
        </button>
      )}
      <span
        className="rozet"
        data-ton={
          suruyor || kosu.status === "durduruldu" ? "dikkat" : kosu.stopReason === "terminal" ? "gelen" : undefined
        }
        title={
          kosu.status === "durduruldu"
            ? "kullanıcı durdurdu — sırada kalan adresler taranmadı"
            : undefined
        }
      >
        {suruyor
          ? "sürüyor"
          : kosu.status === "durduruldu"
            ? "durduruldu — graf eksik"
            : (SEBEP[kosu.stopReason ?? ""] ?? kosu.stopReason ?? kosu.status)}
      </span>
    </div>
  );

  // Kökün taranmasında bir sorun oldu mu? Karar saf katmanda ve testli (lib/kosu-durum).
  const kokSorunu = kokTaramasiSorunu(kosu.stats?.kokTaramasi);

  if (!model || !gorunurModel || kosu.dugumler.length === 0) {
    return (
      <>
        {baslik}
        <Bos>
          {suruyor
            ? "Koşu başladı; adresler bulundukça burada görünecek."
            : kokSorunu
              ? // "Hareket yok" ile "bakılamadı" AYRI cevaplardır (CLAUDE.md). Kök taranamadıysa
                // boş graf bir BULGU değildir; ekran bunu bulgu gibi göstermemeli.
                `Kök adrese BAKILAMADI, bu yüzden takip edilecek giriş bulunamadı — "hareket yok" demek değildir. ${kokSorunu}`
              : "Bu koşu hiç hareket üretmedi. Kök adresin indekslenmiş girişi yoksa takip edilecek para da yoktur."}
        </Bos>
      </>
    );
  }

  const ozet = akisOzeti(model, kosu.rootAddress);
  const dugumHarita = new Map(model.dugumler.map((d) => [d.address, d]));
  const cubukEn = [
    ...ozet.borsalar.map((b) => b.ham),
    ...ozet.adaylar.map((a) => a.ham),
    ozet.kokeGeri,
    ozet.yakilan,
  ].reduce((a, b) => (b > a ? b : a), 1n);

  // Defter: seçim yokken ya da adres seçiliyken şerit başına TEK satır;
  // şerit seçiliyse o şeridin hareketleri tek tek (lib/akis → defterSatirlari).
  const aralikDisindakiler = new Set(
    aralik ? model.seritler.filter((x) => x.deger < aralik.alt || x.deger > aralik.ust).map((x) => x.anahtar) : [],
  );
  const defter = defterSatirlari(model, secim).filter((x) => secim?.serit || !aralikDisindakiler.has(x.anahtar));
  const hareketModu = Boolean(secim?.serit);
  const toplamHareket = defter.reduce((t, x) => t + x.adet, 0);
  const secimAdi = secim?.dugum
    ? dugumAdi(dugumHarita.get(secim.dugum)!)
    : secim?.serit
      ? (() => {
          const [f, t] = secim.serit.split(">");
          return `${dugumAdi(dugumHarita.get(f!)!)} → ${dugumAdi(dugumHarita.get(t!)!)}`;
        })()
      : null;
  const seciliDugum = secim?.dugum ? dugumHarita.get(secim.dugum) : null;
  const seciliSerit = secim?.serit ? model.seritler.find((x) => x.anahtar === secim.serit) : null;
  // Tıklanan şerit, köke kadar geldiği yolla birlikte öne çıkar.
  const seciliYol = secim?.serit ? seritYolu(model, secim.serit) : null;
  const devamKaydi = (adres: string) => kosu.stats?.devamlar?.filter((d) => d.adres === adres).at(-1);
  const devamHatasi = (adres: string) => kosu.stats?.devamHatalari?.filter((d) => d.adres === adres).at(-1);
  const gizliToplam = gizliSerit.size + gizliDugum.size;

  const oran = (ham: bigint) => Number((ham * 1000n) / cubukEn) / 10;

  return (
    <>
      {baslik}
      {kokSorunu && (
        // Graf DOLU olsa bile kök eksik okunduysa iz eksiktir; bunu söylemeyen bir ekran, yarım
        // bir grafi tam gösterir ("yok" ile "bakılamadı" ayrı cevaplardır).
        <div className="veri m3" style={{ color: "var(--hata)", padding: "0 1rem 0.5rem" }}>
          Kök adresin taraması eksik — bu grafta görünmeyen giriş olabilir. {kokSorunu}
        </div>
      )}
      <div className="takip-govde">
        <section className="takip-sol" aria-label="para akışı">
          <div className="akis-lejant">
            {(["akis", "borsa", "aday", "geri"] as SeritTuru[]).map((t) => (
              <span key={t}>
                <i className="akis-lejant-cizgi" style={{ background: SERIT_RENK[t] }} />
                {SERIT_ADI[t]}
              </span>
            ))}
            <span className="m3">·</span>
            <span>
              <i className="akis-lejant-kutu" style={{ background: "var(--akis-borsa)" }} />
              borsa ✓
            </span>
            <span>
              <i className="akis-lejant-kutu akis-lejant-tarama" />
              aday ?
            </span>
            <span>
              <i className="akis-lejant-kutu" style={{ border: "1px dashed var(--m3)" }} />
              bizim sınırımız
            </span>
            {model.dugumler.some((d) => d.tur === "yakildi") && (
              <span>
                <i className="akis-lejant-kutu akis-lejant-yakma" />
                yakıldı ✕
              </span>
            )}
            <span className="takip-bosluk" />
            {varliklar(kosu.kenarlar).length > 1 ? (
              <label className="etiket">
                kalınlık{" "}
                <select id="akis-varlik" value={model.varlik} onChange={(e) => setVarlik(e.target.value)}>
                  {varliklar(kosu.kenarlar).map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="etiket">kalınlık = {model.varlik}</span>
            )}
          </div>
          {seritAraligi(model) && (
            <TutarAraligi
              sinir={seritAraligi(model)!}
              deger={aralik}
              varlik={model.varlik}
              disarida={aralikDisi}
              onDegis={setAralik}
            />
          )}
          {gizliToplam > 0 && (
            <div className="gizli-serit" role="status">
              <span className="etiket">
                gizli: {gizliDugum.size > 0 && `${sayi(gizliDugum.size)} adres`}
                {gizliDugum.size > 0 && gizliSerit.size > 0 && " · "}
                {gizliSerit.size > 0 && `${sayi(gizliSerit.size)} şerit`} — kalınlık kalan akışa göre
              </span>
              {[...gizliDugum].map((a) => {
                const d = dugumHarita.get(a);
                return (
                  <button key={a} type="button" className="gizli-cip" onClick={() => setGizliDugum((k) => degistir(k, a))} title={`${a} — göster`}>
                    {d ? dugumAdi(d) : a.slice(0, 8)} <span aria-hidden="true">×</span>
                  </button>
                );
              })}
              {[...gizliSerit].map((s2) => {
                const [f, t] = s2.split(">");
                const fd = dugumHarita.get(f!);
                const td = dugumHarita.get(t!);
                return (
                  <button key={s2} type="button" className="gizli-cip" onClick={() => setGizliSerit((k) => degistir(k, s2))} title="göster">
                    {fd ? dugumAdi(fd) : "?"} → {td ? dugumAdi(td) : "?"} <span aria-hidden="true">×</span>
                  </button>
                );
              })}
              <button
                type="button"
                className="gizli-hepsi"
                onClick={() => {
                  setGizliSerit(new Set());
                  setGizliDugum(new Set());
                }}
              >
                hepsini göster
              </button>
            </div>
          )}
          <Akis
            model={gorunurModel}
            kokAdres={kosu.rootAddress}
            secili={secim?.dugum ?? null}
            onSecim={setSecim}
            disVurgu={defterVurgu}
            seciliYol={seciliYol}
            onOdak={setAkisOdak}
          />
          {(kirpilan > 0 || model.digerVarlikKenari > 0) && (
            // Çizilmeyen kısım SESSİZCE yok sayılmaz.
            <p className="etiket" style={{ color: "var(--dikkat)", margin: 0 }}>
              {kirpilan > 0 && `çizilmeyen ${sayi(kirpilan)} adres (ilk 100 gösteriliyor, önce kök ve iz biten adresler)`}
              {kirpilan > 0 && model.digerVarlikKenari > 0 && " · "}
              {model.digerVarlikKenari > 0 &&
                `${sayi(model.digerVarlikKenari)} hareket başka varlıkta — kalınlık seçicisinden görülür`}
            </p>
          )}
        </section>

        <aside className="takip-sag">
          <div className="takip-ozet">
            <div className="kayit" data-koken="kaynak">
              <h2>para nereye ulaştı</h2>
              <div className="ozet-cubuklar">
                {ozet.borsalar.map((b) => (
                  <button key={b.address} type="button" className="ozet-cubuk" onClick={() => setSecim({ dugum: b.address })}>
                    <span className="ozet-ad" style={{ color: "var(--akis-borsa-yazi)" }}>{b.ad} ✓</span>
                    <span className="ozet-yol"><span style={{ width: `${oran(b.ham)}%`, background: "var(--akis-borsa)" }} /></span>
                    <span className="veri">{kisaTutar(b.ham, model.decimals)}</span>
                  </button>
                ))}
                {ozet.adaylar.map((a) => (
                  <button key={a.address} type="button" className="ozet-cubuk" onClick={() => setSecim({ dugum: a.address })}>
                    <span className="ozet-ad" style={{ color: "var(--akis-aday-yazi)" }}>aday ?</span>
                    <span className="ozet-yol"><span className="akis-lejant-tarama" style={{ width: `${oran(a.ham)}%` }} /></span>
                    <span className="veri">{kisaTutar(a.ham, model.decimals)}</span>
                  </button>
                ))}
                {ozet.yakilan > 0n && (
                  <button
                    type="button"
                    className="ozet-cubuk"
                    onClick={() => {
                      const z = model.dugumler.find((d) => d.tur === "yakildi");
                      if (z) setSecim({ dugum: z.address });
                    }}
                  >
                    <span className="ozet-ad">yakıldı ✕</span>
                    <span className="ozet-yol"><span className="akis-lejant-yakma" style={{ width: `${oran(ozet.yakilan)}%` }} /></span>
                    <span className="veri">{kisaTutar(ozet.yakilan, model.decimals)}</span>
                  </button>
                )}
                {ozet.kokeGeri > 0n && (
                  <button type="button" className="ozet-cubuk" onClick={() => setSecim({ dugum: kosu.rootAddress })}>
                    <span className="ozet-ad" style={{ color: "var(--akis-geri-yazi)" }}>↩ köke geri</span>
                    <span className="ozet-yol"><span style={{ width: `${oran(ozet.kokeGeri)}%`, background: "var(--akis-geri)" }} /></span>
                    <span className="veri">{kisaTutar(ozet.kokeGeri, model.decimals)}</span>
                  </button>
                )}
                {ozet.borsalar.length === 0 && ozet.adaylar.length === 0 && ozet.yakilan === 0n && (
                  <span className="m3">İz hiçbir borsaya ya da adaya ulaşmadı.</span>
                )}
              </div>
              <div className="m3" style={{ marginTop: 6 }}>
                kökten çıkan <Tutar ham={ozet.kokCikan.toString()} ondalik={model.decimals} sembol={model.varlik} />
              </div>
            </div>
            {(ozet.sinirda > 0 || ozet.taranamadi > 0) && (
              <div className="kayit" data-koken="supheli">
                <h2>
                  {sayi(ozet.sinirda + ozet.taranamadi)} adreste iz bizim sınırımızda kaldı
                </h2>
                <div className="m3">
                  {kosu.stats?.durma &&
                    Object.entries(kosu.stats.durma)
                      .filter(([k]) => k !== "terminal" && k !== "terminal_aday")
                      .map(([k, v]) => `${SEBEP[k] ?? k} ${v}`)
                      .join(" · ")}{" "}
                  — sonrası taranmadı, "temiz" değil
                </div>
              </div>
            )}
          </div>

          <div className="takip-filtre">
            <span className="etiket">
              {hareketModu
                ? `${secimAdi} · ${sayi(defter.length)} hareket`
                : `${secimAdi ?? "tüm akış"} · ${sayi(defter.length)} şerit · ${sayi(toplamHareket)} hareket`}
            </span>
            {secim && (
              <button type="button" onClick={() => setSecim(null)}>
                süzgeci kaldır
              </button>
            )}
          </div>
          {seciliDugum && (
            <div className="takip-secili">
              <Adres deger={seciliDugum.address} zincir={kosu.chain} kisa={false} />
              <span className="m3">
                {seciliDugum.hop}. sıçrama ·{" "}
                {seciliDugum.tur === "yakildi"
                  ? SEBEP.yakildi
                  : seciliDugum.terminalReason
                  ? (SEBEP[seciliDugum.terminalReason] ?? seciliDugum.terminalReason)
                  : devamKaydi(seciliDugum.address)
                    ? `takibe devam edildi (+${devamKaydi(seciliDugum.address)!.ekHop} sıçrama; önce: ${SEBEP[devamKaydi(seciliDugum.address)!.oncekiSebep ?? ""] ?? "—"})`
                    : "devam edildi"}
                {seciliDugum.etiketler.length > 0 && ` · ${seciliDugum.etiketler.map((e) => e.title).join(" · ")}`}
              </span>
              <div className="takip-eylemler">
                {(() => {
                  if (seciliDugum.address === kosu.rootAddress) return null;
                  const karar = devamEdilebilir(seciliDugum.terminalReason, seciliDugum.address);
                  if (seciliDugum.tur === "yakildi") {
                    return <span className="takip-kilit" style={{ color: "var(--m2)" }}>para burada yok edildi — devam edecek bir iz yok</span>;
                  }
                  if (seciliDugum.terminalReason === "terminal") {
                    return <span className="takip-kilit">iz burada tamamlandı — doğrulanmış borsada takip sürdürülmez</span>;
                  }
                  if (!karar.olur) return null;
                  const bekliyor = devamIstek?.adres === seciliDugum.address && !devamIstek.hata;
                  return (
                    <button
                      type="button"
                      className="takip-devam"
                      disabled={suruyor || bekliyor}
                      title={suruyor ? "koşu sürüyor — bitince devam edilebilir" : "bu adrese izlenerek gelen paranın nereye gittiğini tara"}
                      onClick={() => void devamEt(seciliDugum.address, DEVAM_EK_HOP.varsayilan)}
                    >
                      {bekliyor || suruyor ? "taranıyor…" : `takibe devam et ▸ +${DEVAM_EK_HOP.varsayilan} sıçrama`}
                    </button>
                  );
                })()}
                {seciliDugum.address !== kosu.rootAddress && (
                  <button type="button" className="takip-gizle" onClick={() => setGizliDugum((k) => degistir(k, seciliDugum.address))}>
                    {gizliDugum.has(seciliDugum.address) ? "diyagramda göster" : "diyagramda gizle"}
                  </button>
                )}
              </div>
              {devamIstek?.adres === seciliDugum.address && devamIstek.hata && (
                <span style={{ color: "var(--hata)" }}>{devamIstek.hata}</span>
              )}
              {devamHatasi(seciliDugum.address) && !devamKaydi(seciliDugum.address) && (
                <span style={{ color: "var(--hata)" }}>son devam başarısız: {devamHatasi(seciliDugum.address)!.mesaj}</span>
              )}
            </div>
          )}
          {seciliSerit && (
            <div className="takip-secili">
              <span className="veri">
                {dugumAdi(dugumHarita.get(seciliSerit.from)!)} → {dugumAdi(dugumHarita.get(seciliSerit.to)!)}
              </span>
              <span className="m3">
                {seciliYol && seciliYol.size > 1 && `köke kadar ${sayi(seciliYol.size)} şeritlik yol öne çıktı · `}
                {SERIT_ADI[seciliSerit.tur]} · {sayi(seciliSerit.kenarlar.length)} hareket ·{" "}
                <Tutar ham={seciliSerit.ham.toString()} ondalik={model.decimals} sembol={model.varlik} />
              </span>
              <div className="takip-eylemler">
                <button type="button" className="takip-gizle" onClick={() => setGizliSerit((k) => degistir(k, seciliSerit.anahtar))}>
                  {gizliSerit.has(seciliSerit.anahtar) ? "şeridi göster" : "şeridi gizle"}
                </button>
              </div>
            </div>
          )}
          <div className="takip-defter">
            <table className="tablo takip-tablo">
              {/* Sabit kolonlar: dar panelde yatay kaydırma olmasın (kullanıcı bildirimi). */}
              <colgroup>
                <col />
                <col style={{ width: 108 }} />
                <col style={{ width: 40 }} />
                <col style={{ width: 28 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>{hareketModu ? "zaman (TSİ) · işlem" : "kimden → kime"}</th>
                  <th className="sag">{model.varlik}</th>
                  {hareketModu ? (
                    <th className="sag" title="çıkışın ize atfedilen payı">pay</th>
                  ) : (
                    <th className="sag" title="bu şeritte toplanan hareket sayısı">adet</th>
                  )}
                  <th aria-label="diyagramda göster / gizle" />
                </tr>
              </thead>
              <tbody>
                {defter.map((satir, i) => {
                  const onceki = defter[i - 1];
                  const { anahtar } = satir;
                  const yeniGrup = !onceki || onceki.hop !== satir.hop;
                  const vurgula = (seritler: Set<string> | null) => () => setDefterVurgu(seritler);
                  const hopSeritleri = yeniGrup
                    ? new Set(defter.filter((x) => x.hop === satir.hop).map((x) => x.anahtar))
                    : null;
                  const tam = (() => {
                    const p = tutarParcala(satir.ham.toString(), model.decimals);
                    return `${p.tam}${p.kusurat ? "," + p.kusurat : ""} ${model.varlik}`;
                  })();
                  return (
                    <FragmentSatir
                      key={satir.kimlik}
                      grup={yeniGrup ? `${satir.hop}. sıçrama` : null}
                      grupYanik={Boolean(hopSeritleri && defterVurgu && [...hopSeritleri].every((x) => defterVurgu.has(x)) && defterVurgu.size === hopSeritleri.size)}
                      onGrupGir={vurgula(hopSeritleri)}
                      onGrupCik={vurgula(null)}
                    >
                      <tr
                        title={
                          satir.txHash
                            ? `${tarih(satir.ilk)} TSİ · ${satir.txHash}`
                            : `${sayi(satir.adet)} hareket · ${tarih(satir.ilk)}${satir.adet > 1 ? ` – ${tarih(satir.son)}` : ""} TSİ — tıkla: hareketleri aç`
                        }
                        tabIndex={0}
                        className={
                          [
                            akisOdak?.has(anahtar) || (defterVurgu?.size === 1 && defterVurgu.has(anahtar)) ? "yanik" : "",
                            gizliSerit.has(anahtar) || gizliDugum.has(satir.from) || gizliDugum.has(satir.to) ? "gizli" : "",
                          ]
                            .filter(Boolean)
                            .join(" ") || undefined
                        }
                        onMouseEnter={vurgula(new Set([anahtar]))}
                        onMouseLeave={vurgula(null)}
                        onFocus={vurgula(new Set([anahtar]))}
                        onBlur={vurgula(null)}
                        onClick={() => setSecim({ serit: anahtar })}
                      >
                        <td>
                          <i className="takip-tur" style={{ background: SERIT_RENK[satir.tur] }} aria-label={SERIT_ADI[satir.tur]} />
                          {hareketModu ? (
                            <span className="takip-hareket">
                              <span className="veri">{tarih(satir.ilk)}</span>
                              {satir.txHash &&
                                (() => {
                                  const url = islemGezgini(kosu.chain, satir.txHash);
                                  return url ? (
                                    <a
                                      className="veri takip-hash"
                                      href={url}
                                      target="_blank"
                                      // Gezgin hangi soruşturma sayfasından gelindiğini görmesin.
                                      rel="noopener noreferrer"
                                      title={`${satir.txHash} — blok gezgininde aç`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {kisaHash(satir.txHash)} ↗
                                    </a>
                                  ) : (
                                    <span className="veri m3" title={satir.txHash}>
                                      {kisaHash(satir.txHash)}
                                    </span>
                                  );
                                })()}
                            </span>
                          ) : (
                            <span className="veri">
                              {`${dugumAdi(dugumHarita.get(satir.from)!)} → ${dugumAdi(dugumHarita.get(satir.to)!)}`}
                            </span>
                          )}
                        </td>
                        <td className="sag takip-tutar" title={tam}>
                          <Tutar ham={satir.ham.toString()} ondalik={model.decimals} />
                        </td>
                        <td className="sag veri m2">
                          {satir.pay !== null ? `%${Math.round(satir.pay * 100)}` : `×${sayi(satir.adet)}`}
                        </td>
                        <td className="takip-goz-hucre">
                          <button
                            type="button"
                            className="takip-goz"
                            aria-pressed={gizliSerit.has(anahtar)}
                            aria-label={gizliSerit.has(anahtar) ? "şeridi diyagramda göster" : "şeridi diyagramda gizle"}
                            title={gizliSerit.has(anahtar) ? "diyagramda göster" : "diyagramda gizle"}
                            onClick={(e) => {
                              e.stopPropagation();
                              setGizliSerit((kume) => degistir(kume, anahtar));
                            }}
                          >
                            <GozIsareti kapali={gizliSerit.has(anahtar)} />
                          </button>
                        </td>
                      </tr>
                    </FragmentSatir>
                  );
                })}
              </tbody>
            </table>
          </div>
        </aside>
      </div>
    </>
  );
}

function FragmentSatir({
  grup,
  grupYanik,
  onGrupGir,
  onGrupCik,
  children,
}: {
  grup: string | null;
  grupYanik: boolean;
  onGrupGir: () => void;
  onGrupCik: () => void;
  children: ReactNode;
}) {
  return (
    <>
      {grup && (
        // Sıçrama başlığı: üzerine gelmek o sıçramanın BÜTÜN şeritlerini öne çıkarır.
        <tr
          className={grupYanik ? "takip-grup yanik" : "takip-grup"}
          tabIndex={0}
          onMouseEnter={onGrupGir}
          onMouseLeave={onGrupCik}
          onFocus={onGrupGir}
          onBlur={onGrupCik}
        >
          <td colSpan={4}>{grup}</td>
        </tr>
      )}
      {children}
    </>
  );
}

function GozIsareti({ kapali }: { kapali: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="8" cy="8" r="2" fill="currentColor" />
      {kapali && <path d="M2 14 14 2" stroke="currentColor" strokeWidth="1.5" />}
    </svg>
  );
}
