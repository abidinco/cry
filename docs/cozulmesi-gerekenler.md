# Çözülmesi gerekenler

Bu dosya **karar beklemeyen** eksikleri tutar: ne yapılacağı belli, yalnızca
yapılmamış. Karar bekleyenler ayrı ([bekleyen-kararlar.md](bekleyen-kararlar.md)),
"yapılsa iyi olur"lar ayrı ([oneriler.md](oneriler.md)).

Her madde: **ne bozuk · nasıl görülür · ölçüm · nerede.** Ölçümü olmayan
madde yazılmaz; "sanırım şu eksik" bir sonraki turda kanıya dönüşür.

Ölçüm tarihi: **2026-09-28**, yerel yığın.

```
# Postgres — docker exec cry-db psql -U cry -d cry
etiket: 1.117  adres: 90.843     hareket: 268.182    koşu: 5     vaka: 2
izleme: 0      fiyat: 0          rapor: 0

# Blok indeksi — docker exec cry-clickhouse clickhouse-client --database cry
satır: 1,15 Mr        disk: 87,8 GiB        okunan aralık: 81.826.048 – 86.646.047
pencere (boşluksuz):  81.834.230 – 86.646.047  (~167 gün)
doldurucu: 10,9 blok/sn, geriye doğru · taban ~87 gün uzakta · D:'de 1.776 GiB boş
```

Disk artık bağlayıcı kısıt DEĞİL (2 TB takıldı, 2026-09-28). Sırayı belirleyen
şey bundan sonra ZAMAN: tam geçmiş bu hızla ~87 gün.

---

## 1. Etiketlerin KİMLİĞİ: 28 borsa adıyla biliniyor, 739 aday hâlâ adsız

**Ne bozuk:** `labels` tablosunda **1.117 etiket** var ve iki sebep de
ateşleniyor — doğrulanmış borsada `terminal`, adayda `terminal_aday`. Eksik
olan şey artık etiketin VARLIĞI değil, adayların KİMLİĞİ: keşif "burası bir
servis cüzdanı" diyebiliyor, o 739 adres için "burası hangi borsa" diyemiyor.

**Nasıl görülür:** rapor "para bir borsa ADAYINA girdi" der, borsanın adını
vermez. Adli bir yazıda beklenen cümle ikincisidir.

**Ölçüm (2026-09-23):**
```bash
docker exec cry-db psql -U cry -d cry -c "select source,category,count(*) from labels group by 1,2;"
docker exec cry-db psql -U cry -d cry -c \
  "select l.title from labels l where l.source='tronscan' and l.verified_at is not null order by 1;"
```
→ `ofac/sanction:320 · kesif_blok/exchange_hot:739 · tronscan/exchange_hot:32 ·
kesif/exchange_hot:17 · tronscan/diger:5 · kullanici/exchange_hot:4`.

**Bugün yapılan:** blok keşfinin 739 adayı yazıldı, sonra hepsi TronScan'a
soruldu. Doğrulanmış borsa **7 → 32**: 11 Binance sıcak cüzdanı, Kraken, Bybit,
OKX, Bitget, HTX 1/4, KuCoin 2/4, Gate, Paribu, Poloniex, Bitfinex, BitMart,
Coinone, MEXC, CEX.IO. Yapısal keşif gerçekten borsa buluyor — ama adını ancak
bir kaynak koyabiliyor.

**Kalan:**
- **739 adayın 711'i TronScan'da etiketsiz.** Kimlik başka bir kaynak ister;
  bugünkü tek kaynak TronScan ve o da bu adresler için susuyor.
- `MaskEX Hot Wallet 17` bir CEX gibi duruyor ama sözlüğe ALINMADI —
  doğrulanmamış bir borsa adı yanlış bir "borsaya girdi" hükmü üretir.
- BtcTurk adayı `TD32z28Q…` hâlâ etiketsiz.
- Eski koşular donmuş kayıttır: yeni etiketin etkisi ancak YENİ koşuda görünür.

---

## 1b. BSC yoklaması — Blockscout yolu YOK, herkese açık RPC'ye düşüldü

**Karar (2026-09-09):** Etherscan'in ücretsiz planı BSC'yi kapsamıyor
(`chainid=56` → "Free API access is not supported for this chain"); yedek
olarak Blockscout seçilmişti.

