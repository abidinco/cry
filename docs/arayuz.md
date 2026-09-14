# Arayüz — tasarım dili

Yön (kullanıcı kararı, 2026-09-09): **yoğun adli araç**. Sakin, bilgi önce,
süs yok. Ekranda yer kaplayan her şey bir olguyu anlatır.

## Konu

Bu arayüzü kullanan kişi bir dosya üzerinde çalışıyor ve sonunda bir borsaya
resmî yazı yazacak. O yüzden benzetme "gösterge paneli" değil **kayıt
defteri**: satırlar, hizalı rakamlar, tarih, kaynak. Ekran görüntüsü bir
dosyaya konabilecek ciddiyette olmalı.

## İmza: köken oluğu

Her kayıt bloğunun solunda 3 piksellik bir işaret durur ve o bloktaki
bilginin **nereden geldiğini** söyler:

| İşaret | Anlam |
|---|---|
| indigo | kaynağın kendi beyanı |
| çelik mavisi | bizim kayıtlarımızdan türetildi |
| kehribar | doğrulanmamış, ya da eksik bir taramadan geliyor |
| gri | bilinmiyor |

Bu bir süs değil. Projenin en derin kuralı "her etiket kaynağını ve güvenini
taşır"; o kural veritabanında yaşıyordu ama ekranda bir karşılığı yoktu ve
okuyan onu hiç sormuyordu. Oluk, kaynağı **kalıcı bir kanal** yapıyor —
ipucu balonuna saklanan bir bilgi sorulmadıkça görünmez.

Blok düzeyindeki oluğun yanında satır düzeyinde küçük notlar var
("indeksten", "indeks kısmi — daha eskisi olabilir", "zincirde yazılı").

## Renk kanalları ayrıdır

Aynı renk iki farklı işi anlatmaz:

- **yön** (para gelen/giden) → yeşil / kehribar
- **uyarı** (bir şey yanlış) → kırmızı
- **köken** → yalnızca sol oluk ve küçük notlar
- **vurgu** (bağlantı, odak, birincil eylem) → indigo; hiçbir veri sınıfı bu
  rengi kullanmaz

## Tipografi

Üç rol, üç aile — hepsi **build anında kendi sunucumuza gömülür**
(`next/font`). Dışarıdan çekilseydi bir soruşturma sayfasını her açışta
tarayıcı üçüncü bir tarafa haber vermiş olurdu.

- **Space Grotesk** — marka ve başlıklar. Teknik ama karakterli.
- **IBM Plex Sans** — gövde. Veri yoğun kurumsal arayüzler için tasarlandı.
- **IBM Plex Mono** — adres, hash ve tutar. Rakamları tablo hizalı.

## Sayı ve tarih

- Tutarlar **metin üzerinden** biçimlenir, sayıya hiç çevrilmez: zincirde
  2^256-1 gibi değerler gerçekten var ve `Number`'a uğrayan bir tutar rapora
  `1.15e+53` diye düşer.
- Türkçe defter düzeni: binlik nokta, ondalık virgül. **Küsurat sönük
  basılır** — büyüklük tek bakışta okunsun.
- Tarihler ekranda **TSİ**, ipucu balonunda **UTC** (rapor UTC istiyor).

## Takip akışı

Takip sayfası **tek ekrandır** (kullanıcı kararı 2026-09-14, seçenek A):
üstte koşunun kimliği ve metodolojisi tek satırda, solda akış, sağda "para
nereye ulaştı" çubukları ve seçime göre süzülen hareket defteri.

Akış sankey benzeridir: sütunlar sıçrama, **şerit kalınlığı aktarılan
tutar** (tek varlığın ölçeğinde; birden çok varlık varsa seçici çıkar).
Aynı çift arasındaki hareketler tek şeritte toplanır, hepsi defterde durur.

**Renk şeridin ne olduğunu anlatır:**

| Şerit | Anlam |
|---|---|
| gri | ileri akış |
| yeşil, oklu | doğrulanmış borsaya giriş |
| kehribar, oklu | borsa adayına giriş |
| pembe, alttan dolaşan | köke ya da önceki bir adrese dönen para |

**Düğümün durumu dokudur**, renk değil: doğrulanmış borsa düz yeşil ve ✓,
aday taralı kehribar ve ?, bizim sınırımız (bütçe/dallanma) kesik çerçeve,
kök indigo. Renk tek başına hiçbir şey anlatmaz.

Yerleşim **deterministiktir**: aynı koşu her açılışta aynı resmi verir,
çünkü rapora girer. En çok **100 adres** çizilir; seçim önce kökü ve iz biten
adresleri alır, kırpılan kısım ekranda sayılır.

Düğüme gelmek bağlı şeritleri yakar; tıklamak defteri o adrese süzer.
Tam tutar ipucunda ve defterde, şerit etiketinde yalnızca kısa biçim
("11,1 Mn") — kısa biçim de bigint üzerinden hesaplanır.

**Defter ile akış birbirine bağlıdır** (kullanıcı isteği 2026-09-14): bir
defter satırının üzerine gelmek o şeridi, sıçrama başlığının üzerine gelmek
o sıçramanın bütün şeritlerini akışta öne çıkarır; tersine, akışta bir
şeride ya da adrese gelmek defterdeki satırlarını yakar. Klavyeyle de
çalışır (satırlar odaklanabilir).

## Yükleme

- **Üst çubuk:** sayfanın en üstünde 2 piksellik indigo çizgi. Uygulama tam
  sayfa gezinmesi yapıyor; çubuk bağlantıya tıklandığı an başlar, yeni
  sayfanın İLK veri isteği bitince tamamlanır. Arka plan yoklamaları (koşu
  sürerken 3 saniyede bir tazeleme) çubuğu yakmaz — bunu yalnızca sayfa
  bilir ve `yuklemeIzle` ile kendisi bildirir (`src/lib/yukleme.ts`).
  İlerleme gerçek bir yüzde değildir; %90'a yaklaşır, bitişi iş söyler.
- **İskelet:** veri gelene kadar sayfanın ŞEKLİ gösterilir ("yükleniyor"
  yazısı değil), ki veri geldiğinde hiçbir şey yer değiştirmesin. Takip
  sayfasında üst şerit, sıçrama sütunları, özet çubukları ve defter satırları.
- Hareket azaltma tercihinde parıltı ve geçişler kapanır.

## Yoğunluk ve dar ekran

13 piksel taban, sıkı satır aralığı. Dar ekranda **sütun gizlenmez**, tablo
yatay kayar: bir adli listede hangi sütunun gereksiz olduğuna ekran genişliği
karar veremez.

## Yazı dili

Küçük harf, sade fiil, aktif çatı. Düğme yaptığı işi söyler ("zincirden çek",
"yeniden tara"). Boş ekran bir mazeret değil davettir: "Henüz hareket yok.
Yukarıdaki düğme adresin geçmişini zincirden çeker."
