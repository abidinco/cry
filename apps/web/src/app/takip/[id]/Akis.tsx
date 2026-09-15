"use client";

/**
 * Takip akışı — sankey benzeri SVG (kullanıcı kararı 2026-09-14, seçenek A).
 *
 * Renk kanalı ŞERİDİN ne olduğunu anlatır (borsaya giriş · adaya giriş ·
 * geri dönüş · ileri akış); düğümün durumu ise kutunun DOKUSU ve etiketidir
 * (doğrulanmış borsa düz ve ✓, aday taralı ve ?, bizim sınırımız kesik
 * çerçeve). Renk tek başına hiçbir şey anlatmaz — renk körlüğü ve baskı için.
 *
 * Kalınlık tutarla orantılı ve TEK varlığın ölçeğinde. Yerleşimin kendisi
 * `lib/akis.ts`'te, saf ve testli; bu dosya yalnızca çizer ve dinler.
 */

import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import {
  GORUNUM_SIFIR,
  VARSAYILAN_YERLESIM,
  yakinlastir,
  yerlesim,
  type Gorunum,
  type AkisModeli,
  type ModelDugumu,
  type Serit,
  type SeritTuru,
} from "@/lib/akis";
import { kisaAdres, kisaTutar, tarih, tutarParcala } from "@/lib/bicim";

export const SERIT_RENK: Record<SeritTuru, string> = {
  borsa: "var(--akis-borsa)",
  aday: "var(--akis-aday)",
  geri: "var(--akis-geri)",
  akis: "var(--akis-ileri)",
};

export const SERIT_ADI: Record<SeritTuru, string> = {
  borsa: "doğrulanmış borsaya giriş",
  aday: "borsa adayına giriş",
  geri: "önceki bir adrese dönüş",
  akis: "ileri akış",
};

const DURUM_ADI: Record<ModelDugumu["tur"], string> = {
  kok: "kök",
  borsa: "doğrulanmış borsa — iz burada tamamlandı",
  aday: "borsa adayı — etiket doğrulanmamış",
  yakildi: "yakma adresi — para yok edildi, iz burada biter",
  sinir: "bizim sınırımız — iz bitmedi",
  taranamadi: "taranamadı — veri yok",
  ara: "ara adres",
};

export function dugumAdi(d: ModelDugumu): string {
  if (d.tur === "kok") return "kök";
  if (d.borsa) return `${d.borsa} ✓`;
  if (d.tur === "aday") return "borsa adayı ?";
  if (d.tur === "yakildi") return "yakıldı ✕";
  return kisaAdres(d.address, 6, 4);
}

type Ipucu = { x: number; y: number; icerik: ReactNode } | null;