**Ölçüm (2026-09-14) kararın dayanağını çürüttü:** Blockscout BSC
barındırmıyor — `bsc.blockscout.com` ve `bnb.blockscout.com` 404, zincir
listesinde (`chains.blockscout.com/api/chains`) 56 yok.

**Yapılan:** `packages/chain/src/network-probe.ts` Etherscan BSC'de hata
verince `bsc-dataseed.bnbchain.org` RPC'sine düşüyor.
- İşlem hash'i: `eth_getTransactionByHash` KESİN cevap veriyor.
- Adres: geniş aralıklı `eth_getLogs` 403 (ölçüldü), yani geçmiş
  listelenemiyor. Gönderim sayısı, BNB bakiyesi ve USDT-BEP20 bakiyesinden
  biri varsa adres VAR; hiçbiri yoksa sonuç `hata` taşır ("kısmen
  yoklandı") ve "yok" DENMEZ.

**Kalan:** token alıp bakiyesini boşaltmış bir BSC adresi hâlâ görünmez.
Kapatmanın yolu ücretli bir indeksleyici (Etherscan ücretli planı, NodeReal
BSCTrace) — bir karar, bugün yok.

---

## 2. EVM adaptörü BOŞ — Ethereum/Polygon yoklanıyor ama taranamıyor

**Ne bozuk:** `packages/chain/src/adapters/evm.ts` üç yöntemde de
`throw new Error("EVM adaptörü Faz 1b'de doldurulacak")` diyor. Yoklama
katmanı Etherscan'i doğrudan çağırdığı için **bir EVM adresinin var olduğunu
söyleyebiliyoruz ama içine bakamıyoruz.**

**Nasıl görülür:** ETH adresi yapıştır → yoklama "ethereum'da aktif" der →
adres sayfasında indeksleme başlatılamaz.

**Ölçüm:** `grep -n "doldurulacak" packages/chain/src/adapters/evm.ts` → 3 satır.

**Engel ANAHTAR DEĞİL; üç uç da bugün çalışıyor (ölçüldü 2026-09-29).**
`ETHERSCAN_API_KEY` dolu (34 karakter) ve Etherscan V2 üç hesap ucunun
üçünü de veriyle döndürdü: `txlist`, `tokentx` ve **`txlistinternal`** — hepsi
`status: "1"`. Yani yazılacak şey bir erişim müzakeresi değil, TRON'daki
aynı şeklin (sayfalama, imleç, onay süzgeci, ham tam sayı) EVM karşılığını
yazmak. Ölçümün komutu (ağ erişimi ve anahtar konteynerde):

```bash
docker exec cry-worker node -e '
const k = process.env.ETHERSCAN_API_KEY;
const u = "https://api.etherscan.io/v2/api?chainid=1&module=account" +
  "&address=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045&page=1&offset=2&sort=desc&apikey=" + k;
(async () => { for (const a of ["txlist","tokentx","txlistinternal"]) {
  const r = await fetch(u + "&action=" + a); console.log(a, r.status, (await r.text()).slice(0,120));
} })();'
```

**İki tuzak ölçülerek doğrulandı:**

- **Hata HTTP 200 ile gelir ve metni `result` alanında durur.** Anahtarsız aynı
  çağrı `{"status":"0","message":"NOTOK","result":"Missing/Invalid API Key"}`
  döndürdü — `!!result` diye bakan bir kontrol bunu "bulundu" sayar. Yoklama
  katmanında kural zaten var (`etherscanHatasi`, `network-probe.ts`); adaptör
  doldurulurken **aynı kural orada da uygulanmalı**, çünkü bu projede "bir kural
  bir yerde uygulanıp kardeşinde unutulabiliyor".
- **Anahtar depo kökündeki `.env`'de BOŞ** (uzunluk 0); dolu olanlar
  `C:\srv\cry\.env` ve `apps/web/.env.local`. Yalnızca kök `.env` yükleyen bir
  betik "Missing/Invalid API Key" alır ve **bunu hata olarak değil 200 olarak**
  alır. Yerel betik iki dosyayı birden yükler (CLAUDE.md → çalışma ortamı).

**Yeni kapı: `capabilities.internalTransfers: true` EVM'de de bugün İDDİA.**
TRON'dan farkı var — orada kaynak zaten vermiyor (§4), EVM'de kaynak **veriyor**
(`txlistinternal` ölçüldü) ama adaptör okumuyor. Adaptör doldurulurken bu uç
okunmazsa bayrak `false` yapılır; okunursa iki liste birleştirilir ve
`(chain, txHash, occurrence)` tekilliği ikisini de kapsar.

**Sınır, ölçülmüş olan:** ücretsiz plan **BSC'yi kapsamıyor** (§1b) ve istek
başına 1.000 kayıt / 5 çağrı sn sınırı var. Sayfalama blok numarasıyla
olduğu için devam noktası TRON'un fingerprint'inin aksine KALICIDIR.

**Nerede:** `packages/chain/src/adapters/evm.ts`.

---

## 3. Bitcoin ve Solana adaptörleri de boş — ama engelleri AYRI cinsten

**Ne bozuk:** ikisi de her yöntemde `throw`.

**Ölçüldü (2026-09-29): ikisinde de engel KAYNAK değil, MODEL.** Anahtarsız
ve ücretsiz kaynaklar bugün cevap veriyor:

| Zincir | Ölçülen çağrı | Sonuç |
|---|---|---|
| bitcoin | `https://mempool.space/api/address/<adres>/txs` | HTTP 200, 141.704 bayt (tek adres, tek sayfa) |
| solana | `getSignaturesForAddress` (api.mainnet-beta.solana.com) | HTTP 200, imzalar `blockTime` ile |
| solana | `getTransaction` (`jsonParsed`) | HTTP 200, `innerInstructions` ve SPL `mint` alanları dolu |

Yani "kaynak yok" diye bir engel YOK; engel her ikisinde de veriyi bizim
hareket modelimize çevirmek.

**Bitcoin — bu bir adaptör işi DEĞİL.** UTXO modelinde "kimden kime" diye
tek bir çift yok: bir işlemin n girdisi ve m çıktısı var, para üstü çıktısı
göndericinin kendisine dönüyor ve hangi çıktının para üstü olduğu bir
TAHMİNDİR. Ortak girdi sahipliği kümelemesi ve CoinJoin ayıklaması da aynı
cinsten. Yani **atıf kuralının kendisi yeniden yazılır** (FIFO olduğu gibi
uygulanamaz) ve bu, `listTransfers` doldurmakla bitmez — ikinci bir motor
ister. CLAUDE.md'deki "atıf kuralı bir SEÇİMDİR ve rapora YAZILIR" kuralı
burada iki kat önemli: para üstü tahmini de rapora yazılmalı.

**Solana — engel SAHİPLİK çözümlemesi.** SPL token'ları cüzdanda değil
türetilmiş token hesaplarında (ATA) durur; `jsonParsed` bir transferde
karşı taraf olarak **token hesabını** verir, cüzdanı değil. Sahibi
çözülmeden çizilen bir graf, aynı cüzdanı her token'da ayrı bir düğüm
gösterir. İkinci mesele arşiv derinliği: genel RPC `getFirstAvailableBlock`
için **0** diyor, ama bu düğümün İDDİASI — eski bir slot'la sınanmadı ve
genel RPC'lerin eski işlemi reddetmesi bilinen bir durum. Karar verilmeden
önce ölçülecek: yıllar öncesine ait bir imza `getTransaction` ile geliyor mu.

**Sıra ve gerekçesi:** EVM → Solana → Bitcoin. EVM'de şekil hazır ve kaynak
ölçülü; Solana bir çözümleme katmanı ekler; Bitcoin bir motor ekler.
**Hiçbirinde blok indeksi yok** — TRON'daki pencere kazancı (M1) o zincirlerde
yok, her soru kaynağa gider. Zincirler arası köprü takibi de ayrı bir iştir ve
hiçbir adaptör onu tek başına çözmez.

**Nerede:** `packages/chain/src/adapters/bitcoin.ts`, `adapters/solana.ts`.

---

## 4. ~~`internalTransfers: true` bir İDDİA~~ — ÖLÇÜLDÜ ve bayrak DÜŞÜRÜLDÜ (2026-09-29)

**Ölçüm 1 — iç transfer zincirde VAR.** Üç ardışık blokta (86.663.672–674) 1.275 işlemin **7'si**
`internal_transactions` taşıyor; kayıtlar `callValueInfo` ile TRX tutarını da veriyor. Örnek:
`12dcf922…` → `{caller_address, transferTo_address, callValueInfo:[{callValue:1}]}`.

**Ölçüm 2 — `listTransfers`in okuduğu uç onları VERMİYOR.** O iç transferin alıcısı
(`TE3yWdhDMudnhRqKw9a7JD8b97zqk3dZdj`) hesap ucunda 3 kayıt döndürüyor ve iç transferi taşıyan
işlem **aralarında yok**; 3 kaydın 3'ünde de `internal_transactions` alanı BOŞ. Alan her kayıtta
MEVCUT ama hiç dolmuyor — bu projenin "kaynağın ŞEKLİ doğru diye içeriği tam değildir" kuralının
bir örneği daha.

**Yapılan:** `tron.ts` → `internalTransfers: false`. Bayrağı true bırakmak, bakılmamış bir yeri
kapsanmış gösterirdi. Testi var (`tests/gorulemeyen.test.ts`) — bayrak sessizce geri açılamaz.

**Ayrıca: bayrak artık bir EKRAN tarafından soruluyor.** `gorulemeyenler()` (saf, `@cry/chain`)
körlüğü cümleye çeviriyor, `GET /api/takip/[id]` onu yanıta koyuyor ve takip görünümü grafın
altında yazıyor. Adaptör yoksa cevap "yok" değil **null = kapsam BİLİNMİYOR**. Ölçüldü:
`tron → ["sözleşme içi değer hareketleri (internal transfer)"]`, `ethereum · bitcoin · solana → []`.
Sayfanın 3005'te derlendiği doğrulandı (307 → `/giris`); **oturumlu hâli görülmedi**, çünkü ajan
parola girmiyor.

**Kalan — bu artık bir İMKÂN:** iç transferler `gettransactioninfobyblocknum` yanıtında geliyor ve
blok okuyucumuz o yanıtı **zaten her blok için indiriyor**. Yani TRON iç transferlerini blok
indeksine yazmak yeni bir kaynak değil, yeni bir SÜTUN meselesi — ama şema değişikliği ve okunmuş
blokların yeniden okunması demek. Bugün yapılmadı; yapılırsa bayrak `blok-indeksli-adaptor` için
yeniden açılır.

## 5. Vaka açacak ekran yok

**Ne bozuk:** `TraceRun.caseId` zorunlu, ama `cases` tablosuna satır yazacak
tek bir arayüz yok. İlk takibi başlatmak için vakayı elle SQL'le açtım.

**Nasıl görülür:** `POST /api/takip` vakasız çağrıda hata verir; kullanıcı
kendi başına takip başlatamaz.

**Ölçüm:** `select count(*) from cases;` → 0. `find apps/web/src/app -name "*vaka*"` → boş.

**Nerede:** yeni `apps/web/src/app/vaka/…`. Görev 09'un (rapor) da girişidir:
rapor bir vakaya ait olur.

---

## 6. ~~Takip koşusunun ilerlemesi görünmüyor, iptali yok~~ — YAPILDI (2026-09-15)

Worker saniyede en çok bir kez `stats.ilerleme` yazar (işlenen adres,
sıçrama, sırada kalan); sayfa bunu tek satırda gösterir ve 90 sn ses
gelmezse "büyük bir adres taranıyor olabilir" diye uyarır. "durdur" düğmesi
bekleyen işi kuyruktan kaldırır, süren işte bayrak koyar; worker bir sonraki
adreste durur ve koşuyu **"durduruldu — graf eksik"** diye kapatır, sırada
kalan adres sayısı `stats.durdurmalar`a yazılır. Ölçüldü: koşu 11, bayraktan
~1 sn sonra durdu, kalan 10.

Kalan: tek bir büyük adresin indekslenmesi sürerken iptal o tarama bitene
kadar bekler (yoklama adresler arasında).

---

## 7. İndeks kapsamı çok sığ: 90.843 adresin 105'i taranmış

**Ne bozuk:** kayıtlı adreslerin **%0,12'si** tam indeksli (2026-09-28: tam 105 · kısmi 33 ·
bilinmiyor 90.705). Blok indeksi bu tabloyu DOLDURMUYOR — adres taraması ayrı bir iş.
Geri kalanı
hareketlerin karşı tarafı olarak açılmış boş düğümler. Takip motoru
taranmamış düğümü kendisi indeksliyor, ama düğüm sınırına gelince kalanlar
`indekssiz` sebebiyle duruyor.

