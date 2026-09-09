"use client";

import { useCallback, useEffect, useState } from "react";
import { hamdanMetne } from "@cry/chain";

type Etiket = {
  id: number;
  title: string;
  category: string;
  exchange: string | null;
  source: string;
  confidence: number;
  verifiedAt: string | null;
};

type Ozet = {
  chain: string;
  address: string;
  biliniyor: boolean;
  indexState: string;
  lastIndexedAt: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  tarihKaynagi: "kaynak" | "indeks" | null;
  balanceRaw: string | null;
  isContract: boolean | null;
  activatedByAddress: string | null;
  hareketSayisi: { gelen: number; giden: number };
  etiketler: Etiket[];
  isDurumu: "yok" | "bekliyor" | "calisiyor" | "bitti" | "hata";
  adaptorHazir: boolean;
  error?: string;
};

type Hareket = {
  txHash: string;
  ts: string;
  amountRaw: string;
  kind: string;
  success: boolean;
  symbol: string;
  decimals: number;
  from: string | null;
  to: string | null;
  yon: "gelen" | "giden";
};

const gun = (a: string | null) => (a ? new Date(a).toLocaleString("tr-TR") : "—");

/** "Bakılmadı" ile "boş" ayrı sorulardır ve ekranda da ayrı yazılır. */
function indeksMetni(o: Ozet): string {
  if (!o.biliniyor) return "hiç taranmadı";
  if (o.indexState === "tam") return `tam · ${gun(o.lastIndexedAt)}`;
  if (o.indexState === "kismi") return `kısmi (devam edecek) · ${gun(o.lastIndexedAt)}`;
  return "bilinmiyor";
}

/** Bekleme durumu: son hareketin üstünden kaç gün geçti. */
function beklemeMetni(sonHareket: string | null): string {
  if (!sonHareket) return "";
  const gunSayisi = Math.floor((Date.now() - new Date(sonHareket).getTime()) / 86_400_000);
  return gunSayisi < 1 ? "" : ` · ${gunSayisi} gündür hareketsiz`;
}

/**
 * Tarih kaynağın beyanı mı, bizim indeksimizden mi türetildi? İndeks kısmiyse
 * gördüğümüz ilk hareket adresin gerçek ilki OLMAYABİLİR ve bu söylenir.
 */
function tarihNotu(o: Ozet): string {
  if (o.tarihKaynagi !== "indeks") return "";
  return o.indexState === "tam" ? " (indeksten)" : " (indeksteki en eski/yeni — tarama kısmi)";
}

function kisalt(a: string) {
  return a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}

function Satir({ ad, deger }: { ad: string; deger: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <span className="soluk" style={{ minWidth: 130 }}>{ad}</span>
      <span>{deger}</span>
    </div>
  );
}

