# Çözülmesi gerekenler

Bu dosya **karar beklemeyen** eksikleri tutar: ne yapılacağı belli, yalnızca
yapılmamış. Karar bekleyenler ayrı ([bekleyen-kararlar.md](bekleyen-kararlar.md)),
"yapılsa iyi olur"lar ayrı ([oneriler.md](oneriler.md)).

Her madde: **ne bozuk · nasıl görülür · ölçüm · nerede.** Ölçümü olmayan
madde yazılmaz; "sanırım şu eksik" bir sonraki turda kanıya dönüşür.

Ölçüm tarihi: **2026-09-09**, yerel veritabanı (`docker exec cry-db psql -U cry -d cry`):

```
etiket: 0      adres: 14.798     tam indeksli: 19    hareket: 23.895
koşu: 0        düğüm: 0          izleme: 0           vaka: 0
fiyat: 0       rapor: 0          deposit adayı: 0
```

---

## 1. Etiketlerin KİMLİĞİ yok: "bir servis" biliniyor, "hangi borsa" bilinmiyor

**Ne bozuk:** `labels` tablosunda **336 etiket** var (OFAC 320 + 4 aday +
12 yapısal keşif adayı) ve ölçüt artık gerçekten ateşleniyor — gerçek
koşuda `terminal_aday` çıktı. Eksik olan şey artık etiketin VARLIĞI değil
KİMLİĞİ: keşif "burası bir servis cüzdanı" diyebiliyor, "burası BtcTurk"
diyemiyor.

**Nasıl görülür:** rapor "para bir borsa ADAYINA girdi" der, borsanın adını
vermez. Adli bir yazıda beklenen cümle ikincisidir.

**Ölçüm (2026-09-09):**
```bash
docker exec cry-db psql -U cry -d cry -c "select source,category,count(*) from labels group by 1,2;"
docker exec cry-db psql -U cry -d cry -c "select stop_reason, stats->'durma' from trace_runs order by id desc limit 2;"
```
→ `ofac/sanction:320 · kullanici/exchange_hot:4 · kesif/exchange_hot:12`;
son koşu `terminal_aday`, `{"butce":8,"dallanma":2,"terminal_aday":1}`.

**Nerede:** kimlik ancak bir kaynaktan gelir. **TronScan kaynağı yazıldı
(2026-09-14)** — `npx tsx packages/etiket/src/cli.ts --kaynak=tronscan`.
Varsayılan kapsamdaki 55 adresin 8'i etiketli çıktı: 7 borsa (Binance,
KuCoin, OKX, HTX, Poloniex, Bitfinex, Paribu) doğrulanmış `exchange_hot`
olarak yazıldı; biri `Black Hole Address(0)` (bkz. aşağısı).

**Kalan:**
- BtcTurk adayı `TD32z28Q…` ve keşfin 8 adayı TronScan'da etiketsiz — kimlik
  hâlâ yok, `terminal_aday` üretmeye devam ederler.
- Keşif bugün 25 aday veriyor (arşiv 23 bin TRON adresine büyüdü); 14'ü
  YAZILMADI, liste okunmadan `--uygula` çalıştırılmaz.
- Koşu 5 ve 6 donmuş kayıtlardır: Binance-Hot 1 orada hâlâ `terminal_aday`
  görünür. Yeni etiketin etkisi ancak YENİ bir koşuda görülür, ve konteyner
  worker'ı push edilmemiş kodu çalıştırmıyor.

---

## 1b. BSC yoklaması Blockscout'a devredilecek (karar verildi)

**Karar (2026-09-09):** Etherscan'in ücretsiz planı BSC'yi kapsamıyor
(`chainid=56` → "Free API access is not supported for this chain");
BSC yoklaması **Blockscout'a** düşecek (ücretsiz, 5 RPS).

**Nasıl görülür:** bugün EVM yoklaması üç zincirden birini hep
"yoklanamadı" diye işaretliyor ve USDT-BEP20 Türkiye dosyalarında sık
geçiyor.

**Ölçüm:**
```bash
curl -s "https://api.etherscan.io/v2/api?chainid=56&module=proxy&action=eth_getTransactionByHash&txhash=0x0&apikey=$ETHERSCAN_API_KEY"
```

