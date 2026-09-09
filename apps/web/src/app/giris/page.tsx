"use client";

import { useState } from "react";

export default function GirisSayfasi() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setBekliyor(true);
    setHata(null);
    const yanit = await fetch("/api/oturum/giris", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setBekliyor(false);
    if (!yanit.ok) {
      const govde = (await yanit.json().catch(() => ({}))) as { error?: string };
      setHata(govde.error ?? "Giriş yapılamadı");
      return;
    }
    const hedef = new URLSearchParams(window.location.search).get("callbackUrl") ?? "/";
    // Açık yönlendirme olmasın: yalnızca kendi sitemizin yolu kabul edilir.
    window.location.href = hedef.startsWith("/") && !hedef.startsWith("//") ? hedef : "/";
  }

  return (
    <main
      className="sayfa"
      style={{ maxWidth: 360, display: "grid", alignContent: "center", minHeight: "100dvh" }}
    >
      <div style={{ marginBottom: 26 }}>
        <div className="marka" style={{ fontSize: 22 }}>cry</div>
        <div className="etiket">kripto akış analizi</div>
      </div>

      <form onSubmit={gonder} className="kayit satirlar" data-koken="kaynak">
        <label className="satirlar" style={{ gap: 5 }}>
          <span className="etiket">kullanıcı adı</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label className="satirlar" style={{ gap: 5 }}>
          <span className="etiket">şifre</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {hata && (
          <div className="veri" style={{ color: "var(--hata)" }}>
            {hata}
          </div>
        )}
        <div style={{ marginTop: 4 }}>
          <button className="birincil" disabled={bekliyor} style={{ padding: "7px 22px" }}>
            {bekliyor ? "…" : "gir"}
          </button>
        </div>
      </form>

      <p className="etiket" style={{ marginTop: 22 }}>
        kayıt yok · kullanıcıları yönetici açar
      </p>
    </main>
  );
}
