/**
 * Log yolu ⟷ eski yol: GERÇEK TronGrid yanıtıyla, farklı derinliklerde, satır satır (idx dahil) karşılaştırma.
 *   node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/log-yolu-dogrula.mts [blokSayisi=20]
 * Ardışık, paralel YOK: anahtarsız TronGrid 8 paralel istekte IP'yi 403'ler (ölçüldü 2026-10-19).
 */
import { bloktanSatirlar, bloktanSatirlarLogla, loglariBloklaraBol, logsuzAraliksupheli, satirIzi } from "@cry/blok-indeks";
import { KAYNAKLAR, TronBlokKaynagi } from "../../apps/blok-okuyucu/src/kaynak.js";

// `--anahtarsiz`: anahtarın günlük 100.000 istek kotası dolmuşsa (doldurucu onu tüketir) saniyede 1 istekle.
const anahtarsiz = process.argv.includes("--anahtarsiz");
const anahtar = anahtarsiz ? undefined : process.env.TRONGRID_API_KEY;
if (!anahtarsiz && !anahtar) { console.error("TRONGRID_API_KEY boş — anahtarsız ölçüm için --anahtarsiz ver (saniyede 1 istek)."); process.exit(2); }
const n = Number(process.argv.find((x) => /^\d+$/.test(x)) ?? 20);
const k = new TronBlokKaynagi(KAYNAKLAR.trongrid(anahtar, anahtarsiz ? 1300 : 150));
const derinlikler = [73_000_000, 65_000_000, 55_000_000, 45_000_000, 35_000_000, 25_000_000, 15_000_000, 8_000_000, 3_000_000, 800_000];
let toplamUyusmaz = 0, toplamSatir = 0, toplamOlay = 0;
for (const bas of derinlikler) {
  const son = bas + n - 1;
  const t0 = Date.now();
  const govde = await k.bloklar(bas, son);
  const tBlok = Date.now() - t0;
  const t1 = Date.now();
  const tum = await k.loglar(bas, son);
  const tLog = Date.now() - t1;
  const bol = loglariBloklaraBol(tum, bas, son);
  const supheli = logsuzAraliksupheli([...govde.values()] as never[], tum.length);
  let uyusmaz = 0, satir = 0;
  const t2 = Date.now();
  for (let b = bas; b <= son; b++) {
    const blok = govde.get(b);
    if (!blok) { console.log(`  blok ${b}: gövdede yok`); uyusmaz++; continue; }
    const eski = bloktanSatirlar(blok as never, (await k.bilgi(b)) as never);
    const yeni = bloktanSatirlarLogla(blok as never, bol.get(b) ?? []);
    satir += eski.satirlar.length;
    if (satirIzi(eski) !== satirIzi(yeni)) { uyusmaz++; console.log(`  UYUŞMAZ blok ${b}: eski ${eski.satirlar.length} yeni ${yeni.satirlar.length}`); }
  }
  toplamUyusmaz += uyusmaz; toplamSatir += satir; toplamOlay += tum.length;
  console.log(`${String(bas).padStart(9)} +${n}: ${satir} satır · ${tum.length} olay · uyuşmaz ${uyusmaz} · şüpheli ${supheli} · gövde ${tBlok} ms · olaylar ${tLog} ms · (eski yol ${Date.now() - t2} ms)`);
}
console.log(`TOPLAM: ${toplamSatir} satır, ${toplamOlay} olay, uyuşmaz ${toplamUyusmaz}. Kaynak sayacı: ${JSON.stringify(k.sayac)}`);
process.exitCode = toplamUyusmaz === 0 && toplamSatir > 0 ? 0 : 1;