**Nerede:** `packages/chain/src/network-probe.ts` — BSC dalı Blockscout'a
yönlendirilir, öteki zincirler Etherscan'de kalır. Yapılmadı.

---

## 2. EVM adaptörü BOŞ — Ethereum/Polygon yoklanıyor ama taranamıyor

**Ne bozuk:** `packages/chain/src/adapters/evm.ts` üç yöntemde de
`throw new Error("EVM adaptörü Faz 1b'de doldurulacak")` diyor. Yoklama
katmanı Etherscan'i doğrudan çağırdığı için **bir EVM adresinin var olduğunu
söyleyebiliyoruz ama içine bakamıyoruz.**

**Nasıl görülür:** ETH adresi yapıştır → yoklama "ethereum'da aktif" der →
adres sayfasında indeksleme başlatılamaz.

**Ölçüm:** `grep -n "doldurulacak" packages/chain/src/adapters/evm.ts` → 3 satır.

**Nerede:** `packages/chain/src/adapters/evm.ts`. Şekil TRON adaptöründe hazır
(sayfalama, imleç, onay filtresi, ham tam sayı); Etherscan'in `txlist` +
`tokentx` uçları bloklu sayfalama kullandığı için imleç TRON'unkinden
BASİTTİR — devam noktası blok numarasıdır ve kalıcıdır.

---

## 3. Bitcoin ve Solana adaptörleri de boş

**Ne bozuk:** ikisi de aynı şekilde `throw`. Bitcoin ayrıca UTXO motoru
istiyor (hesap modeli değil), yani FIFO atıfı olduğu gibi uygulanamaz.

**Nasıl görülür:** BTC txid yoklanıyor (mempool.space), sonrası yok.

**Nerede:** `adapters/bitcoin.ts`, `adapters/solana.ts`. Sıra Faz 2/3;
buradaki not, "unutuldu mu?" sorusunun cevabı olsun diye.

---

## 4. `internalTransfers: true` bir İDDİA; karşılığı ölçülmedi

**Ne bozuk:** TRON adaptörü yeteneklerinde `internalTransfers: true` yazıyor
(`tron.ts:60`), ama ayrıştırıcı yalnızca `TransferContract` ve
`TransferAssetContract` çözüyor (`tron.ts:294`). Bir sözleşme çağrısının
İÇİNDE dönen TRX (internal transaction) ayrı bir alanda gelir.

**Nasıl görülür:** görünmez — eksik hareket "hiç olmamış" gibi durur. Bu
sınıfın tehlikesi tam olarak budur.

**Ölçüm (yapılmadı, komutu bu):**
```bash
curl -s -H "TRON-PRO-API-KEY: $TRONGRID_API_KEY" \
  "https://api.trongrid.io/v1/accounts/<ADRES>/transactions?limit=50" \
  | grep -c internal_transactions
```
Sayı sıfırdan büyükse ya ayrıştırıcı doldurulur ya yetenek bayrağı
`false` yapılır. **Yeteneği doğrulanmamış bayrak, kapsanmamış bir yeri
kapsanmış gösterir** (CLAUDE.md → "yok ≠ bakılamadı").

---

## 5. Vaka açacak ekran yok

**Ne bozuk:** `TraceRun.caseId` zorunlu, ama `cases` tablosuna satır yazacak
tek bir arayüz yok. İlk takibi başlatmak için vakayı elle SQL'le açtım.

**Nasıl görülür:** `POST /api/takip` vakasız çağrıda hata verir; kullanıcı
kendi başına takip başlatamaz.

**Ölçüm:** `select count(*) from cases;` → 0. `find apps/web/src/app -name "*vaka*"` → boş.

**Nerede:** yeni `apps/web/src/app/vaka/…`. Görev 09'un (rapor) da girişidir:
rapor bir vakaya ait olur.

---

## 6. Takip koşusunun ilerlemesi görünmüyor, iptali yok

**Ne bozuk:** koşu sırasında sayfa "çalışıyor" der ve orada kalır; kaç düğüm
işlendiği, hangi hop'ta olunduğu görünmez. Koşu **yeniden denenmediği**
için (`attempts: 1`, bilinçli) yarım kalan bir koşu elle temizlenir.

