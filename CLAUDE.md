# cry — proje kuralları

Kripto para akışını takip eden analiz aracı. Next.js 15 + TypeScript +
Prisma/PostgreSQL + BullMQ; testler Vitest. Ayrıntı: [README](README.md),
[PRD](docs/prd.md), [devir dosyası](docs/proje-devir.md).

Bu dosya **kararları ve acı deneyimle öğrenilenleri** tutar. Her satır bir
kural ve yanında onu doğuran ölçüm. Dört dosya, dört soru:

| Dosya | Cevapladığı soru |
|---|---|
| **CLAUDE.md** (burası) | Karar VERİLDİ; kural bu. |
| [docs/bekleyen-kararlar.md](docs/bekleyen-kararlar.md) | Ölçüldü ama TERCİH bekliyor. |
| [docs/cozulmesi-gerekenler.md](docs/cozulmesi-gerekenler.md) | Ne yapılacağı belli, YAPILMAMIŞ. |
| [docs/oneriler.md](docs/oneriler.md) | Yapılsa faydalı; sıralama fayda/maliyet. |

Karara bağlanan madde bekleyenlerden **silinir**, kuralı buraya yazılır.

## Çalışma düzeni

- **`git push` YALNIZCA kullanıcı açıkça "PUSH" dediğinde**, ve onay yalnızca
  o anki commit(ler) için geçerlidir. Push, Actions üzerinden hem Hetzner'a
  hem PC'ye deploy tetikler.
- **Push'tan önce CI'ın KENDİ komutları:** `npm run typecheck` ve `npm test`,
  çıkış koduyla. Proje proje `tsc` yetmez — kök derleme `tests/`i de görüyor.
- Commit mesajları Conventional Commits, **İngilizce**, gövdeli.
- Ortam dosyası depoda DEĞİL: **`C:\srv\cry\.env`** (PC), `/srv/cry/.env`
  (sunucu). Depo public; sır commit'e girmez.
- **ÖNÜMÜZDEKİ HER ŞEY masaya yazılır** (kullanıcı kuralı 2026-10-08): karar
  beklemeyen işler de (`isler` koleksiyonu: sıra · kim bekliyor · açıklama ·
  nerede). Sebep: sohbet temizlendikten sonra önümüzü **masadan okuyarak**
  görüyoruz. **Masada olmayan iş, konuşulmamış sayılır** — oturum sonunda açık
  işler masaya yazılmadan iş bitmiş olmaz, oturum başında ilk bakılacak yer orası.
- **Bekleyen kararlar KARAR MASASINDA sorulur** (kullanıcı kuralı 2026-10-04):
  artifact **cry karar masası** — https://claude.ai/artifact/MKQ4Zj2X4grwjb2KiCYHwS
  Yeni bir tercih çıkınca madde `kararlar` koleksiyonuna yazılır (altı başlık:
  soru · ölçüm · seçenekler · verilmezse · geri alınır mı · nereye yazılır),
  kullanıcı şıkkı masada seçer, ajan `cevaplar` koleksiyonunu OKUYUP uygular:
  kuralı CLAUDE.md'ye yazar, maddeyi masadan ve
  [bekleyen-kararlar.md](docs/bekleyen-kararlar.md)'den düşürür. Dosya masanın
  AYNASIDIR, tersi değil — masada olmayan bir karar sorulmamıştır.
- **Masa ayrıca B3 doldurma DURUMUNU gösterir** (`durum/b3`): yazılan/kalan
  blok, cephe, hız, günlüğün kendi kalan süre tahmini, boşluk, disk. Sayıyı
  `cry-b3-doldurma-bitti-mi` rutini 6 saatte bir ölçüp yazar (kullanıcı kararı
  2026-10-06; günde bire çıkarmak masayı günün ~20 saatinde bayat gösterirdi) —
  masa 8 saatten eskisini BAYAT diye işaretler, çünkü bayat bir ölçüm ölçüm değildir. **Kalan
  süre günlüğün son satırından okunur**, masada yeniden hesaplanmaz.
- **Dokümanlar KISA tutulur** (kullanıcı isteği 2026-09-29): CLAUDE.md her
  oturumda yükleniyor. Bir kural = bir madde + ölçümü; anlatı yok. Yeni kural
  eklerken eskisini uzatma, değiştir.

## Yerel çalışma ortamı — ölçülmüş tuzaklar

- **Açılış OTOMATİK.** `cry-baslangic` görevi `deploy/pc/baslangic.ps1`i
  çalıştırır: Docker'ı açar, durmuş cry konteynerlerini `docker start` eder
  (`compose up` YAPMAZ — yığını runner'ın checkout'u tanımlar), runner/WireGuard
  denetler, 3005 dev sunucusunu başlatır. Günlük `C:\srv\cry\baslangic.log`.
  Kurulum `deploy\pc\kur.ps1`. Betik gövdeleri **saf ASCII** (PS 5.1 BOM'suz
  dosyayı ANSI okur); Docker'ın JSON ayarı metin olarak, BOM'suz yazılır.
- **Önce Docker Desktop açık mı bak.** Kapalıyken bütün yığın düşer, belirti
  "sayfa hiç açılmıyor"dur. `docker ps`.
- **Dev sunucusu 3005, 3000 DEĞİL** (3000 başka projenin service worker'ına ait
  ve cry'ın isteklerini yakalıyordu).
- **Dev sunucusunu preview aracıyla değil AYRIK süreç olarak başlat** — preview
  tur sonunda kapanır. `Start-Process cmd.exe /c "npm.cmd run dev > .dev-3005.log 2>&1"`.
- **PowerShell'de `npm` çalışmaz, `npm.cmd` çalışır** (ilke `npm.ps1`i reddediyor;
  ilke değiştirilmez). `gh` → `%LOCALAPPDATA%\ghcli\bin\gh.exe`.
- **Yerel betik ortamı İKİ dosyadan:**
  `node --env-file=.env --env-file=apps/web/.env.local --import tsx x.mts`.
  Kök `.env` konteyner adlarını, `.env.local` `127.0.0.1:15432`'yi taşır.
  Üst düzey `await` için `.mts`. `TRONSCAN_API_KEY` yalnızca depo kökündeki
  `.env`'de; `ETHERSCAN_API_KEY` kökte BOŞ, `.env.local` ve `C:\srv\cry\.env`'de
  dolu — yalnızca kökü yükleyen betik anahtarsız kalır. Değerler ekrana basılmaz.
- **Redis yalnızca `127.0.0.1:16379`** ve bu **CANLI kuyruktur**: 3005'ten
  başlatılan koşu canlı worker'da işlenir. Kuyruk çağrıları 5 sn süre sınırlı.
- **Canlı yığında betik:** worker konteynerine kopyala ve orada koş
  (`docker cp x.mts cry-worker:/app/apps/worker/ && docker exec -w /app/apps/worker cry-worker npx tsx x.mts`),
  sonra sil. Git Bash yolu çeviriyor: önce `export MSYS_NO_PATHCONV=1`.
  Konteynerde `curl` yok, `node -e` ile `fetch` kullan. **`MSYS_NO_PATHCONV=1` KAYNAK yolunu da
  bozar** (`/tmp/x.mjs` yerine `C:\TMP\x.mjs` aranır): betiği depo köküne yazıp GÖRELİ yolla kopyala.
- **Ölçüm betiği TronGrid'e giderken 429 yer** (kota canlı yığınla paylaşılıyor): tek seferlik
  ölçümde bile geri çekilmeli — 429'da 2 sn, 4 sn, 6 sn… yoksa "kaynak boş döndü" sanılır ve
  ölçülmemiş bir şey ölçülmüş gibi yazılır.
- **İkinci worker SÜRECİ başlatma.** Yeni motor kodunu denemek için
  `takipKos`/`takipDevam`ı bir tsx betiğinden DOĞRUDAN çağır.
- **Deneme koşusu açıldıysa iş bitince SİL** (`delete from trace_runs …`).
- **Oturum çerezi localhost'ta PORTLAR ARASINDA paylaşılır** — 1337'de giriş
  yapan aynı tarayıcıda 3005'i de oturumlu açar (ajan parola girmez).
- **Unutulan şifre:** `npm.cmd run sifre:sifirla`, kullanıcı `abidin`; şifreyi
  kullanıcı girer.
- **Uzun düzenleme betiklerini kabuk heredoc'una gömme** — önce dosyaya yaz.
  Satır sonları karışık: okurken normalleştir, yazarken dosyanınkini koru.
- **Oturumlu sayfanın yerine geçen ölçüm:** saf katmanı (`lib/akis.ts`) gerçek
  veriyle SVG'ye çizdir; CSS'i statik kopyada ölç. "Göremedim" demek yerine ne
  ölçüldüğü söylenir.

## Blok indeksi — motor, kapsam, disk

Plan ve ölçümler: [docs/yol-haritasi-blok-indeks.md](docs/yol-haritasi-blok-indeks.md).

- **Motor ClickHouse**, kendi makinede, Docker'da; Apache 2.0 ve ÜCRETSİZ
  (ücretli olan yalnızca *Cloud*). Parquet'le başa baş, kararı işletim verdi.
  Postgres 324,5 B/satır ve yoğun adreste ~490 ms ile elendi.
- **Eşiksiz ve tam geçmiş** hedefleniyor; **dolan disk bir DURMA ölçütüdür.**
  D: 2 TB Lexar NM620 (2026-09-28): 1.776 GiB boş, indeks+ayna ~82 B/satır,
  tam geçmiş (~10,8 Mr satır) ≈ 825 GiB → sığıyor.
- **Veri D:'de, volume ile DEĞİL**, Docker'ın WSL veri diski D:'ye alınarak.
  Windows klasörünü bağlamak ClickHouse'u kırıyor (rename'i 9p reddediyor).
- **18123 yalnızca WireGuard ağına açık**; `default` kullanıcısı kapatıldı,
  kimlik `.env`de.
- **Blok kapsamı AYRI tabloda (`blok_okundu`)**, kursör sayısında değil. Okunan
  her blok — 0 transferli olan dahil — transferlerden SONRA bir satır alır.
  `blok_indeks`te satırı olmayan blok "transfer yok" mu "okunmadı" mı söyleyemez.
- **Sayan sorgu `FINAL` kullanır.** ReplacingMergeTree mükerreri birleşmede
  siler: 100 blok yeniden yazılınca ham 323.170, `FINAL` 292.641.
- **Bir bloğun işlem bilgisi işlemleriyle BİREBİR eşleşmeli; eşleşmeyen blok
  HATADIR.** Anahtarsız düğümler tutmadıkları blokta HTTP 200 + boş dizi
  dönüyor ve o blok hatasız "0 USDT" yazılırdı. **Kaynağın şekli doğru diye
  içeriği tam değildir** — yeni kaynak TronGrid'le satır satır karşılaştırılır.
- **İki kaynak aynı bloğa farklı satır verirse blok YAZILMAZ**; boşluk kalır ve
  raporlanır (her 500. blok çapraz denetlenir).
