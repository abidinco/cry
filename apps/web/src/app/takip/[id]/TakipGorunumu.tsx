"use client";

import { useCallback, useEffect, useState } from "react";
import { Adres, Bos, Kayit, Rozet, Satir, Tarih, Tutar } from "@/components/ui";
import { sayi, tarih } from "@/lib/bicim";

type Dugum = {
  address: string;
  hop: number;
  amountRaw: string | null;
  isTerminal: boolean;
  terminalReason: string | null;
  etiketler: { title: string; category: string; exchange: string | null }[];
};

type Kenar = {
  txHash: string;
  from: string;
  to: string;
  symbol: string;
  decimals: number;
  amountRaw: string;
  ts: string;
  hop: number;
  taintShare: number;
};

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
  dugumler: Dugum[];
  kenarlar: Kenar[];
  error?: string;
};

const KURAL_ADI: Record<string, string> = {
  fifo: "FIFO (ilk giren ilk çıkar)",
  orantisal: "orantısal",
  zaman_pencereli: "zaman pencereli",
};

/** Durma sebebi: kullanıcının anlayacağı cümle. */
const SEBEP: Record<string, string> = {
  terminal: "etiketli borsa adresine ulaşıldı",
  butce: "hop bütçesi doldu",
  dugum_siniri: "düğüm sınırına ulaşıldı",
  dallanma: "çıkış sayısı eşiği aştı (borsa ya da mikser olabilir)",
  esik: "tutar eşiğin altına düştü",
  kontrat: "akıllı sözleşme — iz burada kesiliyor",
  indekssiz: "bu adres taranamadı, veri yok",
};

