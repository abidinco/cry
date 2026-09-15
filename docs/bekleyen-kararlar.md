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

## 8. Redis yerel geliştirmeye açılsın mı

**Soru:** Yerel dev sunucusu (3005) kuyruğa ulaşamıyor; yeni koşu, devam ve
durdur yalnızca canlı yığında (1337) denenebiliyor. Redis portu yalnızca
makineye (`127.0.0.1`) yayınlansın mı?

**Ölçüm (2026-09-15):** 3005'ten gönderilen "takibe devam et" isteği hiç
dönmedi (BullMQ `maxRetriesPerRequest: null` ile bağlanmayı sonsuza kadar
bekliyor) ve koşu 9 "kuyrukta"da takılı kaldı. Düzeltme sonrası aynı istek
5,4 sn'de 503 dönüyor. `docker port cry-redis` boş.

**Yeniden üretim:**
```bash
docker port cry-redis
curl -s -X POST localhost:3005/api/takip/9/devam   # oturumlu tarayıcıdan
```

**Seçenekler:**
1. **`127.0.0.1:16379:6379` yayınla** (Postgres'teki `127.0.0.1:15432` gibi) —
   dışarı açık değil, yalnızca bu makine. `.env.local`'e `REDIS_URL` eklenir.
   Geri alınabilir. Risk: yerel dev sunucusu CANLI kuyruğa iş atar ve canlı
   worker onu işler — yerel deneme canlı veriyi değiştirir (zaten aynı
   veritabanı).
2. **Olduğu gibi kalsın** — kuyruk işleri canlıda denenir; yerel yalnızca
   görünüm için.

**Karar verilmezse:** kuyruk isteyen her değişiklik push'tan sonra ya da
worker konteynerine betik kopyalanarak denenir.

**Karar yeri:** `docker-compose.yml` + CLAUDE.md → Yerel çalışma ortamı.

---

## 9. Koşu 9'da sınırda kalan küçük adreslerden devam edilsin mi

**Soru:** Canlıda koşu 9'un 100 bin USDT ve üstü taşıyan 4 adresinden devam
edildi (2026-09-14). 48 adres hâlâ bütçe sınırında, 5'i dallanmada; çoğuna
0,01–40 bin USDT gelmiş. Hangi eşiğin altı "kırıntı" sayılır?

**Ölçüm:** 4 devam koşuyu 24 → 86 adrese, 47 → 1.342 harekete büyüttü ve
yeni bir borsa buldu (KuCoin 2,77 Mn). Aynı devamlar 706 küçük transferlik
bir çift de getirdi.

**Yeniden üretim:**
```bash
docker exec cry-db psql -U cry -d cry -c "select n.address, n.terminal_reason, sum(e.amount_raw::numeric)/1e6 usdt from trace_nodes n left join trace_edges e on e.trace_run_id=9 and e.to_address=n.address where n.trace_run_id=9 and n.terminal_reason in ('butce','dallanma') group by 1,2 order by 3 desc nulls last"
```

**Seçenekler:** (1) tutar eşiği koy (ör. 10 bin USDT) ve üstündekilerden
devam et; (2) yalnızca kullanıcının seçtiği adreslerden; (3) motora
`minTutar` varsayılanı ver (bugün 0 = kapalı, bilinçli).

**Karar verilmezse:** koşu 9 bugünkü hâliyle kalır; eksik kalan dallar
"sınırda" diye görünür, "temiz" değil.

**Karar yeri:** koşu 9 (arayüzden devam) ya da `VARSAYILAN_ESIKLER.minTutar`.