**Nasıl görülür:** grafın kenarında duran düğümlerin çoğu "veri yok" der;
iz gerçekten bitti mi, biz mi bakmadık — ayırt edilebiliyor (iyi), ama
kapsam dar.

**Ölçüm:** `docker exec cry-db psql -U cry -d cry -c "select index_state, count(*) from addresses group by 1;"`

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
tetikleme) + sunucuda `.env`. Sıklık ve eşik karara bağlandı (CLAUDE.md → Kalan kararlar): 15 dakikada bir,
eşik üstü harekette mesaj, küçükler günlük özete.

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

**Nerede:** Görev 09. Kaynak ve AN karara bağlandı (CLAUDE.md → Kalan kararlar): iki kur birden
yazılır, USD/TRY TCMB'den, token→USD CoinGecko'dan.

---

## 11. Blok indeksinin yedeği YOK — karar YENİDEN DÜŞÜNÜLECEK (2026-09-28)

**Ne var, ne yok:** Postgres yedekleniyor (`deploy/pc/yedek.ps1`, günlük 03:15, 14 kopya). Blok
indeksi (1,15 Mr satır / 87,8 GiB) yedeklenMİYOR.

**Neden böyle karar verilmişti:** yeri doldurulamayan veri Postgres'te ve **17 MB** — vaka, takip
koşusu, etiket, rapor, denetim kaydı. Blok indeksi zincirden yeniden türetilebilir; bedeli para
değil ZAMAN.

