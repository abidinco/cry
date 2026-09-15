# cry.abidin.dev — Proje Devir Dosyası

Bu dosya, projenin planlama aşamasında alınan **tüm** kararları içerir.
Claude Code'a bağlam olarak verilmek üzere yazıldı. Sıfırdan okuyup projeyi
devralabilecek şekilde hazırlandı.

---

## 1. Proje nedir

Kripto para akışını takip eden, tarayıcıdan kullanılan bir analiz aracı.
Kullanıcı bir cüzdan adresi veya işlem hash'i yapıştırır; araç paranın
cüzdanlar arasında nasıl dolaştığını, nerede beklediğini ve hangi borsaya
girdiğini gösterir.

**Temel senaryo:** X'ten Y'ye 10.000 TRX gider. Y'de biriken para 50.000 olur,
40.000'i Z'ye aktarılır. Z'de toplam 100.000'e çıkar ve tamamı T'ye gider.
Kullanıcı bu zinciri görsel olarak takip edebilmeli.

**Asıl hedef:** paranın hangi borsanın hot wallet'ına girdiğini ve ne zaman
girdiğini tespit etmek. Kullanıcı adli merci olarak o borsaya resmi yazı
yazacak.

**Kapsam notu:** Bu bir analiz aracıdır, delil üretim sistemi değil. Çıktısı
bağlayıcı değildir; adli merci her seferinde kendisi sorgulama yapar. Yine de
her etiketin kaynağı ve güven derecesi kayıt altında tutulur.

### Zincir üstünde görünmeyen şey

"Ne zaman paraya çevrildi" sorusunun cevabı blockchain'de **yoktur** —
fiat'a çevirme borsanın iç defterinde gerçekleşir. Zincirde görülebilecek son
şey: paranın borsanın deposit adresine girmesi ve oradan hot wallet'a
süpürülmesi. Aracın ürettiği çıktı bu: **borsa adı + deposit adresi + tx hash +
tarih.** Resmi yazı için gereken de tam olarak budur.

### Takip neden kesin değil

TRON ve EVM zincirleri hesap-bakiye modeli kullanır (Bitcoin gibi UTXO değil).
Bir cüzdanda paralar karışır; "X'ten gelen 10k'nın hangisi Z'ye gitti"
sorusunun matematiksel kesin cevabı yoktur. Bu yüzden bir atıf kuralı seçmek
zorundayız ve seçilen kural raporda **metodoloji olarak belirtilmelidir.**

---

## 2. Mimari — genel görünüm

```
tarayıcı → cry.abidin.dev (65.21.108.193, Namecheap A kaydı)
         → Hetzner: Caddy (proxy-caddy konteyneri, TLS)
         → WireGuard tüneli (10.99.0.1 → 10.99.0.2)
         → Windows PC: Next.js uygulaması :1337
                       Postgres + Redis + worker'lar (Docker, WSL2)
```

Ağır işin tamamı evdeki makinede döner. Sunucu sadece iki iş yapar:
TLS sonlandırma + proxy, ve 7/24 izleme servisi.

### Neden lokal

| | Hetzner | Lokal (dev) |
|---|---|---|
| CPU | 2 vCPU | 14 çekirdek |
| RAM | 3,7 GB | 32 GB |
| Boş disk | ~17 GB | ~350 GB |

Darboğaz disk ve paralel işlem gücüydü. Derin taramada lokalde onlarca worker
çalışabilir; sunucuda iki tane zor.

### PC kapalıyken

Caddy `handle_errors` ile `/srv/landing/cry-offline.html` sayfasını gösterir
("Analiz motoru çevrimdışı"). Sunucudaki izleme servisi etkilenmez, Telegram
uyarıları gelmeye devam eder; sadece derin analiz yapılamaz.

### Yerel kestirme

Evdeyken `http://localhost:1337` — trafik Hetzner'a gidip gelmez, belirgin
şekilde hızlıdır. Aynı uygulama, iki giriş noktası.

---

## 3. Altyapı — kurulmuş ve çalışıyor durumda

Bu bölüm **tamamlandı**, Görev 01'de doğrulandı. Bilgi amaçlı burada.

### Ağ

| Parametre | Değer |
|---|---|
| Alan adı | `cry.abidin.dev` → `65.21.108.193` (Namecheap A kaydı) |
| Sunucu WG IP | `10.99.0.1` |
| PC WG IP | `10.99.0.2` |
| WG portu | `51830/UDP` |
| Uygulama portu | `1337` |
| WG ağı | `10.99.0.0/24` |

