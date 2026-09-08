# cry — Ürün tanımı (PRD)

Kaynak kararlar [proje-devir.md](proje-devir.md) dosyasında; burası onların
ekrana ve uç noktaya dönüşmüş hâli. Çelişirlerse **proje-devir.md esastır**.

## 0. Tek cümlelik ölçüt

Araç işini yaptıysa kullanıcı şu dört şeyi elde etmiş olur:
**borsa adı + deposit adresi + tx hash + tarih** — resmi yazı için gereken tam
olarak budur. Geri kalan her ekran bu çıktıya hizmet eder.

## 1. Kullanıcılar

| Rol | Ne yapar |
|---|---|
| admin | Kullanıcı açar, public etiket/vaka onaylar, denetim kaydını görür |
| analist | Vaka açar, takip koşar, rapor üretir, etiket ÖNERİR |

Kayıt yok; kullanıcıları admin elle açar. Giriş yapılmadan hiçbir sayfa
açılmaz — kapı `src/middleware.ts`'te. İlk şifre seed ile verilir ve **ilk
girişte değiştirilmesi zorunludur**.

## 2. Ekranlar

### 2.1 Giriş (`/giris`)
Kullanıcı adı + şifre. "Kullanıcı yok" ile "şifre yanlış" aynı cevabı verir.

### 2.2 Arama (`/`)
Tek bir yapıştırma kutusu. Girdi bir adres, bir tx hash ya da bir explorer
bağlantısı olabilir.

- Ağ **formattan** çözülür (`detectNetwork`, ağ çağrısı yok).
- Her sonuç bir **gerekçe** taşır: "neden TRON dedin" ekranda yazar.
- Checksum'ı bozuk adres **asla sessizce kabul edilmez** — uyarı çıkar.
- Belirsizlik kalırsa (EVM hangi zincir? 64 hex TRON mu BTC mi) **yoklama**
  adımı önerilir: zincir başına en fazla 2 çağrı, sonuç `probe_cache`'e yazılır.
- İkincil zincirler için ayrı bir "Daha fazla zincirde ara" düğmesi.

### 2.3 Adres görünümü (`/adres/[chain]/[address]`)
- Özet: bakiye, ilk/son hareket, **"şu kadar gündür hareketsiz"**, etiketler.
- Etiket rozeti kaynağını ve güven skorunu gösterir; doğrulanmamışsa açıkça
  "doğrulanmamış" yazar.
- TRON'da: bu hesabı kim aktive etti + o adresin aktive ettiği diğer hesaplar.
- İşlem tablosu (zaman sıralı), filtre ve sayfalama.
- "Takibe al" ve "Vakaya ekle" düğmeleri.

### 2.4 Vaka (`/vaka/[slug]`)
- **Ana görünüm: yönlü graf.** Düğüme tıklayınca tek seviye açılır.
- **Yan panel:** zaman sıralı işlem tablosu, seçili düğümle senkron.
- **Gezinme çubuğu (history rail):** geçmiş aramalar, ileri/geri. Daha önce
  tıklanmış bağlantı ve işlemler **farklı renkte**.
- **İkincil görünüm: Sankey** — sadeleştirilmiş özet ve rapor için.
- Notlar; vaka varsayılan **private**, public yapmak admin onayı ister.

### 2.5 Takip ayarları (vaka içinde panel)
Hepsinin varsayılanı var, hepsi değiştirilebilir:

- Atıf kuralı: **FIFO · orantısal · zaman pencereli** (seçim rapora yazılır)
- Maksimum hop · maksimum düğüm · dallanma eşiği
- Minimum tutar eşiği — **değiştirildiği anda USD/TL karşılığı görünür**
- İlk X saatteki çıkışları filtrele
- Yön: ileri (nereye gitti) / **ters (nereden geldi)**

Tarama şu durumlarda kendiliğinden durur ve SEBEBİNİ yazar: hop bütçesi,
dallanma patlaması, tutar eşiği, terminal borsa düğümü, düğüm sınırı.

### 2.6 Rapor (`/vaka/[slug]/rapor`)
- Sütunları kullanıcı seçer (havuz geniş: tx hash, tarih **UTC + TSİ**,
  gönderen/alan, borsa, etiket, tutar, token, işlem anındaki USD/TRY, hop,
  atıf oranı, güven skoru).
- Rapor alındığında **graf dondurulur**: zincir sonradan hareket etse bile
  rapordaki tablo değişmez ve rapor yeniden üretilebilir.
- PDF'e **SHA-256 özeti** basılır.
- Metodoloji bölümü otomatik yazılır: hangi atıf kuralı, hangi eşikler, hangi
  fiyat kaynağı, hangi tarihte çekildi.

### 2.7 Etiketler (`/etiketler`)
Liste + arama. Kullanıcı kendi etiketini oluşturur (başlık + açıklama).
Public etiket admin onayı ister; **başlangıçta hepsi onaydan geçer**, dashboard'da
bunu kapatan bir düğme var.