**Kararın şartı GERÇEKLEŞTİ:** "2 TB disk gelip tam geçmiş yüklendiğinde yeniden düşünülür"
deniyordu. Disk takıldı (2026-09-28). Yeniden türetme maliyeti bugün bile ~87 gün; tam geçmiş
yüklendiğinde indeksi kaybetmek bir çeyrek demek. Sıradaki iş: ClickHouse'un kendi `BACKUP TABLE`
komutunu **D:'den AYRI bir fiziksel diske** ölçmek (süre, boyut, geri yükleme denemesi). Bugün
böyle bir disk MAKİNEDE TAKILI DEĞİL (bkz. §16).

**Kapsam dışı:** bu yedek PC'nin Postgres'ini kapsar. Hetzner'daki yığının veritabanı ayrıdır ve
onun yedeği YOKTUR.

## 12. ~~Hız sınırına takılma kullanıcıya söylenmiyor~~ — YAPILDI (2026-09-29)

`index_state = 'kismi'` sebebi söylemiyordu; sebep yalnızca worker günlüğündeydi ve adres sayfası
yanına **"devam edecek"** yazıyordu — DOĞRULANMAMIŞ bir vaat, çünkü kimse kendiliğinden devam
etmiyor.

**Yapılan:** `addresses.index_note` (migration `20260929140000_indeks_notu`) turun neden yarıda
kaldığını tutuyor: `sayfa_butcesi` · `hiz_siniri` · `kaynak_hatasi` · `adaptor_yok` · `iptal`.
Yazan `apps/worker/src/indeksle.ts` (hata yakalanır, sebep yazılır, hata YİNE yükselir); kodu
cümleye çeviren saf katman `@cry/motor` → `indeks-notu.ts`, 15 testle. Biten tur notu SİLER, yoksa
dün hız sınırına takılmış bir adres bugün tam taransa bile "takıldı" demeye devam ederdi. Adres
sayfası sebebi yazıyor ve yalnızca işe yarayacağı yerde (`hiz_siniri`, `sayfa_butcesi`)
"yeniden taranabilir" diyor.

