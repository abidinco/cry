# cry — devir dosyası

Projenin **ne olduğu** ve planlama aşamasında alınıp bugün hâlâ geçerli olan
kararlar. İşleyen kurallar ve ölçümler burada değil [CLAUDE.md](../CLAUDE.md)'de;
çakışma olursa CLAUDE.md geçerlidir. Bu dosya 2026-09-29'da kısaltıldı — o
tarihte gerçekleşmiş ya da çürümüş bölümler silindi, tarihçe git geçmişinde.

## 1. Ne yapıyor

Kripto para akışını takip eden, tarayıcıdan kullanılan analiz aracı. Kullanıcı
bir cüzdan adresi ya da işlem hash'i yapıştırır; araç paranın cüzdanlar arasında
nasıl dolaştığını, nerede beklediğini ve hangi borsaya girdiğini gösterir.

**Asıl hedef:** paranın hangi borsanın hot wallet'ına, ne zaman girdiğini tespit
etmek. Kullanıcı adli merci olarak o borsaya resmî yazı yazacak.

**Kapsam:** bu bir analiz aracıdır, delil üretim sistemi değil. Çıktısı bağlayıcı
değildir; her etiketin kaynağı ve güven derecesi kayıt altında tutulur.

**Zincirde görünmeyen şey:** "ne zaman paraya çevrildi" sorusunun cevabı
blockchain'de YOKTUR — fiat'a çevirme borsanın iç defterinde olur. Zincirde
görülebilecek son şey paranın deposit adresine girip hot wallet'a süpürülmesi.
Ürün çıktısı budur: **borsa adı + deposit adresi + tx hash + tarih.**

**Takip neden kesin değil:** TRON ve EVM hesap-bakiye modeli kullanır; bir
cüzdanda paralar karışır ve "X'ten gelen 10k'nın hangisi Z'ye gitti" sorusunun
matematiksel kesin cevabı yoktur. Bu yüzden bir atıf kuralı SEÇİLİR ve raporda
metodoloji olarak yazılır.

## 2. Mimari

```
tarayıcı → cry.abidin.dev (65.21.108.193) → Hetzner: Caddy (TLS, proxy-caddy)
         → WireGuard (10.99.0.1 → 10.99.0.2) → Windows PC :1337
            Next.js + Postgres + Redis + worker + ClickHouse (Docker/WSL2)
```

Ağır işin tamamı evdeki makinede döner (14 çekirdek / 32 GB / 2 TB ⟷ sunucu
2 vCPU / 3,7 GB / ~17 GB). Sunucu iki iş yapar: TLS + proxy, ve 7/24 izleme.
PC kapalıyken Caddy `handle_errors` ile çevrimdışı sayfasını gösterir. Evdeyken
`http://localhost:1337` aynı uygulamanın kestirmesi.

