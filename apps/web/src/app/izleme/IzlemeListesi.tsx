"use client";

/**
 * İzleme listesi — adres ekleme, eşik düzenleme, pasife çekme.
 *
 * Eşik metni SUNUCUDA doğrulanır (`lib/izleme.ts`) ve hatalı değer sessizce
 * varsayılana DÜŞMEZ: ekran hatayı satırın üstünde gösterir. "1.000 yazdım ama
 * 1 ile filtrelendi" diye bir hâl olmamalı.
 */
import { useState } from "react";
import { adresGezgini } from "@/lib/gezgin";

export type Esik = { assetSymbol: string; minAmount: string };
export type TakipSatiri = {
  id: number;
  chain: string;
  address: string;
  label: string | null;
  active: boolean;
  lastCheckedAt: string | null;
  thresholds: Esik[];
  uyariSayisi: number;
  sonUyari: {
    ts: string;
    assetSymbol: string | null;
    amountRaw: string | null;
    path: string | null;
    reason: string | null;
  } | null;
};

/** Eşik listesini tek satırlık metne çevir: `USDT=1000 · *=1`. */
function esikMetni(esikler: Esik[]): string {
  return esikler.map((e) => `${e.assetSymbol}=${e.minAmount}`).join(" · ");
}

/** `USDT=1000, *=1` metnini eşik listesine çevir. Hatalı parça SESSİZCE atılmaz. */
function esikAyristir(metin: string): { esikler: Esik[] } | { hata: string } {
  const parcalar = metin
    .split(/[,\n·]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const esikler: Esik[] = [];
  for (const p of parcalar) {
    const yer = p.lastIndexOf("=");
    if (yer <= 0) return { hata: `"${p}" — biçim <varlık>=<tutar> olmalı (ör. USDT=1000)` };
    esikler.push({
      assetSymbol: p.slice(0, yer).trim(),
      minAmount: p.slice(yer + 1).trim(),
    });
  }
  return { esikler };
}

export default function IzlemeListesi({ satirlar }: { satirlar: TakipSatiri[] }) {
  const [adres, setAdres] = useState("");
  const [ad, setAd] = useState("");
  const [yeniEsik, setYeniEsik] = useState("USDT=1000, *=1");
  const [hata, setHata] = useState<string | null>(null);
  const [calisan, setCalisan] = useState(false);

  async function ekle() {
    setHata(null);
    const ayrisan = esikAyristir(yeniEsik);
    if ("hata" in ayrisan) {
      setHata(ayrisan.hata);
      return;
    }
    setCalisan(true);
    try {
      const y = await fetch("/api/izleme", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chain: "tron",
          address: adres.trim(),
          label: ad.trim() || undefined,
          thresholds: ayrisan.esikler,
        }),
      });
      const govde = (await y.json()) as { error?: string };
      if (!y.ok) {
        setHata(govde.error ?? `HTTP ${y.status}`);
        return;
      }
      window.location.reload();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setCalisan(false);
    }
  }

  async function esikDuzenle(s: TakipSatiri) {
    const girdi = window.prompt(
      `Eşikler — <varlık>=<tutar>, virgülle ayrılır. ' * ' bütün varlıklar için varsayılandır.\n` +
        `Boş bırakmak eşiği KALDIRIR: o adreste her hareket mesaj olur.`,
      esikMetni(s.thresholds),
    );
    if (girdi === null) return;
    const ayrisan = esikAyristir(girdi);
    if ("hata" in ayrisan) {
      setHata(ayrisan.hata);
      return;
    }
    await yama(s.id, { thresholds: ayrisan.esikler });
  }

  async function yama(id: number, govde: Record<string, unknown>) {
    setHata(null);
    setCalisan(true);
    try {
      const y = await fetch(`/api/izleme/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(govde),
      });
      if (!y.ok) {
        const c = (await y.json()) as { error?: string };
        setHata(c.error ?? `HTTP ${y.status}`);
        return;
      }
      window.location.reload();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setCalisan(false);
    }
  }

  async function kaldir(s: TakipSatiri) {
    if (!window.confirm(`${s.address} izlemeden ÇIKARILSIN mı? Uyarı geçmişi de silinir.`)) return;
    setCalisan(true);
    try {
      const y = await fetch(`/api/izleme/${s.id}`, { method: "DELETE" });
      if (!y.ok) {
        const c = (await y.json()) as { error?: string };
        setHata(c.error ?? `HTTP ${y.status}`);
        return;
      }
      window.location.reload();
    } finally {
      setCalisan(false);
    }
  }

  return (
    <>
      <section className="panel" style={{ marginTop: 12 }}>
        <h2 style={{ fontSize: 14 }}>Adres ekle</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <input
            value={adres}
            onChange={(e) => setAdres(e.target.value)}
            placeholder="TRON adresi (T…)"
            className="veri"
            style={{ flex: "2 1 320px" }}
          />
          <input
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            placeholder="etiket (isteğe bağlı)"
            style={{ flex: "1 1 160px" }}
          />
          <input
            value={yeniEsik}
            onChange={(e) => setYeniEsik(e.target.value)}
            placeholder="USDT=1000, *=1"
            className="veri"
            style={{ flex: "1 1 200px" }}
          />
          <button onClick={ekle} disabled={calisan || !adres.trim()}>
            ekle
          </button>
        </div>
        <p className="etiket m3" style={{ marginTop: 6 }}>
          Eşik, varlığın GÖSTERİM biriminde yazılır (1000 USDT, 0,5 TRX). Varlığa özel eşik{" "}
          <span className="veri">*</span> varsayılanını ezer.
        </p>
        {hata && (
          <p className="veri" style={{ color: "var(--hata, #c0392b)", marginTop: 8 }}>
            {hata}
          </p>
        )}
      </section>

      <section className="panel" style={{ marginTop: 12 }}>
        {satirlar.length === 0 ? (
          <p className="m2">
            İzlenen adres yok — servis dönüyor olsa da <b>bakacağı bir şey yok</b>.
          </p>
        ) : (
          satirlar.map((s, i) => (
            <article
              key={s.id}
              style={{
                padding: "12px 0",
                borderTop: i === 0 ? "none" : "1px solid var(--cizgi)",
                opacity: s.active ? 1 : 0.55,
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <a className="veri" href={adresGezgini(s.chain, s.address) ?? `/adres/${s.chain}/${s.address}`}>
                  {s.address}
                </a>
                {s.label && <span className="etiket">{s.label}</span>}
                {!s.active && <span className="etiket m3">pasif</span>}
                <span style={{ flex: 1 }} />
                <button onClick={() => esikDuzenle(s)} disabled={calisan}>
                  eşik
                </button>
                <button onClick={() => yama(s.id, { active: !s.active })} disabled={calisan}>
                  {s.active ? "pasife çek" : "aktif et"}
                </button>
                <button onClick={() => kaldir(s)} disabled={calisan}>
                  kaldır
                </button>
              </div>
              <p className="veri m2" style={{ fontSize: 12, marginTop: 4 }}>
                {s.thresholds.length > 0 ? (
                  `eşik: ${esikMetni(s.thresholds)}`
                ) : (
                  <span style={{ color: "var(--uyari, #b8860b)" }}>
                    eşik YOK — her hareket mesaj olur (toz dahil)
                  </span>
                )}
              </p>
              <p className="veri m3" style={{ fontSize: 12 }}>
                {/* "Bakılmadı" ile "hareket yok" ayrı cevaplardır: ikisi de yazılır. */}
                son bakış: {s.lastCheckedAt ? s.lastCheckedAt.replace("T", " ").slice(0, 19) + " UTC" : "henüz bakılmadı"}
                {" · "}mesaj: {s.uyariSayisi}
                {s.sonUyari &&
                  ` · son: ${s.sonUyari.ts.replace("T", " ").slice(0, 19)} UTC ${
                    s.sonUyari.amountRaw ?? "?"
                  } ham ${s.sonUyari.assetSymbol ?? "?"} (${s.sonUyari.reason ?? "?"})`}
              </p>
            </article>
          ))
        )}
      </section>
    </>
  );
}
