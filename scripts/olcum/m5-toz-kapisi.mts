// M5 ölçüm kapısı (2026-09-23): keşfin şekil ölçütü TOZU sayıyor mu, saymalı mı?
//
// Neden: pencere 9,7 günden 124 güne çıkınca `kesif-blok` adayları 50'den 3.859'a fırladı. Yazılacak
// her aday DOĞRULANMAMIŞ bir `exchange_hot` etiketidir ve motor onlara varınca `terminal_aday` deyip
// izi DURDURUR. 3.859 durak, yanlışsa 3.859 kesilmiş iz demek — önce neyi saydığımıza bakılır.
//
// Şüphe: `servisAdaylari` eşiği TOZ DAHİL karşı taraf sayısına uyguluyor. Adres zehirleme (bir
// adrese binlerce cüzdandan 0,000001 USDT göndermek) tam da bu sayıyı şişiriyor; CLAUDE.md'de
// ölçülmüş hâli var: "bir adrese gönderen 3.069 adresin 3.053'ü yalnızca toz". Toz gerekçede
// YAZILIYOR ama karara GİRMİYOR.
//
// Bu betik hiçbir şey yazmaz. İki ölçütü aynı pencerede yan yana koyar:
//   A) bugünkü kural  — eşik toz DAHİL sayıya
//   B) öneri          — eşik toz DIŞI (gerçek) karşı taraf sayısına; toz yine gerekçede
//
// Çalıştır:
//   node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/m5-toz-kapisi.mts
import { prisma } from "@cry/db";
import { base58ToHex } from "@cry/chain";
import { ayarOku, pencereOku, kesifSayilari } from "@cry/blok-indeks";
import { servisAdaylari, VARSAYILAN_KESIF, type AdresIstatistigi } from "../../packages/etiket/src/kesif.ts";

const MIN_GUVEN = Number(process.argv.find((x) => x.startsWith("--minGuven="))?.split("=")[1] ?? 0.7);

const a = ayarOku();
const p = await pencereOku(a);
if (!p) throw new Error("pencere yok");
const gun = ((p.zamanSon - p.zamanBas) / 86_400).toFixed(1);
console.log(`pencere ${p.bas}–${p.son} · ${gun} gün · güven > ${MIN_GUVEN}`);

const arsiv = await prisma.$queryRaw<{ address: string }[]>`
  select a.address from addresses a where a.chain = 'tron'`;
const hexten = new Map(arsiv.map((r) => [base58ToHex(r.address).slice(2).toLowerCase(), r.address]));
console.log(`arşivde ${arsiv.length} TRON adresi`);

const sayilar = await kesifSayilari(a, [...hexten.keys()], p);
console.log(`pencerede hareketi olan: ${sayilar.size}`);

/** Aynı istatistikler, iki farklı karşı taraf sayımıyla. */
const kur = (tozuSay: boolean): AdresIstatistigi[] =>
  [...sayilar].map(([h, s]) => ({
    address: hexten.get(h)!,
    indeksDurumu: "kismi" as const,
    altSinirNotu: "blok indeksi penceresi",
    gonderenSayisi: tozuSay ? s.gonderen : s.gonderen - s.tozGonderen,
    aliciSayisi: tozuSay ? s.alici : s.alici - s.tozAlici,
    tozGonderenSayisi: s.tozGonderen,
    tozAliciSayisi: s.tozAlici,
    hareketSayisi: s.hareket,
  }));

const A = servisAdaylari(kur(true), VARSAYILAN_KESIF);
const B = servisAdaylari(kur(false), VARSAYILAN_KESIF);
const gecen = (r: typeof A) => r.adaylar.filter((c) => c.guven > MIN_GUVEN);
const [ga, gb] = [gecen(A), gecen(B)];

console.log(`\nA) bugünkü kural (toz DAHİL): ${A.adaylar.length} aday, güven eşiğini geçen ${ga.length}`);
console.log(`B) öneri      (toz DIŞI):     ${B.adaylar.length} aday, güven eşiğini geçen ${gb.length}`);

const kumeB = new Set(gb.map((c) => c.address));
const sadeceA = ga.filter((c) => !kumeB.has(c.address));
console.log(`\nyalnızca A'da olan (toz olmasa eşiği geçemezdi): ${sadeceA.length}`);

// "N kayıt" bir doğrulama değildir: en uç örneklere elle bakılır.
const sayiAdresten = new Map([...sayilar].map(([h, s]) => [hexten.get(h)!, s]));
const tozOrani = (ad: string) => {
  const s = sayiAdresten.get(ad)!;
  const t = s.gonderen + s.alici;
  return t ? (s.tozGonderen + s.tozAlici) / t : 0;
};
console.log(`\nyalnızca A'da olanların en toz 10'u:`);
for (const c of [...sadeceA].sort((x, y) => tozOrani(y.address) - tozOrani(x.address)).slice(0, 10)) {
  const s = sayiAdresten.get(c.address)!;
  console.log(
    `  ${c.address}  güven ${c.guven}  ${c.sekil}` +
      `\n      gelen ${s.gonderen} (${s.tozGonderen} toz → gerçek ${s.gonderen - s.tozGonderen})` +
      ` · giden ${s.alici} (${s.tozAlici} toz → gerçek ${s.alici - s.tozAlici}) · ${s.hareket} hareket`,
  );
}

// Şekil de değişiyor mu: toz bir yönü şişirince "toplayıcı" görünen adres aslında geçiş olabilir.
const sekilA = new Map(ga.map((c) => [c.address, c.sekil]));
const sekilDegisen = gb.filter((c) => sekilA.has(c.address) && sekilA.get(c.address) !== c.sekil);
console.log(`\nikisinde de olup ŞEKLİ değişen: ${sekilDegisen.length}`);
for (const c of sekilDegisen.slice(0, 5)) console.log(`  ${c.address}  ${sekilA.get(c.address)} → ${c.sekil}`);

await prisma.$disconnect();
