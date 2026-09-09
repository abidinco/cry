"use client";

import { useState } from "react";
import { Bos, Kayit, Rozet } from "@/components/ui";
import { tarih } from "@/lib/bicim";

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

type Vurus = {
  network: string;
  exists: boolean;
  hata?: string;
  nativeTxCount?: number;
  tokenTxCount?: number;
  firstSeen?: string;
  lastSeen?: string;
};

type YoklamaSonucu = {
  hits: Vurus[];
  autoSelected: string | null;
  probedAt: string;
  notProbed: string[];
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
  const [yoklama, setYoklama] = useState<YoklamaSonucu | null>(null);
  const [yokluyor, setYokluyor] = useState(false);

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
      setYoklama(null);
      setSonuc((await yanit.json()) as Sonuc);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Çözümlenemedi");
      setSonuc(null);
    } finally {
      setBekliyor(false);
    }
  }

  /** Yoklama AYRI bir adım: ağa gitmek kullanıcının kararı, otomatik değil. */
  async function yokla(dahaFazlaZincir: boolean) {
    setYokluyor(true);
    setHata(null);
    try {
      const yanit = await fetch("/api/probe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: girdi, dahaFazlaZincir }),
      });
      // Sunucu hata verdiğinde gövde boş olabilir; JSON ayrıştırma çökmesi
      // gerçek hatayı gizler ve kullanıcı "bozuk JSON" görür.
      const govde = (await yanit.json().catch(() => ({}))) as {
        sonuc?: YoklamaSonucu;
        error?: string;
      };
      if (!yanit.ok) throw new Error(govde.error ?? `Sunucu ${yanit.status} döndü`);
      setYoklama(govde.sonuc ?? null);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Yoklanamadı");
    } finally {
      setYokluyor(false);
    }
  }

  const yoklanacak = sonuc?.candidates.some((a) => a.needsProbe) ?? false;

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

            {yoklanacak && !yoklama && (
              <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={() => yokla(false)} disabled={yokluyor}>
                  {yokluyor ? "yoklanıyor" : "zincirlerde yokla"}
                </button>
                <span className="etiket">
                  zincir başına en fazla 2 çağrı · sonuç saklanır
                </span>
              </div>
            )}
          </div>
        </Kayit>
      )}

      {yoklama && sonuc && (
        <Kayit
          koken={yoklama.autoSelected ? "kaynak" : "supheli"}
          baslik={`yoklama · ${tarih(yoklama.probedAt)}`}
          sag={
            yoklama.notProbed.length > 0 ? (
              <button onClick={() => yokla(true)} disabled={yokluyor}>
                {yokluyor ? "yoklanıyor" : "daha fazla zincirde ara"}
              </button>
            ) : undefined
          }
        >
          <div className="panel">
            <div className="tablo-sar">
              <table className="tablo">
                <thead>
                  <tr>
                    <th style={{ width: 130 }}>ağ</th>
                    <th style={{ width: 90 }}>sonuç</th>
                    <th>bulunan</th>
                  </tr>
                </thead>
                <tbody>
                  {yoklama.hits.map((v) => (
                    <tr key={v.network}>
                      <td>
                        {v.exists && !v.hata && sonuc.kind === "address" ? (
                          <a
                            className="veri"
                            href={`/adres/${v.network}/${encodeURIComponent(sonuc.normalized)}`}
                          >
                            {v.network}
                          </a>
                        ) : (
                          <span className="veri">{v.network}</span>
                        )}
                      </td>
                      <td>
                        {/* "yok" ile "bakılamadı" AYRI: kapsanmayan bir zinciri
                            temiz göstermek, aranan şeyi orada aramamak olur. */}
                        <span
                          className="veri"
                          style={{
                            color: v.hata
                              ? "var(--dikkat)"
                              : v.exists
                                ? "var(--gelen)"
                                : "var(--m3)",
                          }}
                        >
                          {v.hata ? "yoklanamadı" : v.exists ? "var" : "yok"}
                        </span>
                      </td>
                      <td className="m2">
                        {v.hata ?? (v.exists ? ozetMetni(v) : "bu zincirde hareket görülmedi")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {yoklama.autoSelected ? (
              <p className="m2" style={{ margin: "12px 0 0" }}>
                Tek zincirde aktivite bulundu:{" "}
                <strong className="veri">{yoklama.autoSelected}</strong>
              </p>
            ) : (
              <p className="m2" style={{ margin: "12px 0 0" }}>
                {yoklama.hits.some((v) => v.exists && !v.hata)
                  ? "Birden çok zincirde aktivite var; hangisinin aradığın olduğuna sen karar vereceksin."
                  : "Yoklanan zincirlerin hiçbirinde hareket yok."}
              </p>
            )}

            {yoklama.notProbed.length > 0 && (
              <p className="etiket" style={{ marginTop: 8 }}>
                yoklanmayan: {yoklama.notProbed.join(", ")}
              </p>
            )}
          </div>
        </Kayit>
      )}
    </>
  );
}

/** Yoklamanın bulduğu şeyi tek satırda söyler; sayı yoksa uydurulmaz. */
function ozetMetni(v: Vurus): string {
  const parcalar: string[] = [];
  if (typeof v.nativeTxCount === "number") parcalar.push(`${v.nativeTxCount} native işlem`);
  if (typeof v.tokenTxCount === "number") parcalar.push(`${v.tokenTxCount} token işlemi`);
  if (v.lastSeen) parcalar.push(`son: ${tarih(v.lastSeen)}`);
  return parcalar.length > 0 ? parcalar.join(" · ") : "aktivite var";
}
