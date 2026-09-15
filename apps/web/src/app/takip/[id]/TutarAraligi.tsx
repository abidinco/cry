"use client";

/**
 * Şerit toplamına göre tutar aralığı — çift kaydırıcı + elle giriş.
 *
 * Kaydırıcı LOGARİTMİK (şeritler 0,01 ile 70 Mn arasında dağılıyor), elle
 * giriş Türkçe defter düzenini ve "10b", "2,5mn" kısaltmalarını anlar. Birim
 * seçili varlığınkidir; neden öyle olduğu `lib/akis → tutarAraligiylaAyikla`.
 */

import { useEffect, useState } from "react";
import { logDeger, logKonum, tutarGirdisiniCoz } from "@/lib/akis";

const ADIM = 1000;

const goster = (n: number) =>
  n.toLocaleString("tr-TR", { maximumFractionDigits: n < 1 ? 4 : n < 1000 ? 2 : 0 });

export default function TutarAraligi({
  sinir,
  deger,
  varlik,
  disarida,
  onDegis,
}: {
  sinir: { en_az: number; en_cok: number };
  deger: { alt: number; ust: number } | null;
  varlik: string;
  /** Aralık dışında kalan şerit sayısı. */
  disarida: number;
  onDegis: (aralik: { alt: number; ust: number } | null) => void;
}) {
  const alt = deger?.alt ?? sinir.en_az;
  const ust = deger?.ust ?? sinir.en_cok;
  const [altMetin, setAltMetin] = useState(goster(alt));
  const [ustMetin, setUstMetin] = useState(goster(ust));
  const [hata, setHata] = useState<string | null>(null);

  // Kaydırıcı ya da sıfırlama değeri değiştirince kutular da güncellenir.
  useEffect(() => setAltMetin(goster(alt)), [alt]);
  useEffect(() => setUstMetin(goster(ust)), [ust]);

  const uygula = (yeniAlt: number, yeniUst: number) => {
    const a = Math.max(0, Math.min(yeniAlt, yeniUst));
    const u = Math.max(yeniAlt, yeniUst);
    // Tam sınırlara dönüldüyse filtre yok sayılır: "hepsi" ile "0,01–70 Mn" aynı şey.
    if (a <= sinir.en_az && u >= sinir.en_cok) onDegis(null);
    else onDegis({ alt: a, ust: u });
  };

  const kutudanUygula = (hangisi: "alt" | "ust", metin: string) => {
    const n = tutarGirdisiniCoz(metin);
    if (n === null) {
      setHata(`"${metin}" bir tutar değil — örnek: 10.000 · 2.500,75 · 10b · 2,5mn`);
      if (hangisi === "alt") setAltMetin(goster(alt));
      else setUstMetin(goster(ust));
      return;
    }
    setHata(null);
    if (hangisi === "alt") uygula(n, ust);
    else uygula(alt, n);
  };

  const altKonum = Math.round(logKonum(alt, sinir.en_az, sinir.en_cok) * ADIM);
  const ustKonum = Math.round(logKonum(ust, sinir.en_az, sinir.en_cok) * ADIM);

  return (
    <div className="tutar-araligi" role="group" aria-label={`şerit tutarı aralığı, ${varlik}`}>
      <span className="etiket">tutar ({varlik})</span>
      <input
        id="aralik-alt"
        className="tutar-kutu"
        inputMode="decimal"
        value={altMetin}
        aria-label="en az"
        onChange={(e) => setAltMetin(e.target.value)}
        onBlur={(e) => kutudanUygula("alt", e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && kutudanUygula("alt", e.currentTarget.value)}
      />
      <div className="cift-kaydirici">
        <div
          className="cift-kaydirici-dolu"
          style={{ left: `${(altKonum / ADIM) * 100}%`, right: `${100 - (ustKonum / ADIM) * 100}%` }}
        />
        <input
          id="aralik-alt-kaydirici"
          type="range"
          min={0}
          max={ADIM}
          value={altKonum}
          aria-label="en az (kaydırıcı)"
          onChange={(e) => uygula(logDeger(Math.min(Number(e.target.value), ustKonum) / ADIM, sinir.en_az, sinir.en_cok), ust)}
        />
        <input
          id="aralik-ust-kaydirici"
          type="range"
          min={0}
          max={ADIM}
          value={ustKonum}
          aria-label="en çok (kaydırıcı)"
          onChange={(e) => uygula(alt, logDeger(Math.max(Number(e.target.value), altKonum) / ADIM, sinir.en_az, sinir.en_cok))}
        />
      </div>
      <input
        id="aralik-ust"
        className="tutar-kutu"
        inputMode="decimal"
        value={ustMetin}
        aria-label="en çok"
        onChange={(e) => setUstMetin(e.target.value)}
        onBlur={(e) => kutudanUygula("ust", e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && kutudanUygula("ust", e.currentTarget.value)}
      />
      {deger ? (
        <>
          <span className="etiket" style={{ color: "var(--dikkat)" }}>
            {disarida} şerit aralık dışında
          </span>
          <button type="button" className="gizli-hepsi" onClick={() => onDegis(null)}>
            sıfırla
          </button>
        </>
      ) : null}
      {hata && (
        <span className="etiket" role="alert" style={{ color: "var(--hata)", flexBasis: "100%" }}>
          {hata}
        </span>
      )}
    </div>
  );
}