Tünel tek yönlü kurulur: PC sunucuya bağlanır. Ev tarafında hiçbir port açık
değil. PC'de `AllowedIPs = 10.99.0.1/32` — yani internet trafiği tünelden
geçmiyor, sadece sunucuya giden paketler. `PersistentKeepalive = 25` şart,
yoksa modem NAT eşlemesini düşürür.

### Sunucu ortamı (Hetzner)

- Ubuntu, dış arayüz `eth0`, ufw pasif
- Reverse proxy: **Caddy, Docker içinde** (`proxy-caddy`)
- Caddyfile: `/srv/proxy/Caddyfile` · statik dosyalar: `/srv/landing`
- RAM 3,7 GB — üzerinde pt.abidin.dev, hessap.la, hafiza.abidin.dev,
  blog.abidin.dev çalışıyor. **Bunlara zarar verecek değişiklik yapılmayacak.**
- Caddyfile'da `cry.abidin.dev` bloğu **tam olarak bir kez** bulunmalı; iki kez
  olursa "ambiguous site definition" hatası verir (bu bir kez yaşandı).
- Caddyfile değişikliğinden sonra: yedekle → `caddy validate` → `caddy reload`

### PC ortamı (Windows)

- Docker Desktop + WSL2
- **Postgres veri dizini WSL2'nin ext4 dosya sisteminde olmalı, `/mnt/c`
  altında değil** — Windows dosya sistemine bağlanan volume'lar 5-10 kat yavaş
- Docker Desktop oturum açılışında başlar — **2026-09-15'e kadar BAŞLAMIYORDU**
  (kendi `AutoStart` ayarı kapalıydı); artık `deploy/pc/kur.ps1` açıyor ve
  `cry-baslangic` görevi denetliyor. Servislerde `restart: unless-stopped`
- WireGuard tüneli servis olarak kurulu, açılışta bağlanıyor
- Güvenlik duvarı kuralı `cry-app-wg`: TCP 1337, kaynak `10.99.0.0/24`
- Uyku modu kapalı

### Port kuralları

| Servis | Bağlama |
|---|---|
| Next.js | `1337:3000` — **`127.0.0.1:` öneki koyma**, tünelden erişilemez |
| Postgres | `127.0.0.1:15432:5432` — dışarı açık değil, DBeaver için |
| Redis | `127.0.0.1:16379:6379` — yalnızca bu makineye, yerel dev sunucusu kuyruğa ulaşsın diye (2026-09-15). Yerel dev CANLI kuyruğa iş atar. |

### Yedekleme

Otomatik yedek **yok**, kullanıcının bilinçli kararı. Elle alınacak:

```powershell
docker exec cry-db pg_dump -U cry -d cry --format=custom > "cry-yedek-$(Get-Date -Format yyyyMMdd).dump"
```

---

## 4. Veri kaynakları

### Ücretsiz katman gerçeği

Blockchain verisi halka açık ama **indekslenmiş** veri açık değil. Zincirde
"X adresinin tüm işlemleri" diye bir sorgu yoktur. Kendi arşiv düğümünü
çalıştırmak disk açısından imkânsız (TRON 2,5-3,5 TB, Ethereum 1,5-2 TB), o
yüzden hazır indeksleyicilerin ücretsiz katmanlarını kullanıyoruz.

| Kaynak | Limit | Kullanım |
|---|---|---|
| TronGrid | ~100K istek/gün, ~20 sorgu/sn (key ile) | TRON — ana kaynak |
| Etherscan V2 | 5 çağrı/sn, 100K/gün, tek key ile 60+ EVM zinciri | EVM |
| Blockscout | 5 RPS, 100K kredi/gün, 117 zincir | EVM yedek |
| mempool.space | key gerektirmiyor | Bitcoin (Faz 2) |

Etherscan ücretsiz katmanında istek başına dönen kayıt sayısı 1.000'e
düşürüldü — sayfalama maliyeti yüksek, buna göre planla.

### Üç katmanlı veri stratejisi

**a) Vaka odaklı artımlı indeks — ana çözüm.**
Sorgulanan her adresin işlem geçmişi bir kez çekilir ve Postgres'e yazılır.
Aynı adres bir daha API'ye sorulmaz; sadece son bloktan itibaren delta çekilir.
Zamanla soruşturulan dünyanın kendi indeksi oluşur. Rate limit sadece ilk
taramada sorun.

