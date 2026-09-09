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

Kardeş dosyalar: karar beklemeyen eksikler
[cozulmesi-gerekenler.md](cozulmesi-gerekenler.md), benim önerilerim
[oneriler.md](oneriler.md).

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

---

## 6. Sıradaki görev hangisi: graf mı, etiketler mi

**Soru:** Görev 07 (graf görünümü) sırada. Ama etiket tohumlaması sıradan
DIŞARIDA duruyor ve ondan önce yapılması gerekebilir. Hangisi önce?

**Ölçüm (2026-09-09):** arşivde 0 etiket. Bu yüzden takip motorunun
`terminal` durma sebebi hiç ateşlenmiyor ve her tarama bütçede bitiyor
(gerçek koşuda ölçüldü: 25 düğüm, sebep `dugum_siniri`). Graf bugün
çizilirse **hepsi aynı renkte, hiçbiri "borsa" demeyen** bir düğüm bulutu
çizer.

**Seçenekler:**
1. **Önce etiket, sonra graf** (önerim) — TronScan tohumlaması yarım gün;
   ardından graf ilk çizimde asıl bilgiyi (nerede bitti, hangi borsa)
   gösterir. Grafın en pahalı işi düğümü sınıflandırmaktır ve sınıf
   etiketten gelir.
2. **Önce graf** — görsel ilerleme hemen görünür, etiket sonra binince graf
   yeniden renklendirilir. İki kez dokunmak demek.

**Karar verilmezse:** Görev 07 sıradaki iş olarak duruyor ve muhtemelen
yukarıdaki 1. sırayla çakışıyor.

**Geri alınabilir:** evet, ikisi de sıra meselesi.

**Karar yeri:** `docs/gorevler/README.md` tablosu.

---

## 7. Graf düzeni: hiyerarşi mi, kuvvet mi — ve kaç düğüm çizilir

**Soru:** Cytoscape hangi düzenle çizsin, ve düğüm sayısı sınırı ne olsun?

**Ölçüm:** ilk gerçek koşu **25 düğüm / 231 kenar** üretti; düğüm sınırı
varsayılan 300. 300 düğüm ve kabaca on katı kenar, kuvvet tabanlı düzende
tarayıcıda saniyeler sürer ve okunmaz bir yumak verir.

**Seçenekler:**
1. **Hiyerarşik (dagre), soldan sağa hop sırası** (önerim) — hop zaten bir
   SIRADIR; hiyerarşi o sırayı görselleştirir ve "para nereden nereye"
   sorusu yukarıdan aşağı okunur. Adli bir ekte de böyle basılır.
2. **Kuvvet tabanlı (cose/fcose)** — kümeleri güzel gösterir, ama düğüm
   yerleşimi her açılışta DEĞİŞİR; rapora giren bir görselde bu kabul
   edilemez (aynı koşu iki farklı resim üretir).
3. İkisi arasında tuş.

**Ek soru:** çizilen düğüm sayısı sınırı — "ilk 100 düğüm + gerisi 've N
düğüm daha'" mı, hepsi mi?

**Karar verilmezse:** Görev 07 kendi başına bir düzen seçer ve seçim
rapordaki görselin yeniden üretilebilirliğini belirler.

**Geri alınabilir:** evet.

**Karar yeri:** Görev 07 + [arayuz.md](arayuz.md).

---

## 8. Fiyat: hangi AN, hangi kaynak

**Soru:** Bir hareketin TL karşılığı hangi ana göre yazılsın?

**Ölçüm:** `prices_daily` ve `fx_rates_daily` tabloları boş; bugün hiçbir
tutarın TL karşılığı yok.

**Seçenekler:**
1. **İşlem GÜNÜNÜN kuru** — "o gün ne kadardı" sorusunun cevabı; adli
   yazıda beklenen budur.
2. **Rapor gününün kuru** — "bugün ne kadar" sorusunun cevabı.
3. **İkisi birden** (önerim) — rapor satırı "işlem günü X ₺ (rapor günü Y ₺)"
   der ve hangi kurun kullanıldığını YAZAR. Tek sayı yazmak, hangi soruya
   cevap verdiğini gizler.

**Kaynak ayrı bir soru:** TCMB yalnızca USD/TRY verir (resmî, ücretsiz,
günlük). Token → USD için ayrı bir kaynak gerekir (CoinGecko ücretsiz katman).
Stablecoin'de 1 USDT ≈ 1 USD varsayımı **yazılmaz, ölçülür** — depeg günleri
gerçek.

**Karar verilmezse:** Görev 09 raporu token cinsinden kalır; resmî yazıya TL
elle eklenir.

**Geri alınabilir:** evet, fiyat ayrı tabloda; rapor yeniden üretilir.

**Karar yeri:** Görev 09 + CLAUDE.md → Veri kuralları.

---

## 9. Rapor neyi dondurur, hash neyin üstünden alınır

**Soru:** SHA-256 **PDF'in** mi, yoksa raporun dayandığı **kanıt paketinin**
(JSON) mi özeti olsun?

**Ölçüm:** `reports` tablosu boş; şema hem dosya hem içerik alanı taşıyor.

**Seçenekler:**
1. **JSON kanıt paketi + onun hash'i, PDF ondan üretilir** (önerim) — PDF
   yazı tipine, sürüme, sayfa boyutuna göre bayt bayt değişir; aynı veriden
   iki farklı hash çıkar. Dondurulması gereken şey KANITTIR, sayfa düzeni
   değil.
2. **PDF'in hash'i** — karşı tarafa verilen dosyanın kimliğini doğrular.
3. **İkisi de** — pakette iki satır.

**Karar verilmezse:** Görev 09'un çıktısı "hash'li" görünür ama neyin hash'i
olduğu belirsizdir; itiraz edildiğinde savunulamaz.

**Geri alınabilir:** hayır sayılır — verilmiş bir rapordaki hash geri
alınamaz. Bu yüzden ilk rapordan ÖNCE karar gerekir.

**Karar yeri:** Görev 09 + CLAUDE.md.

---

## 10. İzleme: sıklık ve uyarı eşiği

**Soru:** İzlemedeki bir adres ne sıklıkla kontrol edilsin, hangi olayda
mesaj gitsin?

**Ölçüm:** `watches` boş, servis hiç koşmadı. TronGrid anahtarlı sınır
10 istek/sn — sıklık teknik olarak serbest, mesele gürültü.

**Seçenekler:**
1. **5 dakikada bir, her harekette mesaj** — hızlı, ama aktif bir cüzdan
   telefonu susmaz hâle getirir.
2. **15 dakikada bir, eşik üstü harekette mesaj** (önerim) — eşik varlık
   bazında ve adres bazında ayarlanır; küçük hareketler günlük özete girer.
3. Yalnızca günlük özet.

**Karar verilmezse:** Görev 10'da servis bir varsayılan seçer ve ilk gürültü
turunda değiştirilir.

**Geri alınabilir:** evet, ayar.

**Karar yeri:** Görev 10 + `apps/watcher`.