**Ölçüldü (2026-09-29, canlı Postgres + gerçek TronGrid):**

| yol | nasıl zorlandı | kayda yazılan |
|---|---|---|
| sayfa bütçesi | `adresIndeksle(..., { maxSayfa: 1 })`, 305 yeni hareket | `kismi` / `sayfa_butcesi` |
| hız sınırı | gerçek 429 (kota canlı yığınla paylaşılıyor) | `kismi` / `hiz_siniri` |

**Yol boyunca çıkan asıl kusur:** ilk sürüm gerçek 429'a `kaynak_hatasi` yazdı. Sebep,
`http.ts`in denemeler tükenince `"N denemede alınamadı: <url>"` diye SARMALAMASI ve o
sarmalayıcının durum kodu TAŞIMAMASIYDI — 429 yalnızca `cause`'ta duruyordu. Yani kullanıcıya
"bekle, yeniden dene" denmesi gereken yerde "yeniden denemek işe yaramayabilir" denecekti.
`notaCevir` artık zinciri izliyor ve bunun iki testi var. **Bu kusur kod okuyarak değil,
koşturulunca çıktı.**

**Ölçülmeyen tek yol:** tur BİTİNCE notun silinmesi uçtan uca görülmedi — TronGrid kotası doygundu
ve her ikinci tur 429 aldı. Karar saf katmana alındı (`kaydedilecekNot`) ve testli; yazan satır
tek satır. Bir sonraki tam tarama bunu kendiliğinden gösterecek.

