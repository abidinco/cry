# Yerel blok indeksi — yol haritası

Kullanıcı hedefi (2026-09-15): *"nihai olarak bu blokların lokalde
indekslenmesi işi için betikler yazma aşamasına geçelim."*

Bu dosya bir PLANDIR ve her aşama bir **ölçüm kapısıyla** açılır: kapının
cevabı gelmeden bir sonraki aşamanın kodu yazılmaz. Kapsamı belirleyen karar
kullanıcıda ([bekleyen-kararlar §8](bekleyen-kararlar.md)).

Yan dosyalar: [kurallar](../CLAUDE.md) · [proje devri §4 — veri kaynakları](proje-devir.md) ·
[görevler](gorevler/README.md) · [çözülmesi gerekenler](cozulmesi-gerekenler.md).

---

## 0. Neden şimdi, ve eski karar neydi

Proje devri §4 "kendi arşiv düğümünü çalıştırmak disk açısından imkânsız"
diyor ve **vaka odaklı artımlı indeksi** ana çözüm seçiyor: sorgulanan adres
bir kez çekilir, sonra delta. Bugünkü hâli:

| Ölçüm (2026-09-15) | Değer |
|---|---|
| Veritabanı | 56 MB |
| Hareket (`transfers`) | 85.137 (2018-06 → 2026-09) |
| Adres | 30.525 — **114'ü taranmış** (tam 89, kısmi 25), 30.404'ü "bilinmiyor" |

Artımlı indeksin iki yapısal sınırı var ve blok indeksi tam bunları kapatır:

1. **Ters sorgu yok.** "Bu adrese kim para gönderdi / kimi aktive etti" ancak
   o adres taranmışsa bilinir; taranmamış 30.404 adres "bakılmadı" kalıyor.
2. **Keşif kör.** Yapısal keşif (`packages/etiket/src/kesif.ts`) yalnızca
   taranan adreslerin şeklini ölçebiliyor; servis cüzdanları taranmadıkça
   görünmüyor (CLAUDE.md → Etiket kaynağı).

## 1. Ölçülmüş gerçekler — kapsamı bunlar belirler

**Yeniden üretim:**
```bash
node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/tron-blok-hacmi.mts
node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/tron-tutar-dagilimi.mts
```

**Makine** (2026-09-15): 20 mantıksal çekirdek, 32 GB RAM, iki SSD —
C: 930 GB (262 GB boş), D: 466 GB NVMe (198 GB boş). Docker WSL diski 21 GB.

**Zincir hacmi** (TRON, blok 86.271.342 civarı, gün içine yayılmış 30 örnek blok):

| | Blok başına | Günlük tahmin (28.800 blok) |
|---|---|---|
| İşlem | 424 | ~12,2 Mn |
| USDT-TRC20 transferi | 93 | **~2,7 Mn** |
| Tüm TRC20 transferi | 95 | ~2,7 Mn — TRC20 hacminin ~%98'i USDT |
| TRX transferi | 146 | **~4,2 Mn** |
| Ham JSON (blok + işlem bilgisi) | ~578 KB | ~16 GB/gün ham |
| İstek süresi (blok + bilgi çifti) | ~258 ms | — |

**Tutar dağılımı** (aynı yöntem, 3.043 USDT + 4.920 TRX transferi):

| Eşik | USDT'nin kalan payı | TRX'in kalan payı |
|---|---|---|
| ≥ 1 | %99,5 | **%23,9** |
| ≥ 10 | %91,2 | %10,3 |
| ≥ 100 | %70,4 | %3,0 |
| ≥ 1.000 | %32,4 | %0,7 |
| ≥ 10.000 | %9,0 | %0,1 |

Buradan dört sonuç çıkıyor:

- **Tam arşiv düğümü yine sığmıyor** (TRON 2,5–3,5 TB, iki diskte toplam 460 GB boş).
- **Geçmişi TronGrid'den blok blok çekmek olmaz.** Blok başına 2 istek,
  anahtarlı kota ~100 bin/gün → günde ~50 bin blok; zincir 86 Mn blok. Yıllar.
- **Canlı ucu TronGrid'den izlemek OLUR.** Günde 28.800 blok × 2 = ~57.600
  istek, kotanın içinde. Paralel adres taramalarıyla PAYLAŞILAN kota — hız
  kapısı ortak olmalı.
- **Hacmin çoğu toz.** TRX transferlerinin %76'sı 1 TRX'in altında. Ama
  **tutar eşiği CLAUDE.md kuralıyla çatışır**: "açık bir eşik küçük ama
  kritik bir transferi sessizce eler" (`VARSAYILAN_ESIKLER.minTutar = 0`,
  bilinçli). Eşikli bir indeks bu yüzden yalnızca **keşif** için kullanılır,
  **iz** için kullanılmaz — iz her zaman adresin tam taramasına dayanır
  (bkz. §3, iki katman).

