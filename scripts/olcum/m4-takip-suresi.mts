// M4 ölçüm kapısı (2026-09-22): "rastgele bir adres verdiğimde takip koşusu ne kadar sürüyor?"
//
// Kullanıcının hedefi: "Ben sana rastgele bir cüzdan adresi veya TX hash verdiğimde ÇOK UZUN
// OLMAYAN bir sürede bunun sankey diyagramını, takip koşusunu çıkarmanı isteyeceğim."
// M1–M3 motoru blok indeksine bağladı; bu betik o işin UÇTAN UCA karşılığını ölçer.
//
// Kullanıcının BEKLEDİĞİ süre iki parçadır ve ikisi de ölçülür:
//   1. KÖKÜ İNDEKSLEME — motor tohumu Postgres'ten okuyor (`tohumGirisleri`), yani indekslenmemiş
//      bir adresle koşu 1 düğümde biter. Ölçüldü: taze adreste koşu 10,9 sn sürdü ve 0 kenar verdi.
//      Arayüzdeki gerçek sıra da budur: adres aranır, indekslenir, sonra takip başlatılır.
//   2. TAKİP KOŞUSU — keşfettiği her yeni adresi kendisi indeksler.
//
// Ölçülen şey koşunun toplam süresi DEĞİL yalnızca: süre nereye gidiyor, onu da ayırır —
// koşu sırasında indekslenen her adres için hangi yolun (indeks / melez / trongrid) seçildiği
// ve kaç saniye sürdüğü. "Hızlandı" demek yetmez; NEYİN hızlandığı söylenir.
//
// Koşu kuyruğa ATILMAZ: `takipKos` doğrudan çağrılır (CLAUDE.md — ikinci bir worker süreci
// başlatmak yasak). Deneme koşusu iş bitince SİLİNİR (kullanıcı kararı 2026-09-15).
//
// Çalıştır:
//   node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/m4-takip-suresi.mts \
//     --adres=T... [--hop=2] [--dugum=12] [--sakla]
import { prisma } from "@cry/db";
import { takipKos } from "../../apps/worker/src/takip.ts";
import { adaptorAl } from "../../apps/worker/src/indeksle.ts";
import { BlokIndeksliAdaptor } from "../../apps/worker/src/blok-indeksli-adaptor.ts";
import { ayarOku, pencereOku } from "@cry/blok-indeks";

const deger = (ad: string) => process.argv.find((x) => x.startsWith(`--${ad}=`))?.split("=")[1];
const ADRES = deger("adres");
const HOP = Number(deger("hop") ?? 2);
const DUGUM = Number(deger("dugum") ?? 12);
const SAKLA = process.argv.includes("--sakla");
if (!ADRES) { console.error("--adres=T... zorunlu"); process.exit(2); }

const p = await pencereOku(ayarOku());
console.log(`pencere ${p ? `${new Date(p.zamanBas * 1000).toISOString().slice(0, 10)} -> ${new Date(p.zamanSon * 1000).toISOString().slice(0, 10)} (${((p.zamanSon - p.zamanBas) / 86400).toFixed(1)} gün)` : "YOK"}`);

// Koşu bir VAKAYA ait olmak zorunda (şema kuralı). Ölçüm için var olan bir vakaya iliştirilir.
const vaka = await prisma.case.findFirst({ select: { id: true } });
if (!vaka) { console.error("vaka yok - ölçüm koşusu bir vakaya iliştirilemiyor"); process.exit(2); }

const adaptor = adaptorAl("tron");
const sayacli = adaptor instanceof BlokIndeksliAdaptor ? adaptor : null;
sayacli?.sayaciSifirla();

// Kök artık `takipKos` tarafından indeksleniyor (tohumdan ÖNCE); burada elle yapılmaz.
// Ölçülen şey kullanıcının TEK adımda beklediği süre: adresi verdi, koşuyu aldı.
const kosu = await prisma.traceRun.create({
  data: {
    caseId: vaka.id, chain: "tron", rootAddress: ADRES, taintRule: "fifo",
    params: { maxHop: HOP, maxDugum: DUGUM },
    status: "kuyrukta",
  },
  select: { id: true },
});
console.log(`deneme koşusu ${kosu.id} açıldı (kök ${ADRES}, hop ${HOP}, düğüm ${DUGUM})`);

const t0 = performance.now();
let ozet: unknown = null;
let hata: unknown = null;
try {
  ozet = await takipKos(kosu.id);
} catch (e) {
  hata = e;
}
const sure = (performance.now() - t0) / 1000;

const son = await prisma.traceRun.findUnique({
  where: { id: kosu.id },
  select: { status: true, stopReason: true, stats: true, _count: { select: { nodes: true, edges: true } } },
});

console.log(`\n=== SONUÇ ===`);
console.log(`kullanıcının beklediği toplam: ${sure.toFixed(1)} sn (kök taraması dahil)`);
console.log(`kök taraması: ${JSON.stringify((son?.stats as Record<string, unknown>)?.kokTaramasi ?? "yapılmadı (kök zaten taranmıştı)")}`);
console.log(`koşu ${sure.toFixed(1)} sn · durum ${son?.status} · başlık sebep ${son?.stopReason} · ${son?._count.nodes} düğüm / ${son?._count.edges} kenar`);
if (hata) console.log(`HATA: ${(hata as Error).message.slice(0, 200)}`);
console.log(`durma dağılımı: ${JSON.stringify((son?.stats as Record<string, unknown>)?.durma ?? {})}`);
if (ozet) console.log(`motor özeti: ${JSON.stringify(ozet)}`);

// Yol dağılımı, adaptörün kendi sayacından: koşu sırasında her adres için hangi yol seçildi.
if (sayacli) {
  const y = sayacli.sayac;
  const t = y["blok-indeksi"] + y.melez + y.trongrid;
  console.log(`yol dağılımı (${t} tarama): blok-indeksi=${y["blok-indeksi"]} · melez=${y.melez} · trongrid=${y.trongrid}`);
}

// Koşu sırasında kaç adres indekslendi ve hangi durumda kaldı.
const durumlar = await prisma.address.groupBy({
  by: ["indexState"],
  where: { chain: "tron", lastIndexedAt: { gte: new Date(Date.now() - sure * 1000 - 5000) } },
  _count: true,
});
console.log(`bu koşuda indekslenen adresler: ${durumlar.map((d) => `${d.indexState}=${d._count}`).join(" · ") || "yok"}`);

if (SAKLA) {
  console.log(`\nkoşu ${kosu.id} SAKLANDI (--sakla) - arayüzde bakılabilir, sonra elle silin.`);
} else {
  // Deneme koşusu iş bitince silinir; düğüm ve kenarlar cascade ile gider.
  await prisma.traceRun.delete({ where: { id: kosu.id } });
  console.log(`\ndeneme koşusu ${kosu.id} silindi`);
}
await prisma.$disconnect();