## 13. ~~Ucu olmayan kenarlar: düğüm sınırında kenar yazılıyor, hedef yazılmıyor~~ — YAPILDI (2026-09-29)

Worker bir düğümün çıkışlarını ÖNCE kenar olarak yazıyor, sonra hedefleri sıraya alırken düğüm
sınırına takılıp `break` ediyordu. Hedef düğüm hiç yazılmıyor, kenarın ucu boşta kalıyordu:
koşu 9'da 1.342 kenarın 10'u grafta olmayan bir adrese gidiyor, başlık "1.342 hareket" defter
"1.332 hareket" diyordu. Saf katman ucu olmayan kenarı zaten eliyor (`akisModeli` → `if (!f || !t)
continue`) ve "çağıran onu kırpılan olarak sayar" diyor — ama çağıran saymıyordu.

Sınıra takılan hedef artık `dugum_siniri` sebebiyle bir SINIR düğümü olarak yazılıyor
(`apps/worker/src/takip.ts` → `yuru`). Sınır düğümü TARANMAZ; yalnızca "buraya kadar geldik ve
sebebi bu" der. Etiketi yazıldığı anda dondurulur, yani sınırda duran bir borsa raporda görünür.

**Ölçüldü (2026-09-29, aynı kök `TAyAA1xj…`, `maxDugum: 8` ile sınır ZORLANARAK):**

| | düğüm | kenar | sınır düğümü | ucu boşta kenar |
|---|---|---|---|---|
| düzeltmesiz | 8 | 23 | 4 | **5** |
| düzeltmeli | 11 | 23 | 7 | **0** |

Kenar sayısı DEĞİŞMEDİ: hareket uydurulmadı, yalnızca eksik UÇ yazıldı. 5 kenarın 3 düğüme
denk gelmesi normal — birden çok kenar aynı hedefe gidiyor. Arşivde ucu boşta kenar kalmadı:

```bash
docker exec cry-db psql -U cry -d cry -c "select e.trace_run_id, count(*) from trace_edges e left join trace_nodes n on n.trace_run_id=e.trace_run_id and n.address=e.to_address where n.address is null group by 1"
```
→ tek satır: koşu 9 (donmuş kayıt; eski koşular düzeltilmez, yeni koşularda görünmez).

**Bilerek böyle:** düğüm bütçesi TARANAN düğümü sınırlar, çizilen düğümü değil — 8 bütçeyle 11
düğüm yazıldı ve 7'si `dugum_siniri` sebebi taşıyor. Alternatifi (kenarı hiç yazmamak) gerçekten
olmuş bir para hareketini gizlerdi.

## 14. Büyük koşuda defter üzerinde gezinmek bütün sayfayı yeniden çiziyor

**Ne bozuk:** defter satırına gelmek `defterVurgu` durumunu değiştiriyor ve
`TakipGorunumu` tamamen yeniden çiziliyor (98 satır + SVG). Koşu 9'da
ölçülmedi, ama 300 düğümlük bir koşuda hover gecikmesi beklenir.

**Nerede:** `apps/web/src/app/takip/[id]/TakipGorunumu.tsx` — vurgu durumu
`Akis`'e kadar inip defter satırlarını ayrı bir bileşene almak ya da CSS
sınıfıyla DOM düzeyinde yakmak. Önce ölçülmeli (React Profiler).

