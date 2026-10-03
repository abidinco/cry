/**
 * İzleme servisi — Hetzner'da 7/24 döner.
 *
 * Kullanıcı kararı (CLAUDE.md → Kalan kararlar): **15 dakikada bir bakar,
 * EŞİK ÜSTÜ harekette mesaj atar, küçükler günlük özete girer.** Eşik varlık
 * ve adres bazında ayarlanır ve `/izleme` ekranından gelir.
 *
 * Döngü: (1) PC ayaktaysa listeyi ve EŞİKLERİ tazele, (2) kapanmış günlerin
 * özetini gönder, (3) her adresin son bakıştan BERİ olan hareketlerini oku ve
 * eşiğe göre mesaj/özet ayır, (4) gönderilen uyarıları PC'ye geri it.
 *
 * PC kapalıyken 1 ve 4 atlanır; 2 ve 3 çalışmaya devam eder — servisin var
 * olma sebebi zaten bu.
 *
 * `--kuru` (ya da `WATCHER_DRY=1`): tek tur koşar, Telegram'a GİTMEZ, kursörü
 * ilerletmez, uyarı/özet YAZMAZ ve PC'ye hiçbir şey itmez; yalnızca hangi
 * hareketin hangi yola gittiğini sayar. Listeyi yine de tazeler, çünkü eşikler
 * PC'de duruyor — tazeleme yalnızca kendi (atılabilir) kopyasına yazar. Ölçüm
 * bu kipte yapılır, çünkü "kod okuyarak değil ÇALIŞTIRARAK doğrula".
 */
import { depoAc } from "./depo.js";
import { telegramGonder } from "./telegram.js";
import { hareketleriOku } from "./tron.js";
import { esikSec, gunAnahtari, mesajMetni, ozetMetni, yolSec } from "./esik.js";

const PC_TABANI = process.env.PC_BASE_URL ?? "http://10.99.0.2:1337";
/** Varsayılan 900 sn = 15 dakika (kullanıcı kararı). */
const PERIYOT_SN = Number(process.env.WATCHER_POLL_SECONDS ?? 900);
const KURU = process.argv.includes("--kuru") || process.env.WATCHER_DRY === "1";

const depo = depoAc();
const uyu = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString();