**Sunucu ortak kullanımda** (pt.abidin.dev, hessap.la, hafiza.abidin.dev,
blog.abidin.dev): onlara zarar verecek değişiklik yapılmaz. Caddyfile'da
`cry.abidin.dev` bloğu **tam olarak bir kez** bulunmalı ("ambiguous site
definition" bir kez yaşandı); değişiklikten sonra yedekle → `caddy validate` →
`caddy reload`. Deploy akışında `docker image prune` var, yoksa sunucunun diski
birkaç build'de dolar.

**Tünel tek yönlü:** PC sunucuya bağlanır, ev tarafında port açık değil.
`AllowedIPs = 10.99.0.1/32` (internet trafiği tünelden geçmez),
`PersistentKeepalive = 25` şart. Güvenlik duvarı: `cry-app-wg` (TCP 1337) ve
`cry-clickhouse-wg` (TCP 18123), ikisi de kaynak `10.99.0.0/24`.

**Port kuralları:** Next.js `1337:3000` — **`127.0.0.1:` öneki koyma**, tünelden
erişilemez · Postgres `127.0.0.1:15432:5432` · Redis `127.0.0.1:16379:6379`
(yerel dev CANLI kuyruğa iş atar).

**Postgres veri dizini WSL2'nin ext4'ünde olmalı**, `/mnt/c` altında değil —
Windows dosya sistemine bağlanan volume 5–10 kat yavaş.

## 3. Veri kaynakları

Blockchain verisi halka açık ama **indekslenmiş** veri açık değil: zincirde "X
adresinin tüm işlemleri" diye bir sorgu yoktur. Kendi arşiv düğümü disk açısından
imkânsız (TRON 2,5–3,5 TB), o yüzden indeksleyicilerin ücretsiz katmanları +
kendi seçilmiş blok indeksimiz kullanılıyor.

| Kaynak | Limit | Kullanım |
|---|---|---|
| TronGrid | ~100K istek/gün, anahtarla ~20 sorgu/sn (ölçülen tavan ~12,5) | TRON — ana kaynak |
| Etherscan V2 | 5 çağrı/sn, 100K/gün, tek anahtar 60+ zincir, istek başına 1.000 kayıt | EVM |
| publicnode / tronstack | anahtarsız | blok indeksi (canlı uç / geçmiş) |
| mempool.space | anahtarsız | Bitcoin (Faz 2) |

**Dört katman:** (a) vaka odaklı artımlı indeks — sorgulanan her adres bir kez
çekilir, sonra delta · (b) kendi **blok indeksimiz** (ClickHouse; seçilmiş
transferlerin tablosu, arşiv düğümü değil) · (c) lokal makine derin taramaları
koşturur · (d) BigQuery **satın alınmadı** (CLAUDE.md → Geçmişin sırası ve bedeli);
"X hesabı başka hangi hesapları aktive etti" sorgusu için bir gün yeniden açılabilir.

## 4. Ağ tespiti

`network-detect.ts` (saf) + `network-probe.ts` (ağ). Bağımlılıklar `bs58`,
`bech32`, `@noble/hashes` v2 (import yolları uzantılı).

| Girdi | Sonuç |
|---|---|
| `T` + 33 base58, checksum geçerli | TRON adresi, **kesin** |
| `bc1`/`1`/`3` + geçerli checksum | Bitcoin adresi, **kesin** |
| base58 → ham 32 / 64 bayt | Solana adresi (checksum yok, 0.9) / imzası |
| `0x` + 40 / 64 hex | EVM adresi / tx — **hangi zincir olduğu formattan bilinemez** |
| Ön eksiz 64 hex | TRON tx %50 / BTC txid %50 / EVM %15 — üçü de yoklanır |
| `*.eth` | ENS |

Explorer linkinden adres ayıklanır, görünmez karakterler temizlenir, bozuk EIP-55
uyarı üretir. **Checksum'ı bozuk adres asla sessizce kabul edilmez.** Her sonuç bir
`reason` taşır. Yoklama yalnızca belirsizlikte, zincir başına en fazla 2 çağrı,
sonuç `probe_cache`e yazılır; hem native hem token işlemine bakılır (bir adres hiç
native işlem yapmadan USDT alabilir).

## 5. Faz planı

**Faz 1 TRON** (Türkiye dosyalarının çoğu, özellikle USDT-TRC20) → **1b EVM** →
**Faz 2/3 Bitcoin ve Solana.** Engellerin bugünkü ölçümü
[cozulmesi-gerekenler.md](cozulmesi-gerekenler.md) §2–3'te. Zincir adaptörü
arayüzü baştan dördünü de kaldıracak şekilde tasarlandı, sırayla dolduruluyor.

## 6. Motorda hedeflenen, henüz yazılmamış yetenekler

Yazılmış olanların kuralları CLAUDE.md'de; burada kalan **istek listesi**:

- **Deposit adresi sezgiseli** — A, D'ye gönderdi ve D bakiyesini bilinen bir hot
  wallet'a süpürdü ⇒ D o borsanın deposit adresidir. Güven skoruyla üretilir.
  **Aracın en kritik çıktısı bu.**
- **TRON aktivasyon kümelemesi** — yeni hesabı aktive eden adres zincire yazılır;
  aynı adresin aktive ettiği cüzdanlar büyük ihtimalle aynı kişinin. Hedef çıktı:
  "hesabını aktive eden X, 19 hesap daha aktive etmiş; 10'u parasını Binance,
  Paribu ve BtcTurk'e göndermiş."
- **Ters takip** ("bu adrese para nereden geldi"), **DEX/swap sonrası iz** (mümkün
  değilse düğüm "kontrata girdi, iz kesildi" işaretlenir).
- **Şekil sinyalleri:** peel chain, structuring/smurfing, yuvarlak rakam, cüzdanın
  ilk işlem tarihi, karşı taraf sayısı/hacim, **işlem saatlerinin saat dilimi
  dağılımı**, OFAC eşleşmesi (bu sonuncusu yazıldı).
- **Bekleme durumu:** güncel bakiye + son hareket + "şu kadar gündür hareketsiz".
- **Atıf kuralları** FIFO / orantısal / zaman pencereli — üçü de seçilebilir ve
  karşılaştırılabilir olacak.
- **Kullanıcı etiketleri:** başlık + açıklama, public için admin onayı.

### Doğrulanmamış aday adresler

Kullanıcının verdiği dört adres base58check'ten geçiyor (yani **gerçek**), ama
adresin gerçek olması etiketin doğru olduğunu göstermez — Paribu olduğu iddia
edilen `TJEw7U8a4Asoh83EoB5Pk5YyfTadVZbb8h` takip sitelerinde borsa etiketi
taşımıyor. Veritabanına "aday, doğrulanmamış" olarak girdiler.

| Borsa | Ağ | Adres |
|---|---|---|
| BtcTurk | EVM | `0xb5a46bc8b76fd2825aeb43db9c9e89e89158ecde` |
| BtcTurk | TRON | `TD32z28Qmyz1zj3LfoYMGnfxPTbsVopCSj` |
| Paribu | EVM | `0xbd8ef191caa1571e8ad4619ae894e07a75de0c35` |
| Paribu | TRON | `TJEw7U8a4Asoh83EoB5Pk5YyfTadVZbb8h` |

Hedef: tüm CEX/DEX hot wallet'ları, Türk borsaları dahil (BtcTurk, Paribu,
Icrypex, Bitci — Icrypex için statik hot wallet bulunamadı). Ama asıl yaklaşım
**liste değil keşif motoru**: liste bayatlar, motor bayatlamaz.

