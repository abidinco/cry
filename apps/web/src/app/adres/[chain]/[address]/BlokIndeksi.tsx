"use client";

import { Fragment, useEffect, useState } from "react";
import { Adres, Bos, Kayit, Tarih, Tutar } from "@/components/ui";
import { sayi, tarih } from "@/lib/bicim";

type KarsiTaraf = { adres: string; hareket: number; toplam: string };
type YonOzeti = {
  varlik: "TRX" | "USDT";
  karsiTaraf: number;
  tozKarsiTaraf: number;
  hareket: number;
  tozHareket: number;
  toplam: string;
  ilk: number;
  son: number;
  enBuyukler: KarsiTaraf[];
};
type Pencere = { bas: number; son: number; zamanBas: number; zamanSon: number };
export type Cevap =
  | { durum: "tamam"; pencere: Pencere; gelen: YonOzeti[]; giden: YonOzeti[] }
  | { durum: "bakilamadi"; sebep?: string }
  | { durum: "desteklenmiyor" };

/** TRX ve USDT'nin ikisi de 6 ondalık (blok indeksi yalnızca bu iki varlığı tutar). */
const ONDALIK = 6;
const sn = (s: number) => new Date(s * 1000);

/**
 * Adresin yerel blok indeksine göre özeti (B5). ADAY bilgidir: köken oluğu "türetildi", ve takip/rapor
 * bunu kullanmaz — bu yüzden ayrı bir blokta, yukarıdaki taramadan ayrık durur.
 * Toz (<1 TRX/USDT) sayımdan elenmez, AYRI gösterilir (kullanıcı kararı 2026-09-17).
 */
export default function BlokIndeksi({ chain, address }: { chain: string; address: string }) {
  const [cevap, setCevap] = useState<Cevap | null>(null);
  const [acik, setAcik] = useState<string | null>(null);

  useEffect(() => {
    let iptal = false;
    fetch(`/api/adres/${chain}/${encodeURIComponent(address)}/blok-indeksi`)
      .then((r) => r.json())
      .then((j: Cevap) => { if (!iptal) setCevap(j); })
      .catch(() => { if (!iptal) setCevap({ durum: "bakilamadi", sebep: "istek başarısız" }); });
    return () => { iptal = true; };
  }, [chain, address]);

  return cevap ? <BlokIndeksiGorunumu chain={chain} cevap={cevap} acik={acik} setAcik={setAcik} /> : null;
}

/** Görünüm katmanı ayrı: oturumsuz ortamda gerçek veriyle statik olarak çizilip ölçülebilsin. */
export function BlokIndeksiGorunumu({
  chain, cevap, acik, setAcik,
}: { chain: string; cevap: Cevap; acik: string | null; setAcik: (a: string | null) => void }) {
  if (cevap.durum === "desteklenmiyor") return null;

  if (cevap.durum === "bakilamadi") {
    return (
      <Kayit koken="supheli" baslik="blok indeksi">
        <Bos>Blok indeksine bakılamadı{cevap.sebep ? ` (${cevap.sebep})` : ""}. Bu, "hareket yok" demek değildir.</Bos>
      </Kayit>
    );
  }

  const { pencere: p } = cevap;
  const satirlar = [
    ...cevap.gelen.map((v) => ({ yon: "gelen" as const, v })),
    ...cevap.giden.map((v) => ({ yon: "giden" as const, v })),
  ];

  return (
    <Kayit
      koken="indeks"
      baslik={
        <h2 className="etiket" title={`bloklar ${sayi(p.bas)}–${sayi(p.son)}`}>
          blok indeksi · {tarih(sn(p.zamanBas))} → {tarih(sn(p.zamanSon))}
        </h2>
      }
      sag={<span className="etiket m3">aday bilgi — takip ve rapor kullanmaz · toz: 1'in altı</span>}
    >
      {satirlar.length === 0 ? (
        <Bos>Bu pencerede adrese TRX ya da USDT girişi veya çıkışı yok. Pencere dışı için bir şey söylenemez.</Bos>
      ) : (
        <div className="tablo-sar">
          <table className="tablo">
            <thead>
              <tr>
                <th style={{ width: 70 }}>yön</th>
                <th style={{ width: 60 }}>varlık</th>
                <th className="sag">karşı taraf</th>
                <th className="sag">hareket</th>
                <th className="sag" style={{ width: 210 }}>toplam</th>
                <th style={{ width: 250 }}>ilk → son</th>
                <th style={{ width: 110 }} />
              </tr>
            </thead>
            <tbody>
              {satirlar.map(({ yon, v }) => {
                const anahtar = `${yon}-${v.varlik}`;
                return (
                  <Fragment key={anahtar}>
                    <tr>
                      <td><span className="veri" style={{ color: `var(--${yon})` }}>{yon}</span></td>
                      <td className="veri">{v.varlik}</td>
                      <td className="sag veri">
                        {sayi(v.karsiTaraf)}
                        {v.tozKarsiTaraf > 0 && (
                          <span className="koken-notu" data-koken="supheli" title="Bu karşı taraflarla yalnızca 1'in altında tutar geçti">
                            {sayi(v.tozKarsiTaraf)} yalnızca toz
                          </span>
                        )}
                      </td>
                      <td className="sag veri">
                        {sayi(v.hareket)}
                        {v.tozHareket > 0 && <span className="koken-notu">{sayi(v.tozHareket)} toz</span>}
                      </td>
                      <td className="sag tutar-hucre"><Tutar ham={v.toplam} ondalik={ONDALIK} sembol={v.varlik} /></td>
                      <td>
                        <Tarih deger={sn(v.ilk)} metin={tarih(sn(v.ilk))} /> → <Tarih deger={sn(v.son)} metin={tarih(sn(v.son))} />
                      </td>
                      <td>
                        <button onClick={() => setAcik(acik === anahtar ? null : anahtar)}>
                          {acik === anahtar ? "kapat" : `en büyük ${v.enBuyukler.length}`}
                        </button>
                      </td>
                    </tr>
                    {acik === anahtar &&
                      v.enBuyukler.map((k) => (
                        <tr key={`${anahtar}-${k.adres}`}>
                          <td />
                          <td className="m3 etiket">{yon === "gelen" ? "kimden" : "kime"}</td>
                          <td colSpan={2}><Adres deger={k.adres} zincir={chain} /></td>
                          <td className="sag tutar-hucre"><Tutar ham={k.toplam} ondalik={ONDALIK} sembol={v.varlik} /></td>
                          <td className="veri m3">{sayi(k.hareket)} hareket</td>
                          <td />
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Kayit>
  );
}
