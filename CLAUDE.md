# cry — proje kuralları

Kripto para akışını takip eden analiz aracı. Next.js 15 + TypeScript +
Prisma/PostgreSQL + BullMQ; testler Vitest. Ayrıntı: [README](README.md),
[PRD](docs/prd.md), [devir dosyası](docs/proje-devir.md).

Bu dosya **kararları ve acı deneyimle öğrenilenleri** tutar. Dört ayrı
dosya, dört ayrı soru — biri ötekinin yerine yazılmaz:

| Dosya | Cevapladığı soru |
|---|---|
| **CLAUDE.md** (burası) | Karar VERİLDİ; kural bu. |
| [docs/bekleyen-kararlar.md](docs/bekleyen-kararlar.md) | Ölçüldü ama TERCİH bekliyor; cevabı insan verir. |
| [docs/cozulmesi-gerekenler.md](docs/cozulmesi-gerekenler.md) | Ne yapılacağı belli, YAPILMAMIŞ. |
| [docs/oneriler.md](docs/oneriler.md) | Yapılsa faydalı; sıralama fayda/maliyet. |

Bir madde karara bağlanınca bekleyenlerden **silinir** ve kuralı buraya
yazılır. Aynı şey iki dosyada durursa ikisi zamanla ayrışır ve hangisinin
güncel olduğu sorulamaz hâle gelir.

## Çalışma düzeni

- **`git push` YALNIZCA kullanıcı açıkça "PUSH" dediğinde.** Push, GitHub
  Actions üzerinden hem Hetzner'a hem PC'ye deploy tetikliyor. Bir "PUSH"
  onayı yalnızca o anki commit(ler) için geçerlidir.
