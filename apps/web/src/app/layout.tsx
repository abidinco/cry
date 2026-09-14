import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import YuklemeCubugu from "@/components/YuklemeCubugu";

/**
 * Yazı tipleri BUILD ANINDA kendi sunucumuza gömülür (next/font). Dışarıdan
 * çekilseydi, bir soruşturma sayfasını her açışta tarayıcı üçüncü bir tarafa
 * haber vermiş olurdu.
 *
 * Üç rol, üç aile:
 * - Space Grotesk: başlıklar. Teknik ama karakterli; arayüze ses veriyor.
 * - IBM Plex Sans: gövde. Veri yoğun kurumsal arayüzler için tasarlandı.
 * - IBM Plex Mono: adres, hash ve TUTAR. Rakamları tablo hizalı.
 */
const baslik = Space_Grotesk({
  subsets: ["latin-ext"],
  weight: ["500", "700"],
  variable: "--yazi-baslik",
});

const govde = IBM_Plex_Sans({
  subsets: ["latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--yazi-govde",
});

const veri = IBM_Plex_Mono({
  subsets: ["latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--yazi-veri",
});

export const metadata: Metadata = {
  title: "cry — kripto akış analizi",
  description: "Cüzdanlar arası para akışını takip eden analiz aracı",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${baslik.variable} ${govde.variable} ${veri.variable}`}>
      <body>
        <YuklemeCubugu />
        {children}
      </body>
    </html>
  );
}
