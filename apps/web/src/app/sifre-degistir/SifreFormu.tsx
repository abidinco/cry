"use client";

import { useState } from "react";

export default function SifreFormu({ zorunlu }: { zorunlu: boolean }) {
  const [mevcut, setMevcut] = useState("");
  const [yeni, setYeni] = useState("");
  const [tekrar, setTekrar] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata(null);
    if (yeni !== tekrar) {
      setHata("Yeni şifreler birbirini tutmuyor");
      return;
    }
    setBekliyor(true);
    const yanit = await fetch("/api/oturum/sifre", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mevcut, yeni }),
    });
    setBekliyor(false);
    if (!yanit.ok) {
      const govde = (await yanit.json().catch(() => ({}))) as { error?: string };
      setHata(govde.error ?? "değiştirilemedi");
      return;
    }
    window.location.href = "/";
  }

  return (
    <form className="panel satirlar" onSubmit={gonder} style={{ gap: 12 }}>
      <label>
        <div className="etiket">Mevcut şifre</div>
        <input type="password" value={mevcut} onChange={(e) => setMevcut(e.target.value)} autoFocus style={{ width: "100%" }} />
      </label>
      <label>
        <div className="etiket">Yeni şifre (en az 10 karakter)</div>
        <input type="password" value={yeni} onChange={(e) => setYeni(e.target.value)} style={{ width: "100%" }} />
      </label>
      <label>
        <div className="etiket">Yeni şifre (tekrar)</div>
        <input type="password" value={tekrar} onChange={(e) => setTekrar(e.target.value)} style={{ width: "100%" }} />
      </label>
      {hata && <div className="veri" style={{ color: "var(--hata)" }}>{hata}</div>}
      <button className="birincil" disabled={bekliyor}>{bekliyor ? "…" : "değiştir"}</button>
      {!zorunlu && (
        <a className="etiket" href="/" style={{ fontSize: 13 }}>
          Vazgeç
        </a>
      )}
    </form>
  );
}