**Nasıl görülür:** uzun bir taramada kullanıcı çalışıyor mu takıldı mı
bilemez — ve tarama gerçekten dakikalarca sürüyor.

**Nerede:** `apps/worker/src/takip.ts` (ilerleme yazımı) +
`apps/web/src/app/takip/[id]/TakipGorunumu.tsx`.

---

## 7. İndeks kapsamı çok sığ: 14.798 adresin 19'u taranmış

**Ne bozuk:** kayıtlı adreslerin **%0,13'ü** tam indeksli. Geri kalanı
hareketlerin karşı tarafı olarak açılmış boş düğümler. Takip motoru
taranmamış düğümü kendisi indeksliyor, ama düğüm sınırına gelince kalanlar
`indekssiz` sebebiyle duruyor.

**Nasıl görülür:** grafın kenarında duran düğümlerin çoğu "veri yok" der;
iz gerçekten bitti mi, biz mi bakmadık — ayırt edilebiliyor (iyi), ama
kapsam dar.

**Ölçüm:** `select index_state, count(*) from addresses group by 1;`

**Nerede:** ayar meselesi (hop bütçesi, düğüm sınırı) + tarama hızı
([oneriler](oneriler.md) §4: önce ÖLÇ, sonra paralelleştir).

---

## 8. İzleme servisi hiç deploy edilmedi

**Ne bozuk:** `apps/watcher` yazılmış (Dockerfile + kaynak var), ama
`deploy-watcher.yml` yalnızca `apps/watcher/**` değişince tetikleniyor ve
**bir kez bile koşmadı**. Sunucuda ayrıca bir kerelik `/srv/cry/.env`
gerekiyor.

**Nasıl görülür:** Telegram kanalı doğrulandı (iki mesaj ulaştı) ama kimse
bir şey izlemiyor: `watches` tablosu boş.

**Nerede:** GitHub → Actions → deploy-watcher → **Run workflow** (elle
tetikleme) + sunucuda `.env`. Zamanlaması bir karar
([bekleyen-kararlar](bekleyen-kararlar.md) §5).

---

## 9. Telegram `chat_id` container'a henüz ulaşmadı

**Ne bozuk:** değer `C:\srv\cry\.env` dosyasına yazıldı; çalışan
container'lar ortamı **açılışta** okuyor. Bir sonraki deploy'a kadar
uygulama içinden Telegram'a mesaj gitmez (elle test edilen yol gitti).

**Nerede:** ilk deploy'da kendiliğinden düzelir; buraya "bozuk mu?" diye
ikinci kez bakılmasın diye yazıldı.

---

## 10. Fiyat ve kur tabloları boş

**Ne bozuk:** `prices_daily` ve `fx_rates_daily` **0 satır**. Bütün tutarlar
token cinsinden ("9.512.155.590,98 USDT"). Adli bir yazıda karşılığın TL
olarak yazılması gerekir.

**Nerede:** Görev 09. Kaynağın ve ANIN seçimi karar
([bekleyen-kararlar](bekleyen-kararlar.md) §8).

---

## 11. Veritabanı yedeği yok

**Ne bozuk:** 23.895 hareket ve 19 tam taranmış adres tek bir Docker
volume'ünde duruyor. Rapor "kanıt dondurma" iddiasında; altındaki veri
yedeksiz.

**Nasıl görülür:** görünmez — ta ki görünene kadar.

**Komut:**
```powershell
docker exec cry-db pg_dump -U cry -d cry --format=custom > "cry-yedek-$(Get-Date -Format yyyyMMdd).dump"
```

---

## 12. Hız sınırına takılma kullanıcıya söylenmiyor

**Ne bozuk:** tarama yarıda kalırsa (`index_state = 'kismi'`) sebebin hız
sınırı mı kaynağın hatası mı olduğu yalnızca worker log'unda.

**Nasıl görülür:** adres sayfası "kısmi" der, kullanıcı ne yapacağını bilmez.

**Nerede:** `IndeksSonucu.atlanmaSebebi` zaten taşınıyor ama kayda
yazılmıyor; `addresses` tablosuna bir sebep alanı + adres sayfasında satır.