---

## 15. Tek bir büyük adres taranırken "durdur" beklemek zorunda

**Ne bozuk:** iptal bayrağı ADRESLER ARASINDA yoklanıyor; bir adresin
indekslenmesi (en çok 10 sayfa) sürerken iptal o tarama bitene kadar bekler.

**Nerede:** `apps/worker/src/indeksle.ts` sayfa döngüsüne iptal kontrolü
(koşu kimliği parametre olarak) — ya da kabul: en kötü durum birkaç dakika.

---

## 16. Dış yedek diski TAKILI DEĞİL — yedek 4 gün SESSİZCE alınamadı

**Ne bozuk:** 2 TB SSD takılırken eski E: diski (931 GB, yedek hedefi) makineden çıktı.
`yedek.ps1` `E:\04_Yedek\cry` yoluna gömülüydü ve **24–28 Eylül arasında hiç yedek alınmadı**.
Görev koştu, günlüğe "HATA: hedef surucu yok" yazdı ve kimse bakmadı; geri yükleme denemesi de
"A drive with the name 'E' does not exist" dedi.

**Ne düzeltildi (285668a):** hedef artık harf değil FİZİKSEL DİSK ile seçiliyor
(`deploy/pc/yedek-hedefi.ps1`): `04_Yedek\cry` klasörü olan ve D:'nin diskinde OLMAYAN bir birim
aranır, bulunamazsa `C:\srv\cry\yedek`e düşülür ve günlüğe UYARI yazılır. Ölçüldü: 17,3 MB dump,
11 tablo / 363.166 satır geri yüklendi.

**Kalan — bu bir DONANIM işi:** bugünkü hedef C:, yani veriyle **aynı makinede**. Disk arızasına
karşı korur, makine kaybına (hırsızlık, yangın, anakart) KORUMAZ. Harici diski geri tak ya da
yenisini ayır; üstünde `04_Yedek\cry` klasörü olsun, gerisi kendiliğinden çalışır.

