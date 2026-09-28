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
([bekleyen-kararlar](bekleyen-kararlar.md) §5).

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

## 12. Hız sınırına takılma kullanıcıya söylenmiyor

**Ne bozuk:** tarama yarıda kalırsa (`index_state = 'kismi'`) sebebin hız
sınırı mı kaynağın hatası mı olduğu yalnızca worker log'unda.

**Nasıl görülür:** adres sayfası "kısmi" der, kullanıcı ne yapacağını bilmez.

**Nerede:** `IndeksSonucu.atlanmaSebebi` zaten taşınıyor ama kayda
yazılmıyor; `addresses` tablosuna bir sebep alanı + adres sayfasında satır.

---

## 13. Ucu olmayan kenarlar: düğüm sınırında kenar yazılıyor, hedef yazılmıyor

**Ne bozuk:** worker bir düğümün çıkışlarını ÖNCE kenar olarak yazıyor, sonra
hedefleri sıraya alırken düğüm sınırına takılıp duruyor. Hedef düğüm hiç
yazılmıyor; kenar ucu boşta kalıyor.

**Nasıl görülür:** koşu 9: 1.342 kenarın 10'u grafta olmayan bir adrese
gidiyor. Başlık "1.342 hareket", defter "1.332 hareket" diyor ve fark hiçbir
yerde açıklanmıyor.

**Ölçüm (2026-09-15):**
```bash
docker exec cry-db psql -U cry -d cry -c "select count(*) from trace_edges e left join trace_nodes n on n.trace_run_id=e.trace_run_id and n.address=e.to_address where e.trace_run_id=9 and n.address is null"
```

**Nerede:** `apps/worker/src/takip.ts` → `yuru` (kenar yazımı ile `maxDugum`
kesmesinin sırası). Ya hedef "düğüm sınırı" sebebiyle yazılır ya da ekran
farkı sayıp söyler.

---

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
