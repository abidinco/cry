import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // Docker imajında tek klasör çıktı — node_modules'ü taşımaya gerek kalmaz.
  output: "standalone",
  // Monorepo: workspace paketleri kaynak TypeScript olarak geliyor.
  transpilePackages: ["@cry/blok-indeks", "@cry/chain", "@cry/db", "@cry/kuyruk", "@cry/motor"],
  // Standalone çıktının kökü depo kökü olmalı, apps/web değil (Next 15'te
  // üst düzey seçenek, experimental değil).
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // @cry/blok-indeks NodeNext düzeninde yazıldı (`./istemci.js` → istemci.ts; tsx ve tsc öyle çözüyor).
  // webpack .js uzantısını .ts'ye çevirmiyor ve derleme "Module not found" ile düşüyordu (ölçüldü, 2026-09-17).
  webpack: (yapilandirma) => {
    yapilandirma.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return yapilandirma;
  },
};

export default config;
