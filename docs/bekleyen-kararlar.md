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

## 1b. Arayüz tasarımı — takip sayfası karara bağlandı, gerisi bekliyor

**Karar (2026-09-14):** takip sayfası için üç örnek üretildi (A akış +
defter · B geniş akış + çekmece · C kartlı sütunlar); kullanıcı **A**'yı
seçti ve uygulandı (bkz. CLAUDE.md → Arayüz, `docs/arayuz.md` → Takip akışı).
Kullanıcının dile getirdiği şikâyetler: para yoğunluğu görünmüyor, renk yok,
gitti/geldi/geri döndü ayrışmıyor, borsalar belirgin değil, sayfa dağınık.

**Kalan:** adres görünümü ve ana sayfa aynı gözle elden geçirilmedi.
Kullanıcı başka sayfa için şikâyet bildirmedi; sorulacak.

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

## 3. Takip koşusu vakasız çalışabilir mi

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

## 4. Sunucudaki izleme servisi kurulsun mu, ne zaman

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

## 5. Fiyat: hangi AN, hangi kaynak

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

## 6. Rapor neyi dondurur, hash neyin üstünden alınır

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

## 7. İzleme: sıklık ve uyarı eşiği

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

---

## 8. BigQuery: tam geçmiş satın alınsın mı, yoksa 87 gün beklensin mi

**Soru:** TRON'un tam geçmişi BigQuery'den PARAYLA bir haftada mı yüklensin, yoksa doldurucu
kendi hızıyla ~87 günde mi getirsin?

**Ölçüm (2026-09-28):** indeks 1,15 Mr satır / 87,8 GiB; doldurucu 10,9 blok/sn ile GERİYE gidiyor
ve taban ~87 gün uzakta. Disk artık kısıt DEĞİL (2 TB, 1.776 GiB boş; tam geçmiş ~825 GiB).
Bedeli ölçen asıl sayı M4'ten: **10–12 düğümlük bir takip koşusu ~200 saniye ve bunun ~198'i
pencere ÖNCESİ geçmişi TronGrid'den okumak.** Tam geçmiş diskteyse aynı koşu birkaç saniye.
Kaynak `bigquery-public-data.goog_blockchain_tron_mainnet_us`; talep başına 6,25 $/TiB, ayda
1 TiB ücretsiz (her ay sıfırlanır). Google ücretsiz denemesi BİTTİ, yani kart bağlanması gerekir.

**Seçenekler:**
1. **Beklemek (bugünkü hâl)** — 0 ₺, ~87 gün. Bu süre boyunca eski adresli her koşu ~200 sn.
2. **Tam geçmiş, tek seferde** — ~89–127 $. Bir haftada biter.
3. **Üç takvim ayına yayarak** — ~25 $ (aylık 1 TiB ücretsiz kotayla). Beklemekten hızlı, en ucuz
   satın alma; ama ayları beklemek gerekir.
4. **Yalnızca 2018–2022** — ~22–35 $. Dava döneminiz orası; doldurucu oraya EN SON varır.

**Karar verilmezse:** doldurucu çalışmaya devam eder ve iş yine biter — yalnızca 87 gün sonra.
Bu bir tıkanma değil, bir HIZ tercihi.

**Doğrulanmamış varsayım:** BigQuery şemasında "`input = '0x'` ⇒ TransferContract" eşitliği
ölçülmedi. Ücretsiz Sandbox'ta tek sorguyla sınanabilir; satın almadan önce sınanmalı.

**Geri alınabilir:** para geri alınmaz. Yüklenen veri kalıcıdır.

**Karar yeri:** `docs/yol-haritasi-blok-indeks.md` → B3 + CLAUDE.md.

---

## 9. 739 borsa adayının kaçı incelenecek, kim inceleyecek

**Soru:** `/etiket` 739 doğrulanmamış borsa iddiası gösteriyor. Hepsi mi elden geçecek, bir
kısmı mı, yoksa yalnızca bir koşuyu durdurdukça mı bakılacak?

**Ölçüm (2026-09-28):** 792 doğrulanmamış `exchange%` etiketi, **0'ı** insan kararına bağlanmış.
Sayfa sırayı zaten doğru kuruyor: önce GERÇEKTEN bir izi durdurmuş olanlar (en üstte 4 koşuda
görünüp 3 kez duran bir adres). TronScan bu 739'un hiçbirine ad veremedi — kimlik için ikinci bir
kaynak yok.

**Seçenekler:**
1. **Tembel: yalnızca karşılaşılınca** (önerim) — bir koşu bir adayda durduğunda o satır incelenir.
   Emek işin geldiği yere harcanır; hiç karşılaşılmayan 700 adres bugün hiçbir raporu değiştirmiyor.
2. **En ağır N tanesi peşinen** — ilk 50'yi bir oturumda bitirmek, sonraki koşuları temiz başlatır.
3. **Hepsi** — 739 satır × gezginde bakmak; günler sürer ve çoğu hiç kullanılmaz.

**Karar verilmezse:** liste durur, koşular `terminal_aday` demeye devam eder — yanlış bir şey
olmaz, yalnızca raporlar "borsa ADAYINA girdi" demeyi sürdürür.

**Geri alınabilir:** evet. Karar etiketi silmez, `diger`e çeker; kaynak turları insan kararını
EZMEZ (`INSAN_IMZASI`).

**Karar yeri:** çalışma düzeni; sonuç [cozulmesi-gerekenler](cozulmesi-gerekenler.md) §17'ye.

---

## 10. Doldurucu hangi dönemi önce doldursun

**Soru:** Doldurucu uçtan GERİYE gidiyor ve şu an 81,8 Mn'da (~2022 sonu). Dava dönemi
2019–2022 ise oraya sırayla en son varır. Sıra değişsin mi?

**Ölçüm (2026-09-28):** pencere 81.834.230 – 86.646.047, ~167 gün. Doldurucu `--taban` ile
istenen bloktan başlatılabiliyor.

**Seçenekler:**
1. **Uçtan geriye, kesintisiz** (bugünkü hâl) — pencere hep BOŞLUKSUZ ve tek parça kalır.
   Pencerenin değeri de bundan geliyor: bir boşluk altındaki her şeyi motora kapatır.
2. **Dava dönemine atlamak** — o dönem erken gelir ama arada KOCA bir boşluk kalır ve pencere
   ikiye bölünür; alttaki parça, üstteki boşluk kapanana kadar motora KAPALI olur.

**Karar verilmezse:** 1 numara sürer. Bu güvenli seçenek.

**Dikkat:** 2 numara "daha hızlı sonuç" gibi görünür ama boşluk kapanana kadar o veriyi motor
kullanamaz — yalnızca diskte durur. Bu yüzden ancak 2019–2022'nin TAMAMI yüklenecekse anlamlı.

**Karar yeri:** `apps/blok-okuyucu/src/doldur.ts` çağrısı + `deploy/pc/doldurucu-bekci.ps1`.