- **Giden yön ince aynadan okunur** (`blok_indeks_giden`, MV ile dolar): ana
  tablo `kime` sıralı, giden sorgu tam tarama yapıyordu (600 ms → 28 ms). Aynada
  tx yerine `cityHash64(tx)`, blok yok. Yazan kod aynayı BİLMEZ. **MV'den önce
  yazılmış satır aynaya kendiliğinden gelmez** (`scripts/blok-indeks-ayna-doldur.mts`).
- **Her cevap bir PENCEREYE bağlıdır** (boşluksuz son aralık). Pencere ölçümü
  bir ALT SINIRDIR. **Bir boşluk ALTINDAKİ HER ŞEYİ motora kapatır** — tam
  geçmişte 84 Mn'daki tek boşluk 84 Mn bloğu kullanılamaz yapar.
- **Ulaşılamayan blok indeksi "hareket yok" DEĞİLDİR**; `bakilamadi` denir.
- **Web `@cry/blok-indeks`i `extensionAlias` ile derler** (NodeNext; Next'in
  webpack'i `./sema.js`i çözemiyordu). Web'e yeni paket bağlanınca push'tan
  önce imaj temiz kopyada derlenir.

## Geçmişin sırası ve bedeli

- **BigQuery SATIN ALINMADI; geçmiş beklenerek dolar.** 0 ₺ ⟷ ~89–127 $/1 hafta.
  Ara seçenek (~25 $ / üç ay) ölçülünce çöktü: beklemek zaten o kadardı.
  Karar yeniden açılırsa önce ücretsiz Sandbox'ta `input = '0x'` ⇒
  TransferContract eşitliği ÖLÇÜLÜR — satın alma bugün ölçülmemiş bu varsayıma dayanıyor.
- **Kalan süre uçtaki hızla ölçülmez.** Uçta 10,9 blok/sn, derinde 5,8 —
  doldurucunun kendi tahmini 87 günden **~164 güne** çıktı (2026-09-29). Tahmin
  her zaman günlüğün son satırından okunur.
- **Doldurucu uçtan geriye KESİNTİSİZ gider; dava dönemine atlamak reddedildi**
  (`--taban` bunu yapabilir, yapılmayacak): atlanan bölge, aradaki boşluk
  kapanana kadar motora KAPALIDIR.
- **Blok numarası TARİHE ancak ÖLÇÜLEREK çevrilir:**
  `select min(zaman) from blok_indeks where blok = <n>`. "81,8 Mn ≈ 2022 sonu"
  sanılmıştı; ölçüm **2026-04-14** dedi ve uydurma bir aciliyet üretmişti.
- **TronGrid doldurmada ÖNCELİKSİZDİR** (kota adres taramasıyla paylaşılıyor):
  yalnızca `adres-indeksle` ve `takip-kosusu` kuyrukları boşken gider, kuyruğu
  okuyamazsa hiç gitmez.
- **Doldurucu kuyruk işi DEĞİL, tek bir ayrık süreçtir**
  (`apps/blok-okuyucu/src/doldur.ts`); kaldığı yeri kapsam tablosu bilir, süreci
  öldürmek zararsız, aynı komut kaldığı yerden devam eder.

## Canlı uç

- **Canlı uç konteynerdir (`cry-blok-okuyucu`), kaynağı publicnode, TronGrid
  yedek.** tronstack uçta işe yaramıyor (yeni bloğun bilgisi 30 sn sonra da eksik).
- **Kursör AÇILIŞTA kapsama sorulur** (`kapsamdanIlerlet`); okunmuş blok yeniden
  okunmaz. Ölçüldü: kursör takılıyken 52.457 blok BAŞTAN okunuyordu — ~5 saat
  kota, sıfır yeni satır. **Veri bozulmuyordu, iş boşunaydı**: mükerrer okuma
  tekillikle birleşiyor, o yüzden hatasız aylarca sürebilirdi.
- **Kursör okunmamış bloğun üstüne ATLAMAZ** (`bitisikKursor`): ilerleme durur,
  gecikme büyür ve günlükte görünür.
- **Yeni kesinleşen blokta işlem bilgisi EKSİK gelebilir** (3–13 sn); boşluk
  değildir, okuyucu bekleyip aynı bloğu yeniden okur.
- **Sağlık denetimi YETİŞMEYİ de ölçer.** Nabız dosyası `<ms> <gerideSn>` taşır; denetim hem
  damganın tazeliğine hem 3.600 sn eşiğine bakar. Yalnızca damgaya bakarken okuyucu **45,6 saat**
  geride "healthy" diyordu (ölçüldü 2026-09-28 19:31). Pencerenin üst ucu buradan geldiği için
  sessiz kopma, hata vermeden M1'in kazancını eritir. Gerilik kursörün DEĞDİĞİ son bloğun
  damgasından ölçülür, uçtakinden değil. Yani **ilerleme ile yetişme AYRI ölçülerdir.**
- **Her PUSH deploy'u yığını yeniden oluşturur.** Bu yüzden indekse yazan her
  süreç bağlantı ve 5xx hatalarını 10 dk yeniden dener (`geciciyseTekrarla`);
  kalıcı hata (4xx) durdurur.
- **Yerelde imaj derlerken depo köküyle `docker build` YAPMA** (`.dockerignore`
  yok, Windows `node_modules`ü imaja giriyor). Temiz kopya:
  `git ls-files -co --exclude-standard -z | tar --null -T - -cf - | tar -xf - -C <klasör>`.
  Deneme konteyneri `--env-file C:\srv\cry\.env --network cry_default` ile koşar.

## Motor indeksi okuyor

- **İki katman kuralı PENCERE İÇİNDE kalktı.** Eşiksiz ve boşluksuz olduğu
  ispatlı bir pencerede indeks HÜKÜM verir (13 adres, 560 hareket, eksik 0 /
  fazla 0). **Pencere DIŞI kaynaktan okunur.** EŞİKLİ bir indeks asla "başka
  para girmedi" dedirtmez.
- **"Eksik 0" EKSİKSİZ demek değildir** — iki taraf da sözleşme içi TRX
  transferlerini görmüyor. Bir karşılaştırma ortak körlüğü göremez.
- **Motor üç sorgu atar:** gelen ← ana tablo, giden ← ayna, gerçek tx ← nokta
  okuma. **`kime OR kimden` TEK sorguda yazılmaz** (anahtarı düşürüyor, 26–47 sn)
  ve **tx çözümü JOIN ile yazılmaz** (`INNER JOIN … FINAL` sağ tabloyu belleğe
  alıyor, 300 kat). Toplam 498 ms ⟷ TronGrid 8.764 ms.
- **Hareketin KİMLİĞİ kaynağa bağlı olamaz.** `(chain, txHash, index)` öyleydi
  ve 60 harekette uyuşmadı. Kural: işlem içinde aynı (kimden, kime, varlık,
  tutar) dörtlüsünün kaçıncı TEKRARI (`occurrence`) — 0 uyuşmazlık. **İki
  kaynağın yazdığı tabloda tekillik, ikisinin de görebildiği şeyden kurulur.**
- **Melez adaptör DİKMEZ, ÖRTÜŞTÜRÜR** (`blok-indeksli-adaptor.ts`): aralık
  pencerede ise indeks, pencereden önce başlıyorsa kaynak + indeks 5 dk
  örtüşmeyle, tamamen öncesiyse kaynak. Mükerrer zararsız çünkü kimlik
  kaynaktan bağımsız (ölçüldü: 234 hareket, eksik 0 / fazla 0). **Sayaçlar AYRI
  olmalı** — ortak sayaç örtüşen kayda #3 deyip tekilliği bozardı. Yalnızca
  `listTransfers` devralınır; bakiye, aktivasyon ve tek işlem kaynağın işi.
- **`firstSeen`/`create_time` bir ALT SINIR DEĞİLDİR** (8 adresin 6'sında ilk
  hareketten SONRA, birinde 73 gün): TRC20 bakiyesi sözleşmede tutulduğu için
  aktive edilmemiş adrese USDT gidebiliyor. Pencere öncesi HER ZAMAN kaynağa sorulur.
- **ClickHouse'a ulaşılamazsa pencere "bilinmiyor" sayılır** ve soru kaynağa gider.
- **Bugünkü kazanç pencere içiyle SINIRLI.** Asıl hızlanma tam geçmiş yüklenince gelir.

## Koşunun süresi ve kökü

- **10–12 düğümlük koşu ~200 sn** ve neredeyse tamamı pencere ÖNCESİ geçmişi
  TronGrid'den okumak (adres başına ~25 sn); indeksin payı saniyenin altında.
  **Yol dağılımı adaptörün kendi sayacından okunur** — "hızlandı" demek yetmez.
- **`takipKos` kökü tohumdan ÖNCE indeksler.** Taranmamış kökle tohum boş çıkıyor
  ve koşu tek düğümde "bitti" kapanıyordu; düzeltmeden sonra aynı adres 7 düğüm /
  92 kenar verdi. Yalnızca `bilinmiyor` durumdaki kök taranır.
- **Kök taranamazsa koşu DURMAZ ama SESSİZ de kalmaz** (`stats.kokTaramasi`,
  `kokTaramasiSorunu`): boş graf "para hareket etmemiş" diye okunur, oysa cevap
  "köke BAKILAMADI" olabilir.
- **`kosuyuKapat` eski `stats`i KORUR, beyaz listeye almaz** — bir listeye
  eklemeyi unutmak bilginin kaybolması demekti (`kokTaramasi` tam bunu yaşadı).

## Boşluk kapatıcı ve doldurucunun bekçisi

- **Kapatıcı `scripts/blok-indeks-bosluk-doldur.mts`**, görev `cry-bosluk-doldur`
  (04:15). Hiçbir kaynak veremezse boşluk KALIR ve sebebi sayılır — sessizce
  "0 transferli blok" yazmak bakılmamış bloğu bakılmış gösterirdi.
- **Kapatıcı eksik listesini ÖLÇEREK budar.** `block_cursors.missing_ranges` yalnızca BÜYÜYORDU;
  kapatıcı boşluğu kapatıp listeden düşürmüyordu (ölçüldü: 30 kayıtlık listenin 30'u da kapsamda
  okunmuş çıktı). Artık her `--uygula` turunda listedeki her aralık kapsama sorulur, okunmuş
  bloklar DÜŞER, kapatılamayanlar sebebiyle KALIR — tur hiç boşluk bulmasa da koşar, çünkü bayat
  kayıtlar cephenin ALTINDA kalabiliyor. Ölçüldü: 5 kayıt → 2. **"Yok ≠ bakılamadı" kuralının ters
  yüzü de yanlıştır: bakılmış bir yeri bakılmamış göstermek.** Alan bugün hiçbir karar için
  okunmuyor (pencere kapsamdan gelir), o yüzden doldurucuyla yarışı kilitlenmedi; bir ekran bu
  alanı okumaya başlarsa önce kilit gelir.
- **Doldurucunun CEPHESİNE yaklaşılmaz** (`--emniyet` 50.000): cephenin üstünde
  205 bloğun 27'si boşluk göründü, oysa oran yüz binde 3 — onlar uçuştaki bloklar.
- **Büyük aralık boşluk DEĞİLDİR** (`--enBuyukBosluk` 1000): hiç okunmamış koca
  bölgeler doldurucunun işi.
- **Betik `process.exit()` ÇAĞIRMAZ** — açık tutamaçla kapanan süreç libuv
  "Assertion failed" basıp sağlıklı turu hatalı gösteriyor.
- **Bekçi `cry-doldurucu-bekci` 15 dakikada bir bakar; asla ÖLDÜRMEZ.** Düşmüşse
  başlatır, çalışıyorsa dokunmaz, şüphelenirse yalnızca UYARI yazar. Başlatmadığı
  üç durum: disk 55 GiB altı, iş bittiyse, `doldur-devam.ps1` çalışıyorsa; üst
  üste hemen ölen süreçte saatte bire çekilir. **El freni:**
  `C:\srv\cry\doldurucu-dur`. Her turda bir NABIZ satırı yazar.
- **Süreç aramada "komut satırında geçen metin" YETMEZ** (bir tanı komutu kendini
  saydı): ölçüt `-File …doldur-devam.ps1` kalıbı + kendi PID'ini hariç tutmak.
- **PowerShell tek elemanlı diziyi SKALERE çevirir** ve `.Count` `$null` olur;
  çağrı yerinde `@(...)` şart.
- **`Register-ScheduledTask` hata verip akışı sürdürebiliyor**; `kur.ps1` kayıttan
  SONRA `Get-ScheduledTask` ile doğrular.
- **Bir sürecin takılıp takılmadığı damgayla değil İLERLEMEYLE ölçülür.** İki ayrı
  denetim aynı tuzağa düştü; biri sapasağlam doldurucuyu öldürdü. Günlük damgası
  artık saat dilimini söyler (`ts()`).

## Docker'ın diski D:'de

- **WSL2'de anahtar `CustomWslDistroDir`, `DataFolder` DEĞİL** (o Hyper-V'nin).
  Kontrol arayüzden ya da backend API'sinden (`\\.\pipe\dockerBackendApiServer`,
  `GET /app/settings` → `vm.resources.wslDataFolder`), `settings-store.json`a
  bakarak değil. Bugün: `D:\Docker\wsl`.
