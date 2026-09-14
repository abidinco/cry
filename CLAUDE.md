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
- **Tıklanan şerit, köke kadar geldiği yolla öne çıkar** (kullanıcı isteği).
  "Bu para buraya hangi yoldan geldi" — şeridin kaynağına giren ileri
  şeritler, onlarınkiler, köke kadar (`seritYolu`). Geri dönen şeritler yola
  alınmaz: para o yoldan gelmedi, oradan döndü.
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
