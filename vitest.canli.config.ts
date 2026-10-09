/**
 * CANLI sözleşme testleri — ağa ÇIKAN, normalde koşmayan takım.
 *
 * `npm test` bunları ÇALIŞTIRMAZ (varsayılan yapılandırma yalnızca `tests/`
 * içini alır) ve CI de koşmaz: ağ, kota ve anahtar ister. `npm run test:canli`
 * elle koşulur ve sorduğu soru şudur — **kaynağın şekli hâlâ bizim okuduğumuz
 * şekil mi?** Bu projedeki ciddi kusurların hepsi canlı veriyle çıktı; hiçbiri
 * tip kontrolünden geçmedi diye yakalanmadı (öneri 15).
 *
 * Sıra ZORUNLU olarak tek dosya/tek iş: TronGrid'in kotası canlı yığınla
 * paylaşılıyor ve CoinGecko'nun kapısı 13 saniye. Paralel koşan bir takım,
 * ölçtüğü şeyi hız sınırına sokar.
 */
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "apps/web/src") },
  },
  test: {
    include: ["tests-canli/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests-canli/ortam.ts"],
    // Ağ + geri çekilme: tek bir denetim 60 saniyeye kadar sürebilir.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    sequence: { concurrent: false },
    // Tek bir hız sınırı, sonraki denetimleri de düşürür; ilk kırmızıda durulur.
    bail: 0,
    retry: 0,
  },
});
