"use client";

import type { ReactNode } from "react";

/**
 * Kabuk: solda sabit ray, sağda sayfa. Üst şeridin yerini aldı (tasarım yönü C,
 * kullanıcı kararı 2026-10-08) — ray dikey olduğu için takip ekranına bir satır
 * değil bir sütun ödüyoruz ve tek ekran kuralı korunuyor.
 *
 * `aktif` hangi düğmenin yanacağını söyler; adres/işlem/takip gibi derin
 * sayfalarda hiçbiri yanmaz, çünkü ray bir KONUM değil bir geçiş aracıdır.
 */
export type RayBolumu = "ara" | "etiket" | "izleme" | "yonetim" | "sifre" | null;

const BOLUMLER: { ad: Exclude<RayBolumu, null>; yol: string; isaret: string; baslik: string }[] = [
  { ad: "ara", yol: "/", isaret: "⌕", baslik: "ara" },
  { ad: "etiket", yol: "/etiket", isaret: "⛉", baslik: "etiket incelemesi" },
  { ad: "izleme", yol: "/izleme", isaret: "◉", baslik: "izleme" },
  { ad: "yonetim", yol: "/yonetim", isaret: "⚙", baslik: "yönetim" },
  { ad: "sifre", yol: "/sifre-degistir", isaret: "✻", baslik: "şifre değiştir" },
];

export default function Kabuk({
  username,
  admin,
  aktif = null,
  genis = false,
  children,
}: {
  username: string;
  admin: boolean;
  aktif?: RayBolumu;
  genis?: boolean;
  children: ReactNode;
}) {
  async function cik() {
    await fetch("/api/oturum/cikis", { method: "POST" });
    window.location.href = "/giris";
  }

  return (
    <div className="kabuk">
      <nav className="ray" aria-label="bölümler">
        <a href="/" className="marka" title="cry — akış analizi">
          c
        </a>
        {BOLUMLER.filter((b) => b.ad !== "yonetim" || admin).map((b) => (
          <a
            key={b.ad}
            href={b.yol}
            className="ray-dugme"
            title={b.baslik}
            aria-label={b.baslik}
            aria-current={aktif === b.ad ? "page" : undefined}
          >
            {b.isaret}
          </a>
        ))}
        <span className="ray-alt">
          <span className="ray-kullanici" title={username}>
            {username.slice(0, 2)}
          </span>
          <button className="ray-cikis" onClick={cik}>
            çık
          </button>
        </span>
      </nav>
      <main className={genis ? "ana ana-genis" : "ana"}>{children}</main>
    </div>
  );
}
