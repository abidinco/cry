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
      setHata(govde.error ?? "giriş başarısız");
      return;
    }
    const hedef = new URLSearchParams(window.location.search).get("callbackUrl") ?? "/";
    // Açık yönlendirme olmasın: yalnızca kendi sitemizin yolu kabul edilir.
    window.location.href = hedef.startsWith("/") && !hedef.startsWith("//") ? hedef : "/";
  }

  return (
    <main className="kutu" style={{ maxWidth: 380 }}>
      <h1 style={{ fontSize: 22 }}>cry</h1>
      <form className="panel" onSubmit={gonder} style={{ display: "grid", gap: 10 }}>
        <label>
          <div className="soluk">Kullanıcı adı</div>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus style={{ width: "100%" }} />
        </label>
        <label>
          <div className="soluk">Şifre</div>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%" }} />
        </label>
        {hata && <div style={{ color: "var(--hata)" }}>{hata}</div>}
        <button disabled={bekliyor}>{bekliyor ? "…" : "Giriş"}</button>
      </form>
      <p className="soluk" style={{ fontSize: 13 }}>
        Kayıt yok; kullanıcıları yönetici açar.
      </p>
    </main>
  );
}
