"use client";

import { useEffect, useState } from "react";

type Rol = { key: string; name: string };
type Kullanici = {
  id: number;
  username: string;
  displayName: string | null;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  role: Rol;
};

export default function KullaniciYonetimi() {
  const [kullanicilar, setKullanicilar] = useState<Kullanici[]>([]);
  const [roller, setRoller] = useState<Rol[]>([]);
  const [hata, setHata] = useState<string | null>(null);
  const [yeniAd, setYeniAd] = useState("");
  const [yeniRol, setYeniRol] = useState("analist");
  /** Üretilen şifre YALNIZCA burada, bir kez görünür; hiçbir yere yazılmaz. */
  const [sifre, setSifre] = useState<{ kim: string; deger: string } | null>(null);

  async function yukle() {
    const yanit = await fetch("/api/kullanici");
    if (!yanit.ok) {
      setHata("liste alınamadı");
      return;
    }
    const govde = (await yanit.json()) as { kullanicilar: Kullanici[]; roller: Rol[] };
    setKullanicilar(govde.kullanicilar ?? []);
    setRoller(govde.roller ?? []);
  }

  useEffect(() => {
    void yukle();
  }, []);

  async function ekle(e: React.FormEvent) {
    e.preventDefault();
    setHata(null);
    const yanit = await fetch("/api/kullanici", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: yeniAd, role: yeniRol }),
    });
    const govde = (await yanit.json().catch(() => ({}))) as { error?: string; sifre?: string };
    if (!yanit.ok) {
      setHata(govde.error ?? "eklenemedi");
      return;
    }
    setSifre({ kim: yeniAd, deger: govde.sifre ?? "" });
    setYeniAd("");
    void yukle();
  }

  async function guncelle(id: number, govde: Record<string, unknown>, kim: string) {
    setHata(null);
    const yanit = await fetch(`/api/kullanici/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(govde),
    });
    const cevap = (await yanit.json().catch(() => ({}))) as { error?: string; sifre?: string };
    if (!yanit.ok) {
      setHata(cevap.error ?? "güncellenemedi");
      return;
    }
    if (cevap.sifre) setSifre({ kim, deger: cevap.sifre });
    void yukle();
  }

  return (
    <section>
      {hata && <p style={{ color: "var(--hata)" }}>{hata}</p>}

      {sifre && (
        <div className="panel" style={{ borderColor: "var(--uyari)", marginBottom: 14 }}>
          <strong>{sifre.kim}</strong> için şifre — <em>bu değer bir daha gösterilmez:</em>
          <div className="mono" style={{ fontSize: 16, margin: "8px 0" }}>{sifre.deger}</div>
          <button onClick={() => setSifre(null)} style={{ fontSize: 13, padding: "6px 10px" }}>
            Kapat
          </button>
        </div>
      )}

      <form className="panel" onSubmit={ekle} style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input
          value={yeniAd}
          onChange={(e) => setYeniAd(e.target.value)}
          placeholder="kullanıcı adı"
          className="mono"
          style={{ flex: 1 }}
        />
        <select value={yeniRol} onChange={(e) => setYeniRol(e.target.value)}>
          {roller.map((r) => (
            <option key={r.key} value={r.key}>{r.name}</option>
          ))}
        </select>
        <button disabled={yeniAd.trim().length < 3}>Ekle</button>
      </form>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr className="soluk" style={{ textAlign: "left" }}>
            <th>Kullanıcı</th>
            <th>Rol</th>
            <th>Durum</th>
            <th>Son giriş</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {kullanicilar.map((k) => (
            <tr key={k.id} style={{ borderTop: "1px solid var(--cizgi)" }}>
              <td className="mono">
                {k.username}
                {k.mustChangePassword && <span className="soluk"> · şifre değiştirmedi</span>}
              </td>
              <td>
                <select
                  value={k.role.key}
                  onChange={(e) => guncelle(k.id, { role: e.target.value }, k.username)}
                >
                  {roller.map((r) => (
                    <option key={r.key} value={r.key}>{r.name}</option>
                  ))}
                </select>
              </td>
              <td style={{ color: k.active ? "var(--tamam)" : "var(--metin-soluk)" }}>
                {k.active ? "aktif" : "pasif"}
              </td>
              <td className="soluk mono" style={{ fontSize: 12 }}>
                {k.lastLoginAt ? new Date(k.lastLoginAt).toLocaleString("tr-TR") : "—"}
              </td>
              <td style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button
                  onClick={() => guncelle(k.id, { sifreSifirla: true }, k.username)}
                  style={{ fontSize: 12, padding: "5px 8px" }}
                >
                  Şifre sıfırla
                </button>
                <button
                  onClick={() => guncelle(k.id, { active: !k.active }, k.username)}
                  style={{ fontSize: 12, padding: "5px 8px" }}
                >
                  {k.active ? "Kapat" : "Aç"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
