"use client";

/**
 * Takip grafı — Cytoscape.js + dagre.
 *
 * Düzen HİYERARŞİK ve soldan sağa (kullanıcı kararı 2026-09-09). Gerekçe
 * estetik değil YENİDEN ÜRETİLEBİLİRLİK: kuvvet tabanlı düzende yerleşim
 * her açılışta değişir, yani aynı koşu iki farklı resim verir ve rapora
 * giren bir görselde bu savunulamaz. Hop zaten bir SIRADIR; hiyerarşi o
 * sırayı görselleştirir.
 *
 * Renk kanalı burada TEK BİR ŞEY anlatıyor: düğümün DURUMU (iz burada
 * bitti mi, biz mi durduk, bakılamadı mı). Yön rengi kullanılmaz — yönü
 * okun kendisi zaten söylüyor.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import dagre from "cytoscape-dagre";

import {
  CIZIM_SINIRI,
  cizilecekler,
  dugumEtiketi,
  dugumSinifi,
  type GrafDugumu,
  type GrafKenari,
} from "@/lib/graf-secim";

export type { GrafDugumu, GrafKenari };

let dagreKuruldu = false;

export default function Graf({
  dugumler,
  kenarlar,
  kokAdres,
  onSecim,
}: {
  dugumler: GrafDugumu[];
  kenarlar: GrafKenari[];
  kokAdres: string;
  onSecim?: (adres: string | null) => void;
}) {
  const kutu = useRef<HTMLDivElement>(null);
  const [hazir, setHazir] = useState(false);

  const { elemanlar, kirpilanDugum, kirpilanKenar } = useMemo(() => {
    const { secilen, kirpilan } = cizilecekler(dugumler, kokAdres);
    const cizilen = new Set(secilen.map((d) => d.address));

    const dugumElemanlari: ElementDefinition[] = secilen.map((d) => ({
      data: { id: d.address, label: dugumEtiketi(d), hop: d.hop },
      classes: dugumSinifi(d, kokAdres),
    }));

    // Ucu çizilmeyen kenar çizilmez — ama SAYILIR.
    const tutulan = kenarlar.filter((k) => cizilen.has(k.from) && cizilen.has(k.to));
    const teklestirilmis = new Map<string, GrafKenari>();
    for (const k of tutulan) {
      const anahtar = `${k.from}->${k.to}`;
      const mevcut = teklestirilmis.get(anahtar);
      // Aynı çift arasında birden çok hareket olabilir; graf bunları TEK ok
      // gösterir ve payın en büyüğünü taşır — kalabalık bir yumak okunmayan
      // bir resimdir. Hareketlerin tamamı aşağıdaki tablolarda duruyor.
      if (!mevcut || k.taintShare > mevcut.taintShare) teklestirilmis.set(anahtar, k);
    }

    const kenarElemanlari: ElementDefinition[] = [...teklestirilmis].map(([id, k]) => ({
      data: {
        id,
        source: k.from,
        target: k.to,
        pay: Math.round(k.taintShare * 100),
        genislik: 1 + Math.min(4, k.taintShare * 4),
      },
    }));

    return {
      elemanlar: [...dugumElemanlari, ...kenarElemanlari],
      kirpilanDugum: kirpilan,
      kirpilanKenar: kenarlar.length - tutulan.length,
    };
  }, [dugumler, kenarlar, kokAdres]);

  useEffect(() => {
    if (!kutu.current) return;
    if (!dagreKuruldu) {
      cytoscape.use(dagre);
      dagreKuruldu = true;
    }

    const oku = (ad: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(ad).trim();

    const cy: Core = cytoscape({
      container: kutu.current,
      elements: elemanlar,
      // Kullanıcı kaydırıp yakınlaştırabilir ama düğümü SÜRÜKLEYEMEZ:
      // yerleşimin elle bozulması, aynı koşunun iki farklı resmi demek.
      autoungrabify: true,
      wheelSensitivity: 0.2,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "text-wrap": "wrap",
            "text-valign": "center",
            "text-halign": "center",
            "font-size": 9,
            color: oku("--m1"),
            shape: "round-rectangle",
            width: 96,
            height: 34,
            "background-color": oku("--yuzey-2"),
            "border-width": 1,
            "border-color": oku("--cizgi"),
          },
        },
        { selector: "node.kok", style: { "border-color": oku("--vurgu"), "border-width": 2 } },
        { selector: "node.terminal", style: { "border-color": oku("--gelen"), "border-width": 2 } },
        {
          selector: "node.terminal_aday",
          style: {
            "border-color": oku("--kok-supheli"),
            "border-width": 2,
            "border-style": "dashed",
          },
        },
        {
          selector: "node.bakilamadi",
          style: { "border-color": oku("--kok-yok"), "border-style": "dotted", color: oku("--m3") },
        },
        { selector: "node.kontrat", style: { shape: "hexagon", width: 100 } },
        {
          selector: "node.bizim_sinirimiz",
          style: { "border-color": oku("--cizgi"), "border-style": "dashed", color: oku("--m2") },
        },
        {
          selector: "edge",
          style: {
            width: "data(genislik)",
            "line-color": oku("--cizgi"),
            "target-arrow-color": oku("--cizgi"),
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.8,
            "curve-style": "bezier",
            opacity: 0.85,
          },
        },
        {
          selector: "node:selected",
          style: { "background-color": oku("--yuzey"), "border-color": oku("--vurgu-2") },
        },
      ],
      layout: {
        name: "dagre",
        rankDir: "LR",
        nodeSep: 14,
        rankSep: 90,
        // Rastgelelik yok: aynı girdi aynı yerleşimi verir.
        animate: false,
        fit: true,
        padding: 16,
      } as cytoscape.LayoutOptions,
    });

    cy.on("tap", "node", (o) => onSecim?.(o.target.id()));
    cy.on("tap", (o) => {
      if (o.target === cy) onSecim?.(null);
    });

    setHazir(true);
    return () => {
      cy.destroy();
    };
  }, [elemanlar, onSecim]);

  return (
    <div>
      <div
        ref={kutu}
        style={{
          height: 460,
          background: "var(--zemin)",
          border: "1px solid var(--cizgi-2)",
          borderRadius: "var(--kose)",
        }}
      />
      <div className="etiket" style={{ marginTop: 6, display: "flex", gap: 14, flexWrap: "wrap" }}>
        <Aciklama renk="var(--vurgu)" metin="kök" />
        <Aciklama renk="var(--gelen)" metin="borsa (doğrulanmış)" />
        <Aciklama renk="var(--kok-supheli)" metin="borsa adayı (doğrulanmamış)" kesik />
        <Aciklama renk="var(--cizgi)" metin="bizim sınırımız (bütçe/dallanma)" kesik />
        <Aciklama renk="var(--kok-yok)" metin="taranamadı" kesik />
      </div>
      {(kirpilanDugum > 0 || kirpilanKenar > 0) && (
        // Kırpılan kısım SESSİZCE yok sayılmaz: neyi görmediğin yazar.
        <p className="etiket" style={{ marginTop: 6, color: "var(--dikkat)" }}>
          çizilmeyen: {kirpilanDugum} düğüm, {kirpilanKenar} kenar — graf ilk {CIZIM_SINIRI} düğümü
          gösteriyor (önce kök ve iz biten düğümler). Tamamı aşağıdaki tablolarda.
        </p>
      )}
      {!hazir && <p className="etiket">graf çiziliyor</p>}
    </div>
  );
}

function Aciklama({ renk, metin, kesik }: { renk: string; metin: string; kesik?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span
        style={{
          width: 14,
          height: 10,
          borderWidth: 1,
          borderStyle: kesik ? "dashed" : "solid",
          borderColor: renk,
          background: "var(--yuzey-2)",
          borderRadius: 2,
        }}
      />
      {metin}
    </span>
  );
}
