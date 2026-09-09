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

## Graf

Düzen **hiyerarşik (dagre), soldan sağa hop sırasıyla**. Gerekçe estetik
değil yeniden üretilebilirlik: kuvvet tabanlı bir düzende yerleşim her
açılışta değişir ve aynı koşu iki farklı resim verir — rapora giren bir
görselde bu savunulamaz. Aynı sebeple düğümler **sürüklenemez**.

Grafta renk TEK BİR ŞEY anlatır: düğümün durumu. Yön rengi (gelen/giden)
kullanılmaz, çünkü yönü okun kendisi söylüyor.

| Çerçeve | Anlam |
|---|---|
| indigo | kök (odak) |
| yeşil | doğrulanmış borsa etiketi — iz burada tamamlandı |
| kehribar, kesik | borsa ADAYI, etiket doğrulanmamış |
| gri, kesik | bizim koyduğumuz sınır (bütçe, dallanma) — iz bitmedi |
| gri, noktalı | taranamadı ("yok" değil, "bakılamadı") |

En çok **100 düğüm** çizilir ve seçim deterministiktir: önce kök, sonra iz
biten düğümler, sonra hop sırası. Kırpılan kısım sessizce yok sayılmaz —
kaç düğüm ve kaç kenar çizilmediği ekranda yazar, tamamı tablolarda durur.

## Yoğunluk ve dar ekran

13 piksel taban, sıkı satır aralığı. Dar ekranda **sütun gizlenmez**, tablo
yatay kayar: bir adli listede hangi sütunun gereksiz olduğuna ekran genişliği
karar veremez.

## Yazı dili

Küçük harf, sade fiil, aktif çatı. Düğme yaptığı işi söyler ("zincirden çek",
"yeniden tara"). Boş ekran bir mazeret değil davettir: "Henüz hareket yok.
Yukarıdaki düğme adresin geçmişini zincirden çeker."