- **Dosyalar elle taşınıp Lxss `BasePath` değiştirilirse** Docker kaydı C:'ye
  GERİ yazar ve BOŞ yeni disk açar — yığın "yok olmuş" görünür, veri yerindedir.
- **Taşımadan ÖNCE disk KÜÇÜLTÜLÜR** (VHDX kendiliğinden küçülmez: 6 GB veri,
  125 GB dosya). Sıra: `wsl -d docker-desktop -e fstrim -av` → `docker desktop
  stop` + `wsl --shutdown` → diskpart `compact vdisk` (yönetici) → 9,3 GB.
- **Docker'ı ZORLA kapatma.** `Stop-Process -Force`, `%LOCALAPPDATA%\Docker\run`
  altında silinemeyen soket dosyaları bırakıyor ve Docker açılıp kapanıyor.
  Onarım: klasörü yeniden ADLANDIR (silinmiyor) — çöken her açılış yeni öksüz
  bıraktığı için birkaç tur gerekebilir; `docker-secrets-engine` de aynı duruma
  düşüyor. Docker'ın önerdiği "Reset to factory defaults" bütün veriyi siler,
  KULLANILMAZ. Kapatma `docker desktop stop`, açma `docker desktop start`.
- **Duraklatılmış Docker deploy'u DÜŞÜRÜR** (kod sağlamken 17 sn'de "motora
  ulaşılamıyor"). `gh run rerun <id>` aynı commit'i yeniden dağıtır; ayrı bir
  PUSH gerekmez.

## Sessiz yanlış cevap: DuckDB'nin Parquet BLOB bloom filtresi

Motor seçilmese de ders kalıcı: DuckDB 1.5.5 BLOB sütunu için bozuk bloom
filtresi yazıyor; 19 Mn satırda `kime = <adres>` **hatasız 0 satır** dönüyor,
aynı değer aralık süzgeciyle 560.160 satır veriyor. Küçük dosyada görünmüyor.
Bu yüzden bir motorun ilk testi, bilinen bir adresin sayısını **iki farklı
yoldan** alıp karşılaştırmaktır.

## Fiyat ve kur

Doldurucu `packages/fiyat` (`--kaynak=tcmb|coingecko`, varsayılan KURU koşu).

- **Bültenin tarihi GÖVDEDEN okunur, adresten DEĞİL.** `today.xml` 2026-09-30
  saat 00:14'te hâlâ **29.09.2026**'yı veriyordu (TCMB kuru öğleden sonra
  yayımlıyor). Adrese güvenip yazmak, pazartesinin kurunu salıya yazmaktı.
- **TCMB 404'ü hata DEĞİL, "o gün bülten yayınlanmadı"dır** (hafta sonu ve
  resmî tatil; ölçüldü 2026-09-27 Pazar ve 2026-01-01). Kayda geçmezse o gün
  sonsuza dek yeniden sorulur.
- **Yazılan kur DÖVİZ ALIŞ** (kullanıcı kararı 2026-09-30, dayanağı VUK 280) ve
  seçim `source` sütununda durur (`tcmb-doviz-alis`). Bülten dördünü de veriyor;
  kuru söylemeyen bir TL tutarı savunulamaz.
- **Kurda hafta sonu için geriye EN ÇOK 14 gün yürünür ve kullanılan bültenin
  TARİHİ cevapla döner.** 14 ölçümden geldi: 2.842 günlük kayıtta en uzun
  kesintisiz yayınlanmama **9 gün** (2018-08-18→26 ve 2021-07-17→25, Kurban
  Bayramı + hafta sonu) ve bu bir ALT SINIR — yalnızca hareketi olan günler
  soruldu. Bu bir SEÇİMDİR, rapora yazılır. **Fiyatta geriye
  yürüme YOK** — kur resmî bir sayıdır ve cuma kuru cumartesi için
  savunulabilir; kripto fiyatı 7/24 oynar, dünün fiyatını bugüne yazmak ölçüm
  değil uydurmadır.
- **CoinGecko ücretsiz katmanı 365 günden eskisini HTTP 401 ile reddediyor**
  (`error_code: 10012`). 401'i kimlik hatası sanmak, 2015–2025 arasını "bu
  token'ın fiyatı yok" diye okumaktı. Arşivin 12.900 (varlık, gün) çiftinin
  **11.999'u** bu yüzden `aralik_disi` — ağa hiç gidilmeden, sebebiyle.
- **CoinGecko'nun hız sınırı dar ve İSRARCI:** 6 ardışık çağrının 6'sı da 429
  döndü. Kapı 13 sn (~4,6/dk); 978 çiftlik tur 2s 37dk sürdü ve hız sınırına
  HİÇ takılmadı. Her sonuç KALICI yazılır; aynı günü ikinci kez sormanın
  bedeli yüksek.
- **Yeniden deneme ölçütü "429 mu" DEĞİL, `tekrarDenenir`dir.** İlk sürüm
  yalnızca hız sınırını tekrarlıyordu ve 978 çiftin 2'si tek bir geçici
  Cloudflare **504**'ü yüzünden fiyatsız kaldı. Geçici bir ağ hatasının bedeli
  o günün fiyatının bir sonraki tura kalması olmamalı.
- **CoinGecko tarih biçimi GG-AA-YYYY, ISO DEĞİL.** `10-01-2025` kaynağa göre
  10 Ocak, ISO okuyan göze göre 1 Ekim; ayın 12'sinden küçük her günde iki
  okuma da "geçerli" görünür ve yanlış günün fiyatı HATASIZ yazılırdı.
- **1 USDT ≈ 1 USD VARSAYILMAZ, ölçülür** (2026-09-07 için 0,999957). Depeg
  günleri gerçek ve raporda fark eden büyüklükler üretir.
- **Üstel yazım İKİ uçta da çıkar ve ikisi de ölçüldü.** Yazarken: CoinGecko
  `3.2e-9` verebiliyor ve Decimal(38,12) onu kabul etmez (`fiyatMetni`).
  **Okurken: Prisma'nın Decimal'i `toString()`te 1e-6 ALTINI üstel yazıyor**
  (400 fiyatın 3'ünde, `3.72575e-7`) — okuyan taraf `toFixed()` kullanır.
  İlk sürüm yalnızca yazma ucunu kapatmıştı ve 85,5 Mn BTT'nin TL karşılığı
  "tutar fiyata çarpılamadı" diye düşüyordu: dürüst bir mesaj, ama fiyat
  GERÇEKTEN vardı. `ayristir` ikinci kapı olarak üsteli de kabul eder.
- **Tutar × fiyat × kur `Number`'a UĞRAMAZ** (`packages/fiyat/src/ondalik.ts`,
  BigInt); ölçek küçültme yarıyı yukarı yuvarlar. 2^256-1 testli.
- **Bir satırın YOKLUĞU iki şey anlatır**, o yüzden olumsuz yoklamalar ayrı
  tabloya yazılır (`price_lookups`, `fx_lookups`): `yayinlanmadi` ·
  `aralik_disi` · `kaynakta_yok` · `hiz_siniri` · `kaynak_hatasi`. İlk üçü
  KALICI, son ikisi yeniden denenir. Sütunu nullable yapmak eski okuru
  yalancı çıkarırdı; tablo eklemek geriye uyumludur.
- **Gün sınırı baştan sona UTC'dir** ve bu SÖYLENİR. `transfers.ts` UTC saklanıyor,
  oturum saat dilimi UTC, ekranın `ts.slice(0,10)`'u ve "bugün" de UTC — yani
  zincir uçtan uca tutarlı. Ama ekran saatleri TSİ gösteriyor: **03:00 TSİ'deki
  bir işlem bir ÖNCEKİ UTC gününün kuruyla çevrilir.** Söylenmezse okur TSİ
  varsayar ve gece yarısına yakın hareketlerde bir günlük kur farkı görünmez
  bir hata olurdu.
- **Rapor tek sayı BASMAZ:** "işlem günü X ₺ (bugün Y ₺)" ve hangi tarihli
  bültenin kullanıldığı satırda durur. `/islem/[chain]/[hash]` bunu gösteriyor.

## Rapor ve mühür

Kanıt paketi: saf katman `packages/rapor`, toplayıcı `apps/web/src/lib/rapor-kaynagi.ts`,
uçlar `POST /api/rapor` · `GET /api/rapor/[id]` · `/api/rapor/[id]/kanit`, ekran `/rapor/[id]`.

- **Kanonik hash KANIT PAKETİNİN (JSON) hash'idir**, PDF'in değil (kullanıcı kararı).
  `reports.sha256` kanıt paketinin, `pdf_sha256` PDF'in kendi özeti; tek sütuna iki hash
  sığdırmak hangi şeyin mühürlendiğini gizlerdi.