export default function AdresGorunumu({ chain, address }: { chain: string; address: string }) {
  const [ozet, setOzet] = useState<Ozet | null>(null);
  const [hareketler, setHareketler] = useState<Hareket[]>([]);
  const [toplam, setToplam] = useState(0);
  const [sayfa, setSayfa] = useState(0);
  const [hata, setHata] = useState<string | null>(null);

  const taban = `/api/adres/${chain}/${encodeURIComponent(address)}`;

  const ozetYukle = useCallback(async () => {
    const yanit = await fetch(taban);
    const govde = (await yanit.json()) as Ozet;
    if (!yanit.ok) {
      setHata(govde.error ?? "alınamadı");
      return null;
    }
    setOzet(govde);
    return govde;
  }, [taban]);

  const hareketYukle = useCallback(
    async (s: number) => {
      const yanit = await fetch(`${taban}/hareketler?sayfa=${s}`);
      if (!yanit.ok) return;
      const govde = (await yanit.json()) as { hareketler: Hareket[]; toplam: number };
      setHareketler(govde.hareketler ?? []);
      setToplam(govde.toplam ?? 0);
    },
    [taban],
  );

  useEffect(() => {
    void ozetYukle();
    void hareketYukle(sayfa);
  }, [ozetYukle, hareketYukle, sayfa]);

  // Tarama sürerken sayfa kendini tazeler; iş bitince yoklama DURUR.
  useEffect(() => {
    if (ozet?.isDurumu !== "bekliyor" && ozet?.isDurumu !== "calisiyor") return;
    const zamanlayici = setInterval(async () => {
      const yeni = await ozetYukle();
      if (yeni && yeni.isDurumu !== "bekliyor" && yeni.isDurumu !== "calisiyor") {
        setSayfa(0);
        void hareketYukle(0);
      }
    }, 3000);
    return () => clearInterval(zamanlayici);
  }, [ozet?.isDurumu, ozetYukle, hareketYukle]);

  async function tara() {
    setHata(null);
    const yanit = await fetch(`${taban}/indeksle`, { method: "POST" });
    const govde = (await yanit.json().catch(() => ({}))) as { error?: string };
    if (!yanit.ok) {
      setHata(govde.error ?? "tarama başlatılamadı");
      return;
    }
    void ozetYukle();
  }

  if (hata) return <p style={{ color: "var(--hata)" }}>{hata}</p>;
  if (!ozet) return <p className="soluk">yükleniyor…</p>;

  const calisiyor = ozet.isDurumu === "bekliyor" || ozet.isDurumu === "calisiyor";

  return (
    <section>
      <h1 className="mono" style={{ fontSize: 16, wordBreak: "break-all" }}>{ozet.address}</h1>
      <div className="soluk" style={{ marginBottom: 12 }}>
        {ozet.chain}
        {ozet.isContract ? " · sözleşme" : ""}
      </div>

      {ozet.etiketler.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {ozet.etiketler.map((e) => (
            <span
              key={e.id}
              className="panel"
              style={{ padding: "4px 8px", fontSize: 12 }}
              title={`kaynak: ${e.source} · güven: ${e.confidence}`}
            >
              {e.title}
              {!e.verifiedAt && <em className="soluk"> · doğrulanmamış</em>}
            </span>
          ))}
        </div>
      )}

      <div className="panel" style={{ display: "grid", gap: 6, marginBottom: 14 }}>
        <Satir ad="İndeks durumu" deger={indeksMetni(ozet)} />
        <Satir ad="İlk hareket" deger={`${gun(ozet.firstSeen)}${tarihNotu(ozet)}`} />
        <Satir
          ad="Son hareket"
          deger={`${gun(ozet.lastSeen)}${beklemeMetni(ozet.lastSeen)}${tarihNotu(ozet)}`}
        />
        <Satir ad="Bakiye" deger={ozet.balanceRaw ? `${hamdanMetne(ozet.balanceRaw, 6)} TRX` : "—"} />
        <Satir
          ad="Hareket"
          deger={`${ozet.hareketSayisi.gelen} gelen · ${ozet.hareketSayisi.giden} giden`}
        />
        {ozet.activatedByAddress && (
          <Satir
            ad="Aktive eden"
            deger={
              <a className="mono" href={`/adres/${ozet.chain}/${ozet.activatedByAddress}`}>
                {ozet.activatedByAddress}
              </a>
            }
          />
        )}
        <div style={{ marginTop: 6 }}>
          <button onClick={tara} disabled={calisiyor || !ozet.adaptorHazir}>
            {calisiyor ? "taranıyor…" : ozet.biliniyor ? "Yeniden tara" : "Zincirden çek"}
          </button>
          {!ozet.adaptorHazir && (
            <span className="soluk" style={{ marginLeft: 8 }}>
              bu zincirin adaptörü henüz doldurulmadı
            </span>
          )}
          {ozet.isDurumu === "hata" && (
            <span style={{ color: "var(--hata)", marginLeft: 8 }}>son tarama hata verdi</span>
          )}
        </div>
      </div>

      <h2 style={{ fontSize: 15 }}>
        Hareketler <span className="soluk">({toplam})</span>
      </h2>
      {hareketler.length === 0 ? (
        <p className="soluk">
          {ozet.biliniyor ? "Kayitli hareket yok." : "Bu adres henuz taranmadi."}
        </p>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr className="soluk" style={{ textAlign: "left" }}>
                <th>Tarih</th>
                <th>Yon</th>
                <th>Karsi taraf</th>
                <th style={{ textAlign: "right" }}>Tutar</th>
              </tr>
            </thead>
            <tbody>
              {hareketler.map((h, i) => {
                const karsi = h.yon === "gelen" ? h.from : h.to;
                return (
                  <tr key={h.txHash + i} style={{ borderTop: "1px solid var(--cizgi)" }}>
                    <td className="mono" style={{ fontSize: 12 }}>{gun(h.ts)}</td>
                    <td style={{ color: h.yon === "gelen" ? "var(--tamam)" : "var(--uyari)" }}>
                      {h.yon === "gelen" ? "gelen" : "giden"}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {karsi ? <a href={`/adres/${ozet.chain}/${karsi}`}>{kisalt(karsi)}</a> : "-"}
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {hamdanMetne(h.amountRaw, h.decimals)} {h.symbol}
                      {!h.success && <span style={{ color: "var(--hata)" }}> · basarisiz</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => setSayfa((s) => Math.max(0, s - 1))} disabled={sayfa === 0}>
              onceki
            </button>
            <button onClick={() => setSayfa((s) => s + 1)} disabled={(sayfa + 1) * 50 >= toplam}>
              sonraki
            </button>
          </div>
        </>
      )}
    </section>
  );
}
