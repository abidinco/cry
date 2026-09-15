// B0 ölçümü (2026-09-15): TRON bloklarından USDT-TRC20 ve TRX transferlerini örnekler.
//   1) ardisik: güncel kesinleşmiş uçtan geriye ARDIŞIK N blok — depolama denemesinin gerçek tabanı
//      ve adres tekrar oranı (sıkıştırmayı belirleyen şey).
//   2) yillar: 2018-06'dan bugüne her yıla yayılmış örnek bloklar — yıla göre hacim ve tutar dağılımı.
// Satırlar .onbellek/b0/*.csv'ye yazılır (gitignore'da); var olan blok yeniden istenmez.
// Çalıştır:
//   node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/tron-b0-ornekle.mts [--ardisik=1200] [--yilBasina=125]
// Anahtar (TRONGRID_API_KEY) ekrana basılmaz.
import { mkdirSync, existsSync, readFileSync, appendFileSync } from "node:fs";

const arg = (ad: string, vars: number) => Number(process.argv.find((a) => a.startsWith(`--${ad}=`))?.split("=")[1] ?? vars);
const ARDISIK = arg("ardisik", 1200);
const YIL_BASINA = arg("yilBasina", 125);
const ES_ZAMAN = arg("eszaman", 4);

const K = process.env.TRONGRID_API_KEY ?? "";
const H = { "Content-Type": "application/json", ...(K ? { "TRON-PRO-API-KEY": K } : {}) };
const USDT_HEX = "a614f803b6fd780986a42c78ec9c7f77e6ded13c";
const TRANSFER = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const KESINLESME = 30; // ~19 onay; pay bırakılır
const DIZIN = ".onbellek/b0";
mkdirSync(DIZIN, { recursive: true });

let istek = 0, yenidenDeneme = 0;
const sebepler: Record<string, number> = {};
// Tek hız kapısı: istekler en az ARALIK ms arayla çıkar (anahtarlı kota paylaşılıyor).
const ARALIK = arg("aralikMs", 120);
let sonrakiSlot = 0;
async function kapi() {
  const simdi = Date.now();
  const bekle = Math.max(0, sonrakiSlot - simdi);
  sonrakiSlot = Math.max(simdi, sonrakiSlot) + ARALIK;
  if (bekle) await new Promise((r) => setTimeout(r, bekle));
}
async function post(yol: string, govde: unknown): Promise<any> {
  for (let deneme = 0; ; deneme++) {
    await kapi();
    istek++;
    try {
      const r = await fetch(`https://api.trongrid.io${yol}`, { method: "POST", headers: H, body: JSON.stringify(govde), signal: AbortSignal.timeout(30_000) });
      const metin = await r.text();
      if (r.status === 429 || r.status >= 500 || /frequency limit/i.test(metin)) throw new Error(`durum ${r.status}`);
      const j = JSON.parse(metin);
      // Kaynağın hatası veri gibi görünebilir: şekil doğrulanır.
      if (yol.endsWith("getblockbynum") && !j.block_header) throw new Error("blok şekli yok");
      if (yol.endsWith("infobyblocknum") && !Array.isArray(j)) throw new Error("bilgi dizi değil");
      return j;
    } catch (e) {
      const sebep = (e as Error).message.slice(0, 60);
      sebepler[sebep] = (sebepler[sebep] ?? 0) + 1;
      if (deneme >= 6) throw e;
      yenidenDeneme++;
      await new Promise((r) => setTimeout(r, 500 * 2 ** deneme));
    }
  }
}

type Satir = { blok: number; zaman: number; tx: string; idx: number; varlik: "USDT" | "TRX"; kimden: string; kime: string; tutar: string; basarili: boolean };