**b) BigQuery genel veri setleri — toplu/ters sorgular için.**
Google'ın halka açık blockchain veri setlerinde Ethereum ve TRON var; sandbox
ayda 1 TiB sorgu ücretsiz. Kullanıcı bu yolu kullanmayı onayladı.

Neden gerekli: "X hesabı başka hangi hesapları aktive etti" sorgusu normal
API'lerle korkunç pahalı — X'in tüm giden işlemlerini çek, sonra her alıcının
ilk işlemini ayrı ayrı sorgula. 10.000 alıcısı olan adres 10.000 çağrı demek.
BigQuery'de tek SQL. Sorgular partition/cluster filtreleriyle yazılmalı, yoksa
taranan bayt patlar.

**c) Lokal makine — motor.**
Node çalıştırmak için değil; uzun süren derin taramaları koşturmak için.

**d) Yerel blok indeksi — keşif katmanı (2026-09-15, planlanıyor).**
Arşiv düğümü değil: seçilmiş transferlerin (USDT-TRC20, TRX) kendi tablomuz;
canlı uç TronGrid'den, geçmiş toplu kaynaktan. Aday üretir, hüküm üretmez.
Plan ve ölçümler: [yol-haritasi-blok-indeks.md](yol-haritasi-blok-indeks.md).

---

## 5. Ağ tespiti — YAPILDI

İki modül yazıldı ve gerçek adreslerle test edildi (15 test vektörü, hepsi
doğru): `network-detect.ts` ve `network-probe.ts`. Bunlar projeye olduğu gibi
alınacak.

**Bağımlılıklar:** `bs58`, `bech32`, `@noble/hashes` (v2 — import yolları
`@noble/hashes/sha2.js` ve `@noble/hashes/sha3.js` şeklinde, uzantılı).

### Tespit kuralları

