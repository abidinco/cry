"use client";

import { useEffect, useState } from "react";
import { Kayit } from "@/components/ui";
import { tarih } from "@/lib/bicim";

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
        <div className="panel" style={{ borderColor: "var(--dikkat)", marginBottom: 14 }}>
          <strong>{sifre.kim}</strong> için şifre — <em>bu değer bir daha gösterilmez:</em>
          <div className="veri" style={{ fontSize: 16, margin: "8px 0" }}>{sifre.deger}</div>
          <button onClick={() => setSifre(null)} style={{ fontSize: 13, padding: "6px 10px" }}>
            Kapat
          </button>
        </div>
      )}

      <Kayit koken="kaynak" baslik="yeni kullanıcı">
      <form className="panel" onSubmit={ekle} style={{ display: "flex", gap: 8 }}>
        <input
          value={yeniAd}
          onChange={(e) => setYeniAd(e.target.value)}
          placeholder="kullanıcı adı"
          className="veri"
          style={{ flex: 1 }}
        />
        <select value={yeniRol} onChange={(e) => setYeniRol(e.target.value)}>
          {roller.map((r) => (
            <option key={r.key} value={r.key}>{r.name}</option>
          ))}
        </select>
        <button className="birincil" disabled={yeniAd.trim().length < 3}>kullanıcı aç</button>
      </form>
      </Kayit>

      <Kayit koken="kaynak" baslik="kullanıcılar">
      <div className="tablo-sar">
      <table className="tablo">
        <thead>
          <tr>
            <th>kullanıcı</th>
            <th>rol</th>
            <th>durum</th>
            <th>son giriş</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {kullanicilar.map((k) => (
            <tr key={k.id} >
              <td className="veri">
                {k.username}
                {k.mustChangePassword && <span className="etiket"> · şifre değiştirmedi</span>}
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
              <td style={{ color: k.active ? "var(--gelen)" : "var(--m3)" }}>
                {k.active ? "aktif" : "pasif"}
              </td>
              <td className="soluk mono" style={{ fontSize: 12 }}>
                {k.lastLoginAt ? tarih(k.lastLoginAt) : "—"}
              </td>
              <td style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button
                  onClick={() => guncelle(k.id, { sifreSifirla: true }, k.username)}
                  style={{ fontSize: 12, padding: "5px 8px" }}
                >
                  şifre sıfırla
                </button>
                <button
                  onClick={() => guncelle(k.id, { active: !k.active }, k.username)}
                  style={{ fontSize: 12, padding: "5px 8px" }}
                >
                  {k.active ? "kapat" : "aç"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      </Kayit>
    </section>
  );
}
