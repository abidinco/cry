"use client";

import { useState } from "react";
import { Bos, Kayit, Rozet } from "@/components/ui";

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

const TUR_ADI: Record<string, string> = {
  address: "adres",
  tx: "işlem",
  ens: "ENS adı",
  unknown: "tanınmadı",
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
      if (!yanit.ok) throw new Error(`Sunucu ${yanit.status} döndü`);
      setSonuc((await yanit.json()) as Sonuc);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Çözümlenemedi");
      setSonuc(null);
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <>
      <form onSubmit={gonder} style={{ display: "flex", gap: 8, marginBottom: 22 }}>
        <input
          value={girdi}
          onChange={(e) => setGirdi(e.target.value)}
          placeholder="cüzdan adresi, işlem hash'i ya da explorer bağlantısı"
          style={{ flex: 1 }}
          spellCheck={false}
          autoFocus
        />
        <button className="birincil" disabled={bekliyor || girdi.trim().length === 0}>
          {bekliyor ? "…" : "çözümle"}
        </button>
      </form>

      {hata && <p style={{ color: "var(--hata)" }}>{hata}</p>}

      {!sonuc && !hata && (
        <Bos>
          Ağ, yapıştırılan metnin biçiminden çözülür — hiçbir ağ çağrısı yapılmadan.
          Biçim tek bir zinciri göstermiyorsa adaylar yoklanır.
        </Bos>
      )}

      {sonuc && (
        <Kayit
          koken={sonuc.candidates.length > 0 ? "kaynak" : "supheli"}
          baslik={`çözümleme · ${TUR_ADI[sonuc.kind] ?? sonuc.kind}`}
        >
          <div className="panel">
            <div className="veri" style={{ wordBreak: "break-all", marginBottom: 12 }}>
              {sonuc.normalized}
            </div>

            {sonuc.warnings.length > 0 && (
              <ul style={{ margin: "0 0 12px", paddingLeft: 16, color: "var(--dikkat)" }}>
                {sonuc.warnings.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            )}

            {sonuc.candidates.length > 0 && (
              <table className="tablo">
                <thead>
                  <tr>
                    <th style={{ width: 130 }}>ağ</th>
                    <th style={{ width: 60 }}>güven</th>
                    <th>gerekçe</th>
                  </tr>
                </thead>
                <tbody>
                  {sonuc.candidates.map((a, i) => (
                    <tr key={i}>
                      <td>
                        {/* Zincir KESİN ise adres sayfasına gidilir. Belirsizken
                            link vermek, yanlış zincirde "kayıt yok" diyen bir
                            sayfa üretir — cevapsızlık değil, YANLIŞ cevap. */}
                        {a.network && sonuc.kind === "address" && !a.needsProbe ? (
                          <a
                            className="veri"
                            href={`/adres/${a.network}/${encodeURIComponent(sonuc.normalized)}`}
                          >
                            {a.network}
                          </a>
                        ) : (
                          <span className="veri">{a.network ?? a.family}</span>
                        )}
                      </td>
                      <td className="veri m2">{a.confidence.toFixed(2)}</td>
                      <td className="m2">
                        {a.reason}
                        {a.needsProbe && (
                          <div style={{ marginTop: 4 }}>
                            <Rozet ton="dikkat">yoklanacak: {a.probeChains?.join(", ")}</Rozet>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Kayit>
      )}
    </>
  );
}