async function blokSatirlari(no: number): Promise<{ satirlar: Satir[]; zaman: number; txSayisi: number; basarisizTrx: number; onay: number }> {
  const [blok, bilgi] = await Promise.all([post("/wallet/getblockbynum", { num: no }), post("/wallet/gettransactioninfobyblocknum", { num: no })]);
  const zaman = Number(blok.block_header.raw_data.timestamp);
  const satirlar: Satir[] = [];
  let basarisizTrx = 0, onay = 0;
  for (const t of blok.transactions ?? []) {
    const c = t.raw_data?.contract?.[0];
    if (c?.type !== "TransferContract") continue;
    const basarili = (t.ret?.[0]?.contractRet ?? "SUCCESS") === "SUCCESS";
    if (!basarili) basarisizTrx++;
    satirlar.push({ blok: no, zaman, tx: t.txID, idx: 0, varlik: "TRX", kimden: String(c.parameter.value.owner_address).slice(2), kime: String(c.parameter.value.to_address).slice(2), tutar: BigInt(c.parameter.value.amount ?? 0).toString(), basarili });
  }
  for (const b of bilgi) {
    const basarili = (b.receipt?.result ?? "SUCCESS") === "SUCCESS";
    (b.log ?? []).forEach((l: any, i: number) => {
      if (l.address !== USDT_HEX) return;
      if (l.topics?.[0] !== TRANSFER || l.topics.length !== 3) { onay++; return; }
      satirlar.push({ blok: no, zaman, tx: b.id, idx: i, varlik: "USDT", kimden: l.topics[1].slice(24), kime: l.topics[2].slice(24), tutar: BigInt("0x" + (l.data || "0")).toString(), basarili });
    });
  }
  return { satirlar, zaman, txSayisi: (blok.transactions ?? []).length, basarisizTrx, onay };
}

function okunmus(dosya: string): Set<number> {
  const s = new Set<number>();
  if (!existsSync(dosya)) return s;
  for (const satir of readFileSync(dosya, "utf8").split("\n")) if (satir) s.add(Number(satir.split(",")[0]));
  return s;
}

// Blok özeti dosyası: blok,zaman,tx,trx,usdt,basarisizTrx,onay — boş blok da kaydedilir.
async function topla(ad: string, bloklar: number[]) {
  const ozet = `${DIZIN}/${ad}-bloklar.csv`, veri = `${DIZIN}/${ad}.csv`;
  const bitti = okunmus(ozet);
  const kalan = bloklar.filter((b) => !bitti.has(b));
  let i = 0, yapilan = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: ES_ZAMAN }, async () => {
    while (i < kalan.length) {
      const no = kalan[i++]!;
      const s = await blokSatirlari(no);
      appendFileSync(veri, s.satirlar.map((r) => [r.blok, r.zaman, r.tx, r.idx, r.varlik, r.kimden, r.kime, r.tutar, r.basarili ? 1 : 0].join(",") + "\n").join(""));
      const trx = s.satirlar.filter((r) => r.varlik === "TRX").length;
      appendFileSync(ozet, [no, s.zaman, s.txSayisi, trx, s.satirlar.length - trx, s.basarisizTrx, s.onay].join(",") + "\n");
      if (++yapilan % 100 === 0) process.stderr.write(`${ad}: ${yapilan}/${kalan.length} (${((Date.now() - t0) / 1000).toFixed(0)} sn)\n`);
    }
  }));
  return { istenen: bloklar.length, onbellekten: bloklar.length - kalan.length, cekilen: kalan.length, sureSn: Math.round((Date.now() - t0) / 1000) };
}

const simdi = await post("/wallet/getnowblock", {});
const uc = Number(simdi.block_header.raw_data.number) - KESINLESME;
const ucZaman = Number(simdi.block_header.raw_data.timestamp);

// 1) ardışık — ilk çalıştırmadaki uç sabitlenir ki tekrar çalıştırma aynı pencereyi tamamlasın
const pencereDosya = `${DIZIN}/ardisik-uc.txt`;
const ardUc = existsSync(pencereDosya) ? Number(readFileSync(pencereDosya, "utf8")) : (appendFileSync(pencereDosya, String(uc)), uc);
const ardisik = Array.from({ length: ARDISIK }, (_, k) => ardUc - k);

// 2) yıllar — blok numarası 3 sn varsayımıyla tahmin edilir, gerçek yıl bloğun kendi zamanından okunur
const yillar: number[] = [];
const bugun = new Date(ucZaman);
for (let y = 2018; y <= bugun.getUTCFullYear(); y++) {
  const bas = Math.max(Date.UTC(y, 0, 1), Date.UTC(2018, 5, 26));
  const son = Math.min(Date.UTC(y + 1, 0, 1), ucZaman - 86_400_000);
  const adet = y === 2018 ? Math.round(YIL_BASINA / 2) : YIL_BASINA;
  for (let k = 0; k < adet; k++) {
    const t = bas + ((son - bas) * (k + 0.5)) / adet;
    yillar.push(Math.max(1, Math.round(uc - (ucZaman - t) / 3000)));
  }
}

const a = await topla("ardisik", ardisik);
const b = await topla("yillar", [...new Set(yillar)]);
console.log(JSON.stringify({ uc, ardisikUc: ardUc, ardisik: a, yillar: b, istek, yenidenDeneme, sebepler, anahtarVar: Boolean(K) }, null, 1));
