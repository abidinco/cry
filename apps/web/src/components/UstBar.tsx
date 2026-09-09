"use client";

/** Her sayfanın üstündeki ince şerit: kim girmiş, nereye gidilir, çıkış. */
export default function UstBar({ username, admin }: { username: string; admin: boolean }) {
  async function cik() {
    await fetch("/api/oturum/cikis", { method: "POST" });
    window.location.href = "/giris";
  }

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        borderBottom: "1px solid var(--cizgi)",
        paddingBottom: 10,
        marginBottom: 18,
      }}
    >
      <a href="/" style={{ fontWeight: 700, textDecoration: "none" }}>
        cry
      </a>
      <span style={{ flex: 1 }} />
      {admin && (
        <a href="/yonetim" className="soluk" style={{ fontSize: 13 }}>
          Yönetim
        </a>
      )}
      <a href="/sifre-degistir" className="soluk" style={{ fontSize: 13 }}>
        Şifre
      </a>
      <span className="mono soluk">{username}</span>
      <button onClick={cik} style={{ fontSize: 13, padding: "6px 10px" }}>
        Çıkış
      </button>
    </header>
  );
}
