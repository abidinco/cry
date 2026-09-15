// B0 ölçümü (2026-09-15): tron-b0-ornekle.mts çıktısını çözümler — ağ YOK.
//   · yıllar: yıla göre blok başına USDT/TRX transferi, tutar eşiklerinin payı, yıllık satır tahmini
//   · ardışık pencere: eşik seçeneklerine göre günlük satır, adres tekrarı, başarısız/onay sayıları
// Çalıştır: node --import tsx scripts/olcum/b0-yillar-analiz.mts
import { readFileSync } from "node:fs";

const DIZIN = ".onbellek/b0";
const oku = (ad: string) => readFileSync(`${DIZIN}/${ad}`, "utf8").split("\n").filter(Boolean).map((l) => l.split(","));
const ESIK = [1, 10, 100, 1000, 10000];
const BIRIM = 1_000_000n; // USDT ve TRX 6 ondalık — karşılaştırma bigint'te, Number YOK

type Kova = { blok: number; usdt: number; trx: number; usdtEsik: number[]; trxEsik: number[]; basarisiz: number; onay: number };
const yeni = (): Kova => ({ blok: 0, usdt: 0, trx: 0, usdtEsik: ESIK.map(() => 0), trxEsik: ESIK.map(() => 0), basarisiz: 0, onay: 0 });

function kovala(bloklar: string[][], satirlar: string[][], anahtar: (zamanMs: number) => string) {
  const kova = new Map<string, Kova>();
  const blokKova = new Map<string, string>();
  for (const b of bloklar) {
    const k = anahtar(+b[1]!);
    blokKova.set(b[0]!, k);
    const v = kova.get(k) ?? yeni();
    v.blok++; v.onay += +b[6]!; kova.set(k, v);
  }
  for (const r of satirlar) {
    const v = kova.get(blokKova.get(r[0]!)!)!;
    if (r[8] === "0") { v.basarisiz++; continue; } // başarısız işlem transfer değildir
    const tutar = BigInt(r[7]!);
    const usdt = r[4] === "USDT";
    if (usdt) v.usdt++; else v.trx++;
    ESIK.forEach((e, j) => { if (tutar >= BigInt(e) * BIRIM) (usdt ? v.usdtEsik : v.trxEsik)[j]!++; });
  }
  return kova;
}
const yuzde = (p: number, t: number) => (t ? `%${((100 * p) / t).toFixed(1)}` : "—");

// --- yıllar ---
const yil = kovala(oku("yillar-bloklar.csv"), oku("yillar.csv"), (z) => String(new Date(z).getUTCFullYear()));
const yilTablo = [...yil].sort().map(([y, v]) => ({
  yil: y, blok: v.blok,
  usdtBlok: +(v.usdt / v.blok).toFixed(1), trxBlok: +(v.trx / v.blok).toFixed(1),
  gunlukUsdt: Math.round((v.usdt / v.blok) * 28_800), gunlukTrx: Math.round((v.trx / v.blok) * 28_800),
  usdt: Object.fromEntries(ESIK.map((e, j) => [`>=${e}`, yuzde(v.usdtEsik[j]!, v.usdt)])),
  trx: Object.fromEntries(ESIK.map((e, j) => [`>=${e}`, yuzde(v.trxEsik[j]!, v.trx)])),
  basarisiz: v.basarisiz, onay: v.onay,
}));
// Geçmiş satır tahmini: her yılın blok başına ortalaması × o yılın blok sayısı (2018 yarım yıl, bu yıl bugüne kadar)
const bugun = Date.UTC(2026, 8, 15);
let toplamUsdt = 0, toplamTrx = 0;
const esikToplam = { u100: 0, u1000: 0, t100: 0, u1: 0, t1: 0 };
for (const [y, v] of yil) {
  const bas = Math.max(Date.UTC(+y, 0, 1), Date.UTC(2018, 5, 25)), son = Math.min(Date.UTC(+y + 1, 0, 1), bugun);
  const blokSay = (son - bas) / 3000;
  toplamUsdt += (v.usdt / v.blok) * blokSay; toplamTrx += (v.trx / v.blok) * blokSay;
  esikToplam.u1 += (v.usdtEsik[0]! / v.blok) * blokSay; esikToplam.t1 += (v.trxEsik[0]! / v.blok) * blokSay;
  esikToplam.u100 += (v.usdtEsik[2]! / v.blok) * blokSay; esikToplam.t100 += (v.trxEsik[2]! / v.blok) * blokSay;
  esikToplam.u1000 += (v.usdtEsik[3]! / v.blok) * blokSay;
}

// --- ardışık pencere ---
const ardBlok = oku("ardisik-bloklar.csv"), ardSatir = oku("ardisik.csv");
const ard = kovala(ardBlok, ardSatir, () => "pencere").get("pencere")!;
const adres = new Map<string, number>();
for (const r of ardSatir) for (const a of [r[5]!, r[6]!]) adres.set(a, (adres.get(a) ?? 0) + 1);
const gun = (n: number) => Math.round((n / ard.blok) * 28_800);
const ardisik = {
  blok: ard.blok, satir: ardSatir.length, usdtBlok: +(ard.usdt / ard.blok).toFixed(1), trxBlok: +(ard.trx / ard.blok).toFixed(1),
  basarisizSatir: ard.basarisiz, onayOlayi: ard.onay,
  tekilAdres: adres.size, birKezGorulen: [...adres.values()].filter((n) => n === 1).length,
  gunlukSatir: {
    esiksiz: gun(ard.usdt + ard.trx),
    "USDT>=1 + TRX>=1": gun(ard.usdtEsik[0]! + ard.trxEsik[0]!),
    "USDT>=100 + TRX>=100": gun(ard.usdtEsik[2]! + ard.trxEsik[2]!),
    "yalnız USDT>=100": gun(ard.usdtEsik[2]!),
    "yalnız USDT>=1000": gun(ard.usdtEsik[3]!),
  },
  usdt: Object.fromEntries(ESIK.map((e, j) => [`>=${e}`, yuzde(ard.usdtEsik[j]!, ard.usdt)])),
  trx: Object.fromEntries(ESIK.map((e, j) => [`>=${e}`, yuzde(ard.trxEsik[j]!, ard.trx)])),
};

const Mn = (n: number) => +(n / 1e6).toFixed(0);
console.log(JSON.stringify({
  yillar: yilTablo,
  tamGecmisSatirMn: { usdt: Mn(toplamUsdt), trx: Mn(toplamTrx), "USDT>=1 + TRX>=1": Mn(esikToplam.u1 + esikToplam.t1), "USDT>=100 + TRX>=100": Mn(esikToplam.u100 + esikToplam.t100), "yalnız USDT>=100": Mn(esikToplam.u100), "yalnız USDT>=1000": Mn(esikToplam.u1000) },
  ardisik,
}, null, 1));
