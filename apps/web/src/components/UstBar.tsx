"use client";

/** Üst şerit: kim girmiş, nereye gidilir, çıkış. Sabit yükseklik, tek çizgi. */
export default function UstBar({ username, admin }: { username: string; admin: boolean }) {
  async function cik() {
    await fetch("/api/oturum/cikis", { method: "POST" });
    window.location.href = "/giris";
  }

  return (
    <header className="ust">
      <a href="/" className="marka">
        cry
      </a>
      <span className="etiket" style={{ marginLeft: -8 }}>
        akış analizi
      </span>
      <span style={{ flex: 1 }} />
      {admin && (
        <a href="/yonetim" className="etiket" style={{ color: "var(--m2)" }}>
          yönetim
        </a>
      )}
      <a href="/sifre-degistir" className="etiket" style={{ color: "var(--m2)" }}>
        şifre
      </a>
      <span className="veri m3">{username}</span>
      <button onClick={cik}>çıkış</button>
    </header>
  );
}