export default function TakipGorunumu({ id }: { id: string }) {
  const [kosu, setKosu] = useState<Kosu | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    const yanit = await fetch(`/api/takip/${id}`);
    const govde = (await yanit.json().catch(() => ({}))) as Kosu;
    if (!yanit.ok) {
      setHata(govde.error ?? "koşu okunamadı");
      return null;
    }
    setKosu(govde);
    return govde;
  }, [id]);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  // Koşu sürerken tazelenir, bitince yoklama DURUR.
  useEffect(() => {
    if (kosu?.status !== "kuyrukta" && kosu?.status !== "calisiyor") return;
    const z = setInterval(() => void yukle(), 3000);
    return () => clearInterval(z);
  }, [kosu?.status, yukle]);

  if (hata) return <p style={{ color: "var(--hata)" }}>{hata}</p>;
  if (!kosu) return <p className="etiket">yükleniyor</p>;

  const suruyor = kosu.status === "kuyrukta" || kosu.status === "calisiyor";
  const hoplar = [...new Set(kosu.dugumler.map((d) => d.hop))].sort((a, b) => a - b);

  /**
   * Düğüme giren izli tutar VARLIK BAŞINA hesaplanır. Toplamak yanlış olurdu:
   * "1 TRX + 1 USDT = 2" diye bir büyüklük yok.
   */
  const dugumTutarlari = new Map<string, { symbol: string; decimals: number; ham: bigint }[]>();
  for (const k of kosu.kenarlar) {
    const liste = dugumTutarlari.get(k.to) ?? [];
    const mevcut = liste.find((v) => v.symbol === k.symbol);
    if (mevcut) mevcut.ham += BigInt(k.amountRaw);
    else liste.push({ symbol: k.symbol, decimals: k.decimals, ham: BigInt(k.amountRaw) });
    dugumTutarlari.set(k.to, liste);
  }
  const borsalar = kosu.dugumler.filter((d) => d.terminalReason === "terminal");

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <h1>Takip koşusu</h1>
        <div className="etiket" style={{ marginTop: 6 }}>
          {kosu.vaka?.title} · {kosu.chain} · {KURAL_ADI[kosu.taintRule] ?? kosu.taintRule}
        </div>
      </div>

      <Kayit koken="indeks" baslik="koşu">
        <div className="panel satirlar">
          <Satir ad="kök adres">
            <Adres deger={kosu.rootAddress} zincir={kosu.chain} kisa={false} />
          </Satir>
          <Satir ad="durum">
            <span className="veri" style={{ color: suruyor ? "var(--dikkat)" : "var(--gelen)" }}>
              {suruyor ? "sürüyor" : kosu.status}
            </span>
          </Satir>
          <Satir ad="başladı">
            <Tarih deger={kosu.startedAt} metin={tarih(kosu.startedAt)} />
          </Satir>
          {kosu.finishedAt && (
            <Satir ad="bitti">
              <Tarih deger={kosu.finishedAt} metin={tarih(kosu.finishedAt)} />
            </Satir>
          )}
          <Satir ad="graf">
            <span className="veri">
              {sayi(kosu.dugumler.length)} düğüm · {sayi(kosu.kenarlar.length)} kenar
            </span>
          </Satir>
          {kosu.stats?.durma && (
            <Satir ad="durma sebepleri">
              <span className="m2">
                {Object.entries(kosu.stats.durma)
                  .map(([k, v]) => `${SEBEP[k] ?? k}: ${v}`)
                  .join(" · ")}
              </span>
            </Satir>
          )}
          <Satir ad="metodoloji" koken="kaynak" not="rapora yazılır">
            <span className="m2">
              {KURAL_ADI[kosu.taintRule]} · en fazla {String((kosu.params as Record<string, unknown>)?.maxHop)} hop ·{" "}
              {String((kosu.params as Record<string, unknown>)?.maxDugum)} düğüm
            </span>
          </Satir>
        </div>
      </Kayit>

      {borsalar.length > 0 && (
        <Kayit koken="kaynak" baslik="borsaya ulaşan iz">
          <div className="panel">
            {borsalar.map((d) => (
              <div key={d.address} style={{ marginBottom: 6 }}>
                <Adres deger={d.address} zincir={kosu.chain} />{" "}
                {d.etiketler.map((e, i) => (
                  <Rozet key={i}>{e.title}</Rozet>
                ))}
              </div>
            ))}
          </div>
        </Kayit>
      )}

      {kosu.dugumler.length === 0 ? (
        <Bos>
          {suruyor
            ? "Koşu başladı; düğümler bulundukça burada görünecek."
            : "Bu koşu hiç düğüm üretmedi. Kök adresin indekslenmiş girişi yoksa takip edilecek para da yoktur."}
        </Bos>
      ) : (
        hoplar.map((h) => {
          const dugumler = kosu.dugumler.filter((d) => d.hop === h);
          const kenarlar = kosu.kenarlar.filter((k) => k.hop === h);
          return (
            <Kayit
              key={h}
              koken="indeks"
              baslik={h === 0 ? "kök" : `${h}. sıçrama · ${sayi(dugumler.length)} düğüm`}
            >
              <div className="tablo-sar">
                <table className="tablo">
                  <thead>
                    <tr>
                      <th>adres</th>
                      <th className="sag" style={{ width: 170 }}>izli tutar</th>
                      <th style={{ width: 260 }}>durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dugumler.map((d) => (
                      <tr key={d.address}>
                        <td>
                          <Adres deger={d.address} zincir={kosu.chain} />
                          {d.etiketler.map((e, i) => (
                            <span key={i} style={{ marginLeft: 6 }}>
                              <Rozet>{e.title}</Rozet>
                            </span>
                          ))}
                        </td>
                        <td className="sag tutar-hucre">
                          {(() => {
                            const varliklar = (dugumTutarlari.get(d.address) ?? [])
                              .slice()
                              .sort((a, b) => (b.ham > a.ham ? 1 : -1));
                            if (varliklar.length === 0) return <span className="m3">—</span>;
                            return varliklar.slice(0, 3).map((v) => (
                              <div key={v.symbol}>
                                <Tutar ham={v.ham.toString()} ondalik={v.decimals} sembol={v.symbol} />
                              </div>
                            ));
                          })()}
                        </td>
                        <td className="m2">
                          {d.terminalReason ? (
                            <span
                              style={{
                                color:
                                  d.terminalReason === "terminal"
                                    ? "var(--gelen)"
                                    : "var(--m2)",
                              }}
                            >
                              {SEBEP[d.terminalReason] ?? d.terminalReason}
                            </span>
                          ) : (
                            <span className="m3">devam edildi</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {kenarlar.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary className="etiket" style={{ cursor: "pointer" }}>
                    bu sıçramanın {sayi(kenarlar.length)} hareketi
                  </summary>
                  <div className="tablo-sar" style={{ marginTop: 8 }}>
                    <table className="tablo">
                      <thead>
                        <tr>
                          <th style={{ width: 140 }}>tarih</th>
                          <th>nereden</th>
                          <th>nereye</th>
                          <th className="sag" style={{ width: 170 }}>izli tutar</th>
                          <th style={{ width: 60 }}>pay</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kenarlar.slice(0, 100).map((k, i) => (
                          <tr key={k.txHash + i}>
                            <td>
                              <Tarih deger={k.ts} metin={tarih(k.ts)} />
                            </td>
                            <td>
                              <Adres deger={k.from} zincir={kosu.chain} />
                            </td>
                            <td>
                              <Adres deger={k.to} zincir={kosu.chain} />
                            </td>
                            <td className="sag tutar-hucre">
                              <Tutar ham={k.amountRaw} ondalik={k.decimals} sembol={k.symbol} />
                            </td>
                            <td className="veri m2">
                              {/* Atıf oranı: çıkışın ne kadarı ize ait. */}
                              %{Math.round(k.taintShare * 100)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </Kayit>
          );
        })
      )}
    </>
  );
}
