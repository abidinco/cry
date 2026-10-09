/**
 * Ölçüm: koşu kaydı KODUN SÜRÜMÜNÜ taşıyor mu, rapor onu basıyor mu?
 *
 * Damganın değeri iddiada değil, iki uçta birlikte durmasında: koşu `stats.surum`
 * yazmalı ve rapor bunu METODOLOJİ satırına basmalı. Burada ikisi de gerçek bir
 * koşuyla ölçülüyor; sonra koşu silinir (deneme koşusu bırakılmaz).
 *
 * Koşum:
 *   node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/kosu-surum-olcum.mts [adres]
 */
import { prisma } from "@cry/db";
import { kanitPaketi, kosununSurumu } from "@cry/rapor";
import { takipKos } from "../apps/worker/src/takip.js";
import { surumuOku } from "../apps/worker/src/surum.js";

const ADRES = process.argv.find((a) => a.startsWith("T") && a.length > 30) ?? "TBJSNuiCtUeypr3AMeTBoTGMeu8SbS7ZxV";
/** `--kalsin`: ekranda bakılacak bir koşu bırakır (varsayılan: deneme koşusu SİLİNİR). */
const KALSIN = process.argv.includes("--kalsin");
const satir = (a: string, b: string) => console.log(`${a.padEnd(22)} ${b}`);

satir("süreç damgası", JSON.stringify(surumuOku()));
satir("CRY_SURUM", process.env.CRY_SURUM ? "dolu" : "(boş — git başına düşecek)");

const kullanici = await prisma.user.findFirstOrThrow({ where: { active: true }, select: { id: true } });
const vaka = await prisma.case.create({
  data: { slug: `olcum-surum-${Date.now().toString(36)}`, title: "ÖLÇÜM — sürüm damgası", ownerId: kullanici.id, isDraft: true },
});
const kosu = await prisma.traceRun.create({
  data: {
    caseId: vaka.id,
    chain: "tron",
    rootAddress: ADRES,
    taintRule: "fifo",
    params: { maxHop: 1, maxDugum: 3, dallanmaEsigi: 50, pencereSaat: 24, yalnizYerel: true },
  },
});

const ozet = await takipKos(kosu.id);
const sonra = await prisma.traceRun.findUniqueOrThrow({ where: { id: kosu.id }, select: { stats: true } });
const damga = kosununSurumu(sonra.stats);

satir("koşu", `${kosu.id} · ${ozet.dugum} düğüm / ${ozet.kenar} kenar`);
satir("stats.surum", JSON.stringify((sonra.stats as { surum?: unknown }).surum));
satir("rapor satırı", kanitPaketi({
  baslik: "ölçüm",
  uretildi: new Date().toISOString(),
  raporGunu: new Date().toISOString().slice(0, 10),
  vaka: { slug: vaka.slug, baslik: vaka.title },
  kosu: {
    id: kosu.id.toString(), zincir: "tron", kok: ADRES, yon: "ileri", atifKurali: "fifo",
    esikler: {}, durum: "bitti", durmaSebebi: null, baslangic: new Date().toISOString(), bitis: null,
    istatistik: sonra.stats,
  },
  gorulemeyenler: [],
  dugumler: [],
  kenarlar: [],
}).metodoloji.kodSurumuCumlesi);
satir("damga kaynağı", damga?.kaynak ?? "yok");

// Deneme koşusu bırakılmaz — `--kalsin` dışında.
if (KALSIN) {
  satir("bırakıldı", `koşu ${kosu.id} · vaka ${vaka.id} (${vaka.slug})`);
} else {
  await prisma.traceRun.delete({ where: { id: kosu.id } });
  await prisma.case.delete({ where: { id: vaka.id } });
  satir("temizlik", `koşu ${kosu.id} ve vaka ${vaka.id} silindi`);
}
await prisma.$disconnect();