## 7. Rapor

- Rapor alındığında **o anki graf dondurulur**; zincir sonradan hareket etse bile
  rapordaki tablo değişmez. Hash kuralı CLAUDE.md → Kalan kararlar.
- **PDF sütun havuzu** (kullanıcı seçer): tx hash · tarih **UTC ve TSİ birlikte** ·
  gönderen/alan · borsa adı · etiket başlığı · tutar/token · işlem anındaki
  USD/TRY · hop numarası · atıf oranı · güven skoru.
- **Denetim kaydı** admin'e görünür; ileride diğer rollere açılabilir.
- **Fiyat:** günlük kapanış yeterli, kullanıcı elle değer girebilmeli, çekilen
  fiyat saklanır. Kur kaynağı TCMB (resmî, ücretsiz).

## 8. Kullanıcılar

Kullanıcı adı + şifre; kayıt YOK, kullanıcıları admin elle oluşturur. Admin
`abidin`. Şifre rastgele üretilir, ilk girişte değiştirme zorunlu, hiçbir zaman
sohbette ya da git geçmişinde durmaz. Rol tablosu var (admin + analist).

## 9. İzleme

Takip listesindeki adres hareket edince **Telegram** bildirimi (SMTP sonraya
bırakıldı). Servis Hetzner'da çalışır, PC kapalıyken de uyarı gelsin diye;
sunucunun RAM'i dar olduğu için **SQLite kullanır, ayrı Postgres kurulmaz**.
Tuttuğu veri minimal: takip listesi + her adresin son görülen işlem hash'i.
Sıklık ve eşik kararı CLAUDE.md → Kalan kararlar.

## 10. Arayüz ve yığın

Türkçe varsayılan, İngilizce seçenekli (i18n altyapısı kurulacak). Next.js /
React / TypeScript, Postgres + Redis + BullMQ, Docker Compose ile tek komutla
ayağa kalkar. Tasarım dili [arayuz.md](arayuz.md); takip görünümünün bugünkü
biçimi **akış diyagramı** (graf değil) ve gerekçesi CLAUDE.md → Arayüz.

## 11. Çalışma tarzı

Kullanıcı kısa ve yönlendirici geri bildirim verir, baştan detaylı şartname
yazmaz; iteratif ilerlemeyi tercih eder. Kararı kendisi verebileceği yerlerde
seçenekleri görmek ister; "bunda sen karar ver" dediğinde doldurulmasını bekler.
Komutlar **tek yapıştırmalık blok** hâlinde verilir, adım adım bölünmez.
