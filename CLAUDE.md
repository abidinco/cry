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
alınabilir; itiraz gelirse kural değişir.

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
  özete girer.** Eşik varlık ve adres bazında ayarlanır. Servisin kurulumu
  arayüzüyle birlikte (Görev 10) — kurulu ama sorulmayan bir servis, `/etiket`ten
  önceki etiketlerin aynısı olurdu.
- **Arayüzün geri kalanı (adres sayfası, ana sayfa) şikâyet ya da ihtiyaç
  geldikçe elden geçirilir.** Peşinen tasarım turu yok; ölçütü etiket incelemeyle
  aynı: bedeli, bir iş o sayfada tökezlediğinde ödenir.