- Commit mesajları [Conventional Commits](https://www.conventionalcommits.org/),
  **İngilizce**, önemsiz olmayan değişiklikte gövdeli.
- **Push'tan önce CI'ın KENDİ komutlarını çalıştır:** `npm run typecheck` ve
  `npm test`, çıkış koduyla birlikte. Proje proje `tsc` çalıştırmak yetmez —
  kök derleme `tests/` klasörünü de görüyor ve farklı bir dosya kümesiyle
  kırılabiliyor (bir kez kırıldı).
- Ortam dosyası depoda DEĞİL: **`C:\srv\cry\.env`** (PC) ve `/srv/cry/.env`
  (sunucu). Depo public; hiçbir sır commit'e girmez.

## Yerel çalışma ortamı — ölçülmüş tuzaklar (2026-09-14/15)

Her madde bu oturumlarda bir kez YAŞANDI ve zaman kaybettirdi.

- **Açılış OTOMATİKTİR** (kullanıcı isteği 2026-09-15). `cry-baslangic`
  zamanlanmış görevi oturum açılışından 30 sn sonra `deploy/pc/baslangic.ps1`'i
  çalıştırır: Docker Desktop'ı açar ve motoru bekler, durmuş cry
  konteynerlerini `docker start` eder (`compose up` YAPMAZ — yığını runner'ın
  checkout'u tanımlar), runner ve WireGuard servislerini DENETLER (başlatmak
  yönetici ister), 1337 sağlığına bakar, 3005 dev sunucusunu başlatır. Günlük:
  `C:\srv\cry\baslangic.log`. Tekrar çalıştırmak zararsız; elle:
  `powershell -NoProfile -ExecutionPolicy Bypass -File deploy\pc\baslangic.ps1`.
  Kurulum/kaldırma: `deploy\pc\kur.ps1 [-Kaldir] [-GelistirmeYok]`. Kurulum
  Docker Desktop'ın kendi `AutoStart` ayarını da açar — ölçüldü, `False`'tu;
  "Windows başlangıcında Run anahtarı var" onun açılacağını GÖSTERMİYORDU.
  Betik gövdeleri SAF ASCII (PS 5.1 BOM'suz dosyayı ANSI okur). Docker'ın
  JSON ayarı metin olarak tek değer değiştirilerek, BOM'suz yazılır
  (`ConvertTo-Json`+`Set-Content -Encoding UTF8` BOM ekler ve biçimi bozar).
  Denendi: elle durdurulan `cry-worker` betikle geri kalktı; görev elle
  tetiklenince sonuç 0.
- **Önce Docker Desktop açık mı bak.** Kapalıyken bütün yığın (db, redis,
  worker, web:1337) düşer ve belirti "sayfa hiç açılmıyor"dur — kod değil.
  Kontrol: `docker ps`; açmak: `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`.
- **Yerel dev sunucusu port 3005'tir, 3000 DEĞİL.** 3000 hafıza projesinin;
  onun service worker'ı `localhost:3000` kökenine kayıtlı kalıyor ve cry'ın
  isteklerini yakalayıp `sw.js no-response` + webpack `'call'` hataları
  üretiyordu. `apps/web/package.json` → `next dev -p 3005`.
- **Dev sunucusunu preview aracıyla değil AYRIK süreç olarak başlat.**
  Preview sunucusu turun sonunda kapanıyor; kullanıcı linke tıkladığında
  sunucu çoktan yok. Çalışan yol:
  `Start-Process cmd.exe -ArgumentList "/c","npm.cmd run dev > .dev-3005.log 2>&1" -WorkingDirectory <cry> -WindowStyle Minimized`.
  Günlük `.dev-3005.log` (gitignore'da).
- **Kullanıcının PowerShell'inde `npm` ÇALIŞMAZ**, `npm.cmd` çalışır: yürütme
  ilkesi `npm.ps1`'i reddediyor. İlke güvenlik ayarıdır, değiştirilmez.
  `gh` de kullanıcının PATH'inde yok: `%LOCALAPPDATA%\ghcli\bin\gh.exe`
  (Bash aracında bulunuyor; `abidinco` hesabıyla giriş yapılı, 2026-09-15).
- **Yerel betiklerin ortamı İKİ dosyadan:**
  `node --env-file=.env --env-file=apps/web/.env.local --import tsx <betik>.mts`.
  Kök `.env` konteyner adlarını taşıyor (`db:5432`); `.env.local` onları
  `127.0.0.1:15432`'ye çeviriyor. Üst düzey `await` için dosya `.mts` olmalı.
  **`TRONSCAN_API_KEY` depo kökündeki `.env`'de** (gitignore'da), `C:\srv\cry\.env`'de
  YOK (ölçüldü) — değer asla ekrana basılmaz.
- **Redis yalnızca bu makineye yayınlı: `127.0.0.1:16379`** (kullanıcı kararı
  2026-09-15; önce hiç yayınlanmıyordu). Yerel dev sunucusu `.env.local` →
  `REDIS_URL=redis://127.0.0.1:16379` ile kuyruğa ulaşır. **DİKKAT: bu CANLI
  kuyruktur** — 3005'ten başlatılan koşu, devam ya da durdurma canlı worker
  tarafından işlenir ve canlı veriyi değiştirir (veritabanı zaten aynı). Önce
  Redis kapalıyken 3005'ten gönderilen bir devam koşu 9'u "kuyrukta"da takılı
  bırakmıştı; kuyruk çağrıları bu yüzden 5 sn süre sınırlı (`zamanAsimi`).
  Yoklama: `docker port cry-redis`.
- **Canlı yığında bir betik çalıştırmak:** worker konteynerine kopyala ve
  orada koş — Redis'e ve veritabanına oradan erişiliyor:
  `docker cp x.mts cry-worker:/app/apps/worker/x.mts && docker exec -w /app/apps/worker cry-worker npx tsx x.mts`,
  sonra dosyayı sil. **Git Bash `docker exec -w /app/...` yolunu Windows
  yoluna çeviriyor** (`C:/Program Files/Git/app`): önce `export MSYS_NO_PATHCONV=1`.
- **İkinci bir worker SÜRECİ başlatma** (Kuyruk ve worker → aynı kural).
  Yeni motor kodunu push'tan önce denemek için `takipKos`/`takipDevam`
  işlevini bir tsx betiğinden DOĞRUDAN çağır: kuyruğu tüketmez, canlı
  worker'la yarışmaz. Kuyruğa atılmayan bir koşu kaydı açıp onun üzerinde dene.
- **Deneme koşusu açıldıysa iş bitince SİL** (kullanıcı isteği 2026-09-15:
  "deneme koşularını sil"). `delete from trace_runs where id in (…)` düğüm
  ve kenarları cascade ile götürür; önce raporu olmadığını doğrula. Denetim
  kaydındaki `takip.baslat` satırları kalır, amacı `meta.amac`ta yazılı.
- **Oturum çerezi localhost'ta PORTLAR ARASINDA paylaşılır.** Kullanıcı
  1337'de giriş yaptıysa aynı tarayıcıda 3005 de oturumlu açılır — oturumlu
  sayfayı gözle doğrulamanın yolu bu (ajan parola girmez). Kullanıcı uygulama
  içi tarayıcıda (Browser pane) giriş yapmıştı.
- **Unutulan şifre:** cry kökünden `npm.cmd run sifre:sifirla`; kullanıcı
  adı `abidin`. Şifre gizli girdiyle sorulur — ajan girmez, kullanıcı girer.
- **Uzun düzenleme betiklerini kabuk heredoc'una gömme.** İçinde tırnak ve
  `${}` olan çok satırlı bir Python düzenlemesi Bash'te "unexpected EOF"
  verdi; betik önce scratchpad'e dosya olarak yazılıp öyle çalıştırılır.
  Satır sonları KARIŞIK (CRLF ve LF): düzenleme betiği okurken normalleştirir,
  yazarken dosyanın kendi satır sonunu korur — yoksa eşleşme sessizce ıskalar.
- **Oturumlu sayfanın yerine geçen ölçüm:** giriş yoksa bileşenin saf
  katmanı (`lib/akis.ts`) gerçek koşu verisiyle SVG'ye çizdirilip bakılır;
  CSS değişikliği aynı sınıflarla kurulmuş statik bir kopyada ÖLÇÜLÜR
  (`scrollWidth - clientWidth`). "Göremedim" demek yerine ne ölçüldüğü söylenir.

## Blok indeksi — kapsam ve motor KARARA BAĞLANDI (2026-09-16)

Plan, ölçümler ve aşamalar
[docs/yol-haritasi-blok-indeks.md](docs/yol-haritasi-blok-indeks.md).
Kullanıcının verdiği dört karar:

- **Motor: ClickHouse** — kendi makinede, Docker'da; Apache 2.0 ve ÜCRETSİZ
  (ücretli olan yalnızca ClickHouse *Cloud*'dur, ve bu bir kez yanlış
  bilindiği için buraya yazılıyor). Ölçümde Parquet'le başa baş
  (34,5–52,1 ⟷ 39,2–55,6 bayt/satır, ikisi de 10–70 ms); kararı İŞLETİM
  verdi: her şey tek makinede kalıyor, uzaktaki site tünelden sorguluyor,
  canlı uç sürekli yazıyor ve ek servis sorun değil. Postgres 324,5
  bayt/satır ve yoğun adreste ~490 ms ile elendi.
- **Eşiksiz** ve **tam geçmiş** hedefleniyor (9,7 Mr satır, 335–505 GB);
  disk D:'nin tamamı. Bugün 198 GB boş, kullanıcı ~267 GB daha açacak.
  Kötümser sınırda bu bütçe de yetmez, o yüzden sıra **önce canlı uç,
  geçmiş geriye doğru** ve **dolan disk bir DURMA ölçütüdür.**
- **Veri D:'de tutulur** — volume ile DEĞİL, Docker'ın veri diskini D:'ye
  alarak (aşağıda). ÖLÇÜLDÜ: Windows klasörünü bağlamak ClickHouse'u tamamen
  kırıyor — parçayı `tmp_insert_…` diye yazıp rename ediyor, 9p
  reddediyor, ilk INSERT HTTP 500. (Hız da 334 MB/s ⟷ 2,5 GB/s.)
- **18123 (HTTP) yalnızca WireGuard ağına açık**: `cry-clickhouse-wg`
  güvenlik duvarı kuralı, kaynak 10.99.0.0/24 — web'in 1337'siyle aynı
  desen. Varsayılan `default` kullanıcısı parolasız gelir ve kapatıldı;
  kimlik `.env`de (`CLICKHOUSE_*`), depoda değil.

Okuyucunun (B2, 2026-09-16) ölçülerek konan iki kuralı:

- **Blok kapsamı AYRI bir tablodadır (`blok_okundu`), kursör sayısında değil.** Okunan her
  blok — 0 transferli olan dahil — bir satır alır ve o satır transferlerden SONRA yazılır.
  `blok_indeks`te satırı olmayan blok tek başına "transfer yok" mu "okunmadı" mı
  söyleyemez; yeniden başlatma ve boşluklar kapsam tablosundan HESAPLANIR. Ölçüldü: tur
  200. blokta zorla öldürüldü, kapsam 200 blok ve satırlar kapsamın saydığıyla birebir;
  devam turu kalan 800'ü okudu.
- **Blok indeksini SAYAN sorgu `FINAL` kullanır.** ReplacingMergeTree mükerreri birleşmede
  siler, yazmada değil: 100 blok yeniden yazılınca ham `count()` 323.170, `FINAL` 292.641.
  `FINAL`sız bir sayım aynı transferi iki kez gösterir.
- **Bir bloğun işlem bilgisi, işlemleriyle BİREBİR eşleşmeli; eşleşmeyen blok HATADIR** (B3 kapısı,
  2026-09-17). Anahtarsız düğümler bilgisini tutmadıkları blokta HTTP 200 + boş dizi döndürüyor
  (publicnode 92 günden eskide hepsinde, tronstack 2018'de bir blokta) ve o blok hatasız "0 USDT"
  yazılırdı. TronGrid'de 180/180 blok eşleşti; kural `bloktanSatirlar`'da, testli. **Kaynağın şekli
  doğru diye içeriği tam değildir** — bir kaynak eklenirken onu TronGrid'le satır satır karşılaştır.

Geçmiş doldurma (B3) — kullanıcı kararı 2026-09-17:

- **Geçmiş ÜCRETSİZ kaynaklardan, uçtan GERİYE doğru dolar; dolan disk durdurur.** BigQuery (hesap +
  bilinmeyen maliyet) ve "yalnızca son 92 gün" seçilmedi. Doldurucu `apps/blok-okuyucu/src/doldur.ts`.
  Ölçülen: tam geçmiş ~10,8 Mr satır, 63 B/satırla bütçeyi aşıyor. Hız uçtan 92 gün geriye ~12
  blok/sn, daha eskide ~6 blok/sn. Ayrıntı yol haritası → B3.
- **TronGrid doldurmada ÖNCELİKSİZDİR — vaka > indeks.** Kota adres taramasıyla paylaşılıyor
  (worker 10 istek/sn, ölçülen tavan ~12,5; 60 ms kapıda 429 yağıyor). Doldurucu TronGrid'e yalnızca
  `adres-indeksle` ve `takip-kosusu` kuyrukları boşken gider ve kuyruğu okuyamazsa hiç gitmez.
- **Doldurucu kuyruk işi DEĞİL, tek bir ayrık süreçtir.** Kaldığı yeri kapsam tablosu biliyor. Kuyruğa
  bağlansaydı tüketicisi ikinci bir worker süreci olurdu. Durdurmak için süreci öldürmek zararsız:
  ölüm testi B2'de yapıldı, yarım blok kalmıyor. Aynı komut kaldığı yerden devam eder.
- **İki kaynak aynı bloğa farklı satır verirse blok YAZILMAZ.** Hangisinin doğru olduğu bilinemez;
  boşluk kalır ve raporlanır (her 500. blok çapraz denetlenir).

Canlı uç (B4) — ölçülerek konanlar (2026-09-17):

- **Canlı uç konteynerdir (`cry-blok-okuyucu`), kaynağı publicnode'dur, TronGrid yedektir.** 10 dk'lık kapıda
  publicnode'un ucu hiç geri gitmedi ve 188 blok TronGrid'le satır satır aynıydı. tronstack uçta işe yaramıyor:
  yeni blokların bilgisi 30 sn sonra da eksikti.
- **Yeni kesinleşen blokta işlem bilgisi EKSİK gelebilir** (188'de 4, 3–13 sn'de tamamlandı). Bu bir boşluk
  değildir; okuyucu bekleyip aynı bloğu yeniden okur. **Canlı uç kursörü okunmamış bloğun üstüne ATLAMAZ**
  (`bitisikKursor`): ilerleme durur, gecikme büyür ve günlükte görünür.
- **Her PUSH deploy'u yığını ClickHouse ve Postgres DAHİL yeniden oluşturuyor** (ölçüldü: makinedeki
  doldurucu "fetch failed" ile durdu). Bu yüzden blok indeksine yazan her süreç bağlantı ve 5xx hatalarını
  10 dk yeniden dener (`geciciyseTekrarla`, `Yazici`); kalıcı hata (4xx) hâlâ durdurur.
- **Yerelde imaj derlerken depo köküyle `docker build` YAPMA.** `.dockerignore` yok ve `COPY . .` Windows
  `node_modules`'ünü (Windows yollu sembolik bağlar) imaja taşıyor; paket bulunamıyor. Temiz kopya:
  `git ls-files -co --exclude-standard -z | tar --null -T - -cf - | tar -xf - -C <klasör>`. Depo kökündeki
  `.env` de konteynere UYMAZ (Postgres bağlantısı farklı, TronGrid anahtarı yok); deneme konteyneri
  `--env-file C:\srv\cry\.env`, `--network cry_default` ve `-e CLICKHOUSE_URL=http://clickhouse:8123` ile koşar.

Motor ve arayüz (B5) — kullanıcı kararları 2026-09-17:

- **Giden yön `kimden` sıralı İNCE AYNADAN okunur** (`blok_indeks_giden`, MV ile dolar). Ana tablo `kime`
  sıralı olduğu için giden sorgu tam tablo taraması yapıyordu: 63 Mn satırda `FINAL` ile ~600 ms, tam geçmişe
  izdüşümü ~100 sn. Aynada 28 ms. İnce: tx yerine `cityHash64(tx)`, blok yok → 28,2 B/satır (+%52; tam kopya
  +%97). Disk bedelini kullanıcı kabul etti ("daha geniş disk alanı sağlayacağım"). Yazan kod aynayı BİLMEZ.
  **MV'den önce yazılmış satır aynaya kendiliğinden gelmez** (`scripts/blok-indeks-ayna-doldur.mts`).
- **Keşifte tutar eşiği YOK; toz AYRI SAYILIR ve GÖSTERİLİR.** Kullanıcı: "0 eşiksiz yap. toz tutarları ayrı
  bir şekilde göstersin. ama göstersin." Toz = <1 TRX/USDT (`TOZ_SINIRI`). Ölçüldü: bir adrese gönderen 3.069
  adresin 3.053'ü yalnızca toz — adres zehirleme sayıyı şişiriyor, ama sayı ELENMEZ, yanında yazar.
- **Blok indeksinin her cevabı bir PENCEREYE bağlıdır** (boşluksuz son aralık, `pencereOku`). Pencere ölçümü
  bir ALT SINIRDIR: 9,7 günlük pencerede arşiv keşfinin 17 etiketinden 16'sı eşiğin altında kaldı. Blok
  keşfi aday EKLER, var olanı düşürmez. Kaynağı `kesif_blok`tur, `kesif` değil. Zaten doğrulanmış ya da arşiv
  keşfinin yazdığı adrese aday yazmaz. Arşivle sınırlanır: pencerede ≥50 göndericisi olan zincir adresi
  111.235.
- **Günlük damgası saat dilimini SÖYLER** (`ts()`, `apps/blok-okuyucu/src/yazici.ts`): yerel saat + fark.
  Damga UTC'ydi ve bunu söylemiyordu; makine TSİ. İki ayrı denetim aynı tuzağa düştü (2026-09-18): biri
  "3 saattir ilerlemiyor" deyip sapasağlam çalışan doldurucuyu öldürüp yeniden başlattı. **Bir sürecin
  takılıp takılmadığı damgayla değil İLERLEMEYLE ölçülür:** günlüğün boyutu/satırı 90 sn'de artıyor mu.
- **Ulaşılamayan blok indeksi "hareket yok" DEĞİLDİR.** Adres sayfası `bakilamadi` der; pencerede hareketi
  olmayan adres için de "pencere dışı için bir şey söylenemez" yazar.
- **Web, `@cry/blok-indeks`i `extensionAlias` ile derler.** Paket NodeNext düzeninde (`./istemci.js` → `.ts`);
  tsx ve tsc bunu çözüyor, Next'in webpack'i çözmüyor: `next build` "Module not found: ./sema.js" ile düştü.
  Yerel typecheck ve testler GEÇİYORDU; hata ancak imaj temiz kopyada derlenince görüldü. Web'e yeni paket
  bağlanınca push'tan önce imaj derlenir (CLAUDE.md → B4 temiz kopya yolu).

Sabit kalan iki kural:

- **İki katman: blok indeksi ADAY üretir, adres taraması HÜKÜM.** Blok
  indeksi eşikli olabilir; ama eşikli bir indeks "bu adrese başka para
  girmedi" dedirtirse yanlıştır. İz, takip ve rapor YALNIZCA eşiksiz adres
  taramasından beslenir.
- **Önce ölçüm kapısı.** Her aşama (B0–B7) bir ölçümle açılır; kapının
  cevabı gelmeden sonraki aşamanın kodu yazılmaz. "Arşiv düğümü imkânsız"
  kararı hâlâ geçerli (2,9–3,6 TB ⟷ 465 GB); blok indeksi düğüm değil,
  seçilmiş transferlerin kendi tablomuzdur.

### Docker'ın diski D:'de — doğru AYAR ANAHTARIYLA (2026-09-16)

- **WSL2'de disk yerinin anahtarı `CustomWslDistroDir`'dır, `DataFolder`
  DEĞİL.** `DataFolder` Hyper-V motorunun anahtarı (`vm-data`); WSL2'de hiçbir
  şey yapmaz. İlk denemede `settings-store.json`a `DataFolder` yazıldı ve
  "Docker ayarı yok sayıyor" sanıldı — yanlış teşhisti. Backend API'si
  (`\\.\pipe\dockerBackendApiServer`, `GET /app/settings`) iki alanı ayrı
  gösteriyor: `vm.resources.dataFolder` ve `vm.resources.wslDataFolder`;
  arayüzün "Disk image location"ı ikincisidir. Kontrol bu uçtan yapılır,
  `settings-store.json`a bakarak değil.
- **Bugünkü durum:** `"CustomWslDistroDir": "D:\\Docker\\wsl"` (Docker
  kapalıyken, metin olarak, BOM'suz yazıldı). Ölçüldü: API
  `wslDataFolder = D:\Docker\wsl` diyor, `D:\Docker\wsl\disk\docker_data.vhdx`
  WSL tarafından KİLİTLİ (kullanımda), C:'de `wsl\disk` klasörü YOK ve Docker
  yeni disk açmadı; 5 konteyner sağlıklı, veri tam (Postgres 5/86.674/31.988,
  ClickHouse 292.641 satır / 1.000 blok). `docker-desktop` sistem dağıtımının
  kaydı (`wsl\main`, 96 MB) C:'de kalıyor.
- **Önceki geçici çözüm NTFS junction'dı** (`%LOCALAPPDATA%\Docker\wsl\disk`
  → `D:\Docker\wsl\disk`) ve çalışıyordu; artık gereksiz, `disk-junction-yedek`
  adıyla duruyor (geri dönüş: adını `disk` yapıp anahtarı silmek). Yedekler
  `D:\Docker\yedek-202609162330\` (ayar dosyası + Lxss kaydı).
- **Dosyalar elle taşınıp WSL kaydındaki `BasePath` değiştirilirse** Docker
  açılışta kaydı C:'ye GERİ yazıyor ve C:'de BOŞ yeni bir veri diski açıyor —
  yığın "yok olmuş" görünür, veri yerindedir. Başarısız `wsl --manage --move`
  da adsız, `BasePath`'i D:'yi gösteren artık bir Lxss kaydı bırakmıştı;
  silindi.
- **Taşımadan ÖNCE disk KÜÇÜLTÜLÜR.** VHDX kendiliğinden küçülmüyor: içindeki
  veri 6 GB iken dosya 125 GB yer kaplıyordu. Sıra: `wsl -d docker-desktop -e
  fstrim -av` → `docker desktop stop` + `wsl --shutdown` → diskpart `compact
  vdisk` (YÖNETİCİ) → 125 → 9,3 GB. `wsl --manage … --set-sparse`
  `--allow-unsafe` istiyor, kullanılmadı.
- **Docker'ı ZORLA kapatma.** `Stop-Process -Force`, `%LOCALAPPDATA%\Docker\run`
  altında silinemeyen soket dosyaları bırakıyor ve Docker "Inference manager"
  hatasıyla açılıp kapanıyor. Onarım klasörü yeniden adlandırmak (silinmiyor).
  Kapatma `docker desktop stop`, açma `docker desktop start`.
- **Duraklatılmış Docker deploy'u DÜŞÜRÜR.** Push anında Docker "manually
  paused" idi; deploy 17 sn'de "Docker motoruna ulaşılamıyor" diye bitti, kod
  sağlamdı. `gh run rerun <id>` aynı commit'i yeniden dağıtır — push zaten
  onaylanıp yapıldığı için ayrı bir PUSH gerekmez.

### Sessiz yanlış cevap: DuckDB'nin Parquet BLOB bloom filtresi

Motor seçilmese de bu ölçüm kalıcı bir ders: DuckDB 1.5.5, BLOB sütunu için
Parquet'e bozuk bir bloom filtresi yazıyor. 19 Mn satırda `kime = <adres>`
süzgeci 165 satır grubunun 165'ini eliyor ve **hatasız 0 satır** dönüyor;
aynı değer aralık süzgeciyle 560.160 satır veriyor. 397 binlik küçük
dosyada hata GÖRÜNMÜYOR. Bu yüzden bir motor seçilince ilk yazılacak test,
bilinen bir adresin sayısını **iki farklı yoldan** (süzgeçli ve süzgeçsiz)
alıp karşılaştıran testtir.

## Windows self-hosted runner — üç tuzak

1. **`shell: bash` WSL'in bash'ine çözülüyor** (`C:\WINDOWS\system32\bash.EXE`)
   ve orada C: sürücüsü `/mnt/c` altındadır; Windows yolları sessizce
   bulunamaz. Adımlar PowerShell ile yazılır.
2. **Adım gövdeleri SAF ASCII.** Runner betiği BOM'suz UTF-8 yazıyor, Windows
   PowerShell 5.1 BOM'suz dosyayı ANSI sanıyor; Türkçe karakterler ayrıştırma
   hatası veriyor. Türkçe yalnızca YAML alanlarında.
3. **Yürütme ilkesi `Restricted`.** Runner adımı `.ps1` dosyasına yazıp
   nokta-kaynaklıyor; ilke bunu reddedince süreç **çıktı üretmeden** exit 1
   veriyor. Bypass iş düzeyinde verilir, makine geneli ayar değiştirilmez.

Ayrıca **compose proje adı sabittir** (`name: cry`): runner kendi çalışma
klasöründen koşuyor ve ad dizinden türeseydi ikinci bir proje aynı container
adlarını isterdi.

## Veri kuralları

- **Tutar HAM TAM SAYIDIR** (string olarak taşınan bigint). `Number`'a
  uğrayan bir tutar rapora `1.15e+53` diye düşer — zincirde 2^256-1 değerleri
  gerçekten var, canlı veride görüldü. Ondalığa çevirme yalnızca gösterim
  sınırında, metin üzerinde.
- **"Yok" ile "bakılamadı" AYRI cevaplardır.** İndeks durumu, yoklama sonucu
  ve etiket doğrulaması bu ayrımı taşır. İkisini aynı kovaya koymak,
  bakılmamış bir yeri temiz gösterir.
- **Her etiket kaynağını, güven skorunu ve doğrulama tarihini taşır.**
  Doğrulanmamış etiket rapora ya hiç girmez ya da açıkça öyle girer.
- **Kaynağın HATASI veri gibi görünebilir.** Etherscan hatayı HTTP 200 ile
  döndürüp mesajı `result` alanına metin olarak koyuyor; `!!result` kontrolü
  bunu "işlem bulundu" saydı ve gerçek bir TRON işlemi "BSC'de var" diye
  raporlandı. Kaynak yanıtının ŞEKLİ doğrulanır, varlığı değil.
- **Hareketin indeksi sayfa konumundan türetilmez.** Aynı hareket başka bir
  turda başka konuma düşer ve `(chain, txHash, index)` tekilliği onu göremez
  (ölçüldü: 201 mükerrer öbek). İndeks, hareketin İŞLEM İÇİNDEKİ sırasıdır ve
  sayaç tur boyunca yaşar — bir işlemin kayıtları sayfa sınırında bölünebilir.
- **İçerik tek başına anahtar olamaz:** bir işlemde birebir aynı 20 Transfer
  olayı ölçüldü ve kaynak yirmisinin de gerçek olduğunu söylüyor.
- **Artımlı indeks TARİHE bağlanır, imlece değil.** TronGrid'in fingerprint'i
  kısa ömürlü; süresi dolunca kaynak sessizce baştan veriyor ve tur "ilerledik"
  sanıyor. İmleç yalnızca tur içinde geçerlidir. Süzgeç her sayfada
  tekrarlanır, yoksa kaynak fingerprint'i reddeder.
- **Varlıklar karışmaz.** TRX ile USDT aynı iz kuyruğuna girerse "10 USDT
  girdi, 10 TRX çıktı" gibi anlamsız bir iz üretilir. Aynı sebeple varlıklar
  arası TOPLAM da alınmaz: "1 TRX + 1 USDT = 2" diye bir büyüklük yok.
- **ONAY (Approval) bir para hareketi DEĞİLDİR.** Harcama izni verir, değer
  taşımaz; TRC20 ucu ikisini aynı listede döndürüyor (ölçüldü: 200 kaydın
  27'si onay, "sonsuz onay" 2^256-1 tutarıyla). Transfer sayıldıklarında graf
  hayalet kenarlarla ve absürt tutarlarla doluyor. Atlanan kayıt SAYILIR ve
  turun raporunda görünür.
- **Sembol kimlik değildir, SÖZLEŞME kimliktir.** Arşivde "U S D T" adlı
  (boşluklu) taklit bir token var ve gerçek USDT'den ayırt eden tek şey
  sözleşme adresi.

## Etiket kaynağı — ölçülmüş olan, varsayılan değil

- **TronScan artık anahtarsız cevap VERMİYOR** (ölçüldü 2026-09-09:
  `apilist.tronscanapi.com` → `401 Authorization Required`, openresty).
  Devir dosyası ve öneriler "TronScan tag'leri API'den ücretsiz gelir"
  diyordu; bu bir varsayımdı ve çöktü. Bir kaynağın ücretsizliği bir
  ÖLÇÜMDÜR, hatırlanan bir olgu değil.
- **TRON hesaplarında on-chain `account_name` YOK.** "Borsa cüzdanları
  kendi adlarını zincire yazar" fikri denendi: arşivin en yoğun beş
  karşı tarafında (Binance hot wallet olduğu bilinenler dâhil) TronGrid
  yanıtında `account_name` alanı hiç dönmüyor. Zincirden bedava etiket
  çıkmıyor.
- **Ücretsiz, anahtarsız ve resmî çalışan tek kaynak: OFAC SDN.**
  `SDN_ENHANCED.XML` (83 MB, `dataAsOf` taşıyor) 320 tekil adres verdi
  (tron 230 · ethereum 94 · arbitrum 1 · bsc 1). Uygulaması
  `packages/etiket` — ayrıştırıcı SAF (metin girer, bulgu çıkar), ağ ve
  veritabanı ayrı; kural bir fixture üstünde sınanıyor.
- **Zincir SEMBOLDEN değil ADRESİN BİÇİMİNDEN çözülür.** OFAC "Digital
  Currency Address - USDT" diyor ve altındaki adres kimi kayıtta `T…`
  (TRON), kimi kayıtta `1…`/`3…` (Bitcoin üstünde Omni USDT, ölçüldü:
  7 kayıt). Sembole bakan bir ayrıştırıcı bitcoin adreslerini TRON'a
  yazardı. Sembol yalnızca EVM ailesi İÇİNDE hangi zincir olduğunu
  söyler ve her hâlükârda kanıta yazılır. ("Sembol kimlik değildir,
  SÖZLEŞME kimliktir" kuralının adres tarafı.)
- **Yaptırım etiketi TERMİNAL DEĞİLDİR.** Motor yalnızca `exchange*` ile
  başlayan kategoriyi terminal sayar: paranın borsaya girmesi izin
  BİTTİĞİ anlamına gelir, yaptırımlı bir adresten para hareket etmeye
  devam eder. Ağır bir bulgudur, bir son değil.
- **Etiketlemek TARAMAK değildir.** Etiket için açılan adres
  `index_state = "bilinmiyor"` kalır; aksi hâlde 320 bakılmamış adres
  "bakıldı, temiz" görünürdü ("yok ≠ bakılamadı").
- **TronScan anahtarla çalışıyor ve KİMLİĞİ o getiriyor** (2026-09-14).
  `accountv2` yanıtındaki `publicTag` kaynağın küratörlü etiketidir; borsa
  adıyla eşleşirse etiket DOĞRULANMIŞ yazılır ve motor `terminal_aday`
  yerine `terminal` üretir. İlk ölçüm: 55 adres → 7 borsa + 1 yakma adresi.
- **Etiket metni borsa sözlüğünden geçer; sözlükte olmayan borsa DEĞİLDİR.**
  `publicTag` serbest metin ve borsa adı taşıyan etiketlerin bir kısmı
  borsa cüzdanı değil ("… Bridge", "Fake …"). Sözlük kapalı, baş eşleşmesi
  şart; tanınmayan etiket `diger` olarak yazılır ve terminal yapmaz.
  Yanlış bir "borsaya girdi" hükmü eksik bir etiketten pahalıdır.
- **Keşif YAKMA adresini servis cüzdanı SANDI.** TRON sıfır adresi
  (`T9yD14Nj…`) çok adrese "gönderiyor" göründüğü için dağıtıcı adayı
  yazılmıştı; TronScan onu "Black Hole Address(0)" diye etiketledi. Kapalı
  liste `packages/etiket/src/yakma.ts` — keşif onu indeks durumundan ÖNCE
  eler ve adıyla raporlar; TronScan kaynağı da onu borsa saymaz. Bir
  yapısal ölçüt, şekli aynı ama anlamı zıt olan adresi ayırt edemez.
- **Yanıtlar `.onbellek/tronscan/` altında durur** (gitignore'da): aynı
  adrese ikinci kez ağa çıkılmaz, `--tazele` yok sayar. Kanıttaki
  `olcumTarihi` yanıtın ALINDIĞI gündür.
- **Ve tohumlamanın asıl ölçüsü "kaç etiket yazdım" değil, "arşivdeki
  hangi adrese denk geldi".** Ölçüldü: 324 etiketin arşivdeki 14.798
  adresle kesişimi **0**. Yani etiketler doğru, kaynak resmî, kod
  çalışıyor — ve `terminal` durma sebebi hâlâ ateşlenemiyor. Yazılmış
  ama hiçbir kaydın SORMADIĞI etiket, olmayan etikettir.
- **Yapısal keşif KİMLİK İDDİA ETMEZ.** Arşivin kendi şekli "burası bir
  servis cüzdanı" der; "burası Binance" DEMEZ — o cevap ancak bir kaynaktan
  ya da insandan gelir. Başlık bu yüzden "Servis cüzdanı adayı (toplayıcı)".
  Uygulaması `packages/etiket/src/kesif.ts` (saf) + `kesif-oku.ts` (sorgu).
- **Şekil sinyali, TARADIĞIMIZ adreslerle karışıyor.** Ölçüldü: arşivdeki
  6.642 adresin en yüksek karşı taraf sayısı 3 ve hepsi
  `index_state = "bilinmiyor"` — küçük görünmelerinin sebebi küçük olmaları
  değil, BAKMAMIŞ olmamız. Bu yüzden ölçüt indeks durumuna göre üç ayrı
  cevap verir: `tam` bir ÖLÇÜMDÜR, `kismi` bir ALT SINIRDIR ("en az bu
  kadar" der, "en çok" diyemez — ve alt sınır zaten eşiği aşıyorsa aday
  geçerlidir, yalnızca güveni düşüktür), `bilinmiyor` hakkında hiçbir şey
  söylenemez ve o adres "temiz" değil "bakılmadı" diye SAYILIR.
- **Doğrulanmamış etiket ayrı bir durma sebebi üretir: `terminal_aday`.**
  Durma sebebi bir İDDİADIR ve doğrudan rapora geçer; "para borsaya girdi"
  cümlesini doğrulanmamış bir etiketle kurmak, kaynağı olmayan bir hükümdür.
  İz yine orada DURUR (borsanın iç karıştırması izi anlamsızlaştırır), ama
  sebep hangi güçte bir iddiaya dayandığını söyler.
- **Koşunun BAŞLIK durma sebebi, en SIK olan değil en ÖNEMLİ olandır.**
  Düğüm düzeyinde "borsaya varıldıysa sebep terminal'dir, butce değil"
  kuralı çoktan yazılıydı; koşu düzeyinde yazılmamıştı ve `enCokDurma` en
  sık sebebi seçiyordu. Gerçek koşuda ölçüldü: `butce:11, terminal_aday:2,
  dallanma:2` → başlık **"butce"** çıkıyor ve iki borsa adayına varılmış
  olması rapordan siliniyordu. `kosuDurmaSebebi` önce terminal'e bakar;
  dağılımın tamamı `stats.durma` içinde durmaya devam eder. **Bir kural bir
  yerde uygulanıp kardeşinde unutulabiliyor.**
- **Ve ölçüt artık gerçekten ATEŞLENİYOR** — bu bir kod incelemesiyle değil
  gerçek koşuyla doğrulandı: kök `TPJxc7u8…`, 21 düğüm / 33 kenar,
  `terminal_aday:1`, koşu başlığı `terminal_aday`. "Bir kapının yazılmış
  olması çalıştığını göstermez."
- **`terminal` da gerçek koşuda ateşlendi** (2026-09-14, koşu 7 — koşu 5
  ile aynı kök ve eşikler). Graf birebir aynı (23 düğüm / 45 kenar), yalnızca
  sebepler değişti: `terminal_aday:2, butce:11` → `terminal:3, terminal_aday:1,
  butce:9`, başlık `butce` → `terminal`. Üç düğümün ikisi (Okex 1, HTX 1)
  koşu 5'te BÜTÇE sınırında kesilmişti — yani kimliksiz arşivde "biz durduk"
  diye görünen yer aslında iz'in bittiği yerdi. Eski koşular donmuş kayıttır;
  yeni etiketin etkisi ancak yeni koşuda görünür.
- **Aday etiket bir İDDİADIR ve öyle girer** (kullanıcı kararı
  2026-09-09): dört borsa adresi `source: "kullanici"`, `confidence 0.3`,
  `verifiedAt` BOŞ. Adresin biçimi doğrulanmış olması etiketin doğru
  olduğunu göstermez; onayı on-chain davranış ve insan verir. Liste
  KAPALI ve her satır gerekçesini taşır (`packages/etiket/src/aday.ts`).
- **Blockscout BSC BARINDIRMIYOR** (ölçüldü 2026-09-14: `bsc.`/`bnb.blockscout.com`
  404, zincir listesinde 56 yok). 2026-09-09'daki "BSC → Blockscout" kararı
  ölçülmemiş bir varsayıma dayanıyordu — TronScan'ın "ücretsiz" varsayımının
  aynısı. BSC yedeği herkese açık RPC; adres için "var" diyebiliyor, "yok"
  DİYEMİYOR ve bunu `hata` ile söylüyor.

## Takip ve rapor

- **Atıf kuralı bir SEÇİMDİR, bir gerçek değil — ve rapora YAZILIR.** FIFO,
  orantısal ve zaman pencereli dağıtım aynı veriden farklı sonuç veriyor
  (testle sabitlendi: `tests/dagitim.test.ts`). Ekranda ve raporda hangi
  kuralın kullanıldığı, hop bütçesiyle birlikte tek satırda görünür. Kuralı
  söylemeyen bir yüzde, tartışmada savunulamaz.
- **Durma SEBEBİ yazılmadan durulmaz.** "Burada iz kesildi" ile "burada
  bütçe bitti" aynı ekranda aynı görünürse, ikincisi taramayı sürdürmekle
  çözülebilirken çözülmez. Sıra da kuralın parçası: borsaya varıldıysa
  sebep `terminal`dir, `butce` değil — tersi sırada rapor asıl bulguyu
  kaybeder.
- **Ateşlenemeyen bir ölçüt, ölçüt değildir.** `terminal` sebebi etiket
  okuyor ve arşivde 0 etiket var (2026-09-09); yani kod doğru, sonuç yok.
  Bir kapının yazılmış olması çalıştığını göstermez — ateşlendiği ÖLÇÜLÜR.
- **Etiket görüntüsü kayıt anında DONDURULUR** (`labelSnapshot`). Rapor
  alındıktan sonra etiket düzeltilirse eski rapor kendi anlattığı şeyle
  çelişmemeli; rapor bir anın tutanağıdır.
- **Yetenek bayrağı bir İDDİADIR.** `capabilities.internalTransfers: true`
  yazmak, iç transferlerin ayrıştırıldığını göstermez — TRON adaptöründe
  bugün göstermiyor. Doğrulanmamış bir bayrak, bakılmamış bir yeri
  "kapsandı" gösterir; "yok ≠ bakılamadı" kuralının kod tarafı.
- **Boş adaptör SESSİZ kalmaz.** Bitcoin/Solana/EVM adaptörleri `throw`
  ediyor ve `registry.hazirMi()` onları kapıda tutuyor. "Sonuç bulunamadı"
  diye dönen bir boş adaptör, kapsanmayan zinciri temiz gösterirdi.

## Görev disiplini

- **Bir görev, kendinden öncekinin ürettiği veriyi EKRANDA gösterebiliyorsa
  bitmiştir.** "Yazıldı ama hiçbir sayfa sormuyor" bitmiş sayılmaz — bu
  projede bir kez yaşandı (`KisiAd` kardeşi: veri yazıldı, okuyan yoktu).
- **Ölçümü olmayan madde yazılmaz.** Dokümanlardaki her sayı, yanında
  yeniden üretim komutuyla durur. Kanıtı yeniden ölçülemeyen bir tespit,
  bir sonraki turda kanıya dönüşür.

## Güvenlik

- **Oturum kullanıcıyı GÖMMEZ.** Jetonun imzası geçerli olabilir ama kullanıcı
  kapatılmış ya da silinmiş olabilir; kapı her API çağrısında kaydı okur ve
  **rolü jetondan değil kayıttan** alır. Aksi hâlde yetkisi düşürülen biri
  eski çerezle yönetici kalır.
- **Kapı kendi çıkışını kapatamaz.** İlk girişte şifre değiştirme zorunluluğu,
  şifreyi değiştiren uç noktayı da engelliyordu; hesap kilitleniyordu. Testi
  var (`tests/kapilar.test.ts`).
- **Üretilen şifre yalnızca yanıtta bir kez döner**, hiçbir yere yazılmaz.
- **Kullanıcı silinmez, pasife çekilir** — denetim kaydı ona atıf yapıyor.
- Son aktif yönetici kapatılamaz; kimse kendi rolünü düşüremez.

## Arayüz

Tasarım dili ve gerekçesi: [docs/arayuz.md](docs/arayuz.md). Özet: yoğun adli
araç, imza öğesi **köken oluğu** (bilginin nereden geldiğini söyleyen sol
işaret), renk kanalları ayrık, yazı tipleri build anında gömülü.

- **Takip bir AKIŞ olarak çizilir, graf olarak değil** (kullanıcı kararı
  2026-09-14, üç örnek arasından A). Kullanıcı: "aktarılan para yoğunluğunu
  görmüyorum, renkler yok." Cytoscape grafında 40 Mn USDT ile 1 USDT aynı
  çizgiydi ve sayfa sıçrama başına bloklarla üç ekrana dağılıyordu. Şimdi
  sütunlar sıçrama, ŞERİT KALINLIĞI tutar (tek varlığın ölçeğinde — "1 TRX +
  1 USDT" diye büyüklük yok), sağda "para nereye ulaştı" + seçime göre süzülen
  defter, hepsi tek ekranda. Saf yerleşim `apps/web/src/lib/akis.ts`, testli.
- **Yerleşim hâlâ DETERMİNİSTİK** — 2026-09-09 kararının gerekçesi (aynı koşu
  aynı resim, rapora giren görsel) değişmedi, yalnızca çizim biçimi değişti.
  Rastgelelik yok, eşitlikte adres sırası; test girdi sırasını ters çevirip
  aynı resmi bekliyor.
- **Akışta renk ŞERİDİN ne olduğunu anlatır, düğümün durumu DOKUDUR.**
  Şerit: ileri akış (gri) · doğrulanmış borsaya giriş (yeşil) · adaya giriş
  (kehribar) · önceki bir adrese dönüş (pembe). Düğüm: borsa düz + ✓, aday
  taralı + ?, bizim sınırımız kesik çerçeve. Renk hiçbir şeyi tek başına
  anlatmaz. Palet koyu zeminde renk körlüğü denetiminden geçti (ΔE ≥ 9); ilk
  deneme kehribarı fazla açık, griyi ayırt edilemez buldu ve düzeltildi.
- **Doğrulanmış borsada takip BİTER; aday ve bizim sınırlarımızda DEVAM
  edilebilir** (kullanıcı kararı 2026-09-14). Gerekçe: borsaya giren para
  borsanın ortak havuzuna karışır, zincirdeki çıkışı artık o paranın devamı
  değildir — kimin çektiğini yalnızca borsanın kayıtları söyler. Kural tek
  yerde (`devamEdilebilir`, `packages/motor/src/durma.ts`) ve API de onu
  sorar; arayüzde düğmenin görünmemesi bir güvence değildir.
  **Uyarı:** "doğrulanmış" bir KAYNAK iddiasıdır (TronScan etiketi), mutlak
  gerçek değil. Etiket yanlışsa iz orada yanlışlıkla kesilir; bu yüzden
  etiketin kaynağı düğümün ipucunda görünür kalır.
- **Devam yeni koşu AÇMAZ, aynı koşuya eklenir.** Tohum, o adrese BU koşuda
  izlenerek gelen paradır — adrese giren bütün para değil; aksi hâlde başka
  kaynakların parası dosyaya yazılırdı. Sıçrama bütçesi düğümün yerinden
  sayılır (+1…5, varsayılan 2), düğüm bütçesi mevcut koşunun üstüne eklenir.
  Bir insan kararıdır ve rapor bunu bilmeli: düğümün eski sebebi, kim ve ne
  zaman `stats.devamlar`a, ayrıca denetim kaydına yazılır. Devam hatası
  koşunun tamamını "hata"ya ÇEKMEZ — önceki graf sağlam. Koşu özeti devamdan
  sonra VERİTABANINDAN yeniden sayılır (bellekteki sayaç tek yürüyüşü bilir).
  Ölçüldü (koşu 8): 70 Mn USDT'lik adaydan devam → 2 çıkış, yeni adres
  dallanmada durdu; doğrulanmış Binance'ten devam reddedildi.
- **Yakma adresi ayrı bir durma sebebidir: `yakildi`** (kullanıcı kararı
  2026-09-14). Koşu 8'de adaydan devam edince 70 Mn USDT'nin TAMAMININ TRON
  sıfır adresine gittiği görüldü; motor onu "dallanma" sanıp devam
  ettirilebilir bir sınır gibi gösteriyordu. Para yok edildi — iz BİTER,
  devam düğmesi çıkmaz, rapor "yakıldı" der. Sebep borsadan ve bütün
  sınırlardan ÖNCE sorulur; yakma adresi taranmaz (milyonlarca hareketi var
  ve hiçbiri bu paranın devamı değil). Koşu başlığında önceliği doğrulanmış
  borsadan sonra, adaydan önce. Liste `packages/chain/src/yakma.ts`'e taşındı
  (keşif, motor ve arayüz soruyor; istemci `@cry/chain/yakma` alt yolundan
  çeker, zincir adaptörleri tarayıcı paketine girmez). Sebep eklenmeden önce
  yazılmış koşularda sıfır adresi "dallanma" kayıtlı — o yüzden kural ve
  arayüz sebebe ek olarak ADRESİ de sorar. Ölçüldü (koşu 9): adaydan devam
  → sıfır adresi `yakildi`, oradan devam reddedildi.
- **Keşif adayı yazma eşiği: güven > 0,7** (kullanıcı kararı 2026-09-14).
  14 yeni adaydan 6'sı yazıldı (keşif etiketi 11 → 17). Eşiğe yakın dört aday
  (0,45–0,56) yazılmadı; güveni yüksek olup TronScan'da ZATEN doğrulanmış
  borsa olan üç adres de (KuCoin 2, Okex 1, HTX 1) yazılmadı — doğrulanmış
  kimliğin yanına zayıf bir aday etiketi eklemek bilgi katmaz. Keşif CLI'si
  `--uygula` ile TÜM adayları yazar; eşikli yazma bu yüzden süzülerek yapıldı.
- **Tutar aralığı filtresi ŞERİT TOPLAMINA bakar, SEÇİLİ VARLIĞIN biriminde**
  (kullanıcı kararı 2026-09-15, koşu 9'un sınırda kalan küçük değerleri
  için). Çift kaydırıcı LOGARİTMİK (şeritler 0,01–70 Mn); elle giriş Türkçe
  defter düzenini ("10.000", "2.500,75") ve "10b", "2,5mn" kısaltmalarını
  anlar, çözülemeyen girdi 0 değil HATA olur. Farklı para birimleri: kalınlık
  zaten tek varlığın ölçeğinde ve diyagram yalnızca onu çiziyor; filtre de o
  birimde konuşur, varlık değişince o varlığın kendi en küçük–en büyük
  şeridine sıfırlanır. Varlıklar arası ortak birim (USD) bir FİYAT ister —
  fiyat tablosu dolunca eklenir (bekleyen-kararlar §5). Aralık dışı şerit
  diyagramdan ve defterden çıkar, özet koşunun tamamını söyler. Sayaç yalnızca
  ÇİZİLEBİLEN çiftleri sayar (ölçüldü: ucu grafta olmayan kenarlar sayılınca
  koşu 9'da 49 yerine 57 çıkıyordu). Uygulaması `tutarAraligiylaAyikla`.
- **Geri dönüş şeritleri İÇ İÇE yerleşir ve kenarlıdır** (kullanıcı
  bildirimi: "pembe şeritler üst üste biniyor"). Alt şeritler zaten ayrıydı ama
  aynı sütun aralığından inen/çıkan DİKEY bacaklar aynı x'e düşüyordu. Her
  şerit bir öncekinin dışına yazılır (dıştaki şeridin bacağı da dışta, böylece
  kesişmezler), koyu bir kenar kesişmeyi okunur kılar, alt şeritte "↩ kimden →
  kime · tutar" etiketi durur. Ölçüldü: koşu 9'un 10 geri şeridinin 10 bacağı
  10 ayrı x'te.
- **Şerit ipucu ilk ve son hareketin zamanını (TSİ) söyler; şerit seçilince
  defter her hareketin hash'ini blok gezginine bağlar.** Gezgin adresleri tek
  yerde (`apps/web/src/lib/gezgin.ts`, adres sayfası da oradan); tanınmayan
  zincirde bağlantı UYDURULMAZ. Gezgin bir üçüncü taraf: `rel="noopener
  noreferrer"` ile açılır, hangi soruşturma sayfasından gelindiğini görmez.
- **Tıklanan şerit, köke kadar geldiği yolla öne çıkar** (kullanıcı isteği).
  "Bu para buraya hangi yoldan geldi" — şeridin kaynağına giren ileri
  şeritler, onlarınkiler, köke kadar (`seritYolu`). Geri dönen şeritler yola
  alınmaz: para o yoldan gelmedi, oradan döndü.
- **Kuyruk çağrısı SÜRE SINIRIYLA yapılır ve başarısızsa durum GERİ ALINIR.**
  Yaşandı (2026-09-15): yerel geliştirme sunucusu Redis'e ulaşamıyor
  (konteyner portu dışarı açık değil) ve BullMQ `maxRetriesPerRequest: null`
  yüzünden SONSUZA kadar bekliyor. Devam uç noktası koşuyu önce "kuyrukta"ya
  çekip sonra kuyruğa atıyordu; istek hiç dönmedi, koşu 9 "kuyrukta"da takılı
  kaldı ve "koşu sürüyor" diye bir daha devam edilemez oldu. Şimdi
  `zamanAsimi` (5 sn) → 503 "kuyruğa ulaşılamadı" ve durum eski hâline döner;
  yeni koşu "hata" olarak kapanır. Ölçüldü: 3005'te istek 5,4 sn'de 503 döndü,
  koşu "bitti" kaldı. **Sonuç: yerel dev sunucusundan devam/durdur/yeni koşu
  YAPILAMAZ** — bunlar canlı yığında (1337) çalışır.
- **Durdurulan koşu "bitti" DEĞİL "durduruldu"dur ve eksik olduğunu söyler.**
  Yarım bir graf "bitti" görünürse tam sanılır. Worker ilerlemeyi ve iptal
  bayrağını `jsonb_set` ile yazar/okur — Prisma'nın Json güncellemesi alanın
  TAMAMINI değiştirir ve süren bir koşuda `devamlar` gibi kayıtları ezerdi.
  Yoklama saniyede en çok bir kez (her düğümde sorgu atılmaz).
- **Defter şerit başına TEK satırdır; şerit seçilince hareketlere açılır.**
  Koşu 9 canlı devamlardan sonra 1.342 hareket oldu, 706'sı aynı çift
  arasındaki küçük transferlerdi; diyagram tek şerit çizerken defter 706
  satır basıyordu. Şimdi 98 satır.
- **Gizleme yalnızca GÖRÜNÜMDÜR.** Şerit ya da adres gizlenince diyagramın
  kalınlık ölçeği kalan akışa göre kurulur (yoğun bir aday hesabı küçük
  şeritleri okunmaz yapıyordu), ama özet ve defter koşunun tamamını söyler;
  defterde gizli satırlar soluk durur. Kök gizlenemez. Seçim bu tarayıcıda
  koşu başına saklanır, rapora girmez.
- **Geri dönen para diyagramın ALTINDAN dolaşır.** Köke ya da aynı/önceki
  sıçramadaki bir adrese giden para ileri şeritlerle karışmasın diye ayrı bir
  alt şeritten okla döner. Koşu 7'de köke 3,85 Mn USDT geri dönmüş — eski
  grafta bu hiç görünmüyordu.
- **Çizilen düğüm sayısı 100 ile sınırlı, gerisi "ve N düğüm daha" diye
  SAYILIR.** Düğüm sınırı 300 ve kabaca on katı kenar okunmaz bir yumak
  verir; ama kırpılan kısım sessizce yok sayılmaz — kaç düğümün
  çizilmediği ekranda yazar.

## Kuyruk ve worker

- **Kuyruk adında ve İŞ KİMLİĞİNDE `:` yasak.** BullMQ ikisini de reddediyor
  ve hata ancak iş kuyruğa atılırken, kullanıcının önünde çıkıyor. Ayraç `-`;
  testi var.
- **Aynı anda birden çok worker süreci ÇALIŞTIRMA.** Her yeniden başlatmada
  eskisi ayakta kaldığı için sekiz worker birikti ve bir tur ESKİ KODLA
  koştu: onay filtresi eklendiği hâlde onaylar yazılmaya devam etti, ve ben
  bir süre "filtre çalışmıyor" sandım. `pkill -f` tsx'in başlattığı node'u
  yakalamıyor; süreçler komut satırına bakılarak kapatılır:
  ```powershell
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like '*worker*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  ```
- **Takip koşusu yeniden DENENMEZ** (`attempts: 1`): yarım kalan koşunun
  düğümleri yazılmış oluyor, ikinci deneme onların üstüne farklı bir grafla
  gelir. Hata kayda geçer, kullanıcı yeniden başlatır.

## Ölçme alışkanlığı

- **Kodu okuyarak değil ÇALIŞTIRARAK doğrula.** Bu projedeki ciddi kusurların
  hepsi (yanlış zincir, mükerrer kayıt, ilerlemeyen indeks, kilitlenen hesap)
  gerçek veriyle koşturulunca çıktı; hiçbiri tip kontrolünden geçmedi diye
  yakalanmadı.
- **"N kayıt yazıldı" bir doğrulama değildir.** Sayının yanında bir örneğe
  elle bak.
- **Dışarıdan görünmesi gereken bir şeyi kendi görüşünle doğrulama.** Ajanın
  yazdığı bazı dosyalar sanal bir katmanda kalabiliyor; kullanıcının ya da
  runner'ın gördüğüne bakılır.