- **Hash ancak serileştirme DETERMİNİSTİKSE bir şey ispatlar.** `JSON.stringify` anahtar
  sırasını ekleme sırasından alıyor; `kanonikJson` her düzeyde SIRALAR, diziyi SIRALAMAZ
  (dizideki sıra veridir). Ölçüldü (koşu 9, 86 düğüm / 1.342 kenar, 805.310 bayt, 197 ms):
  kenarlar ters sırada verilince hash AYNI.
- **Postgres `jsonb` anahtar sırasını KORUMAZ** — bu yüzden paket her okumada yeniden
  kanonikleştirilip hash'i kayıtlıyla karşılaştırılır (`muhur.tutuyorMu`) ve ekran bunu basar.
  Ölçüldü: yaz-oku turundan sonra mühür birebir aynı.
- **Hash'i basan taraf, hash'i ÜRETTİĞİ metni de verir:** `/api/rapor/[id]/kanit`
  `NextResponse.json` KULLANMAZ (o nesneyi kendi biçimiyle yeniden yazar ve baytlar
  ayrılırdı); mühürlenen baytlar olduğu gibi iner, `sha256sum` ile doğrulanabilir.
  Doğrulanamayan bir mühür, mühür değildir.
- **Üretim zamanı pakete GİRER**, yani aynı koşudan iki rapor farklı hash alır — rapor bir
  ANIN tutanağıdır. Determinizm ölçümü o alanı eşitleyerek yapılır.
- **Yarım koşu mühürlenmez** (kuyrukta/çalışıyor → 409), ama **durdurulmuş koşu ALINABİLİR**
  ve paket "graf eksik" uyarısını taşır: eksik olduğunu SÖYLEYEN kanıt alınabilir,
  söylemeyen alınamaz. Dördü de ölçüldü (koşu 12 üstünde, durum geri alındı).
- **Karalama vakasından rapor alınamaz** (`cases.is_draft`): koşu adsız açtıysa ad rapor
  istenirken sorulur, verilince bayrak DÜŞER. Ölçüldü: ad yok → 409, ad var → mühür.
- **TL toplamı fiyatsız kenar varsa ALT SINIRdır** ve kaç kenarın fiyatsız olduğu yanında
  durur. Ölçüldü (koşu 9): 1.342 kenarın **1.342'si** fiyatsız — kenarlar 2019–2022 ve
  CoinGecko ücretsiz katmanı 365 günden eskisini vermiyor. Rapor "0 ₺" DEĞİL "—" ve iki
  sebep yazıyor. Fiyatın olduğu günde yol ateşleniyor (ölçüldü: 4,5 USDT → **220,04 ₺**,
  2026-09-29 bülteni; aynı kayıtta rapor günü fiyatı yok ve sebebi yazılı).
- **Eksik sebepleri TARİHSİZ sayılır** (`sebepOzu`, `<gün>`): yoksa 1.342 kenar yüzlerce ayrı
  satır olur ve "fiyat neden yok" sorusunun cevabı görünmezdi.
