import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // Docker imajında tek klasör çıktı — node_modules'ü taşımaya gerek kalmaz.
  output: "standalone",
  // Monorepo: workspace paketleri kaynak TypeScript olarak geliyor.
  transpilePackages: ["@cry/chain", "@cry/db", "@cry/kuyruk"],
  // Standalone çıktının kökü depo kökü olmalı, apps/web değil (Next 15'te
  // üst düzey seçenek, experimental değil).
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
};

export default config;