## 2. Önerilen mimari — iki katman

```
TronGrid ─┬─► [canlı uç okuyucu]  ─► blok_indeks (sıkıştırılmış, eşikli)   ─► keşif, ters sorgu, "kim gönderdi"
          │                                                                  (aday üretir)
          └─► [adres tarayıcı]    ─► transfers (Postgres, TAM, eşiksiz)     ─► iz / takip motoru / rapor
              (bugünkü adresIndeksle)                                        (hüküm üretir)
toplu kaynak (BigQuery / anlık görüntü) ─► blok_indeks geçmişi (Faz B3, karar bekliyor)
```

- **Katman 1 — blok indeksi (YENİ):** her bloktaki USDT-TRC20 ve TRX
  transferleri, kararlaştırılan eşiğin üstündekiler. Amacı ADAY üretmek:
  "bu adrese son 90 günde 3.000 farklı adresten para girmiş" → servis
  cüzdanı adayı; "şu tarihte şu adrese kim ≥10 bin USDT gönderdi".
- **Katman 2 — adres indeksi (VAR):** bir adres takibe girdiğinde tam ve
  eşiksiz taranır. Rapor ve iz YALNIZCA bu katmandan beslenir. Blok
  indeksinden gelen bir satır bir iz iddiasına dönüşmeden önce adres
  katmanında doğrulanır.

Neden iki katman: eşikli bir indeks raporda "bu adrese başka para
girmedi" dedirtirse o cümle YANLIŞ olabilir ("yok ≠ bakılamadı"). Katmanları
ayırmak bu yanlışı yapısal olarak imkânsız kılar.

**Depolama önerisi:** blok indeksi için **ClickHouse** (Docker konteyneri,
sütunlu ve sıkıştırmalı), vaka verisi Postgres'te kalır. Gerekçe bir tahmin:
günde ~1–3 Mn satır × yıl, satır başına Postgres'te ~150–250 bayt (dizinlerle)
yılda yüzlerce GB eder; sütunlu sıkıştırma bunu bir büyüklük sırası
düşürebilir. **Bu tahmin B0'da ölçülür** — Postgres'in bölümlü tablosu da
aday olarak kalır (tek veritabanı işletimi daha basit).

## 3. Aşamalar

Her aşama: **ne üretir · bitiş ölçütü · kapı**. Aşamalar tek oturumda
bitecek büyüklükte bölünür (görev disiplini, `docs/gorevler/README.md`).

### B0 — Ölçüm ve karar (kod değil, betik)

- Depolama denemesi: 2 günlük örnek transferi (~5–10 Mn satır) hem
  Postgres bölümlü tabloya hem ClickHouse'a yaz; **disk/satır, yazma
  hızı, "adrese gelenler son 90 gün" sorgu süresi** ölç.
- Toplu geçmiş kaynağı yoklaması: BigQuery'de TRON veri seti var mı, şeması,
  USDT transferlerinin aylık satır sayısı, sorgunun taradığı bayt (ücretsiz
  kota ayda 1 TiB); java-tron veri anlık görüntüsünün boyutu ve içeriği.
