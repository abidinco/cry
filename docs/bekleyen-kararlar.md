# Bekleyen kararlar

Ölçülmüş, sebebi anlaşılmış ama **bir tercih bekleyen** durumlar. Kod
cevaplayamaz; cevabı sen vereceksin.

Her madde altı başlıkla yazılır: **soru · ölçüm · seçenekler · karar
verilmezse ne bozuk kalır · geri alınabilir mi · karar verilince nereye
yazılır.** Kanıtı yeniden ölçülemeyen bir karar zamanla ölçüme değil kanıya
dönüşür.

Karar verilince madde **silinir** ve kural [kurallar](../CLAUDE.md) ya da
[veri kriterleri](veri-kriterleri.md) dosyasına yazılır. Burası bir arşiv
değil; tarihçe git geçmişinde.

---

## 1. BSC ücretsiz planda yoklanamıyor

**Soru:** Etherscan'in ücretsiz planı BSC'yi kapsamıyor. Ne yapalım?

**Ölçüm (2026-09-09):** `chainid=56` isteği `{"status":"0","result":"Free API
access is not supported for this chain"}` döndürüyor. Ethereum ve Polygon
sorunsuz. Yoklama ekranı bunu artık "yoklanamadı" diye dürüstçe yazıyor, ama
BSC'de duran bir adresi bulamıyoruz — ve USDT-BEP20 Türkiye dosyalarında
sık geçiyor.

**Yeniden üretim:**
```bash
curl -s "https://api.etherscan.io/v2/api?chainid=56&module=proxy&action=eth_getTransactionByHash&txhash=0x0&apikey=$ETHERSCAN_API_KEY"
```

**Seçenekler:**
1. **Blockscout'u BSC için yedek yap** — ücretsiz, 5 RPS. Yazılması yarım
   gün. (Önerim bu.)
2. **Etherscan ücretli plan** — aylık ücret, tek anahtarla tüm zincirler.
3. **BSC'yi birincil listeden çıkar** — dürüst ama arayan kişi BSC'de
   duran parayı hiç bulamaz.

**Karar verilmezse:** EVM yoklaması üç zincirden birini hep "yoklanamadı"
diye işaretler; kullanıcı her seferinde elle başka bir explorer'a bakar.

**Geri alınabilir:** evet, hepsi.

**Karar yeri:** `packages/chain/src/network-probe.ts` + CLAUDE.md.

---

## 2. Takip neyden başlar: adres mi, işlem mi

**Soru:** Kök adresten takip başlatınca "takip edilen para" nedir?

**Ölçüm:** Motor şu an kök adrese **giren bütün paraları** tohum sayıyor
(pay = 1). Alternatif: kullanıcının seçtiği tek bir işlem.

**Seçenekler:**
1. **Adresin tüm girişleri** (bugünkü hâl) — "bu cüzdana gelen para nereye
   gitti" sorusuna cevap verir. Cüzdan yıllardır kullanılıyorsa iz çok geniş
   başlar.
2. **Tek işlem** — dosya bir havaleyle başlıyorsa çok daha keskin. Kullanıcı
   işlem hash'i yapıştırdığında zaten bu olmalı.
3. **Tarih aralığı** — "şu tarihten sonra gelen paralar".

**Karar verilmezse:** eski ve kalabalık cüzdanlarda ilk hop yüzlerce düğüm
açar, graf okunmaz.

**Geri alınabilir:** evet, parametre.

**Karar yeri:** `apps/worker/src/takip.ts` (tohumGirisleri) + PRD §3.

---

## 3. Aday borsa adresleri arşive girsin mi

**Soru:** Devir dosyasındaki dört aday adres (BtcTurk/Paribu, EVM+TRON)
"aday, doğrulanmamış" olarak veritabanına girsin mi?

**Ölçüm:** Adresler base58check/EIP-55 doğrulamasından geçiyor, yani gerçek
adresler. Ama etiketin doğruluğu kanıtlanmadı; Paribu olduğu iddia edilen
TRON adresi takip sitelerinde borsa etiketi taşımıyor.

**Seçenekler:**
1. **Aday olarak gir** (devir dosyasının önerisi) — sistem on-chain
   davranışla test eder, sen onaylarsın. Rapora "doğrulanmamış" ibaresiyle
   girer.
2. **Hiç girme** — keşif motoru bulana kadar bekle.

**Karar verilmezse:** takip motorunun "terminal düğüm" ölçütü hiç
tetiklenmez, çünkü arşivde tek bir borsa etiketi yok. Tarama her zaman hop
bütçesinde biter.

**Geri alınabilir:** evet, etiket silinebilir.

**Karar yeri:** `docs/veri-kriterleri.md` → Etiket.

---

## 4. Takip koşusu vakasız çalışabilir mi

**Soru:** Şema `TraceRun.caseId`'yi ZORUNLU tutuyor. Hızlı bir bakış için
vaka açmadan takip koşulabilsin mi?

**Ölçüm:** Bugün bir takip başlatmak için önce vaka açmak gerekiyor.

**Seçenekler:**
1. **Zorunlu kalsın** — her koşu bir dosyaya ait olur, denetim kaydı temiz.
2. **"Karalama" vakası** — sistem otomatik bir vaka açar, kullanıcı sonra
   adlandırır.

**Karar verilmezse:** arayüzde takip başlatmadan önce ek bir adım kalır.

**Geri alınabilir:** evet.

**Karar yeri:** Prisma şeması + PRD §2.5.

---

## 5. Sunucudaki izleme servisi kurulsun mu, ne zaman

**Soru:** Telegram kanalı çalışıyor (doğrulandı). İzleme servisini Hetzner'a
şimdi mi kuralım?

**Ölçüm:** `deploy-watcher` iş akışı hazır ve secret'lar tanımlı, ama hiç
koşmadı — yalnızca `apps/watcher/**` değişince tetikleniyor. Sunucuda ayrıca
bir kerelik `/srv/cry/.env` gerekiyor.

**Seçenekler:**
1. **Şimdi kur** — takip listesi arayüzü olmadan da adres eklenebilir (elle
   SQL), PC kapalıyken uyarı gelir.
2. **Görev 10'a bırak** — arayüzle birlikte tek seferde.

**Karar verilmezse:** Telegram kanalı boşta durur.

**Geri alınabilir:** evet.

**Karar yeri:** `docs/gorevler/README.md`.
