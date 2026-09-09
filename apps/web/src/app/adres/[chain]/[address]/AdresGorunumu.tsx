"use client";

import { useCallback, useEffect, useState } from "react";
import { Adres, Bos, Kayit, Rozet, Satir, Tarih, Tutar, type Koken } from "@/components/ui";
import { hareketsizGun, kisaAdres, sayi, tarih } from "@/lib/bicim";

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

const SAYFA = 50;

/** İndeks durumu tek cümlede: ne kadarına baktık, ne zaman. */
function indeksMetni(o: Ozet): string {
  if (!o.biliniyor) return "bu adres için zincire hiç gidilmedi";
  if (o.indexState === "tam") return `tam · ${tarih(o.lastIndexedAt)}`;
  if (o.indexState === "kismi") return `kısmi · ${tarih(o.lastIndexedAt)}`;
  return "bilinmiyor";
}

/** Tarihin kökeni: kaynağın beyanı mı, bizim kayıtlarımızdan mı. */
function tarihKokeni(o: Ozet): { koken: Koken; not?: string } {
  if (o.tarihKaynagi === "kaynak") return { koken: "kaynak" };
  if (o.tarihKaynagi === "indeks") {
    return o.indexState === "tam"
      ? { koken: "indeks", not: "indeksten" }
      : { koken: "supheli", not: "indeks kısmi — daha eskisi olabilir" };
  }
  return { koken: "yok" };
}

