/**
 * İzleme servisi — Hetzner'da 7/24 döner.
 *
 * Döngü: (1) PC ayaktaysa takip listesini tazele, (2) her adresin son
 * işlemine bak, (3) yeni hareket varsa Telegram'dan bildir.
 *
 * PC kapalıyken 1. adım atlanır; 2 ve 3 çalışmaya devam eder — servisin var
 * olma sebebi zaten bu.
 */
import { depoAc } from "./depo.js";
import { telegramGonder } from "./telegram.js";

const TRONGRID = process.env.TRONGRID_URL ?? "https://api.trongrid.io";
const PC_TABANI = process.env.PC_BASE_URL ?? "http://10.99.0.2:1337";
const PERIYOT_SN = Number(process.env.WATCHER_POLL_SECONDS ?? 60);

const depo = depoAc();
const uyu = (ms) => new Promise((r) => setTimeout(r, ms));

async function listeyiSenkronla() {
  const jeton = process.env.WATCHER_TOKEN;
  if (!jeton) {
    console.warn("⊘ WATCHER_TOKEN yok — liste senkronu atlandı");
    return;
  }
  try {
    const kontrol = AbortSignal.timeout(8000);
    const yanit = await fetch(`${PC_TABANI}/api/izleme/liste`, {
      headers: { "x-watcher-token": jeton },
      signal: kontrol,
    });
    if (!yanit.ok) throw new Error(`durum ${yanit.status}`);
    const govde = await yanit.json();
    const sayi = depo.listeyiTazele(govde.watches ?? []);
    console.log(`↻ liste tazelendi: ${sayi} adres`);
  } catch (hata) {
    // PC kapalı olabilir — bu bir ARIZA DEĞİL, beklenen durum.
    console.log(`· liste tazelenemedi (${hata.message}) — elimizdeki kopyayla devam`);
  }
}

/** TRON: adresin en son işlemi. Tek çağrı, tek kayıt. */
async function sonIslem(address) {
  const url =
    `${TRONGRID}/v1/accounts/${address}/transactions` +
    `?limit=1&order_by=block_timestamp,desc`;
  const basliklar = process.env.TRONGRID_API_KEY
    ? { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY }
    : {};
  const yanit = await fetch(url, { headers: basliklar, signal: AbortSignal.timeout(15000) });
  if (!yanit.ok) throw new Error(`TronGrid ${yanit.status}`);
  const govde = await yanit.json();
  const kayit = govde.data?.[0];
  if (!kayit) return null;
  return {
    txHash: kayit.txID,
    ts: new Date(kayit.block_timestamp ?? 0).toISOString(),
  };
}

async function turAt() {
  await listeyiSenkronla();
  const takipler = depo.aktifTakipler();
  if (takipler.length === 0) {
    console.log("· takip listesi boş");
    return;
  }

  for (const takip of takipler) {
    if (takip.chain !== "tron") continue; // Faz 1: yalnızca TRON

    let son;
    try {
      son = await sonIslem(takip.address);
    } catch (hata) {
      console.error(`✗ ${takip.address}: ${hata.message}`);
      continue;
    }
    if (!son) continue;

    // İlk görüş: geçmişin tamamını bildirim yağmuruna çevirmemek için
    // yalnızca işaretlenir. Bildirim BUNDAN SONRAKİ hareketler için.
    if (!takip.last_seen_tx) {
      depo.sonIslemiYaz(takip.chain, takip.address, son.txHash);
      continue;
    }
    if (son.txHash === takip.last_seen_tx) continue;
    if (depo.bildirildiMi(takip.chain, takip.address, son.txHash)) continue;

    const ad = takip.label ? `${takip.label} (${takip.address})` : takip.address;
    const metin =
      `🔔 <b>Hareket</b>\n${ad}\n` +
      `${son.ts}\n` +
      `<code>${son.txHash}</code>\n` +
      `https://tronscan.org/#/transaction/${son.txHash}`;

    const gonderildi = await telegramGonder(metin);
    depo.uyariKaydet(takip.chain, takip.address, son.txHash, son.ts, ad, gonderildi);
    // Bildirim gitmediyse son işlem İLERLETİLMEZ; sonraki tur yeniden dener.
    if (gonderildi) depo.sonIslemiYaz(takip.chain, takip.address, son.txHash);
  }
}

async function main() {
  console.log(`izleme servisi ayakta — periyot ${PERIYOT_SN}s, PC: ${PC_TABANI}`);
  for (;;) {
    try {
      await turAt();
    } catch (hata) {
      console.error("tur hatası:", hata);
    }
    await uyu(PERIYOT_SN * 1000);
  }
}

main();
