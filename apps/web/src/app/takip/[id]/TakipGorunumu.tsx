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
import TakipIskeleti from "./TakipIskeleti";
import { Adres, Bos, Tarih, Tutar } from "@/components/ui";
import { kisaTutar, sayi, tarih } from "@/lib/bicim";
import { cizilecekler } from "@/lib/graf-secim";
import {
  akisModeli,
  akisOzeti,
  anaVarlik,
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
  stats: { dugum?: number; kenar?: number; durma?: Record<string, number> } | null;
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

  const { model, kirpilan } = useMemo(() => {
    if (!kosu || !secilenVarlik) return { model: null, kirpilan: 0 };
    // Rapora giren görselin okunabilir kalması için en çok 100 düğüm; seçim
    // deterministik ve BULGUYU kaybetmez (önce kök ve iz biten düğümler).
    const { secilen, kirpilan } = cizilecekler(
      kosu.dugumler.map((d) => ({ ...d, isTerminal: d.isTerminal })),
      kosu.rootAddress,
    );
    const cizilen = new Set(secilen.map((d) => d.address));
    return {
      model: akisModeli(
        kosu.dugumler.filter((d) => cizilen.has(d.address)),
        kosu.kenarlar,
        kosu.rootAddress,
        secilenVarlik,
      ),
      kirpilan,
    };
  }, [kosu, secilenVarlik]);

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
      <span className="rozet" data-ton={suruyor ? "dikkat" : kosu.stopReason === "terminal" ? "gelen" : undefined}>
        {suruyor ? "sürüyor" : (SEBEP[kosu.stopReason ?? ""] ?? kosu.stopReason ?? kosu.status)}
      </span>
    </div>
  );

  if (!model || kosu.dugumler.length === 0) {
    return (
      <>
        {baslik}
        <Bos>
          {suruyor
            ? "Koşu başladı; adresler bulundukça burada görünecek."
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
  ].reduce((a, b) => (b > a ? b : a), 1n);

  // Defter: seçime göre süzülür; sıçrama sırasıyla, zaman sırasıyla.
  const seritTuru = new Map<string, SeritTuru>();
  for (const s of model.seritler) for (const k of s.kenarlar) seritTuru.set(k.txHash + k.from + k.to, s.tur);
  const defter = kosu.kenarlar
    .filter((k) => k.symbol === model.varlik && dugumHarita.has(k.from) && dugumHarita.has(k.to))
    .filter((k) =>
      !secim
        ? true
        : secim.dugum
          ? k.from === secim.dugum || k.to === secim.dugum
          : `${k.from}>${k.to}` === secim.serit,
    );
  const secimAdi = secim?.dugum
    ? dugumAdi(dugumHarita.get(secim.dugum)!)
    : secim?.serit
      ? (() => {
          const [f, t] = secim.serit.split(">");
          return `${dugumAdi(dugumHarita.get(f!)!)} → ${dugumAdi(dugumHarita.get(t!)!)}`;
        })()
      : null;
  const seciliDugum = secim?.dugum ? dugumHarita.get(secim.dugum) : null;

  const oran = (ham: bigint) => Number((ham * 1000n) / cubukEn) / 10;

  return (
    <>
      {baslik}
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
          <Akis
            model={model}
            kokAdres={kosu.rootAddress}
            secili={secim?.dugum ?? null}
            onSecim={setSecim}
            disVurgu={defterVurgu}
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
                {ozet.kokeGeri > 0n && (
                  <button type="button" className="ozet-cubuk" onClick={() => setSecim({ dugum: kosu.rootAddress })}>
                    <span className="ozet-ad" style={{ color: "var(--akis-geri-yazi)" }}>↩ köke geri</span>
                    <span className="ozet-yol"><span style={{ width: `${oran(ozet.kokeGeri)}%`, background: "var(--akis-geri)" }} /></span>
                    <span className="veri">{kisaTutar(ozet.kokeGeri, model.decimals)}</span>
                  </button>
                )}
                {ozet.borsalar.length === 0 && ozet.adaylar.length === 0 && (
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
              {secimAdi ? `${secimAdi} · ${sayi(defter.length)} hareket` : `tüm hareketler · ${sayi(defter.length)}`}
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
                {seciliDugum.terminalReason ? (SEBEP[seciliDugum.terminalReason] ?? seciliDugum.terminalReason) : "devam edildi"}
                {seciliDugum.etiketler.length > 0 && ` · ${seciliDugum.etiketler.map((e) => e.title).join(" · ")}`}
              </span>
            </div>
          )}
          <div className="takip-defter">
            <table className="tablo takip-tablo">
              <thead>
                <tr>
                  <th>kimden → kime</th>
                  <th className="sag">{model.varlik}</th>
                  <th className="sag" title="çıkışın ize atfedilen payı">pay</th>
                </tr>
              </thead>
              <tbody>
                {defter.map((k, i) => {
                  const onceki = defter[i - 1];
                  const tur = seritTuru.get(k.txHash + k.from + k.to) ?? "akis";
                  const anahtar = `${k.from}>${k.to}`;
                  const yeniGrup = !onceki || onceki.hop !== k.hop;
                  const vurgula = (seritler: Set<string> | null) => () => setDefterVurgu(seritler);
                  const hopSeritleri = yeniGrup
                    ? new Set(defter.filter((x) => x.hop === k.hop).map((x) => `${x.from}>${x.to}`))
                    : null;
                  return (
                    <FragmentSatir
                      key={k.txHash + k.from + k.to + i}
                      grup={yeniGrup ? `${k.hop}. sıçrama` : null}
                      grupYanik={Boolean(hopSeritleri && defterVurgu && [...hopSeritleri].every((x) => defterVurgu.has(x)) && defterVurgu.size === hopSeritleri.size)}
                      onGrupGir={vurgula(hopSeritleri)}
                      onGrupCik={vurgula(null)}
                    >
                      <tr
                        title={`${tarih(k.ts)} TSİ · ${k.txHash}`}
                        tabIndex={0}
                        className={akisOdak?.has(anahtar) || (defterVurgu?.size === 1 && defterVurgu.has(anahtar)) ? "yanik" : undefined}
                        onMouseEnter={vurgula(new Set([anahtar]))}
                        onMouseLeave={vurgula(null)}
                        onFocus={vurgula(new Set([anahtar]))}
                        onBlur={vurgula(null)}
                        onClick={() => setSecim({ serit: anahtar })}
                      >
                        <td>
                          <i className="takip-tur" style={{ background: SERIT_RENK[tur] }} aria-label={SERIT_ADI[tur]} />
                          <span className="veri">
                            {dugumAdi(dugumHarita.get(k.from)!)} → {dugumAdi(dugumHarita.get(k.to)!)}
                          </span>
                        </td>
                        <td className="sag">
                          <Tutar ham={k.amountRaw} ondalik={k.decimals} />
                        </td>
                        <td className="sag veri m2">%{Math.round(k.taintShare * 100)}</td>
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
          <td colSpan={3}>{grup}</td>
        </tr>
      )}
      {children}
    </>
  );
}