export default function AdresGorunumu({ chain, address }: { chain: string; address: string }) {
  const [ozet, setOzet] = useState<Ozet | null>(null);
  const [hareketler, setHareketler] = useState<Hareket[]>([]);
  const [toplam, setToplam] = useState(0);
  const [sayfa, setSayfa] = useState(0);
  const [yon, setYon] = useState<"" | "gelen" | "giden">("");
  const [hata, setHata] = useState<string | null>(null);

  const taban = `/api/adres/${chain}/${encodeURIComponent(address)}`;

  const ozetYukle = useCallback(async () => {
    const yanit = await fetch(taban);
    const govde = (await yanit.json()) as Ozet;
    if (!yanit.ok) {
      setHata(govde.error ?? "Adres okunamadı");
      return null;
    }
    setOzet(govde);
    return govde;
  }, [taban]);

  const hareketYukle = useCallback(
    async (s: number, y: string) => {
      const yanit = await fetch(`${taban}/hareketler?sayfa=${s}${y ? `&yon=${y}` : ""}`);
      if (!yanit.ok) return;
      const govde = (await yanit.json()) as { hareketler: Hareket[]; toplam: number };
      setHareketler(govde.hareketler ?? []);
      setToplam(govde.toplam ?? 0);
    },
    [taban],
  );

  useEffect(() => {
    void ozetYukle();
  }, [ozetYukle]);

  useEffect(() => {
    void hareketYukle(sayfa, yon);
  }, [hareketYukle, sayfa, yon]);

  // Tarama sürerken sayfa kendini tazeler; iş bitince yoklama DURUR.
  useEffect(() => {
    if (ozet?.isDurumu !== "bekliyor" && ozet?.isDurumu !== "calisiyor") return;
    const zamanlayici = setInterval(async () => {
      const yeni = await ozetYukle();
      if (yeni && yeni.isDurumu !== "bekliyor" && yeni.isDurumu !== "calisiyor") {
        setSayfa(0);
        void hareketYukle(0, yon);
      }
    }, 3000);
    return () => clearInterval(zamanlayici);
  }, [ozet?.isDurumu, ozetYukle, hareketYukle, yon]);

  async function tara() {
    setHata(null);
    const yanit = await fetch(`${taban}/indeksle`, { method: "POST" });
    const govde = (await yanit.json().catch(() => ({}))) as { error?: string };
    if (!yanit.ok) {
      setHata(govde.error ?? "Tarama başlatılamadı");
      return;
    }
    void ozetYukle();
  }

  if (hata) return <p style={{ color: "var(--hata)" }}>{hata}</p>;
  if (!ozet) return <p className="etiket">yükleniyor</p>;

  const calisiyor = ozet.isDurumu === "bekliyor" || ozet.isDurumu === "calisiyor";
  const bekleme = hareketsizGun(ozet.lastSeen);
  const tk = tarihKokeni(ozet);

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <h1 className="veri" style={{ fontSize: 15, wordBreak: "break-all" }}>
          {ozet.address}
        </h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 7 }}>
          <span className="etiket">{ozet.chain}</span>
          {ozet.isContract && <Rozet>sözleşme</Rozet>}
          {ozet.etiketler.map((e) => (
            <Rozet
              key={e.id}
              ton={e.verifiedAt ? undefined : "dikkat"}
              baslik={`kaynak: ${e.source} · güven: ${e.confidence}`}
            >
              {e.title}
              {!e.verifiedAt && " · doğrulanmamış"}
            </Rozet>
          ))}
        </div>
      </div>

      <Kayit
        koken={ozet.biliniyor ? "kaynak" : "yok"}
        baslik="ölçüm"
        sag={
          <button className="birincil" onClick={tara} disabled={calisiyor || !ozet.adaptorHazir}>
            {calisiyor ? "taranıyor" : ozet.biliniyor ? "yeniden tara" : "zincirden çek"}
          </button>
        }
      >
        <div className="panel satirlar">
          <Satir ad="indeks">
            <span className="veri">{indeksMetni(ozet)}</span>
            {ozet.indexState === "kismi" && (
              <span className="koken-notu" data-koken="supheli">
                devam edecek
              </span>
            )}
          </Satir>
          <Satir ad="ilk hareket" koken={tk.koken} not={tk.not}>
            <Tarih deger={ozet.firstSeen} metin={tarih(ozet.firstSeen)} />
          </Satir>
          <Satir ad="son hareket" koken={tk.koken} not={tk.not}>
            <Tarih deger={ozet.lastSeen} metin={tarih(ozet.lastSeen)} />
            {bekleme !== null && (
              <span className="koken-notu">{sayi(bekleme)} gündür hareketsiz</span>
            )}
          </Satir>
          <Satir ad="bakiye">
            {ozet.balanceRaw ? <Tutar ham={ozet.balanceRaw} ondalik={6} sembol="TRX" /> : "—"}
          </Satir>
          <Satir ad="hareket">
            <span className="veri">
              {sayi(ozet.hareketSayisi.gelen)} gelen · {sayi(ozet.hareketSayisi.giden)} giden
            </span>
          </Satir>
          {ozet.activatedByAddress && (
            <Satir ad="aktive eden" koken="kaynak" not="zincirde yazılı">
              <Adres deger={ozet.activatedByAddress} zincir={ozet.chain} />
            </Satir>
          )}
          {!ozet.adaptorHazir && (
            <Satir ad="uyarı">
              <span style={{ color: "var(--dikkat)" }}>
                Bu zincirin adaptörü henüz doldurulmadı; tarama yapılamaz.
              </span>
            </Satir>
          )}
          {ozet.isDurumu === "hata" && (
            <Satir ad="uyarı">
              <span style={{ color: "var(--hata)" }}>Son tarama hata verdi.</span>
            </Satir>
          )}
        </div>
      </Kayit>

      <Kayit
        koken="kaynak"
        baslik={`hareketler · ${sayi(toplam)}`}
        sag={
          <div style={{ display: "flex", gap: 6 }}>
            {(["", "gelen", "giden"] as const).map((y) => (
              <button
                key={y || "hepsi"}
                onClick={() => {
                  setYon(y);
                  setSayfa(0);
                }}
                style={y === yon ? { borderColor: "var(--vurgu)", color: "var(--vurgu)" } : undefined}
              >
                {y || "hepsi"}
              </button>
            ))}
          </div>
        }
      >
        {hareketler.length === 0 ? (
          <Bos>
            {ozet.biliniyor
              ? "Bu süzgeçte kayıtlı hareket yok."
              : "Henüz hareket yok. Yukarıdaki düğme adresin geçmişini zincirden çeker."}
          </Bos>
        ) : (
          <>
            <div className="tablo-sar">
            <table className="tablo">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>tarih</th>
                  <th style={{ width: 70 }}>yön</th>
                  <th>karşı taraf</th>
                  <th className="sag" style={{ width: 190 }}>tutar</th>
                  <th style={{ width: 92 }}>işlem</th>
                </tr>
              </thead>
              <tbody>
                {hareketler.map((h, i) => (
                  <tr key={h.txHash + i}>
                    <td>
                      <Tarih deger={h.ts} metin={tarih(h.ts)} />
                    </td>
                    <td>
                      <span className="veri" style={{ color: `var(--${h.yon})` }}>
                        {h.yon}
                      </span>
                    </td>
                    <td>
                      {h.yon === "gelen" ? (
                        h.from ? <Adres deger={h.from} zincir={ozet.chain} /> : <span className="m3">—</span>
                      ) : h.to ? (
                        <Adres deger={h.to} zincir={ozet.chain} />
                      ) : (
                        <span className="m3">—</span>
                      )}
                    </td>
                    <td className="sag tutar-hucre">
                      <Tutar ham={h.amountRaw} ondalik={h.decimals} sembol={h.symbol} />
                      {!h.success && (
                        <span className="koken-notu" style={{ color: "var(--hata)" }}>
                          başarısız
                        </span>
                      )}
                    </td>
                    <td>
                      {/* Zincirdeki kaydın kendisi: her satır kaynağına
                          tıklanarak gidilebilmeli. */}
                      <a
                        className="veri m3"
                        href={`https://tronscan.org/#/transaction/${h.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        title={h.txHash}
                      >
                        {kisaAdres(h.txHash, 5, 4)}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
              <button onClick={() => setSayfa((s) => Math.max(0, s - 1))} disabled={sayfa === 0}>
                önceki
              </button>
              <span className="etiket">
                {sayi(sayfa * SAYFA + 1)}–{sayi(Math.min((sayfa + 1) * SAYFA, toplam))} / {sayi(toplam)}
              </span>
              <button
                onClick={() => setSayfa((s) => s + 1)}
                disabled={(sayfa + 1) * SAYFA >= toplam}
              >
                sonraki
              </button>
            </div>
          </>
        )}
      </Kayit>
    </>
  );
}
