/**
 * Akışın saf katmanı artık PAKETTE: `packages/akis`.
 *
 * Taşındı (2026-10-09) çünkü aynı yerleşimi RAPOR da çizmesi gerekiyor
 * (`@cry/rapor` → `diyagram.ts`). İki ayrı yerleşim, aynı paranın iki farklı
 * resmi demekti ve karşı taraf ikisini yan yana koyabilirdi.
 *
 * Bu dosya yalnızca eski `@/lib/akis` yolunu koruyan bir geçittir: ekran
 * bileşenleri ve testler dokunulmadan çalışmaya devam ediyor.
 */
export * from "@cry/akis";
