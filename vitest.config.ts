import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Next uygulamasının "@/..." takma adı; testler middleware ve yetki
      // katmanını doğrudan içe aktarıyor.
      "@": path.resolve(import.meta.dirname, "apps/web/src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