| Girdi | Sonuç |
|---|---|
| `T` + 33 base58, checksum geçerli, 21 bayt, `0x41` ön ek | TRON adresi, **kesin** |
| `41` + 40 hex | TRON adresinin hex biçimi |
| `bc1`/`1`/`3` + geçerli checksum | Bitcoin adresi, **kesin** |
| base58 → ham 32 bayt | Solana adresi (Solana'da checksum yok, 0.9) |
| base58 → ham 64 bayt | Solana işlem imzası |
| `0x` + 40 hex | EVM adresi — **hangi zincir olduğu formattan bilinemez** |
| `0x` + 64 hex | EVM işlem hash'i — zincir bilinemez |
| Ön eksiz 64 hex | TRON tx %50 / BTC txid %50 / EVM %15 — üçü de yoklanır |
| Ön eksiz 40 hex | `0x` düşmüş EVM adresi (0.6) |
| `*.eth` | ENS, çözümlenmeli |

Ek yetenekler: explorer linki yapıştırıldığında (tronscan, etherscan, solscan,
mempool.space vb.) içinden adres ayıklanır ve alan adı ipucu olarak kullanılır;
görünmez karakterler temizlenir; EIP-55 checksum'ı bozuk EVM adresleri için
uyarı üretilir.

**Kural: checksum'ı bozuk adres asla sessizce kabul edilmez.** Yanlış
kopyalanmış tek karakter tüm soruşturmayı yanlış cüzdana yönlendirir.

Her sonuç bir `reason` alanı taşır — "neden TRON dedin" sorusunun cevabı,
arayüzde ve denetim kaydında gösterilir.

### Yoklama katmanı

Sadece EVM belirsizliği ve TRON/BTC hash çakışması için ağ çağrısı yapılır.
Zincir başına **en fazla 2 çağrı**. Sonuç `probe_cache` tablosuna yazılır.

- **Otomatik yoklanan:** Ethereum, BSC, Polygon
- **"Daha fazla zincirde ara" butonu:** Arbitrum, Optimism, Base, Avalanche

Adres yoklamasında hem native hem token işlemine bakılır — bir adres hiç native
işlem yapmadan USDT alabilir.

---

## 6. Faz planı

**Faz 1: TRON.** Türkiye dosyalarının büyük çoğunluğu burada, özellikle
USDT-TRC20. Önce bu tam çalışsın.

**Faz 1b: EVM.** Ethereum, BSC, Polygon + ikincil zincirler.

**Faz 2: Bitcoin.** Ayrı motor gerekiyor — UTXO modeli, para üstü adresi
tespiti, ortak girdi sahipliği kümelemesi, CoinJoin tespiti. Hesap modeliyle
aynı kodu paylaşamaz.

**Faz 3: Solana.** Hesap modelinde ama token'lar cüzdanda değil, türetilmiş
token hesaplarında durur; sahiplik çözümlemesi ek katman. İşlem hacmi yüksek.

Zincir adaptörü arayüzü **baştan dördünü de kaldıracak şekilde** tasarlanacak,
sadece sırayla doldurulacak.

---

## 7. Takip motoru

### Atıf (taint) kuralları

Üçü de uygulanabilir olmalı, kullanıcı seçebilmeli, sonuçlar karşılaştırılabilmeli:

1. **FIFO** — ilk giren ilk çıkar
2. **Orantısal** — havuzun %20'si X'ten geldiyse çıkışın %20'si X'e atfedilir
3. **Zaman pencereli** — giriş sonrası N saat içindeki çıkışlar takip edilir

Seçilen kural rapora metodoloji olarak yazılır.

### Dallanma kontrolü

Otomatik + derin tarama var, ayrıca düğüme tıklayarak tek seviye açma da var.
Tarama şu durumlarda kendiliğinden durur:

- Hop bütçesi bitti (varsayılan değer + kullanıcı ayarlayabilir)
- Düğümün dallanması patlıyor (çıkış sayısı eşiği aştı)
- Tutar minimum eşiğin altına düştü
- Etiketli bir borsa adresine ulaşıldı (terminal düğüm)
- Maksimum düğüm sayısına ulaşıldı

Araç "optimum hop sayısını" kendisi sezip önerebilmeli.

### Filtreler

Hepsinin varsayılan değeri var, hepsi arayüzden değiştirilebilir:

- Minimum tutar eşiği — **değiştirildiği anda USD/TL karşılığı görünmeli**
- İlk X saatteki çıkışları filtreleme
- Maksimum hop
- Maksimum düğüm sayısı

### Ters takip

"Bu adrese para nereden geldi" — kaynak tespiti de yapılabilmeli.

### DEX işlemleri

Takip edilebiliyorsa edilecek (SunSwap vb. swap sonrası izi sürdürmek).
Edilemiyorsa düğüm "kontrata girdi, iz burada kesildi" olarak işaretlenir.

---

## 8. Etiketleme ve borsa tespiti

### Deposit adresi sezgiseli

Borsaların deposit adresleri kullanıcıya özeldir ve etiketli değildir. Tespit
kuralı: **A adresi D'ye gönderdi, D de bakiyesini bilinen bir borsa hot
wallet'ına süpürdü ⇒ D, o borsanın deposit adresidir.** Güven skoruyla birlikte
üretilir. Aracın en kritik çıktısı bu.

### TRON aktivasyon kümelemesi

TRON'da yeni bir hesabın aktive edilmesi için birinin ona TRX göndermesi
gerekir ve **bu "aktive eden" adres zincire kaydedilir.** Aynı adres tarafından
aktive edilmiş cüzdanlar büyük ihtimalle aynı kişiye aittir.

Hedeflenen çıktı örneği: *"Sorguladığın hesabı aktive eden X hesabı, ayrıca 19
hesap daha aktive etmiş. Bu 19 hesaptan 10'u parasını Binance, Paribu ve
BtcTurk hot wallet'larına göndermiş."*

Bu sorgu BigQuery modülünü gerektiriyor (bkz. 4.b).

### Diğer sinyaller — hepsi isteniyor

- **Peel chain** — her adımda küçük parça koparıp kalanı ilerletme
- **Structuring / smurfing** — eşit tutarlarda çoklu bölme
- Yuvarlak rakam analizi
- Cüzdanın ilk işlem tarihi (dosya tarihinden hemen önce açılmışsa anlamlı)
- Karşı taraf sayısı ve toplam gelen/giden hacim
- **İşlem saatlerinin saat dilimi dağılımı** — şüphelinin coğrafi konumu
  hakkında ipucu
- OFAC yaptırım listesiyle eşleşme (ücretsiz, resmi kaynak)

### Bekleme durumu tespiti

Güncel bakiye + son hareket tarihi + "şu kadar gündür hareketsiz".

### Etiket veritabanı

**Her etiket kaynağını, güven skorunu ve doğrulama tarihini taşır.**
Doğrulanmamış etiket rapora ya hiç girmez ya da açıkça "doğrulanmamış"
ibaresiyle girer.

Tohum kaynaklar: TronScan'in kendi tag'leri (API'den ücretsiz gelir), açık
kaynak etiket depoları, OFAC listesi. Ama asıl yaklaşım **liste değil keşif
motoru** — sistem hot wallet'ları deposit-süpürme kümelemesiyle kendisi bulur,
kullanıcı onaylar. Liste bayatlar, motor bayatlamaz.

Hedef: tüm CEX ve DEX borsalarının hot wallet'ları, Türk borsaları dahil
(BtcTurk, Paribu, Icrypex, Bitci).

### Doğrulanmamış aday adresler

Kullanıcı Gemini'dan aldığı birkaç adres verdi. Kontrol edildi: base58check
doğrulamasından geçiyorlar, yani **gerçek adresler** (geçerli checksum'ı
tesadüfen üretme ihtimali 4 milyarda bir). Ancak adresin gerçek olması
etiketin doğru olduğu anlamına gelmez. Paribu olduğu iddia edilen
`TJEw7U8a4Asoh83EoB5Pk5YyfTadVZbb8h` incelendiğinde büyük hacimli bir USDT
adresi olduğu görülüyor ama takip sitelerinde borsa etiketi taşımıyor, ayrıca
2023 tarihli bir dolandırıcılık projesi yazısında listelenmiş.

**Bu adresler veritabanına "aday, doğrulanmamış" olarak girer.** Sistem
on-chain davranışla test eder, kullanıcı onaylar.

Kullanıcının verdiği aday listesi:

| Borsa | Ağ | Adres |
|---|---|---|
| BtcTurk | EVM | `0xb5a46bc8b76fd2825aeb43db9c9e89e89158ecde` |
| BtcTurk | TRON | `TD32z28Qmyz1zj3LfoYMGnfxPTbsVopCSj` |
| Paribu | EVM | `0xbd8ef191caa1571e8ad4619ae894e07a75de0c35` |
| Paribu | TRON | `TJEw7U8a4Asoh83EoB5Pk5YyfTadVZbb8h` |

Icrypex için statik hot wallet bulunamamış.

### Kullanıcı etiketleri

Kullanıcı kendi etiketini oluşturabilir: **başlık + açıklama.** Etiket
public veya private olur. Public yapmak için admin onayı gerekir.
**Başlangıçta hepsi admin onaylı gelsin**; dashboard'a bunu kapatıp açan bir
düğme konsun.

---

## 9. Görselleştirme

Sankey diyagramı tek başına yetersiz — döngüleri, zaman eksenini ve yüzlerce
düğümü kaldıramaz.

- **Ana görünüm:** yönlü graf, tıklayınca düğüm genişleyen (React Flow veya
  Cytoscape.js)
- **Yan panel:** zaman sıralı işlem tablosu
- **İkincil:** Sankey — sadeleştirilmiş özet ve rapor görünümü

Vaka içinde gezinme: geçmiş aramalar, **ileri/geri gezinme çubuğu (history
rail)**, daha önce tıklanmış bağlantılar ve işlemler **farklı renkte** gösterilir.

---

## 10. Vaka yönetimi ve raporlama

### Vakalar

- Kaydedilebilir, üstüne not alınabilir, sonra dönülebilir
- **Varsayılan private.** Public yapılabilir, etiketlerdeki gibi admin onayı
- Geçmiş aramalar ve ilişkiler saklanır

### Kanıt bütünlüğü

Rapor alındığında **o anki graf dondurulup saklanır** — zincir sonradan hareket
etse bile rapordaki tablo değişmez, rapor yeniden üretilebilir. PDF'e SHA-256
özeti basılır.

### PDF raporu

Kullanıcı sütunları tıklayarak seçer; sütun havuzu geniş tutulacak:

- İşlem hash'i
- Tarih — **UTC ve kullanıcının bulunduğu saat dilimi (TSİ = UTC+3) birlikte**
- Gönderen / alan adres
- Borsa adı
- Etiket başlığı
- Tutar, token
- İşlem anındaki USD/TRY karşılığı
- Hop numarası, atıf oranı, güven skoru

### Denetim kaydı

Kim, ne zaman, hangi adresi sorguladı — tutulacak, **admin'e görünür**.
İleride diğer rollere açılabilir.

---

## 11. Fiyatlandırma

- Günlük kapanış fiyatı yeterli (saniye hassasiyeti ücretli, gerekmiyor)
- Kullanıcı istediğinde **elle değer girebilmeli**
- Çekilen fiyat veritabanında saklanır, ertesi gün yeniden çekilir
- **USD/TRY kuru TCMB'nin ücretsiz XML servisinden** — resmi kur, raporda daha
  sağlam durur

---

## 12. Kullanıcılar ve yetkilendirme

- Kullanıcı adı + şifre ile giriş. Giriş yapılmadan uygulama kullanılamaz
- Kayıt yok — **kullanıcıları admin elle oluşturur**
- Admin kullanıcı adı: **`abidin`**
- Şifre: rastgele üretilip `.env` üzerinden seed script'e verilecek, **ilk
  girişte değiştirme zorunlu**. Şifre hiçbir zaman sohbette veya git geçmişinde
  durmayacak
- **Rol tablosu** olacak — ileride yeni roller tanımlanabilsin (şimdilik admin
  + analist yeterli)

---

## 13. İzleme ve uyarılar

Takip listesindeki adres hareket edince bildirim.

**Kanal: Telegram botu.** SMTP sonraya bırakıldı.

**7/24 izleme servisi Hetzner'da çalışır** (PC kapalıyken de uyarı gelsin diye).
Sunucunun RAM'i 3,7 GB olduğu ve üzerinde iki Postgres + bir MySQL zaten
döndüğü için **bu servis SQLite kullanacak, ayrı Postgres kurulmayacak.**
Tuttuğu veri minimal: takip listesi + her adresin son görülen işlem hash'i.
PC açıldığında ana veritabanıyla senkronize olur.

Deploy akışına `docker image prune` eklenecek — sunucuda ~17 GB boş alan var,
birkaç build'de tükenir.

---

## 14. Arayüz

- **Türkçe varsayılan, İngilizce seçenekli — i18n altyapısı kurulacak**
- Kullanıcının tercih ettiği stack: Next.js / React / TypeScript
- Postgres + Redis + BullMQ (veya muadili) worker kuyruğu
- Docker Compose ile tek komutla ayağa kalkmalı

---

## 15. Sırada ne var

Altyapı ve ağ tespiti bitti. Yapılacaklar:

1. **PRD** — ekranlar, kullanıcı akışları, özellik listesi
2. **Postgres şeması** — adresler, işlemler, etiketler, vakalar, kullanıcılar,
   roller, denetim kaydı, cache tabloları, fiyat tabloları
3. **Zincir adaptörü arayüzü** — TRON dolu, EVM ikinci, BTC/Solana iskelet
4. **Takip motoru** — taint kuralları, durma sezgiselleri, deposit tespiti,
   aktivasyon kümelemesi
5. **API endpoint listesi**
6. **docker-compose.yml + GitHub Actions** (sunucudaki izleme servisi için)
7. **Görev dosyaları** — her biri tek oturumda bitecek büyüklükte

### Alınması gereken API anahtarları

Kurulum sırasında kullanıcıya rehber verilecek:

- TronGrid API key (ücretsiz kayıt)
- Etherscan V2 API key (ücretsiz kayıt)
- Blockscout API key (yedek)
- Telegram bot token
- Google Cloud hesabı → BigQuery sandbox (kredi kartı istemiyor)

### Henüz kesinleşmemiş

- Varsayılan taint kuralı hangisi olacak
- Varsayılan hop sayısı ve düğüm eşikleri
- Graf kütüphanesi: React Flow mu Cytoscape.js mi
- BigQuery modülü Faz 1'e mi girecek, Faz 2'ye mi

---

## 16. Çalışma tarzı notu

Kullanıcı kısa ve yönlendirici geri bildirim verir, baştan detaylı şartname
yazmaz. İteratif ilerlemeyi tercih eder. Kararı kendisi verebileceği yerlerde
seçenekleri görmek ister; "bunda sen karar ver" dediğinde doldurulmasını
bekler.

Komut verirken **tek yapıştırmalık bloklar** halinde ver, adım adım bölme.
`set -e` kullan ki yarım iş kalmasın. Sunucuda root gerekiyorsa `sudo -i`
gerektiğini baştan söyle.
