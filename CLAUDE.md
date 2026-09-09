# cry — proje kuralları

Kripto para akışını takip eden analiz aracı. Next.js 15 + TypeScript +
Prisma/PostgreSQL + BullMQ; testler Vitest. Ayrıntı: [README](README.md),
[PRD](docs/prd.md), [devir dosyası](docs/proje-devir.md).

Bu dosya **kararları ve acı deneyimle öğrenilenleri** tutar. Bekleyen sorular
ayrı: [docs/bekleyen-kararlar.md](docs/bekleyen-kararlar.md).

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
