"use client";

import { useState } from "react";

type Aday = {
  family: string;
  network: string | null;
  confidence: number;
  reason: string;
  needsProbe: boolean;
  probeChains?: string[];
};

type Sonuc = {
  raw: string;
  normalized: string;
  kind: string;
  candidates: Aday[];
  warnings: string[];
};

export default function AramaKutusu() {
  const [girdi, setGirdi] = useState("");
  const [sonuc, setSonuc] = useState<Sonuc | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setBekliyor(true);
    setHata(null);
    try {
      const yanit = await fetch("/api/detect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: girdi }),
      });
      if (!yanit.ok) throw new Error(`sunucu ${yanit.status}`);
      setSonuc((await yanit.json()) as Sonuc);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "bilinmeyen hata");
      setSonuc(null);
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <section>
      <form onSubmit={gonder} style={{ display: "flex", gap: 8, margin: "20px 0" }}>
        <input
          value={girdi}
          onChange={(e) => setGirdi(e.target.value)}
          placeholder="TR7NHq… / 0xabc… / tronscan.org/#/address/…"
          className="mono"
          style={{ flex: 1 }}
          spellCheck={false}
        />
        <button disabled={bekliyor || girdi.trim().length === 0}>
          {bekliyor ? "…" : "Çözümle"}
        </button>
      </form>

      {hata && <p style={{ color: "var(--hata)" }}>{hata}</p>}

      {sonuc && (
        <div className="panel">
          <div className="mono soluk">{sonuc.normalized}</div>
          <p style={{ margin: "8px 0" }}>
            Tür: <strong>{sonuc.kind}</strong>
          </p>

          {sonuc.warnings.length > 0 && (
            <ul style={{ color: "var(--uyari)" }}>
              {sonuc.warnings.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
            <thead>
              <tr className="soluk" style={{ textAlign: "left" }}>
                <th>Ağ</th>
                <th>Güven</th>
                <th>Gerekçe</th>
              </tr>
            </thead>
            <tbody>
              {sonuc.candidates.map((a, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--cizgi)" }}>
                  <td className="mono">
                    {/* Zincir KESİN ise adres sayfasına gidilir; belirsizse
                        link verilmez — yanlış zincire açılan bir sayfa,
                        "bu adres burada yok" diye YANLIŞ bir cevap üretir. */}
                    {a.network && sonuc.kind === "address" && !a.needsProbe ? (
                      <a href={`/adres/${a.network}/${encodeURIComponent(sonuc.normalized)}`}>
                        {a.network}
                      </a>
                    ) : (
                      (a.network ?? a.family)
                    )}
                  </td>
                  <td className="mono">{a.confidence.toFixed(2)}</td>
                  <td className="soluk">
                    {a.reason}
                    {a.needsProbe && <em> — yoklanacak: {a.probeChains?.join(", ")}</em>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
