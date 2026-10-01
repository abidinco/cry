"use client";

/**
 * "Rapor al" — koşuyu mühürleyip kanıt paketine çeviren düğme.
 *
 * Form araya iki soru koyuyor ve ikisinin de sebebi var:
 *  - **Raporun adı:** adsız rapor bir dosyaya ait olmayan rapordur. Varsayılan
 *    bir ad üretmek onu gizlerdi.
 *  - **Vakanın adı, YALNIZCA karalama vakasında:** nihai amaç "adresi
 *    yapıştır, diyagramı al" olduğu için vaka otomatik açılıyor; bedeli rapor
 *    istenince ödenir (kullanıcı kararı, CLAUDE.md → Kalan kararlar).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RaporAl({
  kosuId,
  karalamaMi,
  vakaBasligi,
  kapali,
}: {
  kosuId: string;
  karalamaMi: boolean;
  vakaBasligi: string;
  /** Koşu sürüyor: yarım graf mühürlenmez. */
  kapali?: boolean;
}) {
  const router = useRouter();
  const [acik, setAcik] = useState(false);
  const [baslik, setBaslik] = useState("");
  const [vaka, setVaka] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  if (kapali) {
    return (
      <span className="takip-kilit" title="rapor bitmiş ya da durdurulmuş koşudan alınır">
        koşu sürüyor — rapor bitince alınır
      </span>
    );
  }

  if (!acik) {
    return (
      <button type="button" className="takip-gizle" onClick={() => setAcik(true)}>
        rapor al ▸
      </button>
    );
  }

  const gonder = async () => {
    setGonderiliyor(true);
    setHata(null);
    const yanit = await fetch("/api/rapor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        traceRunId: kosuId,
        baslik,
        vakaBasligi: karalamaMi ? vaka : undefined,
      }),
    });
    const govde = (await yanit.json().catch(() => ({}))) as { error?: string; raporId?: string };
    if (!yanit.ok || !govde.raporId) {
      setHata(govde.error ?? "rapor alınamadı");
      setGonderiliyor(false);
      return;
    }
    router.push(`/rapor/${govde.raporId}`);
  };

  return (
    <span className="takip-eylemler" style={{ flexWrap: "wrap" }}>
      <input
        autoFocus
        className="veri"
        placeholder="raporun adı"
        value={baslik}
        onChange={(e) => setBaslik(e.target.value)}
      />
      {karalamaMi && (
        <input
          className="veri"
          placeholder={`vakanın adı (şimdi: ${vakaBasligi})`}
          value={vaka}
          onChange={(e) => setVaka(e.target.value)}
          title="bu vaka karalama olarak açıldı; rapor bir dosyaya ait olmalı"
        />
      )}
      <button
        type="button"
        className="takip-devam"
        disabled={gonderiliyor || !baslik.trim() || (karalamaMi && !vaka.trim())}
        onClick={() => void gonder()}
      >
        {gonderiliyor ? "mühürleniyor…" : "mühürle"}
      </button>
      <button type="button" className="takip-gizle" onClick={() => setAcik(false)} disabled={gonderiliyor}>
        vazgeç
      </button>
      {hata && <span style={{ color: "var(--hata)" }}>{hata}</span>}
    </span>
  );
}