- Tutar dağılımını 30 değil ~1.000 blokla ve farklı yıllardan tekrarla
  (2019'daki hacim bugünküyle aynı değil).
- **Bitiş:** her ölçüm `docs/yol-haritasi-blok-indeks.md §1`'e tablo olarak
  yazıldı, betikleri `scripts/olcum/` altında.
- **Kapı:** kullanıcı §8'i cevaplar — varlıklar, eşik, geçmiş penceresi,
  depolama motoru, disk bütçesi.

### B1 — Şema ve kursör

- `blok_indeks` şeması: blok no, zaman, tx hash, log index, varlık, from,
  to, tutar (ham tam sayı METİN/Decimal — `Number` YOK), işlem başarılı mı.
  Aylık bölüm. Tekillik: (tx hash, log index).
- `blok_kursor`: okunan en yüksek KESİNLEŞMİŞ blok, eksik aralıklar listesi,
  son yazma zamanı. Tek satır; yarım kalan aralık kayıtta durur.
- Kesinleşme: TRON'da blok ~19 onayda "solidified" olur; okuyucu yalnızca
  `getnowblock - kesinlesmePayi` altını yazar (yeniden düzenlenen bloğu yazıp
  sonra silmek, "yazılmış ama yanlış" bir indeks demektir).
- **Bitiş:** migration + saf ayrıştırıcı testleri (örnek blok JSON'u
  fixture: TRX transferi, USDT Transfer olayı, başarısız işlem, onay/approve
  olayı — sonuncusu transfer SAYILMAZ, CLAUDE.md'deki "sonsuz onay" dersi).
- **Kapı:** migration PUSH ister (canlı veritabanına uygulanır).

### B2 — Blok okuyucu betiği (tek aralık)

- `packages/blok-indeks` (saf: blok JSON → satırlar) + `apps/blok-okuyucu`
  (ağ, yazma, kursör). Komut: `--aralik=86000000-86001000 [--uygula]`,
  varsayılan KURU.
- Ortak hız kapısı: TronGrid kotası adres taramasıyla paylaşılır
  (`RateGate`, tek yerde).
- Yeniden başlatılabilir: aralık yazıldıkça kursör ilerler; ölüm → kaldığı
  yerden. Aynı aralığı iki kez yazmak zararsız (tekillik).
- İlerleme + durdurma: takip koşusundaki desenin aynısı (saniyede bir durum,
  iptal bayrağı) — `cozulmesi-gerekenler §6` dersi.
- **Bitiş:** 1.000 bloklük bir aralık yazıldı; sayılar B0 ölçümüyle
  tutarlı; ikinci çalıştırma 0 yeni satır.
- **Doğrulama kapısı:** aralıktaki 20 rastgele adresin transfer sayısı,
  aynı aralık için adres taramasının (Katman 2) verdiği sayıyla karşılaştırılır.
  Eşik altı fark BEKLENEN, eşik üstü fark HATA.

### B3 — Geçmiş doldurma (kararlaştırılan pencere)

- Kaynak B0'ın cevabına göre: toplu dışa aktarım (BigQuery → dosya → yerel
  yükleme) ya da yalnızca vaka tarih pencereleri için blok blok.
- Pencere başına iş, kuyrukta (BullMQ, ayrı kuyruk; takip kuyruğunu
  bekletmez). Eksik aralık dedektörü: kursördeki boşluklar listelenir ve
  yeniden kuyruğa girer.
- **Bitiş:** pencere boşluksuz; satır sayısı kaynağın kendi sayımıyla
  (BigQuery'de `count(*)`) birebir.

### B4 — Canlı uç

- Okuyucu sürekli çalışır: her ~3 sn kesinleşmiş yeni blokları yazar.
  Başlangıç betiğine (`deploy/pc/baslangic.ps1`) eklenir; worker gibi
  konteyner olur, `restart: unless-stopped`.
- **Bitiş:** 24 saat boşluksuz; gecikme (uç − kursör) kayıt altında ve
  izleme servisine (görev 10) bağlanabilir.

### B5 — Motor ve arayüz entegrasyonu

- Keşif: `servisAdaylari` taranmamış adresler için de blok indeksinden
  ölçer — ama bunu `index_state` ile KARIŞTIRMAZ; kaynak "blok indeksi,
  eşik ≥X" diye etikete yazılır.
- Adres sayfası: "bu adrese blok indeksine göre N farklı adresten para
  girmiş (≥X USDT, pencere Y)" satırı — köken oluğu "türetildi".
- Takip motoru: blok indeksi YALNIZCA sıradaki adresi önceden taramaya
  (önbellek ısıtma) yarar; atıf ve durma kararları Katman 2'den.
- **Bitiş:** koşu 9 yeniden koşturulduğunda sonuç aynı; keşif adayları
  artar ve her birinin kaynağı yazılı.

### B6 — İşletim

- Disk izleme ve uyarı (bölüm başına boyut, kalan alan; D: NVMe 198 GB boş).
- Yedek (`cozulmesi-gerekenler §11` — bugün yedek yok).
- Eski bölümleri silme ya da arşivleme politikası (pencere dışı).
- **Bitiş:** CLAUDE.md'ye işletim kuralları; başlangıç betiği okuyucuyu da
  denetliyor.

### B7 — EVM (Faz 1b)

Aynı iskelet, farklı okuyucu: ERC-20 `Transfer` olayları (USDT/USDC) +
yerel transfer. Önce B0'ın EVM karşılığı ölçülür (BSC hacmi TRON'a yakın).

## 4. Riskler ve açık sorular

- **Kota paylaşımı:** canlı uç kotanın ~%58'ini tüketir; aynı gün yoğun bir
  vaka taraması kotayı aşabilir. Öncelik kuralı gerekir (vaka > indeks).
- **İç (internal) TRX transferleri** sözleşme çağrısı içinde gerçekleşir ve
  `getblockbynum`'da görünmez (`cozulmesi-gerekenler §4` —
  `internalTransfers: true` iddiası ölçülmedi). Blok indeksi bunları ilk
  sürümde KAÇIRIR ve bunu kendi kapsam notunda söyler.
- **Başarısız işlemler** (`receipt.result != SUCCESS`) transfer değildir;
  ayrıştırıcı açıkça eler ve sayar.
- **Sahte token** — USDT adını taşıyan başka sözleşmeler: varlık kimliği
  SEMBOL değil SÖZLEŞME adresidir (CLAUDE.md kuralı).
- **Disk bütçesi** kararı verilmeden B3 başlamaz.