export default function Akis({
  model,
  kokAdres,
  secili,
  onSecim,
  disVurgu,
  seciliYol,
  onOdak,
}: {
  model: AkisModeli;
  kokAdres: string;
  secili: string | null;
  onSecim: (secim: { dugum?: string; serit?: string } | null) => void;
  /** Dışarıdan (defterden) öne çıkarılan şeritler. */
  disVurgu?: Set<string> | null;
  /** Tıklanan şerit ve köke kadar geldiği yol. */
  seciliYol?: Set<string> | null;
  /** Diyagramda odaklanan şeritler — defter kendi satırlarını yakar. */
  onOdak?: (seritler: Set<string> | null) => void;
}) {
  const kutu = useRef<HTMLDivElement>(null);
  const [boyut, setBoyut] = useState<{ g: number; y: number } | null>(null);
  const [odak, setOdak] = useState<{ dugum?: string; serit?: string } | null>(null);
  const [ipucu, setIpucu] = useState<Ipucu>(null);
  // Kaydırma ve yakınlaştırma (kullanıcı isteği 2026-09-15): büyüyen koşuda
  // sütunlar sıkışıyor. Yerleşim DEĞİŞMEZ — yalnızca bakış açısı değişir,
  // o yüzden aynı koşu yine aynı resmi verir.
  const [gorunum, setGorunum] = useState<Gorunum>(GORUNUM_SIFIR);
  const surukleme = useRef<{ px: number; py: number; x: number; y: number; hareket: boolean; id: number } | null>(null);
  /** Sürükleme bitti mi? Bitince gelen `click` bir SEÇİM değildir. */
  const surukledi = useRef(false);
  const [suruklemede, setSuruklemede] = useState(false);

  // Tekerlek: imlecin altındaki nokta sabit kalarak yakınlaştırır. React'in
  // onWheel'i pasif bağlandığı için sayfa kaymasını engelleyemez; dinleyici elle.
  useEffect(() => {
    const el = kutu.current;
    if (!el) return;
    const tekerlek = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      // Dokunmatik yüzeyde iki parmakla yatay kaydırma: yakınlaştırma değil kaydırma.
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        setGorunum((g) => ({ ...g, x: g.x - e.deltaX }));
        return;
      }
      const carpan = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      setGorunum((g) => yakinlastir(g, e.clientX - r.left, e.clientY - r.top, carpan));
    };
    el.addEventListener("wheel", tekerlek, { passive: false });
    return () => el.removeEventListener("wheel", tekerlek);
  }, []);

  const seciminiYap = (secim: { dugum?: string; serit?: string } | null) => {
    if (surukledi.current) return;
    onSecim(secim);
  };
  const ortadanYakinlastir = (carpan: number) =>
    setGorunum((g) => yakinlastir(g, (boyut?.g ?? 0) / 2, (boyut?.y ?? 0) / 2, carpan));

  useEffect(() => {
    const el = kutu.current;
    if (!el) return;
    const olc = () => {
      const g = Math.round(el.clientWidth);
      const y = Math.round(el.clientHeight);
      // Aynı ölçüye yeniden set edilmez: ResizeObserver kendi çizimini tetikleyip salınmasın.
      setBoyut((o) => (o && o.g === g && o.y === y ? o : { g, y }));
    };
    olc();
    const g = new ResizeObserver(olc);
    g.observe(el);
    return () => g.disconnect();
  }, []);

  const L = useMemo(
    () =>
      boyut && boyut.g > 200 && boyut.y > 150
        ? yerlesim(model, { ...VARSAYILAN_YERLESIM, genislik: boyut.g, yukseklik: boyut.y })
        : null,
    [model, boyut],
  );

  const dugumler = useMemo(() => new Map(model.dugumler.map((d) => [d.address, d])), [model]);
  const enBuyuk = Math.max(0, ...model.dugumler.map((d) => d.deger));

  /**
   * Neyin öne çıktığı, öncelik sırasıyla: diyagramın kendi imleci, defterden
   * gelen vurgu, seçili adres. Hiçbiri yoksa her şey tam görünür.
   */
  const disAktif = !odak && disVurgu && disVurgu.size > 0 ? disVurgu : null;
  const bagli = (s: Serit): boolean => {
    if (odak?.serit) return odak.serit === s.anahtar;
    if (odak?.dugum) return s.from === odak.dugum || s.to === odak.dugum;
    if (disAktif) return disAktif.has(s.anahtar);
    if (seciliYol && seciliYol.size > 0) return seciliYol.has(s.anahtar);
    if (secili) return s.from === secili || s.to === secili;
    return true;
  };
  const herhangiAktif = Boolean(odak || disAktif || secili || (seciliYol && seciliYol.size > 0));
  const merkez = odak?.dugum ?? (disAktif || seciliYol?.size ? null : secili);
  const dugumBagli = (adres: string) =>
    !herhangiAktif ||
    adres === merkez ||
    model.seritler.some((s) => bagli(s) && (s.from === adres || s.to === adres));

  useEffect(() => {
    if (!onOdak) return;
    if (!odak) return onOdak(null);
    onOdak(
      new Set(
        model.seritler
          .filter((s) => (odak.serit ? s.anahtar === odak.serit : s.from === odak.dugum || s.to === odak.dugum))
          .map((s) => s.anahtar),
      ),
    );
  }, [odak, model, onOdak]);

  const tutarMetni = (ham: bigint) => {
    const p = tutarParcala(ham.toString(), model.decimals);
    return `${p.tam}${p.kusurat ? "," + p.kusurat : ""} ${model.varlik}`;
  };

  const goster = (e: PointerEvent, icerik: ReactNode) => {
    const r = kutu.current!.getBoundingClientRect();
    setIpucu({ x: e.clientX - r.left, y: e.clientY - r.top, icerik });
  };

  const hopSay = Math.max(0, ...model.dugumler.map((d) => d.hop));

  return (
    <div ref={kutu} className="akis-kutu" onPointerLeave={() => setIpucu(null)}>
      {L && boyut && (
        <svg
          className="akis-svg"
          width={boyut.g}
          height={boyut.y}
          viewBox={`0 0 ${boyut.g} ${boyut.y}`}
          role="img"
          aria-label={`Para akışı: ${hopSay} sıçrama, şerit kalınlığı ${model.varlik} tutarıyla orantılı`}
          data-surukleniyor={suruklemede ? "evet" : undefined}
          onClick={(e) => {
            if (e.target === e.currentTarget) seciminiYap(null);
          }}
          onDoubleClick={(e) => {
            const r = kutu.current!.getBoundingClientRect();
            setGorunum((g) => yakinlastir(g, e.clientX - r.left, e.clientY - r.top, 1.8));
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            surukleme.current = { px: e.clientX, py: e.clientY, x: gorunum.x, y: gorunum.y, hareket: false, id: e.pointerId };
          }}
          onPointerMove={(e) => {
            const sr = surukleme.current;
            if (!sr) return;
            const dx = e.clientX - sr.px;
            const dy = e.clientY - sr.py;
            // Birkaç piksellik titreme sürükleme sayılmaz: tıklama seçim olarak kalır.
            if (!sr.hareket && Math.hypot(dx, dy) < 4) return;
            if (!sr.hareket) {
              sr.hareket = true;
              setSuruklemede(true);
              try {
                (e.currentTarget as Element).setPointerCapture(sr.id);
              } catch {
                // İşaretçi zaten bırakılmışsa yakalama gerekmez.
              }
              setIpucu(null);
            }
            setGorunum((g) => ({ ...g, x: sr.x + dx, y: sr.y + dy }));
          }}
          onPointerUp={() => {
            if (surukleme.current?.hareket) {
              surukledi.current = true;
              // Aynı tikte gelen click'i yut, sonra normale dön.
              setTimeout(() => (surukledi.current = false), 0);
            }
            surukleme.current = null;
            setSuruklemede(false);
          }}
          onPointerCancel={() => {
            surukleme.current = null;
            setSuruklemede(false);
          }}
        >
          <defs>
            <pattern id="akis-tarama" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" style={{ fill: "var(--akis-aday-zemin)" }} />
              <rect width="2.2" height="6" style={{ fill: "var(--akis-aday)" }} />
            </pattern>
            <pattern id="akis-yakma" width="6" height="6" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" style={{ fill: "var(--zemin)" }} />
              <path d="M0,0 L6,6 M6,0 L0,6" style={{ stroke: "var(--m2)", strokeWidth: 1 }} />
            </pattern>
            {(Object.keys(SERIT_RENK) as SeritTuru[]).map((t) => (
              <marker key={t} id={`akis-ok-${t}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" style={{ fill: SERIT_RENK[t] }} />
              </marker>
            ))}
          </defs>
          <g transform={`translate(${gorunum.x},${gorunum.y}) scale(${gorunum.k})`}>

          {L.kolonX.map((x, i) => (
            <text key={i} x={x} y={14} className="akis-kolon">
              {i === 0 ? "kök" : `${i}. sıçrama`}
            </text>
          ))}
          {L.geriSeritY !== null && (
            <text x={L.kolonX[0]} y={L.geriSeritY} className="akis-kolon" style={{ fill: "var(--akis-geri)" }}>
              ↩ önceki adrese dönen para — diyagramın altından
            </text>
          )}

          {/* Büyük şeritler önce: küçükler üstte kalıp görünsün. */}
          {[...model.seritler]
            .sort((a, b) => b.deger - a.deger || a.anahtar.localeCompare(b.anahtar))
            .map((s) => {
              const y = L.yollar.get(s.anahtar);
              if (!y) return null;
              const acik = bagli(s);
              const icerik = (
                <>
                  <div className="akis-ipucu-baslik">
                    {s.geri ? "↩ " : ""}
                    {dugumAdi(dugumler.get(s.from)!)} → {dugumAdi(dugumler.get(s.to)!)}
                  </div>
                  <dl>
                    <dt>toplam</dt>
                    <dd className="veri">{tutarMetni(s.ham)}</dd>
                    <dt>hareket</dt>
                    <dd className="veri">{s.kenarlar.length}</dd>
                    {(() => {
                      // Ekranda TSİ (docs/arayuz.md → Sayı ve tarih).
                      const zamanlar = s.kenarlar.map((k) => k.ts).sort();
                      const ilk = zamanlar[0]!;
                      const son = zamanlar[zamanlar.length - 1]!;
                      return ilk === son ? (
                        <>
                          <dt>zaman</dt>
                          <dd className="veri">{tarih(ilk)}</dd>
                        </>
                      ) : (
                        <>
                          <dt>ilk</dt>
                          <dd className="veri">{tarih(ilk)}</dd>
                          <dt>son</dt>
                          <dd className="veri">{tarih(son)}</dd>
                        </>
                      );
                    })()}
                    <dt>tür</dt>
                    <dd>{SERIT_ADI[s.tur]}</dd>
                  </dl>
                </>
              );
              return (
                <g key={s.anahtar}>
                  {s.geri && (
                    // Koyu kenar: iki pembe şerit kesişince hangisinin üstte
                    // olduğu okunur (kullanıcı bildirimi: "üst üste biniyor").
                    <path
                      d={y.d}
                      fill="none"
                      style={{
                        stroke: "var(--zemin)",
                        strokeWidth: y.kalinlik + 3,
                        strokeOpacity: acik ? 0.9 : 0.07,
                      }}
                    />
                  )}
                  <path
                    d={y.d}
                    fill="none"
                    markerEnd={s.geri || s.tur !== "akis" ? `url(#akis-ok-${s.tur})` : undefined}
                    style={{
                      stroke: SERIT_RENK[s.tur],
                      strokeWidth: y.kalinlik,
                      strokeOpacity: acik ? (s.tur === "akis" ? 0.55 : 0.85) : 0.07,
                      transition: "stroke-opacity 120ms",
                    }}
                  />
                  {s.geri && y.etiket && acik && (
                    <text x={y.etiket.x} y={y.etiket.y - y.kalinlik / 2 - 3} className="akis-geri-etiket" textAnchor="middle">
                      ↩ {dugumAdi(dugumler.get(s.from)!)} → {dugumAdi(dugumler.get(s.to)!)} · {kisaTutar(s.ham, model.decimals)}
                    </text>
                  )}
                  <path
                    d={y.d}
                    fill="none"
                    className="akis-isabet"
                    style={{ strokeWidth: Math.max(10, y.kalinlik + 6) }}
                    onPointerEnter={(e) => {
                      setOdak({ serit: s.anahtar });
                      goster(e, icerik);
                    }}
                    onPointerMove={(e) => goster(e, icerik)}
                    onPointerLeave={() => {
                      setOdak(null);
                      setIpucu(null);
                    }}
                    onClick={() => seciminiYap({ serit: s.anahtar })}
                  />
                </g>
              );
            })}

          {(() => {
            // Etiketler çakışmasın: aynı sütunda bir öncekine 24 pikselden yakınsa
            // önemsiz düğümün etiketi atlanır (ipucunda duruyor).
            const sonY = new Map<number, number>();
            return [...model.dugumler]
              .sort((a, b) => a.hop - b.hop || L.kutular.get(a.address)!.orta - L.kutular.get(b.address)!.orta)
              .map((d) => {
                const k = L.kutular.get(d.address)!;
                const onemli = d.tur === "kok" || d.tur === "borsa" || d.tur === "aday" || d.tur === "yakildi";
                const buyuk = d.deger >= enBuyuk * 0.02;
                const onceki = sonY.get(d.hop) ?? -Infinity;
                const etiketli = (onemli || buyuk) && (onemli || k.orta - onceki >= 24);
                if (etiketli) sonY.set(d.hop, k.orta);
                const acik = dugumBagli(d.address);
                const sinirli = d.tur === "sinir" || d.tur === "taranamadi";
                const icerik = (
                  <>
                    <div className="akis-ipucu-baslik">{dugumAdi(d)}</div>
                    <div className="veri m3" style={{ wordBreak: "break-all", marginBottom: 6 }}>
                      {d.address}
                    </div>
                    <dl>
                      <dt>durum</dt>
                      <dd>{DURUM_ADI[d.tur]}</dd>
                      {d.etiketler[0] && (
                        <>
                          <dt>etiket</dt>
                          <dd>{d.etiketler.map((e) => e.title).join(" · ")}</dd>
                        </>
                      )}
                      <dt>giren</dt>
                      <dd className="veri">{tutarMetni(d.giren)}</dd>
                      <dt>çıkan</dt>
                      <dd className="veri">{tutarMetni(d.cikan)}</dd>
                    </dl>
                  </>
                );
                return (
                  <g
                    key={d.address}
                    className="akis-dugum"
                    tabIndex={0}
                    role="button"
                    aria-label={`${dugumAdi(d)} ${d.address}: ${DURUM_ADI[d.tur]}`}
                    aria-pressed={secili === d.address}
                    style={{ opacity: acik ? 1 : 0.35 }}
                    onPointerEnter={(e) => {
                      setOdak({ dugum: d.address });
                      goster(e, icerik);
                    }}
                    onPointerMove={(e) => goster(e, icerik)}
                    onPointerLeave={() => {
                      setOdak(null);
                      setIpucu(null);
                    }}
                    onClick={() => seciminiYap({ dugum: d.address })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSecim({ dugum: d.address });
                      }
                    }}
                  >
                    <rect
                      x={k.x}
                      y={k.y}
                      width={k.g}
                      height={Math.max(3, k.h)}
                      rx={1.5}
                      style={{
                        fill:
                          d.tur === "yakildi"
                            ? "url(#akis-yakma)"
                            : d.tur === "aday"
                            ? "url(#akis-tarama)"
                            : d.tur === "borsa"
                              ? "var(--akis-borsa)"
                              : d.tur === "kok"
                                ? "var(--vurgu)"
                                : sinirli
                                  ? "var(--yuzey-2)"
                                  : "var(--akis-dugum)",
                        stroke: secili === d.address ? "var(--m1)" : d.tur === "yakildi" ? "var(--m2)" : sinirli ? "var(--m3)" : "none",
                        strokeDasharray: sinirli && secili !== d.address ? "2 2" : undefined,
                        strokeWidth: 1,
                      }}
                    />
                    {etiketli && (
                      <>
                        <text
                          x={k.x + k.g + 6}
                          y={k.orta - 1}
                          className="akis-ad"
                          style={{
                            fill: d.tur === "borsa" ? "var(--akis-borsa-yazi)" : d.tur === "aday" ? "var(--akis-aday-yazi)" : "var(--m1)",
                            fontWeight: d.tur === "borsa" || d.tur === "aday" || d.tur === "yakildi" ? 600 : 400,
                          }}
                        >
                          {dugumAdi(d)}
                        </text>
                        <text x={k.x + k.g + 6} y={k.orta + 12} className="akis-tutar">
                          {kisaTutar(d.giren > d.cikan ? d.giren : d.cikan, model.decimals)}
                        </text>
                      </>
                    )}
                  </g>
                );
              });
          })()}
          </g>
        </svg>
      )}
      <div className="akis-yakinlik" role="group" aria-label="görünüm">
        <button type="button" onClick={() => ortadanYakinlastir(1.4)} aria-label="yakınlaştır" title="yakınlaştır (tekerlek / çift tık)">
          +
        </button>
        <button type="button" onClick={() => ortadanYakinlastir(1 / 1.4)} aria-label="uzaklaştır" title="uzaklaştır">
          −
        </button>
        <button
          type="button"
          onClick={() => setGorunum(GORUNUM_SIFIR)}
          aria-label="sığdır"
          title="tamamını göster"
          disabled={gorunum.k === 1 && gorunum.x === 0 && gorunum.y === 0}
        >
          sığdır
        </button>
        <span className="veri m3" aria-live="polite">%{Math.round(gorunum.k * 100)}</span>
      </div>
      {ipucu && (
        <div
          className="akis-ipucu"
          style={{
            left: Math.min(ipucu.x + 14, (boyut?.g ?? 0) - 300),
            top: ipucu.y + 14 > (boyut?.y ?? 0) - 150 ? ipucu.y - 150 : ipucu.y + 14,
          }}
        >
          {ipucu.icerik}
        </div>
      )}
    </div>
  );
}