**Asıl ders bunun ötesinde:** sessiz kalan bir görev "çalışıyor" ile "hiç koşmadı"yı ayırt
edilemez kılıyor. Doldurucunun bekçisi her turda NABIZ yazıyor (CLAUDE.md); yedeğin böyle bir
nabzı yok — bir hafta üst üste başarısız olsa yine kimse görmez. Yedek de bir nabız yazmalı
(ya da başarısızlığı Telegram'a düşmeli, kanal zaten hazır).

---

## 17. 739 borsa adayı doğrulanmayı bekliyor — inceleyen yok

**Ne bozuk:** blok keşfi 739 aday yazdı ve TronScan bunların hiçbirine ad veremedi. Her biri
motorda `terminal_aday` üretiyor: iz orada duruyor ama "borsaya girdi" denemiyor.

**Nasıl görülür:** `/etiket` sayfası açılır ve liste **739 satır** gösterir; insan kararı sayacı
**0**. Sayfa 2026-09-23'te yazıldı, hiç kullanılmadı.

**Ölçüm:**
```bash
docker exec cry-db psql -tA -U cry -d cry -c \
  "select count(*) from labels where category like 'exchange%' and verified_at is null"
docker exec cry-db psql -tA -U cry -d cry -c \
  "select count(*) from labels where verified_by like 'kullanici:%'"
```
→ 792 / **0**.

**Nerede:** insan işi, kod işi değil. Sıra `/etiket`te zaten doğru kurulu: önce GERÇEKTEN bir izi
durdurmuş adaylar.

**Karar (2026-09-28): TEMBEL — yalnızca bir koşu o adayda DURDUĞUNDA incelenir.** Peşinen liste
taramak yok; emek işin geldiği yere harcanır. Yani bu madde bir "yapılacak iş" DEĞİL, bir çalışma
düzenidir: sayacın 0 kalması bir eksik değil, beklenen hâldir. Rapor `terminal_aday` demeye devam
eder ve bu yanlış değil, eksik doğrulanmış bir iddiadır (CLAUDE.md → Geçmişin SIRASI ve BEDELİ).

---

## 18. ~~Canlı okuyucu 46 saat geride "healthy" diyordu~~ — YAPILDI (2026-09-29)

Sağlık denetimi yalnızca nabız DAMGASINA bakıyordu; okuyucu sağ olduğu sürece uçtan ne kadar
koparsa kopsun yeşil görünüyordu (ölçüldü 2026-09-28 19:31: "Up 12 minutes (healthy)" derken
günlük `geride 54.668 blok · zincire gecikme 164.108 sn` yazıyordu — 45,6 saat).

Nabız dosyası artık `<ms> <gerideSn>` taşıyor (`apps/blok-okuyucu/src/canli.ts` → `gerideOlc`,
`nabizYaz`) ve denetim ikisine birden bakıyor: damga 120 sn'den taze OLACAK **ve** gerilik 3.600
sn'nin altında olacak. Gerilik, kursörün DEĞDİĞİ son bloğun damgasından ölçülür — uçtakinden
değil; 46 saatlik kopmada 164.108 sn diyen ölçü buydu. Blok yazılmamışsa blok farkı 3 sn ile
çevrilir, yani "bilinmiyor" hiç ölçülmemiş sayılmaz.

**Ölçüldü (2026-09-29):** denetim kabuğu konteynerde gerçek dosyalarla koşturuldu —
`57 → healthy`, `164108 → UNHEALTHY`, `3599 → healthy`, `3600 → UNHEALTHY`, bayat damga +
gerilik 0 → `UNHEALTHY`. Okuyucu kuru koşturuldu, nabız `1790632209804 55` yazdı (günlükteki
57 sn ile uyumlu). Hiçbir servis okuyucunun sağlığına bağlı değil (`depends_on` yok), yani
`unhealthy` bir SİNYALDİR, kimseyi düşürmez.

**Kalan:** sinyali GÖREN yok. Unhealthy bir konteyner `docker ps`e bakılmadıkça sessizdir;
doldurucunun bekçisi gibi bir Telegram nabzı hâlâ yazılmadı (kanal hazır).

## 19. ~~`block_cursors.missing_ranges` bayat: kapanan boşluk listeden düşmüyordu~~ — YAPILDI (2026-09-29)

Liste yalnızca BÜYÜYORDU: `eksikleriGuncelle` yalnızca doldurucudan ve `oku.ts`ten çağrılıyordu,
boşluk kapatıcı (`cry-bosluk-doldur`) bir boşluğu kapatınca listeden düşürmüyordu. Ölçülmüştü:
30 kayıtlık listenin otuzu da kapsam tablosunda okunmuş çıkıyordu.

Kapatıcı artık her `--uygula` turunda `eksikListesiniGuncelle()` çağırıyor: listedeki her aralık
kapsama sorulur (10.000 bloktan büyükler ölçülmez — onlar "henüz gelinmemiş geçmiş"tir),
okunmuş bloklar DÜŞER, bu turun kapatamadıkları sebebiyle KALIR. Tur hiç boşluk BULMASA da
koşar: bayat kayıtlar cephenin altında, yani betiğin hiç dokunmadığı bölgede kalabiliyor.

**Ölçüldü (2026-09-29, canlı yığın):** tur öncesi liste 5 kayıt
(`81453718, 81470641, 81482947, 81482950, 81482961`); kapatıcı cephenin üstündeki 3 boşluğu
kapattı ve liste **5 → 2** oldu — geriye kapsamda gerçekten okunmamış olan iki blok kaldı.
Yeniden üretim:
```bash
docker exec cry-db psql -tA -U cry -d cry -c "select jsonb_array_length(missing_ranges) from block_cursors where chain='tron'"
node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/blok-indeks-bosluk-doldur.mts --uygula
```

**Bilerek yapılmayan:** doldurucuyla yarış kilitlenmedi (ikisi de oku-değiştir-yaz yapıyor, son
yazan kazanır). Bedeli bir turluk bilgi kaybı ve bu alan **hiçbir karar için okunmuyor** —
pencere kapsam tablosundan hesaplanıyor. Bir gün bir ekran ya da rapor bu alanı okursa önce
burası kilitlenmeli. `lastError` ve `lastRunAt` bu betikten EZİLMİYOR: hata yalnızca bu tur bir
boşluğu kapatamadıysa yazılır, `lastRunAt` kursörün kendi yazımıdır (`canli.ts`).
