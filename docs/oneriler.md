# Öneriler

Yapılmamış ama yapılması işe yarayacak şeyler. Karar bekleyenler ayrı
([bekleyen-kararlar.md](bekleyen-kararlar.md)); burası benim önerilerim —
sıralaması fayda/maliyet.

## Yakın vadede değerli

**1. Postgres yedeği — otomatik değil ama HATIRLATMALI.**
Otomatik yedek almama kararı bilinçliydi, ama artık gerçek veri var (2.131
hareket, indekslenmiş adresler). Tek satırlık elle yedek:
```powershell
docker exec cry-db pg_dump -U cry -d cry --format=custom > "cry-yedek-$(Get-Date -Format yyyyMMdd).dump"
```
Öneri: bunu bir vaka kapanışında ve rapor üretiminden önce çalıştırmayı
alışkanlık yap. Rapor kanıt dondurma iddiasında; altındaki veritabanı
yedeksizse iddia yarım kalır.

**2. TronScan etiketlerini tohum olarak çek.**
TronScan kendi tag'lerini API'den ücretsiz veriyor. Bugün arşivde **tek bir
borsa etiketi yok**, bu yüzden takip motorunun "terminal düğüm" ölçütü hiç
tetiklenmiyor. Birkaç yüz etiket, aracın asıl çıktısını (hangi borsa) mümkün
kılar. Etiketler `source: "tronscan"` ve doğrulanmamış olarak girer.

**3. OFAC yaptırım listesi.**
Ücretsiz, resmî, makine okunur. Bir adresin yaptırım listesinde olması
raporda ağır basan bir bulgu ve kaçırılması pahalı.

**4. Tarama hızını ölç, sonra paralelleştir.**
TronGrid anahtarı geldi (2 → 10 istek/sn) ama worker eşzamanlılığı hâlâ 4 ve
adaptörün kapısı 10/sn. Gerçek darboğazın nerede olduğu ÖLÇÜLMEDİ. Önce bir
ölçüm, sonra ayar.

## Orta vadede

**5. Hız sınırı ve kota göstergesi.**
Bir tarama yarıda kalırsa sebebinin hız sınırı mı, kaynağın hatası mı olduğu
şu an yalnızca log'da. Adres sayfasında "kaynak sınırına takıldı, N dakika
sonra devam" demek, kullanıcıyı boşuna beklemekten kurtarır.

**6. Vaka içi arama geçmişi (history rail).**
Şema hazır (`CaseQuery`), arayüz yok. Analiz sırasında "az önce nereye
bakmıştım" sorusu sürekli soruluyor.

**7. Rapor PDF'i: sunucu tarafında üret.**
Tarayıcı yazdırmasına bırakmak, aynı raporun iki farklı makinede farklı
görünmesi demek. Kanıt dondurma iddiası olan bir çıktıda bu kabul edilemez.

**8. İdari yargı benzeri "kurum ağacı" yok ama BORSA ağacı gerekecek.**
Bir borsanın hot wallet'ı, deposit adresleri ve zincir başına ayrı adresleri
var. Bugün hepsi düz etiket. Rapor "Binance" derken hangi Binance adresini
kastettiğini söyleyebilmeli.

## Uzun vadede / tartışmalı

**9. Kendi TRON düğümünü çalıştırmak — HAYIR.**
2,5-3,5 TB disk ve sürekli senkron. Ücretsiz indeksleyiciler yeterli;
gerekirse ikinci bir sağlayıcı eklemek çok daha ucuz.

**10. Zincirler arası köprü takibi.**
Para TRON'dan Ethereum'a köprüyle geçtiğinde iz bugün kesiliyor ("kontrat"
terminali). Köprü sözleşmelerini tanımak ayrı bir korpus işi; Faz 2'den
sonra.

**11. Grafın kendisini rapora gömmek.**
Cytoscape ekran görüntüsü yerine, dondurulmuş graftan sunucu tarafında SVG
üretmek. Rapor yeniden üretilebilir olmalı ve ekran görüntüsü değildir.
