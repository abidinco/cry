# Öneriler

Yapılmamış ama yapılması işe yarayacak şeyler. Karar bekleyenler ayrı
([bekleyen-kararlar.md](bekleyen-kararlar.md)), ne yapılacağı belli olup
yapılmamış eksikler ayrı ([cozulmesi-gerekenler.md](cozulmesi-gerekenler.md));
burası benim önerilerim — sıralaması fayda/maliyet.

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

**2. ~~TronScan etiketlerini tohum olarak çek.~~ — ÖLÇÜLDÜ, YOL KAPALI.**
`apilist.tronscanapi.com` anahtarsız `401 Authorization Required` dönüyor
(2026-09-09); "API'den ücretsiz gelir" bir varsayımdı. Zincirde de bedava
etiket yok: arşivin en yoğun beş karşı tarafında TronGrid `account_name`
alanını hiç döndürmüyor. Yerine geçecek iki yol bir karar bekliyor
([bekleyen-kararlar §1](bekleyen-kararlar.md)).

**3. ~~OFAC yaptırım listesi.~~ — YAPILDI (2026-09-09).**
`packages/etiket`, kaynak `SDN_ENHANCED.XML`. 320 tekil adres yazıldı
(tron 230 · ethereum 94 · arbitrum 1 · bsc 1); adaptörü olmayan 476 kayıt
biçimi adıyla raporlanıyor (bitcoin 442, monero/zcash/dash…). Yeniden
üretim: `npx tsx packages/etiket/src/cli.ts --kaynak=ofac`.

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

## Sonradan eklenenler (2026-09-09)

**12. Etiketi ADRESE değil KÜMEYE bağla.**
Bir borsanın onlarca sıcak cüzdanı, zincir başına ayrı adresleri ve binlerce
deposit adresi var. Bugün etiket düz bir satır; "Binance" derken hangi
Binance adresi olduğu rapordan okunamaz. Bir üst düğüm (borsa) + altında
adresler, sonradan eklemesi pahalı bir yapı — etiket tohumlamasından ÖNCE
kararlaştırmak ucuz. (§8'in yapısal hâli.)

**13. Rapora "bakılmayan yerler" bölümü koy.**
Arşivin dürüstlüğü "yok ≠ bakılamadı" ayrımına dayanıyor ve bu ayrım şu an
yalnızca veritabanında yaşıyor. Rapor, izlenen yolun yanında **izlenmeyeni**
de saymalı: hangi düğümler indekssiz kaldı, hangi zincir yoklanamadı, hangi
etiket doğrulanmamış. Karşı tarafın ilk soracağı şey budur; cevabı raporun
kendisinde durmalı.

**14. Her koşuya sürüm damgası.**
Bir taramanın sonucu, o gün çalışan kodun atıf kuralına ve eşiklerine
bağlı. Koşuya kod sürümü (git SHA) + eşikler + atıf kuralı yazılmazsa iki
ay sonra "bu rakam neden değişti" sorusunun cevabı yok. Alan zaten var
sayılır; yazılması bir satır.

**15. Zincir adaptörleri için ortak bir "canlı sözleşme testi".**
Bugünkü testler saf mantığı sınıyor (43 test, hepsi yeşil) — ama bu projedeki
ciddi kusurların hepsi CANLI veriyle çıktı. Elle seçilmiş birkaç gerçek
adres/işlem üzerinde, ağa çıkan ve normalde atlanan bir test dosyası
(`npm run test:canli`) bu sınıfı yakalar: kaynağın alan adı değişince
sessizce boş dönmek yerine kırmızı yanar.

**16. Adres sayfasında "bu adres neden burada" satırı.**
14.798 adresin çoğu bir hareketin karşı tarafı olarak açıldı. Bir adresi
açan kullanıcı, oraya nereden gelindiğini (hangi işlem, hangi koşu) görmeli;
aksi hâlde arşiv, kendi kaydının kaynağını söyleyemez.

**17. Yoklama sonucunu adres sayfasında GÖSTER.**
`probe_cache` doluyor ama sonuç yalnızca arama anında görünüyor. "Bu adres
başka hangi zincirlerde aktif" sorusu, adres sayfasının kalıcı bir satırı
olmalı — aynı adres birden çok EVM zincirinde yaşıyor olabilir.
