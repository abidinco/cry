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

  const aktif = kullanicilar.filter((k) => k.active);
  // Rolün ANAHTARI "admin"; ekranda "Yönetici" yazıyor. Görünen adı ölçüt yapmak,
  // adı değişince sayıyı sessizce sıfırlardı (ölçüldü: kart "0 yönetici" diyordu).
  const yonetici = aktif.filter((k) => k.role.key === "admin");
  const degistirmeyen = aktif.filter((k) => k.mustChangePassword);

  return (
    <section>
      <div className="tepe">
        <h1>Yönetim</h1>
        <span className="cip">kullanıcılar ve roller</span>
      </div>

      {hata && (
        <div className="uyari" data-ton="hata" style={{ marginBottom: 12 }}>
          <span aria-hidden>⚠</span>
          <span>{hata}</span>
        </div>
      )}

      {/*
        Kartlar YALNIZCA listeden sayılır. Yığın sağlığı (okuyucunun geriliği, disk, yedek)
        buraya konmadı: `/saglik` yalnızca "süreç yaşıyor mu" diyor ve ölçmediğimiz bir sayıyı
        kart yapmak, bakılmamış bir yeri yeşil gösterirdi.
      */}
      <div className="kartlar">
        <div className="kart">
          <div className="etiket">aktif kullanıcı</div>
          <div className="kart-deger">
            {aktif.length}
            <small> / {kullanicilar.length}</small>
          </div>
          <div className="kart-alt">pasifler kayıtta kalır, silinmez</div>
        </div>
        <div className="kart">
          <div className="etiket">yönetici</div>
          <div className="kart-deger">{yonetici.length}</div>
          <div className="kart-alt">son aktif yönetici kapatılamaz</div>
        </div>
        <div className="kart">
          <div className="etiket">şifre değiştirmedi</div>
          <div className="kart-deger" data-ton={degistirmeyen.length > 0 ? "dikkat" : undefined}>
            {degistirmeyen.length}
          </div>
          <div className="kart-alt">ilk girişte değiştirmek zorunlu</div>
        </div>
      </div>

      {sifre && (
        <div className="uyari" style={{ marginBottom: 12 }}>
          <span aria-hidden>⚿</span>
          <span>
            <b>{sifre.kim}</b> için şifre — <em>bu değer bir daha gösterilmez:</em>
            <div
              className="veri"
              style={{
                fontSize: 16,
                letterSpacing: "0.06em",
                margin: "8px 0",
                background: "#0b1220",
                border: "1px dashed var(--vurgu)",
                borderRadius: "var(--kose-2)",
                padding: "9px 12px",
                display: "inline-block",
                color: "var(--m1)",
              }}
            >
              {sifre.deger}
            </div>
            <div>
              <button className="kucuk" onClick={() => setSifre(null)}>
                kapat
              </button>
            </div>
          </span>
        </div>
      )}

      <div className="ikili">
        <div className="sutun">
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
                {k.mustChangePassword && (
                  <span className="koken-notu" data-koken="supheli">
                    şifre değiştirmedi
                  </span>
                )}
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
              <td>
                <span className="rozet" data-ton={k.active ? "gelen" : undefined}>
                  {k.active ? "aktif" : "pasif"}
                </span>
              </td>
              <td className="veri m3">{k.lastLoginAt ? tarih(k.lastLoginAt) : "—"}</td>
              <td style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button className="kucuk" onClick={() => guncelle(k.id, { sifreSifirla: true }, k.username)}>
                  şifre sıfırla
                </button>
                <button
                  className={k.active ? "kucuk tehlike" : "kucuk"}
                  onClick={() => guncelle(k.id, { active: !k.active }, k.username)}
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
        </div>

        <div className="sutun">
          <Kayit koken="kaynak" baslik="yeni kullanıcı">
            <form className="panel" onSubmit={ekle} style={{ display: "grid", gap: 9 }}>
              <label style={{ display: "grid", gap: 5 }}>
                <span className="etiket">kullanıcı adı</span>
                <input
                  value={yeniAd}
                  onChange={(e) => setYeniAd(e.target.value)}
                  placeholder="kucukad"
                  className="veri"
                />
              </label>
              <label style={{ display: "grid", gap: 5 }}>
                <span className="etiket">rol</span>
                <select value={yeniRol} onChange={(e) => setYeniRol(e.target.value)}>
                  {roller.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="birincil" disabled={yeniAd.trim().length < 3}>
                kullanıcı aç
              </button>
              <p className="koken-notu" style={{ display: "block", margin: 0 }}>
                Üretilen şifre yalnızca YANITTA bir kez döner; hiçbir yere yazılmaz. İlk girişte
                değiştirmek zorunludur.
              </p>
            </form>
          </Kayit>

          <div className="uyari">
            <span aria-hidden>⚠</span>
            <span>
              Kullanıcı <b>silinmez</b>, pasife çekilir — denetim kaydı ona atıf yapıyor. Son
              aktif yönetici kapatılamaz ve kimse kendi rolünü düşüremez; kapı bunu kayıttan
              sorar, jetondan değil.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
