import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "cry — kripto akış analizi",
  description: "Cüzdanlar arası para akışını takip eden analiz aracı",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