async function listeyiSenkronla() {
  const jeton = process.env.WATCHER_TOKEN;
  if (!jeton) {
    console.warn("⊘ WATCHER_TOKEN yok — liste senkronu atlandı");
    return;
  }
  try {
    const yanit = await fetch(`${PC_TABANI}/api/izleme/liste`, {
      headers: { "x-watcher-token": jeton },
      signal: AbortSignal.timeout(8000),
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

/**
 * Gönderilmiş uyarıları ve TURUN KENDİSİNİ PC'ye geri it.
 *
 * İki sebep: (1) kurulu ama SORULMAYAN bir servis, olmayan servistir;
 * (2) **bir sürecin takılıp takılmadığı damgayla değil İLERLEMEYLE ölçülür** —
 * uyarı olmadan hiç konuşmayan bir servis, 45 saat sessiz kalsa da ekranda
 * sağlıklı görünürdü (canlı okuyucuda tam bu yaşandı).
 *
 * Uyarı olmasa da itilir: "baktım, hareket yok" bir BİLGİdir. Bakılamayan adres
 * listeye GİRMEZ — "yok" ile "bakılamadı" ayrı cevaplardır.
 */
async function uyarilariIt(tur) {
  const jeton = process.env.WATCHER_TOKEN;
  if (!jeton) return;
  const bekleyen = depo.itilmeyenUyarilar();
  if (bekleyen.length === 0 && (tur?.bakilanlar?.length ?? 0) === 0) return;
  try {
    const yanit = await fetch(`${PC_TABANI}/api/izleme/bildirim`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-watcher-token": jeton },
      body: JSON.stringify({ alerts: bekleyen, tur }),
      signal: AbortSignal.timeout(10000),
    });
    if (!yanit.ok) throw new Error(`durum ${yanit.status}`);
    const govde = await yanit.json();
    depo.itildiYaz(bekleyen);
    console.log(
      `↑ ${bekleyen.length} uyarı + ${tur?.bakilanlar?.length ?? 0} bakış PC'ye itildi ` +
        `(yazılan ${govde.yazildi ?? "?"}, bakış ${govde.bakisIsaretlendi ?? "?"})`,
    );
  } catch (hata) {
    // İtilemeyen uyarı KALIR; bir sonraki turda yeniden denenir.
    console.log(`· uyarılar itilemedi (${hata.message}) — kayıtta bekliyor`);
  }
}

/**
 * Kapanmış günlerin özetini gönder.
 *
 * Gün sınırı **UTC**'dir ve bu özetin başlığında SÖYLENİR: ekran saatleri TSİ
 * gösterdiği için 03:00 TSİ'deki bir hareket bir ÖNCEKİ UTC gününe düşer.
 * Özet gitmezse kayıt DÜŞMEZ; sessizce "özetlendi" saymak kaçırılan bir
 * hareketi görünmez yapardı.
 */
async function ozetleriGonder() {
  const bugun = gunAnahtari(ts());
  for (const { gun } of depo.bekleyenOzetGunleri(bugun)) {
    const kayitlar = depo.ozetKayitlari(gun);
    const metin = ozetMetni(gun, kayitlar);
    if (!metin) {
      depo.ozetiDusur(gun);
      continue;
    }
    if (KURU) {
      console.log(`[kuru] özet ${gun}: ${kayitlar.length} eşik altı hareket`);
      continue;
    }
    if (await telegramGonder(metin)) {
      depo.ozetiDusur(gun);
      console.log(`🗒 ${gun} özeti gönderildi (${kayitlar.length} hareket)`);
    } else {
      console.log(`· ${gun} özeti gönderilemedi — kayıt kalıyor, sonraki tur yeniden denenir`);
    }
  }
}

async function takibeBak(takip, sayac) {
  // İlk görüş: geçmişin tamamını bildirim yağmuruna çevirmemek için yalnızca
  // işaretlenir. Bildirim BUNDAN SONRAKİ hareketler için.
  //
  // Kuru koşuda işaretlenecek bir şey yok ve ölçülecek bir şey olmalı: pencere
  // son `WATCHER_DRY_HOURS` saat (varsayılan 24) olarak açılır.
  let bastan = takip.last_checked_ts;
  if (!bastan) {
    if (!KURU) {
      depo.bakildiYaz(takip.chain, takip.address, Date.now(), null);
      console.log(`· ${takip.address}: ilk görüş — şimdiden sonrası izlenecek`);
      return;
    }
    const saat = Number(process.env.WATCHER_DRY_HOURS ?? 24);
    bastan = Date.now() - saat * 3600_000;
  }

  let okuma;
  try {
    okuma = await hareketleriOku(takip.address, bastan);
  } catch (hata) {
    // Bakılamadı "hareket yok" DEĞİLDİR: kursör ilerletilmez.
    // Sebep de ayrılır: hız sınırı "bekle" der, öteki hatalar "bakılamadı".
    console.error(`✗ ${takip.address}: ${hata.message} — kursör ilerletilmedi`);
    const kod = hata.kod === "hiz_siniri" ? "hiz_siniri" : "bakilamadi";
    sayac[kod] = (sayac[kod] ?? 0) + 1;
    return;
  }

  for (const hareket of okuma.hareketler) {
    const esik = esikSec(takip.esikler, hareket.assetSymbol);
    const karar = yolSec({ tutarHam: hareket.amountRaw, ondalik: hareket.ondalik, esik });
    const kayit = { ...hareket, chain: takip.chain, address: takip.address, label: takip.label };
    sayac[karar.sebep] = (sayac[karar.sebep] ?? 0) + 1;

    if (KURU) {
      sayac[karar.yol] += 1;
      continue;
    }

    if (karar.yol === "ozet") {
      depo.ozeteKoy(gunAnahtari(hareket.ts) ?? gunAnahtari(ts()), kayit);
      sayac.ozet += 1;
      continue;
    }

    if (depo.bildirildiMi(takip.chain, takip.address, hareket.txHash, hareket.movementKey)) continue;
    const metin = mesajMetni(kayit, karar.sebep);
    const gonderildi = await telegramGonder(metin);
    depo.uyariKaydet(
      { ...kayit, summary: metin.slice(0, 500), path: "mesaj", reason: karar.sebep },
      gonderildi,
    );
    if (gonderildi) sayac.mesaj += 1;
    else sayac.gonderilemedi += 1;
  }

  // Sayfa bütçesi KURU koşuda da söylenir: aralığın kısmi okunduğunu
  // söylemeyen bir ölçüm, okunmamış bir aralığı "hareket yok" sanmaya açıktır.
  if (okuma.butceDoldu) {
    console.warn(`⚠ ${takip.address}: sayfa bütçesi doldu — aralık KISMİ okundu`);
    sayac.sayfa_butcesi += 1;
  }
  if (KURU) return;

  // Bütçe dolduysa kursör okunan EN BÜYÜK damgadan ileri taşınmaz: okunmamış
  // bir aralık "hareket yok" diye geçemez.
  const ileri = okuma.butceDoldu
    ? (okuma.enBuyukTs ?? takip.last_checked_ts)
    : Math.max(okuma.enBuyukTs ?? 0, Date.now() - 60_000);
  depo.bakildiYaz(
    takip.chain,
    takip.address,
    ileri,
    okuma.hareketler.at(-1)?.txHash ?? null,
  );
  // Bu adrese GERÇEKTEN bakıldı: hata alan ya da hız sınırına giren adres
  // buraya gelmiyor, çünkü onlara bakılamadı.
  sayac.bakilanlar.push({ chain: takip.chain, address: takip.address });
}

async function turAt() {
  // Eşikler PC'de durur; kuru koşuda da tazelenir (yalnızca yerel kopyaya
  // yazar) — yoksa ölçüm eşiksiz bir listeyle koşar ve ölçtüğü şey eşik olmaz.
  await listeyiSenkronla();
  await ozetleriGonder();

  const takipler = depo.aktifTakipler();
  if (takipler.length === 0) {
    console.log("· takip listesi boş");
    return;
  }

  const basladi = new Date().toISOString();
  const sayac = {
    mesaj: 0, ozet: 0, gonderilemedi: 0, bakilamadi: 0, sayfa_butcesi: 0,
    bakilanlar: [],
  };
  for (const takip of takipler) {
    if (takip.chain !== "tron") continue; // Faz 1: yalnızca TRON
    await takibeBak(takip, sayac);
  }
  console.log(
    `✓ tur bitti — ${Object.entries(sayac)
      .filter(([k, v]) => (k === "bakilanlar" ? v.length > 0 : v > 0))
      .map(([k, v]) => `${k}:${k === "bakilanlar" ? v.length : v}`)
      .join(" · ") || "yeni hareket yok"}`,
  );

  if (!KURU) {
    await uyarilariIt({
      basladi,
      bitti: new Date().toISOString(),
      bakilanlar: sayac.bakilanlar,
      mesaj: sayac.mesaj,
      ozet: sayac.ozet,
      bakilamadi: sayac.bakilamadi + (sayac.hiz_siniri ?? 0),
    });
  }
}

async function main() {
  if (KURU) {
    console.log(`[kuru koşu] tek tur, Telegram KAPALI, hiçbir şey yazılmaz — ${ts()}`);
    await turAt();
    return;
  }
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