### 2.8 Yönetim (`/yonetim`, yalnız admin)
Kullanıcılar · onay bekleyen etiket/vakalar · **denetim kaydı** (kim, ne
zaman, hangi adresi sorguladı) · deposit adayları kuyruğu.

## 3. Akışlar

### 3.1 "Bu para nereye gitti"
1. Kullanıcı adresi/hash'i yapıştırır → ağ çözülür (gerekirse yoklanır).
2. Adres indekslenir (artımlı: ilk seferde tam, sonra yalnızca delta).
3. Kullanıcı vaka açar ya da mevcut vakaya ekler.
4. Takip koşusu başlar: atıf kuralı + eşikler.
5. Graf çizilir; terminal düğümler işaretlenir (borsa / kontrat / bütçe).
6. Borsa bulunmuşsa deposit adresi + tx hash + tarih öne çıkarılır.
7. Rapor alınır, graf dondurulur, PDF üretilir.

### 3.2 "Bu adres kimin"
1. Etiket sorgulanır (tohum listeler + keşif motorunun bulguları).
2. Etiket yoksa **deposit sezgiseli** çalışır: bu adres bakiyesini bilinen bir
   hot wallet'a süpürüyor mu?
3. TRON'da aktivasyon kümelemesi: bu hesabı kim aktive etti, o adres başka
   hangi hesapları aktive etti, onlar nereye para göndermiş?
4. Çıkan sonuç **aday** olarak kaydedilir; kullanıcı onaylar.

### 3.3 "Hareket edince haber ver"
1. Adres takibe alınır (`Watch`).
2. Hetzner'daki izleme servisi listeyi tünelden senkronlar.
3. Yeni hareket görülünce Telegram'dan bildirir.
4. **PC kapalıyken de çalışır** — servisin var olma sebebi bu.

## 4. API uç noktaları

Hepsi oturum ister; istisnalar ayrıca belirtildi.

| Yöntem | Yol | İş |
|---|---|---|
| POST | `/api/oturum/giris` | Giriş *(oturum istemez)* |
| POST | `/api/oturum/cikis` | Çıkış |
| POST | `/api/oturum/sifre` | Şifre değiştir |
| POST | `/api/detect` | Girdiden ağ tespiti (ağ çağrısı yok) |
| POST | `/api/probe` | Belirsiz girdiyi yokla (zincir başına ≤2 çağrı) |
| GET | `/api/adres/[chain]/[address]` | Özet + etiketler + indeks durumu |
| GET | `/api/adres/[chain]/[address]/hareketler` | Sayfalı işlem listesi |
| POST | `/api/adres/[chain]/[address]/indeksle` | İndeks işini kuyruğa at |
| GET | `/api/adres/[chain]/[address]/aktivasyon` | TRON aktivasyon kümesi |
| GET/POST | `/api/vaka` | Vaka listesi / yeni vaka |
| GET/PATCH | `/api/vaka/[slug]` | Vaka detayı / güncelle |
| POST | `/api/vaka/[slug]/not` | Not ekle |
| POST | `/api/takip` | Takip koşusu başlat (kural + eşikler) |
| GET | `/api/takip/[id]` | Koşu durumu + graf |
| POST | `/api/takip/[id]/dur` | Koşuyu durdur |
| POST | `/api/rapor` | Grafı dondur, rapor üret (SHA-256) |
| GET | `/api/rapor/[id]/pdf` | PDF indir |
| GET/POST | `/api/etiket` | Etiket ara / öner |
| POST | `/api/etiket/[id]/onay` | Etiketi onayla *(admin)* |
| GET/POST | `/api/izleme` | Takip listesi / adres ekle |
| GET | `/api/izleme/liste` | İzleme servisi senkronu *(jeton ile)* |
| GET | `/api/denetim` | Denetim kaydı *(admin)* |
| GET | `/saglik` | Ayakta mı *(oturum istemez)* |

## 5. Yapılmayacaklar (kapsam dışı)

- **Delil üretimi.** Çıktı bağlayıcı değildir; adli merci kendi sorgusunu yapar.
- **"Ne zaman paraya çevrildi".** Fiat'a çevirme borsanın iç defterinde olur,
  zincirde YOKTUR. Zincirde görülebilecek son şey deposit → hot wallet.
- **Kesin atıf.** Hesap-bakiye modelinde paralar karışır; "X'ten gelen 10k'nın
  hangisi Z'ye gitti" sorusunun matematiksel kesin cevabı yok. Bu yüzden kural
  SEÇİLİR ve raporda metodoloji olarak yazılır.
- Kendi arşiv düğümünü çalıştırmak (TRON 2,5-3,5 TB).

## 6. Kararı bekleyen maddeler

Bunlar bilinçli olarak boş; **kullanıcı kararı bekliyor** ve varsayılan
uydurulmadı:

1. Varsayılan atıf kuralı hangisi olacak?
2. Varsayılan hop sayısı ve düğüm/dallanma eşikleri?
3. Graf kütüphanesi: React Flow mu, Cytoscape.js mi?
4. BigQuery modülü Faz 1'e mi girecek, Faz 2'ye mi?

Karar verilince buradan silinir ve kural asıl yerine yazılır.
