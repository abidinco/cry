"use client";

/**
 * İnceleme listesi — bir iddia, gerekçesi ve iki düğme.
 *
 * Karar verilen satır listeden KAYBOLMAZ, kararını üstünde taşır: insan ne yaptığını görmeli ve
 * yanlış tıkladıysa aynı satırdan düzeltebilmeli. Sayfa yenilenince zaten gider.
 */
import { useState } from "react";
import { adresGezgini } from "@/lib/gezgin";
import type { IncelemeSatiri, Karar } from "@/lib/etiket-inceleme";

type Durum = { karar: Karar; borsaAdi: string | null } | { hata: string } | null;

export default function IncelemeListesi({ satirlar }: { satirlar: IncelemeSatiri[] }) {
  const [durumlar, setDurumlar] = useState<Record<number, Durum>>({});
  const [calisan, setCalisan] = useState<number | null>(null);

  async function karaVer(s: IncelemeSatiri, karar: Karar) {
    // Onay bir HÜKÜMDÜR ve rapora geçer: hangi borsa olduğu sorulmadan "borsaya girdi" yazılamaz.
    let borsaAdi: string | null = null;
    if (karar === "borsa") {
      const varsayilan = s.title.replace(/\s*(hot|cold)\s*wallet.*$/i, "").trim() || s.title;
      borsaAdi = window.prompt("Hangi borsa? (rapora bu ad girer)", varsayilan);
      if (borsaAdi === null) return;
      if (!borsaAdi.trim()) {
        setDurumlar((d) => ({ ...d, [s.id]: { hata: "borsa adı boş olamaz" } }));
        return;
      }
    }
    setCalisan(s.id);
    try {
      const y = await fetch(`/api/etiket/${s.id}/karar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ karar, borsaAdi }),
      });
      const govde = (await y.json()) as { error?: string; borsaAdi?: string | null };
      setDurumlar((d) => ({
        ...d,
        [s.id]: y.ok
          ? { karar, borsaAdi: govde.borsaAdi ?? null }
          : { hata: govde.error ?? `HTTP ${y.status}` },
      }));
    } catch (e) {
      setDurumlar((d) => ({ ...d, [s.id]: { hata: (e as Error).message } }));
    } finally {
      setCalisan(null);
    }
  }

  if (satirlar.length === 0) {
    return (
      <section className="panel" style={{ marginTop: 12 }}>
        <p className="m2">Bu süzgeçte doğrulama bekleyen iddia yok.</p>
      </section>
    );
  }

  return (
    <section className="panel" style={{ marginTop: 12 }}>
      {satirlar.map((s, i) => {
        const d = durumlar[s.id];
        const gezgin = adresGezgini(s.chain, s.address);
        return (
          <article
            key={s.id}
            style={{
              padding: "12px 0",
              borderTop: i === 0 ? "none" : "1px solid var(--cizgi)",
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <b>{s.title}</b>
              <span className="etiket">{s.source}</span>
              <span className="etiket">güven {s.confidence.toFixed(2)}</span>
              {/* Ağırlık, hangi iddianın gerçekten bir bedeli olduğunu söyler. */}
              {s.durdurdu > 0 && (
                <span className="etiket" style={{ color: "var(--dikkat)" }}>
                  {s.durdurdu} kez izi durdurdu
                </span>
              )}
              {s.kosuda > 0 && <span className="etiket">{s.kosuda} koşuda</span>}
            </div>
            <div className="veri" style={{ wordBreak: "break-all", marginTop: 2 }}>
              <a href={`/adres/${s.chain}/${s.address}`}>{s.address}</a>
              {gezgin && (
                <>
                  {" · "}
                  {/* Gezgin üçüncü taraftır: hangi soruşturmadan gelindiğini görmemeli. */}
                  <a href={gezgin} target="_blank" rel="noopener noreferrer">
                    gezginde aç ↗
                  </a>
                </>
              )}
            </div>
            {s.description && (
              <p className="m2" style={{ margin: "4px 0 0", fontSize: 12, lineHeight: 1.5 }}>
                {s.description}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button disabled={calisan === s.id} onClick={() => karaVer(s, "borsa")}>
                borsa — doğrula
              </button>
              <button disabled={calisan === s.id} onClick={() => karaVer(s, "borsa_degil")}>
                borsa değil
              </button>
              {d && "karar" in d && (
                <span className="etiket" style={{ color: "var(--vurgu)" }}>
                  {d.karar === "borsa" ? `doğrulandı${d.borsaAdi ? ` — ${d.borsaAdi}` : ""}` : "borsa değil"}
                </span>
              )}
              {d && "hata" in d && (
                <span className="etiket" style={{ color: "var(--hata)" }}>
                  {d.hata}
                </span>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
