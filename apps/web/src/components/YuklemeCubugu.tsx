"use client";

/**
 * Sayfanın en üstündeki ince yükleme çubuğu.
 *
 * Sunucudan "başladı" hâliyle gelir: tam sayfa yüklemesinde ilk kare zaten
 * çubuğu gösterir, hidrasyonla kaldığı yerden sürer. Sayfanın izlediği ilk
 * veri isteği bittiğinde tamamlanıp söner. Bağlantıya tıklandığında yeniden
 * başlar — sayfa gidene kadar kullanıcı tıklamanın alındığını görür.
 */

import { useEffect, useRef, useState } from "react";
import { sayfaGecisiMi, sonrakiIlerleme, surenIs, yuklemeDinle } from "@/lib/yukleme";

type Hal = { ilerleme: number; gorunur: boolean };

export default function YuklemeCubugu() {
  const [hal, setHal] = useState<Hal>({ ilerleme: 0.25, gorunur: true });
  const calisiyor = useRef(true);
  const zamanlayici = useRef<ReturnType<typeof setInterval> | null>(null);
  const sondurme = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const baslat = () => {
      if (sondurme.current) clearTimeout(sondurme.current);
      calisiyor.current = true;
      setHal((h) => ({ ilerleme: h.gorunur ? h.ilerleme : 0.08, gorunur: true }));
      if (!zamanlayici.current) {
        zamanlayici.current = setInterval(() => {
          setHal((h) => ({ ...h, ilerleme: sonrakiIlerleme(h.ilerleme) }));
        }, 200);
      }
    };
    const bitir = () => {
      if (!calisiyor.current) return;
      calisiyor.current = false;
      if (zamanlayici.current) clearInterval(zamanlayici.current);
      zamanlayici.current = null;
      setHal((h) => ({ ...h, ilerleme: 1 }));
      sondurme.current = setTimeout(() => setHal({ ilerleme: 0, gorunur: false }), 350);
    };

    baslat();
    // Sayfa hiçbir iş bildirmezse hidrasyonla birlikte tamamlanır; bildirirse
    // o iş bitince. Dinleyici ilk çağrıda mevcut sayıyı hemen verir.
    let ilk = true;
    const birak = yuklemeDinle((n) => {
      if (n > 0) baslat();
      else {
        // İlk karede sayfanın kendi ilk isteğine fırsat tanı: aynı anda
        // başlayacak bir fetch varsa çubuk erken sönmesin.
        setTimeout(() => {
          if (surenIs() === 0) bitir();
        }, ilk ? 80 : 0);
      }
      ilk = false;
    });

    const tikla = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      if (
        sayfaGecisiMi(
          { href: a.href, target: a.target, download: a.hasAttribute("download") },
          { origin: location.origin, pathname: location.pathname, search: location.search },
          { button: e.button, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey, alt: e.altKey },
        )
      ) {
        baslat();
      }
    };
    // Kod içinden yapılan gezinme (ör. çıkış sonrası `location.href`).
    const ayril = () => baslat();
    // Geri tuşuyla önbellekten dönen sayfada çubuk asılı kalmasın.
    const geriGeldi = (e: PageTransitionEvent) => {
      if (e.persisted) bitir();
    };

    document.addEventListener("click", tikla);
    window.addEventListener("beforeunload", ayril);
    window.addEventListener("pageshow", geriGeldi);
    return () => {
      birak();
      document.removeEventListener("click", tikla);
      window.removeEventListener("beforeunload", ayril);
      window.removeEventListener("pageshow", geriGeldi);
      if (zamanlayici.current) clearInterval(zamanlayici.current);
      if (sondurme.current) clearTimeout(sondurme.current);
    };
  }, []);

  return (
    <div className="yukleme-cubugu" data-gorunur={hal.gorunur} aria-hidden="true">
      <div className="yukleme-cubugu-dolu" style={{ transform: `scaleX(${hal.ilerleme})` }} />
    </div>
  );
}