- **Toplam `Number`'a UĞRAMAZ** (`toplaMetin`, BigInt): 1.342 kenarda kuruş hatası birikirdi.
- **Rapor İZLENMEYENİ de sayar** (`bakilmayanOzeti`, saf ve testli; pakette
  `kapsam.bakilmayanlar`, ekranda ve PDF'te «Bakılmayan yerler»): düğüm başına
  indeks durumu + yarıda kalan taramanın SEBEBİ + sınır düğümü + doğrulanmamış
  terminal. Sebep `sebepOzu`yla tarihsizleşir, sebebi kayıtlı olmayan tarama
  «sebep kayıtlı değil» diye SAYILIR. Ölçüldü (2026-10-09): koşu 37 → 25 düğümün
  1'i tam, 24'ü kısmi (23 `pencere_oncesi`, 1 `sayfa_butcesi`), 12 sınır düğümü;
  koşu 9 → 86 düğümün 65'i tam, 21'i kısmi (20'si sebepsiz, 1 `hiz_siniri`),
  1 doğrulanmamış terminal. Düğüm tablosu artık `indeks` kolonu taşıyor
  (PDF'ten metin çıkarıldı: 23 + 1 kısmi satır, 25 adres).
- **Kapsam eksiği metodoloji UYARISINA da girer**: «Graf bir ALT SINIRdır: N
  düğüme hiç bakılmadı, M düğümde tarama yarıda kaldı». Kapsam bölümünü atlayan
  okur bunu uyarılarda görür — bir ölçüt tek yerde yazılıysa okunmayabilir.
- **Mühürlenmiş pakete sonradan bilgi EKLENMEZ.** Biçim `cry-kanit-2`ye çıktı;
  `cry-kanit-1` paketlerinde kapsam bölümü YOK ve ekran bunu açıkça yazar
  («o biçim düğüm kapsamını ölçmüyordu»), PDF de bölümü atlar. Ölçüldü: rapor 3
  (v1) yeniden üretildi → 49 sayfa, 421.562 bayt, iki üretim AYNI sha256, yani
  eski raporun baytları DEĞİŞMEDİ; rapor 4 (v2) → 5 sayfa, 76.873 bayt,
  basılamayan karakter 0.

PDF: saf yerleşim `packages/rapor/src/pdf-duzen.ts`, çizici `pdf.ts` (pdf-lib),
uç `GET /api/rapor/[id]/pdf`.

- **PDF'in de kendi hash'i vardır ve o hash bir TAAHHÜTTÜR** (`reports.pdf_sha256`,
  ilk indirmede yazılır): aynı rapordan üretilen PDF her zaman aynı baytları vermeli.
  Bu yüzden üretim zamanı ve dosya kimliği pdf-lib'in varsayılanından değil PAKETTEN
  gelir (`uretildi`, mührün ilk 32 hanesi). Ölçüldü (rapor 3): iki üretim AYNI sha256;
  49 sayfa, 421.562 bayt, 611 ms. Sonraki üretim kayıttakiyle karşılaştırılır ve
  uyuşmazlık başlıkta söylenir (`x-cry-pdf-uyusuyor`).
- **Yerleşik 14 yazı tipiyle Türkçe rapor BASILAMAZ** (WinAnsi'de `ğ ş İ ı` ve `₺`
  yok): DejaVu 2.37.3 üç dosya hâlinde depoda (`packages/rapor/yazi-tipi`, serbest
  lisans, `KAYNAK.md`). Yazı tipi seçimi mührü DEĞİŞTİRMEZ — kanonik olan JSON.
  **Yazı tipinin kapsamadığı karakter sessizce boş basılmaz:** `?` olur, SAYILIR ve
  sayı ilk sayfaya yazılır (ölçüldü: gerçek raporda 0 karakter).
- **Yazı tipi yolu ÜÇ çalışma dizininden çözülür** (depo kökü · `apps/web` · konteynerde
  `/app`) ve bulunamazsa hata DENENEN yolları sayar. Next'in dosya izleyicisi dinamik
  yolu taşımıyor: `apps/web/Dockerfile` `yazi-tipi`yi açıkça kopyalar (imajda ölçüldü).
- **Sayfalamada bölünen blok kuyruğa geri konur; ilerlemeyen bölme SONSUZ DÖNGÜdür.**
  Sayfa dibine denk gelen tablo kalan 10 pt'ye bölünüyor, parçası da sığmıyor ve blok
  kendini yeniden bölüyordu: 1.342 hareketli koşuda 20 dakikada bitmedi ve HATA DA
  VERMEDİ. İki kural: sığmayan blok ÖNCE yeni sayfaya geçer, bölme ancak TAM SAYFAYA
  sığmadığında yapılır; ve döngünün bir İLERLEME BÜTÇESİ var (aşılırsa hata — takılı
  süreç, hata veren süreçten pahalıdır; testte 5 ms'de ateşliyor).
- **PDF defterin TAMAMINI basar; "ve N hareket daha" demez.** Ölçüldü (rapor 3, metin
  geri çıkarılarak): 1.342 kayıt, 1'den 1.342'ye boşluksuz, 1.342 tekil tx, 49/49
  sayfada altlık, Türkçe ve `₺` sağlam. **PDF'in doğrulaması metin ÇIKARILARAK yapılır** —
  "derlendi" bir ölçüm değil.

## İzleme (eşik · günlük özet)

Servis `apps/watcher` (düz JS, Hetzner, SQLite), saf eşik katmanı
`apps/watcher/src/esik.js` + `tron.js` (42 test), ekran `/izleme`, uçlar
`GET /api/izleme/liste` · `POST /api/izleme/bildirim` (jeton) ·
`/api/izleme` + `/api/izleme/[id]` (oturum).

- **15 dakikada bir bakar; eşik ÜSTÜ hareket anında mesaj, altındakiler GÜNLÜK
  ÖZET** (kullanıcı kararı). Ölçüldü (Binance 2, 1 saatlik pencere):
  442 hareketin **117'si mesaj / 325'i özet**. Eşiksiz izleme aynı saatte 442
  bildirim atardı.
- **Eşik varlık ve adres bazında**; `*` o adresin varsayılanı ve varlığa özel
  eşik onu EZER. Eşik GÖSTERİM biriminde METİN olarak durur, karşılaştırma ham
  uzayda **çarpmayla** yapılır: eşiği varlığın ondalığına çekmek yuvarlamaydı ve
  0,5 eşiği 0 ondalıklı varlıkta 1 olurdu.
- **Eşiği UYGULAYAMADIĞIMIZ hareket SUSTURULMAZ**, sebebiyle mesaj olur:
  `esik_yok` · `ondalik_bilinmiyor` · `esik_okunamadi` · `tutar_okunamadi`.
  Ondalığı bilinmeyen tutarı "küçük" saymak, ölçülmemiş bir şeyi özete gömmekti.
- **Kapının kabul ettiği eşik, servisin OKUYABİLDİĞİ eşik olmalı.** İki taraf
  iki ayrı dilde yazılı (web TS, servis JS — sunucuda derleme yok) ve test
  ikisini yan yana koyuyor; sapma "ekranda kabul, serviste `esik_okunamadi`"
  olurdu. Üstel yazım iki tarafta da REDDEDİLİR (`1e3` bin kat yanlış sınır).
- **Gün sınırı UTC** ve özetin başlığı bunu YAZAR: 03:00 TSİ'deki hareket bir
  ÖNCEKİ günün özetine girer. Özet GİTMEDEN kayıt düşmez.
- **Özet gün dönünce DEĞİL 06:00 UTC'de (09:00 TSİ) gider** — gün 00:00 UTC'de
  kapanıyor ve orası TSİ 03:00'tü. Saat bir SEÇİM, `WATCHER_DIGEST_HOUR_UTC` ile
  geri alınır ve soru [bekleyen kararlarda](docs/bekleyen-kararlar.md). Dünden
  ESKİ birikmiş gün saat BEKLEMEZ: beklerse bir sonraki pencereyi de kaçırıp hiç
  gitmeyebilir.
- **TronGrid `allowed_rps(1)` diyor ve aşılınca sorgu sunucusunu 5 sn askıya
  alıyor** (ölçüldü, gerçek yanıt). Çağrı arası 1,2 sn pencere + 429'da 5/10/15/20
  sn geri çekilme; kota canlı yığınla PAYLAŞILIYOR, yani ölçümün ikinci turu
  hız sınırına girip `hiz_siniri` ile durdu — kursör ilerletilmedi.
- **Hız sınırı HTTP 429 ile DE, HTTP 200 + `Error` metniyle DE gelir.** Şekli
  farklı, anlamı aynı; yalnızca 429'a bakan kod hareketi olan adresi sessizce
  atlardı.
- **Sayfa bütçesi (uç başına 5 sayfa) dolarsa kursör okunan EN BÜYÜK damgadan
  ileri taşınmaz** ve bu kuru koşuda da yazılır: okunmamış aralık "hareket yok"
  diye geçemez.
- **Uyarı tekilliği işlemden DEĞİL hareketten kurulur** (`movement_key =
  <varlık>|<yön>|<tekrar>`): bir işlemde birebir aynı 20 Transfer olayı ölçüldü
  ve biri eşiğin üstünde öteki altında kalabilir.
- **Servis gönderdiği mesajları PC'ye geri İTER** (`/api/izleme/bildirim`,
  jetonla): kurulu ama sorulmayan bir servis, `/etiket`ten önceki etiketlerin
  aynısıdır. Uç bir RAPOR kanalıdır — listede olmayan adres yazılmaz, atlanır ve
  sebebi döner; eşik/aktiflik oradan DEĞİŞTİRİLEMEZ.
- **Tur, UYARI OLMASA DA bildirilir** ("baktım, hareket yok" bir bilgidir) ve
  damga yalnızca GERÇEKTEN bakılan adrese yazılır — hız sınırına giren adres
  listeye girmez. Yalnızca uyarıyla ilerleyen bir damga, hareketsiz adresi hiç
  bakılmamış gösterirdi; canlı okuyucuda bunun tersi ölçüldü (45,6 saat geride
  "healthy"). Ekran 45 dakikayı geçen sessizlikte UYARIR: "mesaj yok" ile
  "hareket yok" aynı şey değil. Ölçüldü: uyarısız tur 1 adresi işaretledi,
  listede olmayanı saymadı, damga ilerledi.
- **Kapı listesine eklemek YETMEZ**, uç kendi jetonunu sormak zorundadır; ikisi
  ayrı dosyada olduğu için testi ikisini birlikte ateşler (`tests/kapilar.test.ts`).
- **İzlemek TARAMAK değildir:** izleme için açılan adres `index_state =
  "bilinmiyor"` kalır.
- **Kuru koşu:** `node apps/watcher/src/index.js --kuru` — tek tur, Telegram
  kapalı, kursör/uyarı/özet yazılmaz, yalnızca yol sayılır. Ölçüm betiği
  `scripts/izleme-olcum.mts`.

## Yalnızca yerel koşu (API'siz takip)

Kullanıcı kararı (2026-10-06): **koşular kaynağa HİÇ gitmeden, yerel blok
indeksinden beslenebilir.** Kip `params.yalnizYerel`, ekranda varsayılan AÇIK,
kapatmak bilerek kaynağa gitmektir. Saf katman testli (`tests/yalniz-yerel.test.ts`).

- **Kipi doğuran ölçüm:** "bütün geçmiş" sorusunda aralık pencereden önce
  başlıyor sayılıyor ve HER düğüm için TronGrid'e tur atılıyordu; koşu 28 kök
  taramasında hız sınırına takılıp **1 düğüm / 0 kenar** verdi. Aynı kök yerel
  kiple **29 düğüm / 67 kenar** (ölçüldü 2026-10-06, koşu 35, 10,3 sn).
- **"Kaynağa gitmedi" İDDİA değil ÖLÇÜM:** ölçüm betiği `fetch`i sarmalayıp giden
  isteği ana bilgisayara göre sayar — 33 istek, **hepsi 127.0.0.1:18123**,
  trongrid 0 (`scripts/yalniz-yerel-olcum.mts`).
- **Kipin bedeli SÖYLENİR:** pencere öncesine uzanan düğüm `pencere_oncesi`
  notuyla `kismi` kalır (asla `tam`), sayısı `stats.yalnizYerel.pencereDisiDugum`
  ve ekran grafın bir **ALT SINIR** olduğunu yazar. Ölçüldü: 29 düğümün 20'si.
- **Sayı koşudan değil KAYITTAN okunur.** İlk sürüm yalnızca o turda taranan
  düğümleri sayıyordu; ikinci koşuda hiçbir adres yeniden taranmadığı için
  "0 düğüm pencere dışı" diyordu (ölçüldü: koşu 33). "Saymadım" ile "yok" aynı
  şey değildir. Pencere de aynı sebeple ayrıca okunur.
- **Bakiye, aktivasyon ve ilk/son görülme UYDURULMAZ:** kip açıkken kaynağa
  sorulmaz, `null` döner; `getActivation` hiç TANIMLANMAZ. Sıfır bakiye yazmak
  bakılmamış bir yeri "boş" göstermekti.
- **Yerelde yarım kalmış adres YENİDEN taranır** (`yerelYenidenTara`): "bilinmiyor
  değilse dokunma" kuralının gerekçesi kaynağın KOTASIYDI, yerelde tarama bir
  ClickHouse sorgusu. O kural kaynağın bıraktığı hasarı kalıcı yapıyordu —
  `kismi/hiz_siniri` kalmış kök yüzünden koşu boş dönüyordu, oysa aynı adresin
  indekste 38.128 geleni vardı.
- **Kökü borsa/servis etiketi DURDURMAZ** (`kokEtiketiDurdurmaz`): adresi insan
  seçti, başlangıç noktasında durmak soruyu cevapsız bırakır. Etiket saklanmaz,
  `stats.kokEtiketi`ne ve ekrana yazılır. Yakma · sözleşme · dallanma ·
  indekssizlik kökte de DURDURUR: biri paranın yok edildiğini söyler, ötekiler
  milyonlarca satırlık bir taramayı başlatırdı.
- **Konteynerde `CLICKHOUSE_URL` SERVİS ADI olmalı.** `.env`deki değer makinenin
  kendisini (`127.0.0.1:18123`) gösteriyor; `blok-okuyucu` ve `web` bunu eziyordu,
  **worker EZMİYORDU**. Ölçüldü (2026-10-06, kuyruktan koşu 36): worker içinden
  `clickhouse:8123` 200, `127.0.0.1:18123` ulaşılamıyor — yani canlı yolda pencere
  hep "okunamadı" sayılıp HER soru kaynağa gidiyordu. **Betikten koşan ölçüm bunu
  göremez**: orada 127.0.0.1 doğru adres. Yani indeksin kazancı aylardır yalnızca
  ölçümlerde vardı, kullanıcının bastığı düğmede yoktu. Düzeltmeden sonra canlı
  yol ölçüldü (koşu 37, hiç taranmamış kök, kuyruktan): kök indeksten **20.189
  hareket** okudu, 25 düğüm / 75 kenar, 82 sn, worker günlüğünde trongrid **0**
  satır, ve koşu `terminal` ile bitti — yani doğrulanmış bir borsaya varıldı.
- **Giden aynasının imleci ONDALIK yazılır.** Ana tabloda `tx` FixedString, aynada
  `txh` **UInt64**; ikisine de `unhex` uygulayan imleç ikinci sayfada "Cannot
  convert string … to type UInt64" ile düşüyordu. Gideni limitten çok olan adres
  bu yüzden `kaynak_hatasi` alıyordu; düzeltmeden sonra aynı adres 3 sayfada
  11.999 hareket verdi (ölçüldü 2026-10-06).

## Yedek

- **Yedeklenen: yalnızca Postgres** (vaka, koşu, etiket, rapor, denetim kaydı —
  zincirden türetilemez, hepsi 57 MB). `deploy/pc/yedek.ps1`, her gün 03:15,
  14 kopya. Aynı fiziksel diske yedek, yedek değildir.
- **Hedef HARFLE değil FİZİKSEL DİSKLE seçilir** (`deploy/pc/yedek-hedefi.ps1`):
  sabit `E:\04_Yedek\cry` harici disk takılı değilken yedeği 4 gün SESSİZCE
  durdurmuştu. Sıra: kökünde `04_Yedek\cry` olan ve D: ile aynı diskte olmayan
  sürücü; yoksa GEÇİCİ `C:\srv\cry\yedek` (disk arızasına karşı korur, makine
  kaybına karşı KORUMAZ — günlük bunu her seferinde yazar).
- **Blok indeksi BİLEREK yedeklenmiyor** (türetilebilir); yedek günlüğü yine de
  indeksin hangi bloğa kadar dolu olduğunu yazar.
- **Geri yüklenmemiş bir yedek, yedek DEĞİLDİR.**
  `deploy/pc/yedek-geri-yukleme-denemesi.ps1` her pazar 03:45. Ölçüt canlı değil,
  dump'ın yanındaki `.sayim` dosyası — canlıyla kıyas, EKSİK bir dump'ı "canlı
  büyümüştür" diye normal görürdü.
- **PowerShell'de üç tuzak:** `docker exec … > dosya` ikili çıktıyı bozar (dump
  konteynerde alınıp `docker cp` ile taşınır) · PS 5.1 yerli exe'ye geçerken
  gömülü çift tırnakları bozuyor (argümanlar ayrı verilir) · yerli exe'de `2>&1`
  stderr'i ErrorRecord'a çevirir.
- **Hetzner'daki veritabanı bu yedeğin KAPSAMI DIŞINDA.**

## Windows self-hosted runner

1. **`shell: bash` WSL'in bash'ine çözülüyor** ve orada C: `/mnt/c` altındadır;
   adımlar PowerShell ile yazılır.
2. **Adım gövdeleri SAF ASCII** (runner BOM'suz yazıyor, PS 5.1 ANSI sanıyor).
   Türkçe yalnızca YAML alanlarında.
3. **Yürütme ilkesi `Restricted`** — runner `.ps1`i nokta-kaynaklıyor ve ilke
   reddedince süreç **çıktı üretmeden** exit 1 veriyor. Bypass iş düzeyinde verilir.
4. **Compose proje adı sabit** (`name: cry`), yoksa ikinci bir proje aynı
   konteyner adlarını isterdi.
5. **Migration `compose up`tan ÖNCE koşar.** Tersi, sütun ekleyen her deploy'da yeni kodun ayakta
   olup sütunun HENÜZ OLMADIĞI bir pencere bırakıyordu; orada Prisma olmayan sütunu seçip
   `/api/adres`i düşürürdü. Bedeli bilerek kabul edildi: migration koşarken **ESKİ konteynerler
   yeni şemaya bakar**, yani her migration GERİYE UYUMLU olmalı — sütun eklemek serbest, sütun
   silmek/yeniden adlandırmak İKİ deploy'a bölünür. `run --rm worker` bağımlılıkları kendisi
   kaldırıp sağlıklı olmalarını bekler ve tek seferlik konteynere ayrı ad verir (`container_name`
   çakışmaz; dry-run ile ölçüldü).

## Veri kuralları

- **Tutar HAM TAM SAYIDIR** (string olarak taşınan bigint). `Number`'a uğrayan
  tutar rapora `1.15e+53` diye düşer — 2^256-1 değerleri canlı veride var.
  Ondalığa çevirme yalnızca gösterim sınırında, metin üzerinde.
- **"Yok" ile "bakılamadı" AYRI cevaplardır.** İkisini aynı kovaya koymak,
  bakılmamış bir yeri temiz gösterir. Bu dosyanın en çok tekrarlanan kuralı.
- **Her etiket kaynağını, güven skorunu ve doğrulama tarihini taşır.**
- **Yarıda kalan tarama SEBEBİNİ kayda yazar** (`addresses.index_note`): `sayfa_butcesi` ·
  `hiz_siniri` · `kaynak_hatasi` · `adaptor_yok` · `iptal`. "kısmi" tek başına "bekleyeyim mi,
  yeniden mi deneyeyim" sorusunu cevaplamıyordu ve sebep yalnızca worker günlüğündeydi. Biten tur
  notu SİLER. Ekran artık "devam edecek" DEMEZ — o doğrulanmamış bir vaatti, kimse kendiliğinden
  devam etmiyor. Sebebi kayıtlı olmayan kısmi tarama da bunu söyler.
- **Hata sebebi ZİNCİRİN içinde olabilir.** `http.ts` denemeler tükenince
  `"N denemede alınamadı: <url>"` diye SARMALAR ve o sarmalayıcı durum kodunu TAŞIMAZ; 429
  yalnızca `cause`'tadır. Ölçüldü (gerçek 429): yalnızca en dıştaki hataya bakan sınıflandırıcı
  kayda `kaynak_hatasi` yazdı — "bekle" denmesi gereken yerde "boşuna deneme" demiş olurdu.
  `notaCevir` zinciri izler ve testlidir.
- **Kaynağın HATASI veri gibi görünebilir.** Etherscan hatayı HTTP 200 ile
  döndürüp mesajı `result` alanına METİN olarak koyuyor (`"Missing/Invalid API
  Key"`, `"Free API access is not supported for this chain"`); `!!result`
  kontrolü bunu "bulundu" saydı ve gerçek bir TRON işlemi "BSC'de var" diye
  raporlandı. Kural `etherscanHatasi`de; EVM adaptörü doldurulurken orada da
  uygulanacak. **Kaynak yanıtının ŞEKLİ doğrulanır, varlığı değil.**
- **Hareketin indeksi sayfa konumundan türetilmez**; işlem İÇİNDEKİ sırasıdır ve
  sayaç tur boyunca yaşar (bir işlemin kayıtları sayfa sınırında bölünebilir).
- **İçerik tek başına anahtar olamaz:** bir işlemde birebir aynı 20 Transfer
  olayı ölçüldü ve yirmisi de gerçek.
- **Artımlı indeks TARİHE bağlanır, imlece değil.** TronGrid fingerprint'i kısa
  ömürlü; süresi dolunca kaynak sessizce baştan veriyor. Süzgeç her sayfada
  tekrarlanır.
- **Varlıklar karışmaz** ve varlıklar arası TOPLAM alınmaz ("1 TRX + 1 USDT = 2"
  diye bir büyüklük yok).
- **ONAY (Approval) bir para hareketi DEĞİLDİR** (200 kaydın 27'si onay, "sonsuz
  onay" 2^256-1 tutarıyla). Atlanan kayıt SAYILIR ve raporda görünür.
- **Sembol kimlik değildir, SÖZLEŞME kimliktir.** Arşivde "U S D T" adlı
  (boşluklu) taklit token var.
- **Tek işlem okumasında TOKEN hareketi AYRI bir uçtadır.** `gettransactionbyid`
  yalnızca sözleşme çağrısını döndürüyor; TRC20 transferi bir OLAYdır ve
  `gettransactioninfobyid`nin `log` dizisindedir. `getTransaction` gerçek bir
  USDT transferini **0 hareketle** döndürüyordu. `listTransfers` bu tuzağa
  düşmüyor çünkü ayrı uç kullanıyor — **bir kural bir yerde uygulanıp kardeşinde
  unutulabiliyor.**
- **Tek işlem okumasında tekillik sayacı YEREL olmalı** (tur sayacı olsaydı aynı
  işlemin ikinci okuması 0,1 yerine 2,3 derdi).
- **Ondalığı BİLİNMEYEN tutar çevrilmez.** Tanınmayan token'ı 0 ondalıkla basmak
  yanlış bir BÜYÜKLÜK gösteriyor; ham sayı, ham olduğu SÖYLENEREK basılır.
- **İşlem listesi bir EKSİKSİZLİK iddiası değildir:** `nativeCevir` yalnızca
  TransferContract ve TransferAssetContract tanıyor; sözleşme çağrısının taşıdığı
  TRX (`call_value`) ve iç transferler görünmüyor. Ekran bunu yazar. (Aynı
  işlemde `from=0x0, to=0x0` bir Transfer olayı ölçüldü — zincirde gerçekten öyle.)

## EVM adaptörü

- **Ethereum · Polygon · Arbitrum · Optimism · Base · Avalanche AÇIK; BSC DEĞİL.** Ücretsiz plan
  `chainid=56`yı kapsamıyor ve Blockscout BSC barındırmıyor (ikisi de ölçüldü). `hazirMi` ayrıca
  ANAHTAR ŞART koşar: anahtarsız Etherscan HTTP 200 ile "Missing/Invalid API Key" döndürüyor ve
  hazır sayılan bir zincir her adrese "bakıldı, bir şey yok" dedirtirdi.
- **Etherscan'de üç şey de HTTP 200 ile gelir: hata, "kayıt yok" ve HIZ SINIRI.** Ayıran şey
  `result`ın TİPİ — metinse hata, diziyse cevap. Hız sınırı metni `rateLimited` ile işaretlenir,
  yoksa "bekle" denmesi gereken yerde "boşuna deneme" denirdi. Gerçek sınır belgelerin dediği 5
  değil **3 çağrı/sn** (ölçüldü); geri çekilme adaptörün İÇİNDE, çünkü `http.ts`in 429 yolu
  HTTP 200'ü hiç görmüyor.
- **Sayfalama imleci son bloğu VE o blokta verilmiş kayıtları taşır.** `sonBlok + 1` sessiz kayıp,
  `sonBlok` yerinde sayma olurdu. Ölçüldü: 3 sayfa, 145 hareket, **mükerrer 0**. Sayfanın tamamı
  tek bloktaysa ilerleyemediğini SÖYLER.
- **`eth_getCode` boş değil diye adres SÖZLEŞME DEĞİLDİR.** `0xef0100`+20 bayt bir **EIP-7702
  yetki devri**dir ve o adres sıradan bir cüzdandır (vitalik.eth'te ölçüldü). Sözleşme saymak,
  izi olmayan bir duvarda `kontrat` sebebiyle durdurup rapora yanlış sebep yazardı.
- **Kaynağın okuyamadığı token metadata'sı UYDURULMAZ.** `tokenName` ve `tokenSymbol` birlikte
  boşsa `tokenDecimal` bir ölçüm değil dolgudur (ölçüldü: boş ad/sembol + "1"); varlık `?` olur,
  ondalık 0'a çekilir ve tutar HAM taşınır. O "1" ile çevrilen tutar 34 milyar kat yanlış bir
  büyüklük gösterirdi.
- **Değer taşımayan kayıt hareket DEĞİLDİR ama SAYILIR** (`atlananSifirSayisi`), onay kayıtlarında
  olduğu gibi. Başarısız işlem kayda GİRER (`success: false`): para hareket etmedi ama niyet bilgidir.

## Etiket kaynağı

- **TronScan anahtarsız cevap VERMİYOR** (401). "Ücretsiz gelir" bir varsayımdı
  ve çöktü: **bir kaynağın ücretsizliği ÖLÇÜMDÜR**, hatırlanan olgu değil.
- **TRON hesaplarında on-chain `account_name` YOK** (Binance hot wallet dahil
  beş yoğun adreste dönmüyor). Zincirden bedava etiket çıkmıyor.
- **Ücretsiz, anahtarsız, resmî tek kaynak: OFAC SDN** (`SDN_ENHANCED.XML`,
  320 tekil adres). Ayrıştırıcı SAF, fixture üstünde sınanıyor (`packages/etiket`).
- **Zincir SEMBOLDEN değil ADRESİN BİÇİMİNDEN çözülür** (OFAC "USDT" diyor ve
  altındaki adres kimi kayıtta `T…`, kimi kayıtta Bitcoin — 7 kayıt ölçüldü).
- **Yaptırım etiketi TERMİNAL DEĞİLDİR** — yalnızca `exchange*` terminaldir;
  yaptırımlı adresten para hareket etmeye devam eder.
- **Etiketlemek TARAMAK değildir:** etiket için açılan adres `index_state =
  "bilinmiyor"` kalır.
- **TronScan anahtarla çalışıyor ve KİMLİĞİ o getiriyor** (`publicTag`).
- **Etiket metni KAPALI borsa sözlüğünden geçer; sözlükte olmayan borsa
  DEĞİLDİR** ("… Bridge", "Fake …" var). Yanlış bir "borsaya girdi" hükmü eksik
  bir etiketten pahalıdır. **Borsanın ESKİ adı da sözlüğe girer** (MXC → MEXC).
  Bilerek dışarıda: FixedFloat, Cobo Custody, HiFiSwap, Heleket/UPay, TronLucky.
- **Üç kademe** (kullanıcı kararı): sözlükte var → DOĞRULANMIŞ `exchange_hot`,
  motor `terminal` · sözlükte yok ama servis işareti taşıyor (`exchange`, `hot
  wallet`, `custody`, `deposit`) → DOĞRULANMAMIŞ, motor `terminal_aday`, insana
  sorulur · hiçbiri → `diger`. Köprü/sahte biçimler işaret taşısa da elenir.
- **Keşif YAKMA adresini servis cüzdanı SANDI** (TRON sıfır adresi). Kapalı liste
  `packages/etiket/src/yakma.ts`; keşif onu indeks durumundan ÖNCE eler. **Bir
  yapısal ölçüt, şekli aynı ama anlamı zıt olan adresi ayırt edemez.**
- **Keşifte tutar eşiği YOK; toz AYRI SAYILIR ve GÖSTERİLİR** (kullanıcı kararı):
  toz = <1 TRX/USDT (`TOZ_SINIRI`). Bir adrese gönderen 3.069 adresin 3.053'ü
  yalnızca tozdu — adres zehirleme sayıyı şişiriyor, ama sayı ELENMEZ, yanında yazar.
- **Keşfin ŞEKİL ölçütü tozu SAYMAZ.** 126 günlük pencerede toz dahil 3.860 aday,
  gerçek karşı taraflarla **740**; aradaki 3.120 yalnızca adres zehirlemesiydi.
  Uç örnek: 20.087 alıcının 20.085'i toz — eşiğin 400 katı görünen adres aslında
  zehirlemenin KAYNAĞI. Toz bir yönü şişirince ŞEKİL de yanlış çıkıyor (95 adres
  "geçiş" sanılmışken "dağıtıcı"). Toz sayısı bilinmiyorsa toplam kullanılır ve
  gerekçe bunu söyler.
- **Yapısal keşif KİMLİK İDDİA ETMEZ** — "burası bir servis cüzdanı" der,
  "burası Binance" demez. **Adayı yazmak yarısı; kimliği SORMAK öteki yarısı:**
  739 aday TronScan'a sorulunca doğrulanmış borsa 7'den **28'e** çıktı. Sıra:
  `--kaynak=kesif-blok --uygula` → `--kaynak=tronscan --kapsam=aday --uygula`.
- **Şekil sinyali TARADIĞIMIZ adreslerle karışıyor:** ölçüt indeks durumuna göre
  üç ayrı cevap verir — `tam` bir ÖLÇÜM, `kismi` bir ALT SINIR (eşiği aşıyorsa
  aday geçerli, yalnızca güveni düşük), `bilinmiyor` "temiz" değil "bakılmadı".
- **İnsan kaynağı ezer, kaynak insanı EZEMEZ** (`INSAN_IMZASI`): `verified_by`
  `kullanici:` ile başlıyorsa `etiketleriYaz` dokunmaz. "Borsa değil" kararı
  etiketi SİLMEZ, `diger`e çeker — silinen kayıt bir sonraki turda yeniden aday
  olurdu; "buna baktım" bilgisi kaydın kendisinde durur.
- **Keşif adayı yazma eşiği: güven > 0,7.** Zaten doğrulanmış borsaya zayıf aday
  etiketi eklenmez.
- **Yanıtlar `.onbellek/tronscan/` altında** (gitignore); `olcumTarihi` yanıtın
  ALINDIĞI gündür.
- **Tohumlamanın ölçüsü "kaç etiket yazdım" değil, "arşivdeki hangi adrese denk
  geldi"** — 324 etiketin 14.798 adresle kesişimi 0'dı. **Yazılmış ama hiçbir
  kaydın SORMADIĞI etiket, olmayan etikettir.**
- **739 borsa adayı TEMBEL incelenir: yalnızca bir koşu o adayda DURDUĞUNDA.**
  Bir etiketin bedeli koşuyu durdurduğunda ödenir. Rapor `terminal_aday` demeye
  devam eder; bu YANLIŞ değil, eksik doğrulanmış bir iddiadır.
- **Karar verilecek kayıt SORULMADIKÇA bitmemiştir: `/etiket`.** Sayfa iddiayı
  gerekçesi, arşivdeki ağırlığı ve gezgin bağlantısıyla sunar; sıra ölçütü
  `incelemeSirasi`de ve testli. Kimliği doğrulanmış adres listeye GİRMEZ.
- **Blockscout BSC BARINDIRMIYOR** (404, zincir listesinde 56 yok) — 2026-09-09
  kararı ölçülmemiş varsayımdı. BSC yedeği herkese açık RPC; "var" diyebiliyor,
  "yok" DİYEMİYOR ve bunu `hata` ile söylüyor.

## Takip ve rapor

- **Atıf kuralı bir SEÇİMDİR, bir gerçek değil — ve rapora YAZILIR.** FIFO,
  orantısal ve zaman pencereli dağıtım aynı veriden farklı sonuç veriyor
  (`tests/dagitim.test.ts`). Kuralı söylemeyen bir yüzde savunulamaz.
- **Durma SEBEBİ yazılmadan durulmaz**, ve sıra kuralın parçası: borsaya
  varıldıysa sebep `terminal`dir, `butce` değil.
- **Koşunun BAŞLIK durma sebebi, en SIK olan değil en ÖNEMLİ olandır.** Gerçek
  koşuda `butce:11, terminal_aday:2, dallanma:2` → başlık "butce" çıkıyor ve iki
  borsa adayına varılmış olması rapordan siliniyordu (`kosuDurmaSebebi`).
- **Ateşlenemeyen bir ölçüt, ölçüt değildir.** `terminal` ve `terminal_aday`
  gerçek koşularda ateşlendi ve bu kod incelemesiyle değil koşuyla doğrulandı.
  Koşu 5 ⟷ 7: aynı kök, aynı graf (23 düğüm/45 kenar), sebepler
  `terminal_aday:2, butce:11` → `terminal:3, terminal_aday:1, butce:9`. Yani
  kimliksiz arşivde "biz durduk" görünen yer aslında izin bittiği yerdi.
  **Eski koşular donmuş kayıttır**; yeni etiketin etkisi yeni koşuda görünür.
- **Etiket görüntüsü kayıt anında DONDURULUR** (`labelSnapshot`); rapor bir anın
  tutanağıdır.
- **Koşuyu ÜRETEN kodun sürümü koşu kaydında durur** (`stats.surum`, saf katman
  `packages/motor/src/surum.ts`, 9 test): eşikler (`params`) ve atıf kuralı zaten
  kayıtlıydı, eksik olan KODUN kendisiydi — iki ay sonra aynı kökten gelen farklı
  bir grafın kurallardan mı koddan mı geldiği söylenemiyordu. Damgayı **worker**
  yazar (grafı koşturan kod odur; kuyruktaki iş araya giren bir deploy'dan SONRA
  işlenebilir) ve **devam kendi damgasını** taşır — bir koşu birden çok sürümün
  ürünü olabilir. Sıra: imaja yazılan `CRY_SURUM` → çalışma kopyasının `.git` başı
  → `bilinmiyor`. **Sürüm UYDURULMAZ**: çözülmemiş şablon (`${…}`, `$CRY_SURUM`)
  ve boş değer damga sayılmaz, rapor "BİLİNMİYOR" der ve bunun ne anlama geldiğini
  yazar. Ölçüldü (2026-10-09, `scripts/kosu-surum-olcum.mts`): koşu 40 →
  `stats.surum` = `8ecdd6d97aad` / `git`, rapor 5'in PDF'inde aynı cümle;
  `CRY_SURUM` verilerek koşulan tur `kaynak: ortam` yazdı; damgası olmayan koşunun
  raporu (rapor 4) "BİLİNMİYOR" bastı. **Canlı yol da ölçüldü** (push 78da66a'dan
  sonra, kuyruktan koşu 41): `docker exec cry-worker printenv CRY_SURUM` tam
  commit'i verdi ve worker koşuya `kaynak: ortam` ile aynı sha'yı yazdı — yani
  damga imajdan geliyor, betiğin git'inden değil.
- **Damga İMAJA build arg ile girer** (`apps/worker/Dockerfile` → `ARG/ENV
  CRY_SURUM`, compose `args`, deploy akışında `${{ github.sha }}`): konteynerde
  `.git` YOKTUR, o yüzden canlı yolda tek kaynak imajdır. Elle `docker compose
  build` yapılırsa damga boş kalır ve koşu bunu "bilinmiyor" diye söyler.
- **Yetenek bayrağı bir İDDİADIR ve ÖLÇÜLDÜ.** TRON'da `internalTransfers` **false'a çekildi**:
  iç transfer zincirde VAR (üç blokta 1.275 işlemin 7'si, `gettransactioninfobyblocknum` →
  `internal_transactions` + `callValueInfo`) ama `listTransfers`in okuduğu HESAP ucu vermiyor —
  alıcı adres o işlemi listesinde HİÇ göstermiyor ve alan her kayıtta MEVCUT ama hep BOŞ. EVM'de
  kaynak **veriyor** (`txlistinternal` ölçüldü) ama adaptör okumuyor; o bayrak hâlâ iddia.
- **Bayrak düşürmek yarısı, EKRANDA söyletmek öteki yarısı.** `gorulemeyenler()` (saf, testli)
  körlüğü cümleye çeviriyor ve takip görünümü grafın altında yazıyor; adaptör yoksa cevap "yok"
  değil **"kapsam BİLİNMİYOR"**. Listeye yalnızca o zincirde VAR OLUP okuyamadığımız şey girer:
  `utxo` ve `activation` model farkıdır — Bitcoin'de sözleşme, Ethereum'da "aktive eden" YOKTUR ve
  onları körlük saymak olmayan bir eksiği varmış gibi gösterirdi. Ölçüldü: tron 1 madde, ethereum ·
  bitcoin · solana 0.
- **Boş adaptör SESSİZ kalmaz:** Bitcoin/Solana/EVM `throw` ediyor ve
  `registry.hazirMi()` onları kapıda tutuyor.

## Arayüz

Tasarım dili: [docs/arayuz.md](docs/arayuz.md). İmza öğesi **köken oluğu**.

- **Kabuk SOL RAY, üst şerit DEĞİL** (kullanıcı kararı 2026-10-08, dört varyasyondan
  C): koyu lacivert yüzey, kart + panel, vurgu cyan. Ray dikey olduğu için takip
  ekranına bir satır değil bir sütun ödenir ve tek ekran kuralı korunur. Görünüm
  değişti, **kanallar değişmedi**: köken oluğu `.kayit` ve `.panel[data-koken]`de
  yaşıyor, cyan yalnızca eylem/odak. Varyasyonlar `docs/tasarim-denemeleri/`.
- **Kart bir ÖLÇÜ basar, altında SINIRINI yazar** (`.kart-alt`): kısmi taramadan
  gelen sayının altında "ALT SINIR" durur. Büyük basılmış bir sayı, kaynağı
  küçültülünce bakılmamış bir yeri hüküm gibi gösterir.

- **Takip bir AKIŞ olarak çizilir, graf olarak değil** (kullanıcı kararı; üç
  örnekten A). Cytoscape grafında 40 Mn USDT ile 1 USDT aynı çizgiydi. Sütunlar
  sıçrama, ŞERİT KALINLIĞI tutar (tek varlığın ölçeğinde), sağda defter. Saf
  yerleşim `apps/web/src/lib/akis.ts`, testli ve **DETERMİNİSTİK** (aynı koşu
  aynı resim; test girdi sırasını ters çevirip aynı resmi bekliyor).
- **Renk ŞERİDİN ne olduğunu anlatır, düğümün durumu DOKUDUR.** Şerit: ileri
  (gri) · doğrulanmış borsa (yeşil) · aday (kehribar) · geri dönüş (pembe).
  Düğüm: borsa düz + ✓, aday taralı + ?, bizim sınırımız kesik çerçeve. Renk
  hiçbir şeyi tek başına anlatmaz; palet ΔE ≥ 9 denetiminden geçti.
- **Doğrulanmış borsada takip BİTER; aday ve bizim sınırlarımızda DEVAM
  edilebilir.** Borsaya giren para ortak havuza karışır. Kural tek yerde
  (`devamEdilebilir`) ve API de onu sorar — düğmenin görünmemesi güvence
  değildir. "Doğrulanmış" bir KAYNAK iddiasıdır; etiketin kaynağı ipucunda kalır.
- **Yakma adresi ayrı bir durma sebebidir: `yakildi`.** 70 Mn USDT'nin tamamı
  sıfır adresine gitmişti ve motor onu "dallanma" sanıyordu. Sebep borsadan ve
  bütün sınırlardan ÖNCE sorulur; yakma adresi taranmaz. Eski koşularda sıfır
  adresi "dallanma" kayıtlı, o yüzden kural sebebe ek olarak ADRESİ de sorar.
- **Devam yeni koşu AÇMAZ, aynı koşuya eklenir.** Tohum, o adrese BU koşuda
  izlenerek gelen paradır. Bir insan kararıdır: eski sebep, kim ve ne zaman
  `stats.devamlar`a ve denetim kaydına yazılır. Devam hatası koşunun tamamını
  "hata"ya ÇEKMEZ. Koşu özeti devamdan sonra VERİTABANINDAN yeniden sayılır.
- **İşlemden takip başlatılabilir ve kök ADRESİ İNSAN seçer.** `/islem/[chain]/[hash]`
  her ALICI için takip düğmesi verir; gönderene konmaz, çünkü tohum köke GİREN
  paradır. **Tohum boş çıkarsa koşu SESSİZ kalmaz** (`stats.tohum`, `tohumSorunu`)
  — boş grafın üç sebebi var: kök taranamadı, tohum işlemi para getirmiyor,
  gerçekten hareket yok.
- **İşlem hash'inde zincir belirsizken de link VERİLİR, adreste verilmez.** İşlem
  sayfası zincire gidip sorar ve "bakıldı, yok" diyebilir; adres sayfası arşivden
  okur ve orada "kayıt yok" bakılmamış bir yeri temiz gösterirdi.
- **Düğüm sınırında hedef düğüm YAZILIR, kenar ucu boşta bırakılmaz.** Kenar hedeften ÖNCE
  yazılıyor ve sınıra takılınca hedef hiç yazılmıyordu: koşu 9'da 1.342 kenarın 10'u grafta
  olmayan adrese gidiyor, başlık "1.342 hareket" defter "1.332" diyordu (saf katman ucu olmayan
  kenarı şerit yapamıyor). Hedef artık `dugum_siniri` sebebiyle bir SINIR düğümü olarak yazılır ve
  TARANMAZ. Ölçüldü (maxDugum 8, aynı kök): **8 düğüm / 23 kenar / 5 ucu boşta → 11 düğüm / 23
  kenar / 0 ucu boşta.** Kenar sayısı değişmedi — hareket uydurulmadı, eksik UÇ yazıldı. **Düğüm
  bütçesi TARANAN düğümü sınırlar**; sınır düğümleri ona ek gelir ve sebep sayımında görünür.
- **Sıçrama/düğüm/dallanma bütçesi EKRANDAN gelir** (`esikleriDogrula`, saf ve
  testli, sunucuda da koşar). Sınırlar GENİŞ (hop 1–50, düğüm 1–10.000) ve amaç
  makineyi korumak değil anlamsız girdiyi kapıda tutmak. **Hatalı değer sessizce
  varsayılana DÜŞMEZ, hata olur** — 500 isteyip 300 koşan bir rapor kendi
  yazdığı sınırla çelişir.
- **Tutar aralığı filtresi ŞERİT TOPLAMINA bakar, SEÇİLİ VARLIĞIN biriminde.**
  Çift kaydırıcı logaritmik; elle giriş Türkçe defter düzenini ve "10b", "2,5mn"
  kısaltmalarını anlar, çözülemeyen girdi 0 değil HATA olur. Varlık değişince
  kendi en küçük–en büyük şeridine sıfırlanır. Sayaç yalnızca ÇİZİLEBİLEN
  çiftleri sayar. (`tutarAraligiylaAyikla`)
- **Geri dönen para diyagramın ALTINDAN dolaşır**, şeritler İÇ İÇE yerleşir ve
  kenarlıdır (aynı x'e düşen dikey bacaklar üst üste biniyordu).
- **Şerit ipucu ilk/son hareketin zamanını (TSİ) söyler; şerit seçilince defter
  hash'leri gezgine bağlar.** Gezgin adresleri tek yerde (`lib/gezgin.ts`);
  tanınmayan zincirde bağlantı UYDURULMAZ, `rel="noopener noreferrer"` ile açılır.
- **Tıklanan şerit köke kadar geldiği yolla öne çıkar** (`seritYolu`); geri
  dönenler yola alınmaz.
- **Defter şerit başına TEK satırdır**, şerit seçilince hareketlere açılır
  (1.342 hareket → 98 satır).
- **Gizleme yalnızca GÖRÜNÜMDÜR:** ölçek kalan akışa göre kurulur ama özet ve
  defter koşunun tamamını söyler. Kök gizlenemez; seçim rapora girmez.
- **Çizilen düğüm sayısı 100 ile sınırlı**, kırpılan kısım "ve N düğüm daha" diye
  SAYILIR.
- **Durdurulan koşu "bitti" DEĞİL "durduruldu"dur** ve eksik olduğunu söyler.
  Worker ilerlemeyi ve iptal bayrağını `jsonb_set` ile yazar (Prisma'nın Json
  güncellemesi alanın TAMAMINI değiştirip `devamlar`ı ezerdi). Yoklama saniyede
  en çok bir kez.
- **Kuyruk çağrısı SÜRE SINIRIYLA yapılır ve başarısızsa durum GERİ ALINIR**
  (BullMQ `maxRetriesPerRequest: null` sonsuza bekliyordu ve koşu 9 "kuyrukta"
  takılı kalmıştı): 5 sn → 503, durum eski hâline döner. **Yerel dev
  sunucusundan devam/durdur/yeni koşu YAPILAMAZ** — bunlar 1337'de çalışır.

## Kuyruk ve worker

- **Kuyruk adında ve İŞ KİMLİĞİNDE `:` yasak** (BullMQ reddediyor, hata
  kullanıcının önünde çıkıyor). Ayraç `-`; testi var.
- **Aynı anda birden çok worker süreci ÇALIŞTIRMA.** Sekiz worker birikti ve bir
  tur ESKİ KODLA koştu; "filtre çalışmıyor" sanıldı. `pkill -f` tsx'in node'unu
  yakalamıyor:
  ```powershell
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like '*worker*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  ```
- **İptal tarama SIRASINDA yoklanır, adresler arasında değil** (`iptaleDuyarli`): gelen iptal
  hem HTTP isteğini hem GERİ ÇEKİLME UYKUSUNU keser. `http.ts`in uykusu iptal edilemezdi ve
  `Retry-After` 60 sn'ye çıkabiliyor — "durdur" o kadar bekliyordu. Ölçüldü (sahte 429,
  `Retry-After: 30`): **30.000 ms → 81 ms**; test düzeltmesiz koşturulunca DÜŞÜYOR.
- **Takip koşusu yeniden DENENMEZ** (`attempts: 1`): yarım koşunun düğümleri
  yazılmış oluyor, ikinci deneme üstüne farklı bir grafla gelir.

## Ölçme ve görev disiplini

- **Kodu okuyarak değil ÇALIŞTIRARAK doğrula.** Bu projedeki ciddi kusurların
  hepsi gerçek veriyle koşturulunca çıktı; hiçbiri tip kontrolünden geçmedi diye
  yakalanmadı.
- **"N kayıt yazıldı" bir doğrulama değildir** — sayının yanında bir örneğe elle bak.
- **Dışarıdan görünmesi gereken bir şeyi kendi görüşünle doğrulama**; kullanıcının
  ya da runner'ın gördüğüne bakılır.
- **Bir görev, kendinden öncekinin ürettiği veriyi EKRANDA gösterebiliyorsa
  bitmiştir.** "Yazıldı ama hiçbir sayfa sormuyor" bitmiş sayılmaz.
- **Ölçümü olmayan madde yazılmaz.** Her sayı yanında yeniden üretim komutuyla durur.

## Güvenlik

- **Oturum kullanıcıyı GÖMMEZ:** kapı her API çağrısında kaydı okur ve **rolü
  jetondan değil kayıttan** alır.
- **Kapı kendi çıkışını kapatamaz** (ilk girişte şifre değiştirme zorunluluğu
  şifre değiştiren ucu da engelleyip hesabı kilitlemişti). `tests/kapilar.test.ts`.
- **Üretilen şifre yalnızca yanıtta bir kez döner.**
- **Kullanıcı silinmez, pasife çekilir** (denetim kaydı ona atıf yapıyor). Son
  aktif yönetici kapatılamaz; kimse kendi rolünü düşüremez.

## Kalan kararlar (2026-09-29, ajan önerisiyle kapatıldı)

Kullanıcı: "beklediğin kararlar için önerdiğin gibi devam et." Altısı da geri
alınabilir; itiraz gelirse kural değişir. Beşi uygulandı; kalan madde bir karar
değil bir TUTUM (arayüzün tembel elden geçirilmesi).

- **Takip adresin TÜM GİRİŞLERİNDEN başlar; tek işlemden başlatmak `/islem`
  sayfasının işidir.** Tarih aralığıyla tohumlama YAZILMAYACAK — gerçek bir
  vaka istemeden yazılan parametre, denenmemiş bir parametredir.
- **Vaka zorunluluğu kalkıyor: koşu başlatılırken yoksa "karalama" vakası
  otomatik açılır.** Nihai amaç "adresi yapıştır, diyagramı al"; araya form
  koymak onu bozuyordu. **Karalama vakasından RAPOR alınamaz** — rapor bir
  dosyaya aittir ve adlandırma o anda istenir.
- **Fiyat İKİ kurla yazılır:** "işlem günü X ₺ (rapor günü Y ₺)" ve hangi kurun
  kullanıldığı satırda durur. Tek sayı, hangi soruya cevap verdiğini gizler.
  Kaynak: TCMB (USD/TRY, resmî) + CoinGecko (token→USD). **1 USDT ≈ 1 USD
  varsayılmaz, ölçülür** — depeg günleri gerçek.
- **Raporun kanonik hash'i JSON KANIT PAKETİNİN hash'idir; PDF ondan üretilir ve
  kendi hash'i ikinci satır olarak yazılır.** PDF yazı tipine ve sürüme göre bayt
  bayt değişir; dondurulması gereken şey KANITTIR, sayfa düzeni değil. Bu karar
  ilk rapordan önce verilmek zorundaydı: verilmiş bir rapordaki hash geri alınamaz.
- **İzleme 15 dakikada bir bakar, EŞİK ÜSTÜ harekette mesaj atar, küçükler günlük
  özete girer.** Eşik varlık ve adres bazında ayarlanır. **YAZILDI ve ölçüldü
  (2026-10-04)** — kuralları *İzleme (eşik · günlük özet)* başlığında, kurulumu
  `/izleme` ekranında. Kalan tek adım bu depoda değil: `deploy-watcher`
  akışının sunucuda bir kez koşması.
- **Arayüzün geri kalanı (adres sayfası, ana sayfa) şikâyet ya da ihtiyaç
  geldikçe elden geçirilir.** Peşinen tasarım turu yok; ölçütü etiket incelemeyle
  aynı: bedeli, bir iş o sayfada tökezlediğinde ödenir.
