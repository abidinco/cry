/**
 * Canlı uç denetimi (B4 bitiş ölçütü) — bir blok aralığında kapsam boşluksuz mu, kursör uçtan ne kadar geride?
 *
 *   node --env-file=.env --env-file=apps/web/.env.local --import tsx apps/blok-okuyucu/src/canli-denetle.ts --bas=<blok> [--son=<blok>]
 *
 * `--son` verilmezse Postgres'teki kursör (`last_final_block`) alınır. Boşluk varsa öbekleriyle yazılır ve çıkış 1.
 * Satır sayısı da kapsamla karşılaştırılır (`FINAL`, CLAUDE.md kuralı): yarım yazılmış blok olmamalı.
 */
import { ayarOku, sorgu, eksikAraliklar, aralikBoyu, KAPSAM_TABLO, TABLO } from "@cry/blok-indeks";
import { prisma } from "@cry/db";
import { TronBlokKaynagi, KAYNAKLAR } from "./kaynak.js";

const deger = (ad: string) => process.argv.find((x) => x.startsWith(`--${ad}=`))?.split("=")[1];
const bas = Number(deger("bas"));
if (!Number.isSafeInteger(bas)) { console.error("kullanım: canli-denetle.ts --bas=<blok> [--son=<blok>]"); process.exit(2); }
const kayit = await prisma.blockCursor.findUnique({ where: { chain: "tron" } });
await prisma.$disconnect();
const son = deger("son") !== undefined ? Number(deger("son")) : kayit?.lastFinalBlock ?? NaN;
if (!Number.isSafeInteger(son) || son < bas) { console.error(`son blok yok ya da bas'tan küçük (kursör ${kayit?.lastFinalBlock ?? "boş"})`); process.exit(2); }

const a = ayarOku();
const W = `blok BETWEEN ${bas} AND ${son}`;
const okunan = new Set((await sorgu(a, `SELECT blok FROM ${KAPSAM_TABLO} WHERE ${W} FORMAT TSV`)).split("\n").filter(Boolean).map(Number));
const eksik = eksikAraliklar({ bas, son }, okunan);
const [zmin, zmax, kapsamSatir] = (await sorgu(a, `SELECT toUnixTimestamp(min(zaman)), toUnixTimestamp(max(zaman)), sum(satir) FROM ${KAPSAM_TABLO} FINAL WHERE ${W} FORMAT TSV`)).trim().split("\t").map(Number);
const satir = Number((await sorgu(a, `SELECT count() FROM ${TABLO} FINAL WHERE ${W} FORMAT TSV`)).trim());
const uc = await new TronBlokKaynagi(KAYNAKLAR.publicnode()).kesinlesmisBlok().catch(() => NaN);

const saat = ((zmax! - zmin!) / 3600).toFixed(1);
console.log(`aralık ${bas}–${son} (${aralikBoyu({ bas, son })} blok, ${saat} saat: ${new Date(zmin! * 1000).toISOString()} → ${new Date(zmax! * 1000).toISOString()})`);
console.log(`kapsam: ${okunan.size} blok okunmuş · boşluk ${eksik.length} öbek / ${eksik.reduce((t, r) => t + aralikBoyu(r), 0)} blok${eksik.length ? ` · ilk öbekler ${JSON.stringify(eksik.slice(0, 5))}` : ""}`);
console.log(`satır: FINAL ${satir} · kapsamın saydığı ${kapsamSatir} · ${satir === kapsamSatir ? "TUTARLI" : "UYUŞMUYOR"}`);
console.log(`kursör ${kayit?.lastFinalBlock ?? "boş"} · kesinleşmiş uç ${uc} · geride ${uc - (kayit?.lastFinalBlock ?? NaN)} blok · kursörün son yazımı ${kayit?.lastRunAt?.toISOString() ?? "-"}`);
process.exit(eksik.length || satir !== kapsamSatir ? 1 : 0);
