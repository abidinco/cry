# Yerel blok indeksi — yol haritası

Kullanıcı hedefi (2026-09-15): *"nihai olarak bu blokların lokalde
indekslenmesi işi için betikler yazma aşamasına geçelim."*

Bu dosya bir PLANDIR ve her aşama bir **ölçüm kapısıyla** açılır: kapının
cevabı gelmeden bir sonraki aşamanın kodu yazılmaz. **Kapsam kararı
2026-09-16'da verildi** (ClickHouse · eşiksiz · tam geçmiş · D:'nin tamamı):
gerekçesi ve sabit kuralları [CLAUDE.md → Blok indeksi](../CLAUDE.md).

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

### B0 ölçümleri (2026-09-15/16)

**Yeniden üretim** (ağa yalnızca ilki çıkar; çıktı `.onbellek/b0/`, gitignore'da):
```bash
node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/tron-b0-ornekle.mts   # 2.261 blok, 4.523 istek, ~10 dk
node --import tsx scripts/olcum/b0-yillar-analiz.mts
# geçici konteynerler: betiğin başındaki dört docker run satırı; bitince docker rm -f b0-ch b0-pg b0-ts b0-duck
node --import tsx scripts/olcum/b0-depolama-denemesi.mts --mod=gercek
node --max-old-space-size=8192 --import tsx scripts/olcum/b0-depolama-denemesi.mts --mod=ayni --gun=2
node --max-old-space-size=8192 --import tsx scripts/olcum/b0-depolama-denemesi.mts --mod=taze --gun=2
node --max-old-space-size=8192 --import tsx scripts/olcum/b0-depolama-denemesi.mts --mod=ayni --gun=2 --motorlar=ch --chProjeksiyonsuz
node --max-old-space-size=8192 --import tsx scripts/olcum/b0-depolama-denemesi.mts --mod=ayni --gun=2 --motorlar=ts --tsBloom
```

**Örnekleme:** ardışık 1.200 blok (86.270.497–86.271.696, 1 saat) + 2018-06'dan
bugüne yılda 125 blok. 4.523 istek, 0 yeniden deneme — ama yalnızca 120 ms'lik
tek hız kapısıyla: kapısız 4 eş zamanlı işçi 123 isteğin 72'sinde yeniden
denemeye düştü (B2'deki ortak `RateGate`'in gerekçesi).

**Yıla göre hacim** (yılda 125 blok; 2018 yarım yıl, 63 blok):

| Yıl | USDT/blok | TRX/blok | Günlük USDT | Günlük TRX | USDT ≥100 | USDT ≥1.000 | TRX ≥1 | TRX ≥100 |
|---|---|---|---|---|---|---|---|---|
| 2018 | 0 | 1,5 | 0 | 42 bin | — | — | %67 | %28 |
| 2019 | 0,0 | 3,4 | ~0,7 bin | 99 bin | (3 örnek) | | %55 | %35 |
| 2020 | 2,0 | 7,8 | 59 bin | 225 bin | %58 | %23 | %71 | %34 |
| 2021 | 24,5 | 35,6 | 705 bin | 1,03 Mn | %69 | %33 | %40 | %14 |
| 2022 | 46,2 | 90,7 | 1,33 Mn | 2,61 Mn | %57 | %26 | %30 | %9,2 |
| 2023 | 64,0 | 108,4 | 1,84 Mn | 3,12 Mn | %49 | %23 | %30 | %6,4 |
| 2024 | 71,9 | 93,4 | 2,07 Mn | 2,69 Mn | %64 | %31 | %32 | %7,2 |
| 2025 | 78,6 | 130,6 | 2,26 Mn | 3,76 Mn | %74 | %37 | %28 | %4,9 |
| 2026 | 77,5 | 155,3 | 2,23 Mn | 4,47 Mn | %72 | %33 | %24 | %3,5 |

- **Tam geçmişin satır sayısı (tahmin):** USDT ~3,6 Mr + TRX ~6,1 Mr = **~9,7 Mr**.
  USDT ≥1 + TRX ≥1: ~5,1 Mr · USDT ≥100 + TRX ≥100: ~2,7 Mr · yalnız USDT ≥100:
  ~2,3 Mr · yalnız USDT ≥1.000: ~1,1 Mr.
- **Gün içi dalgalanma büyük:** ardışık saat blok başına 331 transfer
  (134 USDT + 197 TRX) verdi, 2026'nın yayılmış örneği 233. Önceki 30 blokluk
  ölçüm (239) yayılmış örneğe yakın; günlük tahminler bu yüzden yayılmış
  örnekten alınır (**~6,7 Mn/gün eşiksiz**).
- **Başarısız transfer 0** — bir alan eksikliği değil: `ret` her işlemde var,
  başarısızlar yalnızca sözleşme çağrılarında (`OUT_OF_ENERGY`) ve onlar
  Transfer olayı üretmiyor (3 blokta elle bakıldı). Aynı saatte 469 USDT onay
  olayı atlandı.
- **Adresin çoğu bir kez görünüyor:** 1 saatte 397.381 transferde 316.618
  tekil adres, 203.206'sı tek kez (toz / adres zehirleme). Sıkıştırmayı
  belirleyen asıl bu.

**Depolama denemesi — dört ücretsiz motor.** Gerçek saat 48 kez zamanda
kaydırılarak 2 gün (19.074.288 satır) yapıldı. 2 günü TronGrid'den çekmek
kotaya sığmıyor, bu yüzden adres tekrarı iki sınırla ölçüldü: `ayni` (adresler
her kopyada aynı — iyimser) ve `taze` (saatte ≤2 kez görünen adres her kopyada
yeni — kötümser). Gerçek davranış arasındadır. Üretim **deterministiktir**
(yeni adres/tx = `sha256(kopya:eski)`), yani her motor BİREBİR aynı dosyayı
okudu ve hepsi her sorguya aynı cevabı verdi (yoğun alıcı: 560.160 hareket).

Adaylar ve lisansları: **ClickHouse** (Apache 2.0 — ücretli olan yalnızca
ClickHouse Cloud, kendi makinende çalıştırmak ücretsiz), **Postgres**
(PostgreSQL lisansı), **TimescaleDB** (eklenti; sıkıştırma "Timescale License"
altında — ücretsiz kullanılır, açık kaynak değil), **DuckDB** (MIT) ve onun
yazdığı **Parquet** dosyaları (Apache 2.0 biçim).

Bayt/satır ve sorgu süreleri (`ayni` → `taze`; süreler ortanca, sunucudan
okundu, önbellek sıcak):

| Motor | B/satır | 19 Mn satır | Yazma | Yoğun alıcı özeti | İlk 50 gönderen | `kimden` sorgusu |
|---|---|---|---|---|---|---|
| **ClickHouse** (projeksiyonsuz) | **34,5 → 52,1** | 0,66–0,99 GB | 12 sn | 14 → 13 ms | 14 → 13 ms | 18 → 34 ms |
| **Parquet** (ZSTD, kime sıralı) | **39,2 → 55,6** | 0,75–1,06 GB | 2–6 sn | 8 → 22 ms | 6 → 11 ms | 24 → 70 ms |
| TimescaleDB (sıkıştırılmış) | 48,8 → 69,5 | 0,93–1,33 GB | 40 sn + 34 sn sıkıştırma | 220 → 221 ms | 87 → 106 ms | 748 → 1.014 ms |
| TimescaleDB + `bloom(kimden)` | 49,0 → 70,0 | 0,93–1,33 GB | aynı | 225 → 215 ms | 89 → 103 ms | **371 → 732 ms** |
| DuckDB kendi dosyası | 50,9 → 70,5 | 0,97–1,35 GB | 17 sn | 13 → 62 ms | 8 → 27 ms | 8 → 24 ms |
| ClickHouse + `kimden` projeksiyonu | 75,8 → 117,1 | 1,45–2,23 GB | 17–19 sn | 13 → 18 ms | 10 → 16 ms | 5 → 7 ms |
| Postgres bölümlü tablo | 324,5 | 6,19 GB | 52–57 sn + dizin 18 sn | 489 → 503 ms | 311 → 345 ms | 52 ms |

- **Projeksiyon İKİNCİ bir sıralı kopyadır** ve öbür motorlarda karşılığı yok;
  adil sıra projeksiyonsuz hâldir. Projeksiyon `kimden` sorgusunu 18 ms'den
  5 ms'ye indiriyor ama diski iki katına çıkarıyor — bu kapsamda gerekmiyor.
- **Postgres'in dizinleri tablosundan büyük** (190 ⟷ 134 B/satır) ve yoğun
  adreste en yavaş olan o. Küçük kümelerde (orta/seyrek adres) 1 ms'nin
  altında kalıyor: sorun ölçek, dizin değil.
- **TimescaleDB sıkıştırma sırasına göre hızlı ya da yavaş.** `kime`'ye göre
  sıralı sıkıştırılmış parçada "kime = X" 220 ms, ama `kimden` sorgusu bütün
  parçaları açıyor: 0,7–1,0 sn. 2.30'un seyrek `bloom(kimden)` dizini bunu
  yarıya indiriyor (diske etkisi yok), yine de sütunlu iki motordan 20–40 kat
  yavaş.
- **Sütun payı** (ClickHouse `taze`, projeksiyonlu): tx hash 582 MiB — rastgele
  32 bayt, hiç sıkışmaz, toplamın %26'sı; kimden 231 MiB, kime 100 MiB
  (sıralama anahtarı), kalan her şey 60 MiB.

**DuckDB 1.5.5'in Parquet BLOB bloom filtresi BOZUK — ve sessiz.** 19 Mn
satırlık dosyada `kime = unhex('…')` süzgeci 165 satır grubunun 165'ini eliyor
ve **hatasız 0 satır** dönüyor; aynı değer `kime >= x AND kime <= x` ile ya da
süzgeç itmesi kapatılınca 560.160 satır veriyor (`parquet_bloom_probe` ile
doğrulandı). 397 bin satırlık küçük dosyada hata GÖRÜNMÜYOR (4 satır grubu, 0
eleme) — yani küçük veriyle yapılan bir doğrulama bunu yakalayamaz. Ölçüm
betiği artık aralık süzgeci kullanıyor ve hatayı her koşuda ayrıca sınıyor.
Parquet bu kapsamda seçilirse **adres eşitliği ham hâliyle kullanılamaz**;
kural ya aralık süzgeci ya da adresin tam sayıya çevrilmesidir.

**Projeksiyon** (2026 günlük hacmi 6,7 Mn satır; eşikli alt kümede bayt/satır
aynı varsayıldı — toz adresler elendiği için gerçekte iyimser sınıra daha yakın
olmalı, ölçülmedi):

| Kapsam | Satır/gün | CH 1 yıl | Parquet 1 yıl | PG 1 yıl | CH tam geçmiş | Parquet tam geçmiş |
|---|---|---|---|---|---|---|
| Eşiksiz | 6,7 Mn | 84–127 GB | 96–136 GB | ~790 GB | **335–505 GB** | **380–540 GB** |
| USDT ≥100 + TRX ≥100 | 1,76 Mn | 22–33 GB | 25–36 GB | ~210 GB | 94–142 GB | 107–152 GB |
| Yalnız USDT ≥1.000 | 0,74 Mn | 9–14 GB | 11–15 GB | ~88 GB | 38–57 GB | 43–61 GB |

D: NVMe'de bugün 198 GB boş; kullanıcı ileride ~267 GB daha açacak (toplam
~465 GB). **Eşiksiz tam geçmiş yalnızca sütunlu bir motorla ve ancak o disk
açıldığında sığar; kötümser sınırda taşar.**

**İşletim farkı (ölçülmedi ama seçimi bağlar):** DuckDB bir dosyaya tek yazıcı
süreç kabul eder — canlı uç yazarken web'in aynı dosyayı sorgulaması sorun
olur. Parquet'te bu sorun yok: yazıcı yeni dosya ekler, okuyucular var olanları
okur. ClickHouse ve Postgres zaten çok süreçli sunuculardır.

**Toplu geçmiş kaynağı:**
- **BigQuery:** Google yönetimli TRON veri seti var, **önizleme** durumunda:
  `blockchain-analytics-tron-mainnet-us` — `blocks`, `transactions`, `logs`,
  `receipts`, `decoded_events`; hepsi `block_timestamp` üzerinde AYLIK bölümlü.
  **`token_transfers` tablosu YOK** (Ethereum'da var): USDT transferi `logs`tan
  sözleşme adresi + Transfer konusu ile süzülür. **Satır sayısı ve taranan bayt
  BAKILAMADI** — kuru sorgu bir GCP projesi ve kimlik ister, makinede
  `gcloud`/`bq` yok. Bu yüzden "1 TiB ücretsiz kotaya sığar mı" sorusu açık.
- **java-tron anlık görüntüsü:** tam düğüm ~2,9 TB (iç işlemli ~3,1 TB, bakiye
  geçmişli ~3,6 TB) — iki diskin boşuna sığmaz. Lite düğüm yalnızca güncel
  durum + son 65.536 blok (~2,3 gün) taşır; **geçmiş kaynağı OLAMAZ.**
  Kaynak: TRON Developer Hub "Database snapshots" sayfası (2026-09-15).

**B0'dan çıkan sonuçlar:**
1. **Satır tabanlı Postgres bu iş için pahalı:** sütunlu motorların 4,7–9,4 katı
   disk, yoğun adreste 15–35 kat yavaş. Eşiksiz bir yıl tek başına ~790 GB.
2. **Sıra: ClickHouse (projeksiyonsuz) ≈ Parquet > TimescaleDB ≈ DuckDB dosyası
   > Postgres.** İlk ikisi hem en küçük hem en hızlı; aradaki fark (34,5 ⟷ 39,2
   B/satır) seçimi tek başına belirleyecek kadar büyük değil, işletim farkı daha
   belirleyici.
3. **Eşiksiz tam geçmiş (9,7 Mr satır) 335–540 GB ister**: bugünkü 198 GB'a
   sığmaz, kullanıcının açacağı ~465 GB'a iyimser sınırda sığar, kötümser
   sınırda taşar. Karar verilirken "önce canlı uç, geçmiş geriye doğru dolar"
   sırası bu yüzden gerekli.
4. **Hız kapısı şart:** kapısız paralel okuma istek başına ~%60 yeniden deneme.
5. **Sessiz yanlış cevap riski ölçüldü:** DuckDB'nin Parquet BLOB bloom filtresi
   eşitlik süzgecinde 0 satır döndürüyor ve hata vermiyor. Bir motor seçilince
   ilk yazılacak test, bilinen bir adresin sayısının iki farklı yoldan (süzgeçli
   ve süzgeçsiz) aynı çıktığını sınayan testtir.

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

### B1 — Şema ve kursör ✅ (2026-09-16)

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
- **Yapıldı:** `packages/blok-indeks` (saf ayrıştırıcı + şema + HTTP istemcisi),
  `tests/blok-indeks.test.ts` (iki GERÇEK bloktan kurulmuş fixture, 11 test —
  beş vakanın üçü satır ÜRETMEMELİ), `block_cursors` migration'ı, ve
  `scripts/blok-indeks-sema-kur.mts`: şemayı kurar, gerçek satırları yazar,
  geri okur, ikinci yazmanın tekilliği bozmadığını gösterir, sonra siler.
  Ölçüldü: 3 yazıldı / 3 okundu / ikinci yazmadan sonra yine 3.
- **Kalan uç:** tekillik `(tx, idx)` değil `(kime, zaman, tx, idx)` sıralaması
  üzerinden çalışır — aynı hareket iki FARKLI zamanla yazılırsa ikisi de kalır.
  Kursör aralığı yeniden yazdığında zaman değişmediği için bu pratikte
  olmuyor; B2'nin doğrulama kapısı bunu ayrıca ölçecek.

### B2 — Blok okuyucu betiği (tek aralık) ✅ (2026-09-16)

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
- **Yapıldı.** Eşiksiz karar verildiği için beklenen fark SIFIR oldu ve sıfır ölçüldü.
  - **Ölçüm kapısı** (`scripts/olcum/b2-kapi.mts`): `/walletsolidity/getnowblock`
    çalışıyor, uçtan 20 blok geride. 120 ms ortak kapıyla 60 blok 14,4 sn,
    **4,16 blok/sn, 0 yeniden deneme** — zincirin üretim hızının 12,5 katı.
  - **Kod:** `apps/blok-okuyucu/src/oku.ts` (okuyucu), `kaynak.ts` (TronGrid; `@cry/chain`'in
    `RateGate` + `getJson`'u, yanıt ŞEKLİ doğrulanır), `dogrula.ts` (kapı);
    `packages/blok-indeks/src/aralik.ts` (saf aralık/boşluk hesabı, `tests/blok-aralik.test.ts`).
    Kesinleşmiş ucun üstüne taşan aralık reddedilir.
  - **Kapsam tablosu `blok_okundu` — plandan sapma.** Kursörün tek "en yüksek blok" sayısı
    delikli bir geçmişi anlatamıyor (geçmiş geriye ve parça parça dolacak), ve `blok_indeks`te
    satırı olmayan blok "transfer yok" mu "okunmadı" mı ayırt edilemiyor. Okunan HER blok
    (0 transferli dahil) sayaçlarıyla bir satır alır; satırı transferlerden SONRA yazılır.
    Yeniden başlatma ve boşluk listesi buradan HESAPLANIR. Postgres `block_cursors` tur sonunda
    `missing_ranges`, `last_error`, `last_run_at` alır; `last_final_block` canlı ucun (B4)
    işaretidir ve geçmiş aralığı onu ilerletmez. Ölümle biten turda kursör yazılmaz — doğru
    cevap zaten kapsam tablosunda.
  - **Aralık 86.300.000–86.300.999 yazıldı** (2026-09-16 15:22–16:12 UTC):
    292.641 satır (TRX 173.969 · USDT 118.672; `FINAL`), 527.956 işlem, **blok başına 292,6** —
    B0'ın yayılmış örneği (233) ile ardışık saati (331) arasında. Elenen ve SAYILAN: başarısız
    işlem 1.690 · Transfer olmayan olay 6.054 · USDT dışı token Transfer'i 1.158.
  - **Ölüm ve devam ölçüldü:** tur 200. blokta `Stop-Process -Force` ile öldürüldü →
    kapsam 200 blok, `blok_indeks`te 58.791 satır = kapsamın saydığı 58.791 (yarım blok yok).
    İkinci tur "önceden okunmuş 200 · okunacak 800" dedi ve bitirdi. Üçüncü tur: **okunacak 0**,
    1 istek (kesinleşme sorusu).
  - **Tekillik ölçüldü (B1'in açık ucu):** 100 blok `--yeniden` ile ikinci kez yazıldı →
    ham `count()` 323.170, `FINAL` 292.641 = kapsamın saydığı. İki farklı zamanla yazılmış
    anahtar 0, FINAL sonrası aynı (tx, idx, varlık) 0. **Sonuç: birleşme olana kadar
    mükerrer satır DURUR; sayan her sorgu `FINAL` kullanır** (B5'in kuralı).
  - **Doğrulama kapısı:** 48 adres (iki tohumda 40 rastgele + 8 yoğun), sayı VE tutar
    toplamı motorun adres taramasıyla (`TronAdapter.listTransfers`) **48/48 birebir**. Yoğunların
    en büyüğü 420 TRX + 38 USDT hareketi (sayfalama sınandı). Ders: düz rastgele seçim 40/40
    tek-üç hareketli adres getirdi ve sayfalamayı hiç sınamıyordu; kapı artık yoğun adres
    (aralıkta 20–2.000 hareket) de seçiyor.
  - **Sınanmayan:** Ctrl+C ile zarif durdurma Windows'ta ayrık süreçte sinyal gönderilemediği
    için DENENMEDİ (kod yolu yazılı; sert ölüm yolu denendi). B4'te konteynerde `docker stop`
    SIGTERM gönderir — orada ölçülür.

  ```bash
  node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/b2-kapi.mts --blok=60
  node --env-file=.env --env-file=apps/web/.env.local --import tsx apps/blok-okuyucu/src/oku.ts --aralik=86300000-86300999 --uygula
  node --env-file=.env --env-file=apps/web/.env.local --import tsx apps/blok-okuyucu/src/dogrula.ts --aralik=86300000-86300999 --tohum=1
  node --env-file=.env --env-file=apps/web/.env.local --import tsx apps/blok-okuyucu/src/dogrula.ts --aralik=86300000-86300999 --adres=0 --yogun=8 --tohum=3
  ```

### B3 — Geçmiş doldurma ✅ kod + doğrulama (2026-09-17) · koşu sürüyor

- Kaynak B0'ın cevabına göre: toplu dışa aktarım (BigQuery → dosya → yerel
  yükleme) ya da yalnızca vaka tarih pencereleri için blok blok.
- Pencere başına iş, kuyrukta (BullMQ, ayrı kuyruk; takip kuyruğunu
  bekletmez). Eksik aralık dedektörü: kursördeki boşluklar listelenir ve
  yeniden kuyruğa girer.
- **Bitiş:** pencere boşluksuz; satır sayısı kaynağın kendi sayımıyla
  (BigQuery'de `count(*)`) birebir.
- **Ölçüm kapısı ✅ (2026-09-17).** Cevabı kullanıcı verdi: **ücretsiz kaynaklar, geriye doğru,
  dolan disk durdurur** (BigQuery ve "yalnızca son 92 gün" seçilmedi; CLAUDE.md → Blok indeksi).
  - **Geçmiş boyunca yoğunluk** (60 eşit aralıklı nokta × 3 ardışık blok, 2018–2026; nokta başına
    3 blok olduğu için KABA): satır/blok 2018 4,9 · 2019 3,2 · 2020 34,8 · 2021 54,6 · 2022 141,0 ·
    2023 265,8 · 2024 217,8 · 2025 211,3 · 2026 140,1. **Toplam ~10,8 Mr satır** (B0: 9,7 Mr).
    Satırın ~%77'si 2023 ve sonrasında; geriye doğru birikim 2026 → 1,0 · 2025 → 3,3 ·
    2024 → 5,6 · 2023 → 8,3 · 2022 → 9,8 Mr.
  - **Eski bloklar ayrıştırıcıdan geçiyor:** 180/180, ayrıştırma hatası 0 (2018'in USDT'siz blokları dahil).
  - **Gerçek bayt/satır 63,0** (bugünkü 292.641 satır, `OPTIMIZE FINAL` sonrası tek parça): tx 32 ·
    kimden 16,2 · kime 8,2 · tutar 2,9 · blok+zaman 3,3. B0'ın 19 Mn satırlık örneği 34,5–52,1 vermişti;
    küçük ve tek saatlik bir aralık adres tekrarını az görüyor. **Tam geçmiş 52–63 B/satırla
    525–630 GiB** — ~465 GB bütçeyi aşar. Bütçeye kabaca **2023 başına** kadar sığar.
  - **Kaynaklar** (aynı 10 blokta TronGrid'le satır satır karşılaştırma + kapısız/kapılı hız):

    | Kaynak | Geçmiş | TronGrid'le aynı | Hız (hatasız) |
    |---|---|---|---|
    | TronGrid + anahtar | tam | referans | 120 ms kapı 4,16 · **80 ms 6,14** blok/sn; 60 ms'de çöküyor (192 × 429, 0,37 blok/sn) |
    | TronGrid anahtarsız | tam | 10/10 | kapısız 4 eşzamanda 0/40 (429) |
    | tronstack.io | tam | 9/10 — **1 blokta HTTP 200 ile BOŞ bilgi** (719.222, 2018) | 200 ms 2,42 blok/sn; 120 ms'de 503 |
    | tatum (anahtarsız) | tam | 6/10, 4'ü 429 | kapısız 0,74 blok/sn |
    | publicnode | **yalnızca son ~92 gün** (en eski ≈ 83.654.397) — daha eskide blok `{}`, bilgi `[]` | eskide 0/10 | kapısız 8 eşzamanda **24,6 blok/sn, 0 × 429** |

  - **Sessiz boş cevap ölçüldü ve kapatıldı.** İki anahtarsız kaynak, bilgisini tutmadığı blokta
    HTTP 200 + boş dizi döndürüyor; ayrıştırıcı bunu "0 USDT'li blok" diye yazardı. TronGrid'de işlem
    bilgisi 180/180 blokta işlemlerle birebir eşleştiği için `bloktanSatirlar` artık eşleşmeyi ŞART
    koşuyor, eşleşmeyen blok hata atar ve boşluk listesine düşer (`tests/blok-indeks.test.ts`). B2 aralığının
    200 bloğu kuralla yeniden okundu: 200/200, satırlar önceki gibi 58.791.
  - **Süre:** TronGrid'in 80 ms'lik hızıyla tam geçmiş 86,3 Mn blok / 6,14 ≈ **163 gün kesintisiz**,
    tronstack eklenirse (8,5 blok/sn) ≈ 117 gün. Bütçeye sığan kısım (2023 başına, ~39 Mn blok):
    son 92 gün publicnode'dan ~1,5 günde, kalanı ~50 günde. **TronGrid'in günlük kotası ÖLÇÜLMEDİ**
    (proje devri "~100 bin/gün" diyor ve bu doğruysa TronGrid günde 50 bin blok verir, süre katlanır).
    Yanıt başlıklarında kota/kalan bilgisi YOK. Kota ancak uzun bir koşuda kalıcı 429 olarak görünür.
  - **BigQuery hâlâ BAKILAMADI:** makinede `gcloud`/`bq` yok, bir GCP projesi ve kimlik ister.

  ```bash
  node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/b3-kapi.mts --nokta=60 --ardisik=3
  ```
- **Plandan sapma: kuyruk YOK.** Plan pencere başına BullMQ işi diyordu. Tek bir tüketici aylarca
  aynı işi yapıyor ve kaldığı yeri zaten kapsam tablosu biliyor, yani kuyruk bir şey katmıyor. Üstelik
  tüketicisi ikinci bir worker süreci olurdu (CLAUDE.md → Kuyruk ve worker). Doldurucu tek bir süreçtir.
  Eksik aralık dedektörü de kapsamın kendisi: her parça bitince boşluklar hesaplanıp `missing_ranges`e
  yazılır, bir sonraki koşu kapsamda olmayanı okur.
- **Yapıldı:** `apps/blok-okuyucu/src/doldur.ts` (doldurucu), `yazici.ts` (okuyucuyla ortak tamponlu
  yazıcı), `kaynak.ts` çok kaynaklı (TronGrid · tronstack · publicnode, en eski blok ikili aramayla),
  saf katman `packages/blok-indeks/src/doldurma.ts` (`tests/blok-doldurma.test.ts`, 7 test).
  - Uçtan geriye, 10.000 bloklük parçalarla ilerler. Bir kaynakta hata veren blok başka kaynağa
    gider; 20 ardışık hata veren kaynak 60 sn bekletilir.
  - publicnode'a sınırının (+1 gün pay) altında hiç sorulmaz.
  - **TronGrid yalnızca worker'ın `adres-indeksle` ve `takip-kosusu` kuyrukları boşken kullanılır**
    (10 sn'de bir yoklanır; kuyruk okunamazsa kullanılmaz).
  - Her 500. blok ikinci bir kaynaktan okunup satır satır karşılaştırılır. Uyuşmazsa blok yazılmaz.
  - Her parçadan önce D:'nin boş alanına bakılır; `--minBosGB` (50) altında çıkış kodu 3 ile durur.
  - Bir parçada okunamayan blok %1'i ve 10'u aşarsa boşlukla ilerlemek yerine durur.
- **Doğrulama (2026-09-17):**
  - **Uç bölgesi** 86.305.001–86.307.000 (2.000 blok, üç kaynak birlikte): 366.994 satır, 12,43 blok/sn.
    Boşluk 0; çapraz denetim 40/40 uyuştu. publicnode'un 6 hatası başka kaynaklardan okundu.
  - **2021 bölgesi** 30.000.000–30.000.299 (publicnode'a hiç sorulmadı): 25.139 satır, 5,92 blok/sn,
    boşluk 0, çapraz 14/14.
  - Yeniden koşu: okunan 0, önceden okunmuş 2.000.
  - **Adres taramasıyla kapı (`dogrula.ts`): iki aralıkta 25/25 ve 23/23 uyuştu.** Her iki aralıkta
    ham = FINAL = kapsamın saydığı; iki zamanlı anahtar 0.
  - **publicnode'un sürekli hızı kısa ölçümden düşük:** 800 blokta 25 ms × 8 eşzaman 7,71 blok/sn ve
    3 boşluk, 60 ms × 4 eşzaman **5,90 blok/sn ve 0 hata** (varsayılan bu), 120 ms × 2 eşzaman 4,12.
    Kapıdaki 24,6 yalnızca 40 bloklük bir patlamaydı.
  - Aynı dakikalarda publicnode'un en eski bloğu 83.683.124 ile 83.683.741 arasında değişti: arkada
    sınırları farklı düğümler var. 1 günlük pay bunu karşılıyor; payın içine düşen boş cevabı eşleşme
    kuralı yakalar.
- **Beklenen süre:** uçtan 92 gün geriye üç kaynakla ~12 blok/sn (~2,5 gün). Daha eskisi tronstack +
  (kuyruk boşken) TronGrid ile ~6 blok/sn. 2023 başına ~70 gün, disk bugünkü 184 GiB boşla daha erken
  durur (50 GiB eşik → ~130 GiB veri ≈ 2,1–2,6 Mr satır ≈ 2025 ortası). Kullanıcı D:'de yer açınca aynı
  komut kaldığı yerden devam eder.

  ```bash
  # kuru deneme ve doğrulama
  node --env-file=.env --env-file=apps/web/.env.local --import tsx apps/blok-okuyucu/src/doldur.ts --ust=30000299 --taban=30000000 --parca=150 --capraz=20
  node --env-file=.env --env-file=apps/web/.env.local --import tsx apps/blok-okuyucu/src/dogrula.ts --aralik=86305001-86307000 --tohum=7
  # uzun koşu (ayrık süreç; günlük C:\srv\cry\blok-doldur.log)
  node --env-file=.env --env-file=apps/web/.env.local --import tsx apps/blok-okuyucu/src/doldur.ts --uygula --ilerlemeSn=60
  ```

- **Hızlandırma (2026-09-18): toplu blok isteği.** Dünkü 14 saatlik günlükte kaynak başına hız: publicnode 5,4,
  tronstack 2,9, TronGrid 0,45 blok/sn. publicnode blok ~83,68 Mn'un altına inmiyor, yani ~3 gün sonra hız
  ~3,4 blok/sn'ye düşecekti ve disk sınırına ~75 gün kalıyordu. `getblockbylimitnext` tek istekte 50–100 blok
  döndürüyor ve dönen blok `getblockbynum` ile bayt bayt aynı. İşçi artık kaynağından ardışık 20 blok alıyor:
  blokları tek istekte, işlem bilgisini blok blok çekiyor. Ölçüm (tronstack, kuru, aynı 800/600 blok):

  | Ayar | Hız | İstek | Not |
  |---|---|---|---|
  | toplu 1 × 2 eşzaman (eski) | 2,44 blok/sn | 1.601 | |
  | toplu 20 × 2 | 2,92 | 841 | satırlar AYNI (224.772) — darboğaz sıralı bekleme |
  | **toplu 20 × 4** | **4,61** | 631 | hatasız |
  | toplu 20 × 6 | 4,71 | 631 | 1 hata: 200 ms kapı sınırı |

  **Canlıda üç kaynakla 7,3 → 15,25 blok/sn**, hatasız. Eski geçmişte (tronstack + TronGrid) beklenen ~6–7 blok/sn:
  disk sınırı ~75 gün yerine ~38 gün. TronGrid 2 eşzamanda kaldı (kota worker'la paylaşılıyor), ama istek
  sayısı yarıya indiği için kotadan eskisinin yarısını yiyor.
- **Yanlış "bitti" / "takıldı" alarmları (2026-09-18):** günlük damgası UTC'ydi ve bunu söylemiyordu, makine TSİ.
  Bir denetim sapasağlam doldurucuyu "3 saattir ilerlemiyor" diye öldürüp yeniden başlattı; `doldur-devam.ps1`
  günlükteki 16 Eylül'e ait eski bir "bitti:" satırını okuyup "B3 bitti" bildirimi yolladı. Damga artık saat
  dilimini taşıyor (`2026-09-18T04:43:29+03:00`).

### B4 — Canlı uç ✅ kod + doğrulama (2026-09-17) · 24 saat ölçütü sürüyor

- Okuyucu sürekli çalışır: her ~3 sn kesinleşmiş yeni blokları yazar.
  Başlangıç betiğine (`deploy/pc/baslangic.ps1`) eklenir; worker gibi
  konteyner olur, `restart: unless-stopped`.
- **Bitiş:** 24 saat boşluksuz; gecikme (uç − kursör) kayıt altında ve
  izleme servisine (görev 10) bağlanabilir.
- **Ölçüm kapısı ✅** (`scripts/olcum/b4-kapi.mts`, 10 dk, 3 sn'de bir yoklama, 188 yeni blok):

  | Kaynak | Uç geri gitti mi | Uç − TronGrid | Zincire gecikme p50/p95 | Yeni blok ilk okumada tam | TronGrid'le aynı |
  |---|---|---|---|---|---|
  | TronGrid | 0 | referans | 58,7 / 59,4 sn | 183/183 | referans |
  | **publicnode** | **0** | +1,3 blok | **55,2 / 56,0 sn** | 184/188 — **4'ü eksik, 3–13 sn'de tamamlandı** | **188/188** |
  | tronstack | 0 | +1,3 blok | 55,2 / 56,0 sn | **0/178** — 30 sn sonra da 176'sı eksik | (2/2) |

  Sonuç: **birincil publicnode** (TronGrid kotasına dokunmuyor, uçta en hızlı), **yedek TronGrid**; tronstack
  uçta kullanılmaz. Yeni blokta bilginin eksik gelmesi BEKLENEN bir durumdur: eşleşme kuralı yakalar,
  okuyucu bekleyip aynı bloğu yeniden okur.
- **Yapıldı:** `apps/blok-okuyucu/src/canli.ts` (okuyucu), `Dockerfile`, compose servisi `blok-okuyucu`
  (`cry-blok-okuyucu`), `canli-denetle.ts` (bitiş ölçütü: aralıkta boşluk, satır = kapsam, kursörün uca uzaklığı).
  - **Kursör yalnızca KESİNTİSİZ okunmuş bloklar kadar ilerler** (`bitisikKursor`, testli). Okunamayan blok
    atlanmaz; publicnode 5 kez (3 sn arayla), sonra TronGrid, sonra artan beklemeyle baştan. Gecikme büyür
    ve günlükte görünür, ama boşluk oluşmaz.
  - İlk açılış: `last_final_block` boşsa kapsamın en yüksek bloğundan, yani B3'ün başladığı yerden devam eder.
  - Nabız dosyası + compose sağlık denetimi (2 dk nabızsızsa sağlıksız). `stop_grace_period: 30s`.
  - Deploy denetimi ve açılış betiği `cry-clickhouse` ile `cry-blok-okuyucu`yu da soruyor. B1'den beri
    `cry-clickhouse` ikisinde de eksikti.
- **Doğrulama (2026-09-17):**
  - Makinede kuru deneme: 60 blok geriden 45 sn'de uca yetişti, sonra uçta 0 blok geride kaldı.
  - **Konteyner** (`cry-blok-okuyucu-deneme`, `C:\srv\cry\.env` ile yığının ağında): kapsamın en yüksek
    bloğundan (86.308.051) başladı, 2 dk'da 211 bloğu yetiştirdi, uçta 54 sn gecikme.
  - **`docker stop` → 2 sn, çıkış 0, kursör kaydedildi** (86.308.267). B2'den açık kalan zarif durdurma
    böylece ölçüldü. `docker start` → "kursör 86.308.267 (block_cursors.last_final_block)" ile devam.
  - `canli-denetle --bas=86308052`: 256 blok, **boşluk 0**, satır 33.679 = kapsam, kursör uçtan 3 blok geride.
  - `dogrula.ts` aynı aralıkta adres taramasıyla **20/20** uyuştu.
- **Deploy yığını ClickHouse DAHİL yeniden oluşturuyor — ölçüldü.** B3 push'unda ClickHouse 3 sn kapandı ve
  makinedeki doldurucu "fetch failed" ile durdu. Durması kurala uygundu ve veri tutarlıydı (satır = kapsam,
  3.538.755). Artık yazıcı, kapsam sorgusu ve kursör yazımı bağlantı ve 5xx hatalarını 10 dk boyunca yeniden
  deniyor. Denendi: yazma sırasında `docker restart cry-clickhouse` → "yazma 2 denemeden sonra geçti",
  1.000 blok, boşluk 0, satır = kapsam.
- **Yerel imaj tuzağı:** depoda `.dockerignore` yok ve `COPY . .` bu makinedeki Windows `node_modules`'ünü
  (Windows yolu gösteren sembolik bağlar) imaja taşıyor: `Cannot find package '@cry/blok-indeks'`. Runner'ın
  temiz checkout'unda `node_modules` olmadığı için deploy etkilenmiyor. Yerel deneme, git'in bildiği
  dosyalardan kurulmuş temiz bir kopyadan derlenir.
- **Kalan:** 24 saat boşluksuz ölçütü. Servis bir sonraki deploy'la `cry-blok-okuyucu` olarak gelir; deploy
  adımı deneme konteynerini kaldırır. Kursör Postgres'te olduğu için yeni konteyner kaldığı yerden sürer.
  Ölçüt: `canli-denetle --bas=86308052`, aralık ≥ 24 saat, boşluk 0.

  ```bash
  node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/b4-kapi.mts --dakika=10
  node --env-file=.env --env-file=apps/web/.env.local --import tsx apps/blok-okuyucu/src/canli-denetle.ts --bas=86308052
  node --env-file=.env --env-file=apps/web/.env.local --import tsx apps/blok-okuyucu/src/dogrula.ts --aralik=86308052-86308307 --tohum=11
  docker logs --tail 5 cry-blok-okuyucu
  ```

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

**Kapı ölçümü (2026-09-17)** — `scripts/olcum/b5-kapi.mts`, tablo 63,2 Mn satır:

- **Pencere:** boşluksuz son aralık 86.037.434–86.316.657 = 279.224 blok, **9,70 gün**
  (2026-09-07 12:28 → 09-17 05:15 UTC), 63.057.285 satır. B3 geriye doğru ilerledikçe pencere günde
  ~22 gün genişliyor. Pencere dışındaki eski deneme öbeği (30.000.000–30.001.299) keşfe girmez.
- **Keşif, arşivin 31.896 TRON adresi üzerinde** (31.780'i `bilinmiyor`), karşı taraf eşiği 50:

  | Tutar ≥ | Pencerede görünen arşiv adresi | Aday | ↳ `bilinmiyor` (YENİ) | ↳ mevcut keşif etiketi | Gelen / giden sorgusu |
  |---|---|---|---|---|---|
  | 0 | 1.221 | 71 (+1 yakma) | 69 | 1 | 655 / 472 ms |
  | 1 | 237 | 63 (+1 yakma) | 62 | 1 | 295 / 432 ms |
  | 100 | 174 | 52 | 51 | 1 | 245 / 319 ms |

  - **Mevcut 17 keşif etiketinin 16'sı pencerede eşiğin ALTINDA.** Onlar yılların taramasından ölçüldü,
    pencere 9,7 gün. Pencere ölçümü bir ALT SINIRDIR (`kismi` gibi): aday EKLER, var olan etiketi
    düşürmez ya da silmez.
  - **Arşivle sınırlanmayan keşif anlamsız:** pencerede ≥50 farklı göndericisi olan zincir adresi
    **111.235** (667 ms). Keşif yalnızca arşivin sorduğu adreslere bakar.
  - Tutar ≥0'da pencerede görünen arşiv adresi 1.221, ≥1'de 237: arşiv adreslerinin çoğuna pencerede
    yalnızca 1 TRX/USDT altı tutar geliyor. Toz, karşı taraf sayısını şişirebilir (adres zehirleme).
- **Katman 2 ile tutarlılık:** taraması pencereye uzanan 3 `tam` adreste gelen karşı taraf kümesi ve
  hareket sayısı 3/3 aynı. Örnek küçük, çünkü taramalar 09-10/11'de bitiyor. Geniş karşılaştırma B2/B4'ün
  `dogrula.ts` koşularında (25/25, 23/23, 20/20).
- **Hız — adres sayfası:**

  | Sorgu (tek adres, tüm tablo) | Ortanca | Okunan satır | Tam geçmişe (10,8 Mr) izdüşüm |
  |---|---|---|---|
  | `kime =` (gelen), `FINAL`, 1,1–1,5 Mn satırlık adres | 107–118 ms | 1,3–1,5 Mn | sıralı anahtar: adresin hacmiyle büyür |
  | `kimden =` (giden), `FINAL` | 579–610 ms | **63–65 Mn (tam tablo)** | **~100 sn** |
  | `kimden =`, `FINAL`sız | 50–104 ms | 63 Mn | 9–18 sn |
  | `kimden =`, son 3 gün | 515 ms | — | bölüm AYLIK: ayın tamamı okunur |

  **Giden yön tam tarama.** Sıralama `(kime, …)` ve bölüm aylık, `zaman` süzgeci ayın içini daraltmıyor.
  Adres sayfasının "kime gönderdi" sorusu tam geçmişte kullanılamaz hâle gelir. Ölçülen iki ayna
  (202609 bölümü, `OPTIMIZE FINAL` sonrası):

  | `kimden` sıralı kopya | Bayt/satır | Ana tabloya ek | Aynı sorgu |
  |---|---|---|---|
  | Tam kopya (aynı sütunlar) | 54,4 | +%97 | 30 ms |
  | **İnce ayna:** tx yerine `cityHash64(tx)`, blok yok | **28,2** | **+%52** | 28 ms |

  İnce aynada 63 Mn (tx, idx) çiftinde karma çakışması 0. Anahtar `kimden` ve `zaman`ı da taşıdığı için
  çakışma tekilliği bozamaz. Ana tablonun sütun payı: tx 32 · kimden 14,7 · kime 2,8 · tutar 2,4
  bayt/satır. `kimden`in payı `kime` sıralı tabloda 14,7, `kimden` sıralı aynada 2,2.
  **Karar (kullanıcı, 2026-09-17): ince ayna ŞİMDİ kurulur** — disk alanı genişletilecek (Docker ileride
  yeniden C:'ye taşınabilir). **Keşifte tutar eşiği YOK, toz ayrı gösterilir.**

  ```bash
  node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/b5-kapi.mts
  ```

- **Yapıldı (2026-09-17):**
  - **Ayna** `blok_indeks_giden` + materialized view `blok_indeks_giden_mv`. Yazan kod aynayı bilmiyor:
    doldurucu ve canlı uç ana tabloya yazdıkça MV aynayı doldurur. MV'den önceki satırlar
    `scripts/blok-indeks-ayna-doldur.mts` ile kopyalandı: iki bölüm, 202609'da 66 sn, ana tablo ile aynanın
    `FINAL` sayısı eşit (65.932.272). Ayna diskte 1,90 GiB (birleşme öncesi). İki yazar da hatasız sürdü.
  - **Okuma sorguları** `packages/blok-indeks/src/sorgular.ts`, keşif ve web aynı yerden okur:
    - `pencereOku`: boşluksuz son aralık, 98 ms.
    - `adresOzeti`: yön × varlık başına karşı taraf, hareket, toplam ve en büyük 10 karşı taraf. En yoğun
      adreste (1,1 Mn gelen) 512 ms.
    - `kesifSayilari`: toplu, geçici Memory tablosuyla.
    - Toz (`TOZ_SINIRI`, <1 TRX/USDT) her yerde AYRI sayılır.
  - **Keşif** `--kaynak=kesif-blok`, uygulaması `packages/etiket/src/kesif-blok-oku.ts`:
    - Kaynak `kesif_blok`; kanıtta pencere, sayılar ve toz sınırı var.
    - Pencere ölçümü ALT SINIR sayılır (`kismi`). Gerekçe cümlesi toz sayısını ayrıca söyler (testli).
    - Kuru koşu sonucu: 71 aday → **50 yazılacak** · 20 güven ≤ 0,7 · 1 zaten doğrulanmış · 1 yakma. Örnek:
      `TAzsQ9Gx…` "3069 farklı adresten alıyor (3053'i yalnızca toz), 128231 farklı adrese gönderiyor".
    - **Yazılmadı:** yazılırsa bu adresler sonraki koşularda `terminal_aday` durması üretir. Kullanıcı onayı
      bekliyor.
  - **Adres sayfası:** `GET /api/adres/tron/<adres>/blok-indeksi` ve `BlokIndeksi.tsx`:
    - Köken oluğu "türetildi". Pencere tarihleri, "aday bilgi — takip ve rapor kullanmaz", toz notu ve açılır
      en büyük karşı taraflar görünür.
    - ClickHouse'a ulaşılamazsa "bakılamadı" der, "hareket yok" demez.
    - Web konteyneri `CLICKHOUSE_URL=http://clickhouse:8123` alır.
    - Oturumsuz doğrulandı: görünüm katmanı gerçek veriyle statik çizildi. Üç adres ve bakılamadı durumu
      çizildi; tablo taşması 0.
- **Kalan:** takip motorunda önbellek ısıtma (sıradaki adresi önceden taramaya koymak). Atıf ve durma
  kararlarını değiştirmez; koşu 9'un "sonuç aynı" ölçütü bugün de geçerli, çünkü motor koduna
  dokunulmadı. Canlıda adres sayfası gözle bakılacak (push sonrası).

  ```bash
  node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/blok-indeks-ayna-doldur.mts --uygula
  node --env-file=.env --env-file=apps/web/.env.local --import tsx packages/etiket/src/cli.ts --kaynak=kesif-blok [--uygula]
  ```

### B6 — İşletim

- Disk izleme ve uyarı (bölüm başına boyut, kalan alan; D: NVMe 198 GB boş).
- Yedek (`cozulmesi-gerekenler §11` — bugün yedek yok).
- Eski bölümleri silme ya da arşivleme politikası (pencere dışı).
- **Bitiş:** CLAUDE.md'ye işletim kuralları; başlangıç betiği okuyucuyu da
  denetliyor.

### B7 — EVM (Faz 1b)

Aynı iskelet, farklı okuyucu: ERC-20 `Transfer` olayları (USDT/USDC) +
yerel transfer. Önce B0'ın EVM karşılığı ölçülür (BSC hacmi TRON'a yakın).

## M1 — Takip koşuları blok indeksini okusun (ölçüm kapısı, 2026-09-21)

Kullanıcı hedefi: "Kendi motorumuzdan istediğimiz takip koşularını yapalım. TronGrid'e ihtiyacımız
kalmasın." Bu, CLAUDE.md'nin **iki katman** kuralını (indeks ADAY üretir, hüküm adres taramasınındır)
değiştirmek demek; şartı indeksin TronGrid'le BİREBİR aynı hareketleri verdiğini ölçmekti.
Betik `scripts/olcum/m1-kapi.mts`.

```bash
node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/m1-kapi.mts --adres=5
```

- **A) Pencere 95,52 gün:** 83.693.140–86.443.134 (2.749.995 blok), 2026-06-18 → 2026-09-21.
  B5'te 9,7 gündü; doldurucu toplu istekle hızlandıktan sonra 95 güne çıktı.
- **B) Arşiv kapsaması %0,34:** Postgres'teki 86.674 TRON hareketinin yalnızca 299'u pencerede.
  Arşiv 2018-06-25 → 2026-09-11 aralığına yayılı. **Motor bu yüzden BUGÜN melez olmak zorunda:**
  pencere içi indeksten, pencere dışı TronGrid'den.
- **C) Doğruluk: 13 adres, 560 hareket, EKSİK 0 / FAZLA 0.** (İki koşu: 8 adres/314 hareket ve
  5 adres/246 hareket.) Karşılaştırma anahtarı `(tx, kimden, kime, varlık, tutar)`;
  **`idx`/`index` anahtara GİRMEZ** — indekste TRC20 `idx`'i işlemin OLAY dizisindeki konum,
  TronGrid adaptöründe aynı adresin o işlemdeki kaçıncı kaydı. İkisi karıştırılırsa aynı hareket
  iki ayrı hareket sanılır.
- **D) Hız: indeks 498 ms, TronGrid 8.764 ms → 17,6 kat.** Ama ancak DOĞRU sorgu yoluyla (aşağıda).

### Motorun atacağı üç sorgu — ve iki tuzak

Doğru yol (ölçülen 326–871 ms, ortalama 498 ms):

1. **gelen** ← ana tablo, `kime = X` (birincil anahtar ön eki) — **80 ms**
2. **giden** ← ayna `blok_indeks_giden`, `kimden = X` (aynanın birincil anahtar ön eki) — **~300 ms**
3. **tx çözümü** ← aynada tx yerine `cityHash64` var; gerçek hash defterin blok gezgini bağlantısı
   için ŞART. Aynanın verdiği `(kime, zaman)` çiftleriyle ana tablo NOKTA okunur — **~100 ms**.
   Ölçüldü: çözülen satır sayısı aynanınkiyle birebir (23/23, 71/71, 25/25, 3/3).

Tuzak 1 — **`kime OR kimden` tek sorguda yazılmaz.** Birincil anahtarı TAMAMEN devre dışı bırakıyor,
596 Mn satır taranıyor: 25.842–47.000 ms. İki ayrı sorgu şart.

Tuzak 2 — **tx çözümü JOIN ile yazılmaz.** `INNER JOIN blok_indeks AS m FINAL` sağ tablonun
TAMAMINI belleğe alıyor: aynı iş 26.369 ms. Ön ek okuması 15–98 ms. Aradaki fark 300 kat.

Ayrıca ana tabloda `kimden` taraması **29.496 ms** — ayna olmasaydı indeks TronGrid'den 3 kat YAVAŞ
olurdu. B5'in ayna kararı burada karşılığını verdi.

### "Eksik 0" ne demek DEĞİL

İndeks TronGrid'le aynı cevabı veriyor; **eksiksiz olduğunu göstermiyor.** İkisi de sözleşme içi
(internal) TRX transferlerini göstermiyor — TronGrid'in hesap uçları da onları döndürmüyor. Yani bu
ölçüm "indeks kaynağı kadar iyi" der, "zincirin tamamı" demez. O boşluğu BigQuery'nin
`tron_internal_transactions` tablosu kapatacak (bkz. BigQuery maliyet ölçümü).

### M1-E — `transfers.index` KAYNAĞA BAĞLI ÇIKTI (2026-09-21)

Kapının C sorusu (hareket kümesi) geçti, ama hareketi VERİTABANINDA tekilleştiren anahtar geçmedi.
Postgres'te `@@unique([chain, txHash, index])` var ve yazma `skipDuplicates`. İki yol aynı harekete
farklı `index` verirse aynı para İKİ SATIR olur.

```bash
node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/m1-kapi.mts --adres=6 --cokKayitli
```

Ölçüm (6 adres, 2.270 hareket — aday seçimi bilerek ZOR haldan: aynı işlemde adrese ait 3+ kaydı olanlar):

| Kural | Uyuşmayan |
|---|---|
| **KURAL-1** — bugünkü şema: TronGrid'in verdiği sıra (adresin o işlemdeki kaçıncı kaydı) | **60 / 2.270** |
| **KURAL-2** — aday: işlem içinde aynı (kimden, kime, varlık, tutar) dörtlüsünün kaçıncı TEKRARI | **0 / 2.270** |

**KURAL-1 neden üretilemiyor:** TronGrid adaptörünün sırası, adresin o işlemdeki kayıtlarını BÜTÜN
TOKEN'LAR boyunca sayıyor. Blok indeksi yalnızca USDT ve TRX tutuyor, yani aradaki kayıtları
göremiyor. Somut: tx `9e4d9165…` indekste `idx` = 0,1,2,3,4,5,**7** — 6 yok, çünkü o konumdaki olay
USDT değil. TronGrid aynı adrese o işlemde 8 kayıt verip 0–7 numaralıyor. Sayı, BAKANIN kapsamına
bağlı; kaynaktan bağımsız bir kimlik olamaz.

**KURAL-2 neden işe yarıyor:** İçerik tek başına anahtar değil (aynı tx'te 20 özdeş Transfer olayı
ölçülmüştü), ama içerik + tekrar sırası anahtar. Özdeş iki kaydın hangisine #0 hangisine #1 dendiği
ÖNEMSİZ — özdeşler zaten birbirinin yerine geçer, çokluk aynı kalır. Bir adresi sorgulayan taraf,
o adresi ilgilendiren bir dörtlünün BÜTÜN kopyalarını görür (kopyaların hepsinde aynı kimden/kime
var), o yüzden sayım iki kaynakta da aynı çıkar.

**Bugünkü veri buna hazır:** 86.674 TRON satırında aynı dörtlüden birden çok satırı olan yalnızca
**4 öbek** var. Yani `occurrence` sütunu gerçekten gerekiyor (dörtlü tek başına yetmez) ama göç
küçük.

Önerilen değişiklik (UYGULANMADI, kullanıcı kararı bekliyor):
- `transfers`'a `occurrence Int` eklenir; pencere fonksiyonuyla mevcut satırlar için hesaplanır.
- Tekillik `(chain, txHash, index)` → `(chain, txHash, fromAddressId, toAddressId, assetId, amountRaw, occurrence)`.
- `index` KALIR — sıralama ve gösterim için; artık kimlik değil, kaynağın kendi sırası.
  (takip.ts `orderBy: [ts, index]` kullanıyor; kimlik değişse de sıra bozulmaz.)

### M1 uygulaması — motor artık kendi diskimizden okuyor (2026-09-21)

`apps/worker/src/blok-indeksli-adaptor.ts` `ChainAdapter`'ın ÖNÜNE geçiyor; `adresIndeksle` hiçbir
şey bilmiyor, `registry.get` yerine `adaptorAl` çağırıyor. `listTransfers` DIŞINDAKİ her şey
(bakiye, aktivasyon, tek işlem) hâlâ kaynağın işi — blok indeksi yalnızca HAREKET tutuyor.

**Yönlendirme kuralı:** sorulan aralığın bir ucu bile pencerenin dışındaysa soru TronGrid'e gider.
Yarısını indeksten yarısını kaynaktan DİKMEK yok: pencere sınırı blok hassasiyetinde, TronGrid'in
TRC20 ucu ise blok numarası vermiyor; zaman üzerinden dikiş sınırda hareket kaybeder ya da çiftler.
ClickHouse'a ulaşılamazsa pencere "bilinmiyor" sayılır ve soru kaynağa gider — sessiz boş cevap,
bakılmamış bir yeri temiz gösterirdi.

**Gerçek veriyle doğrulama** (`scripts/olcum/m1-adaptor-dogrula.mts`) — sayfalama dahil, motorun
gerçekten kullandığı yol, karşılaştırma Postgres'teki TEKİLLİK ANAHTARININ aynısı üzerinden
`(txHash, from, to, sözleşme, tutar, occurrence)`:

```bash
node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/m1-adaptor-dogrula.mts --adres=6 [--cokKayitli]
```

| Koşu | Adres | Hareket | Eksik | Fazla | Sarmalayıcı | TronGrid | Oran |
|---|---|---|---|---|---|---|---|
| olağan | 5 | 246 | **0** | **0** | 238 ms | 3.688 ms | 15,5x |
| **çok kayıtlı** (zor hal) | 5 | 2.086 | **0** | **0** | 106 ms | 7.192 ms | **67,8x** |

Zor halde `TYRVFVe4YGHQpBSiW4XQu1WVDyVrf8cJ8S` var — M1-E'de `index` alanında 60 kayma veren adres.
Kimlik `occurrence`a taşındıktan sonra 205/205 birebir.

Yönlendirme de çalıştırılarak doğrulandı: `fromTs` yokken "ilk tam tarama — pencere geçmişin
tamamını kapsamıyor" diyip kaynağa gidiyor; pencere öncesi bir `fromTs` ile "aralık pencere dışında"
diyor. İkisi de TronGrid'e düşüyor, doğru.

**Bugünkü kazanım DAR ve bunu söylemek gerek:** pencere 96 gün, arşivin %0,34'ü. Yani indeks bugün
yalnızca (a) penceresi içinde kalan artımlı taramaları ve (b) son üç ayın vakalarını karşılıyor.
İlk kez taranan bir adres hâlâ TronGrid'e gidiyor, çünkü onun sorusu "bütün geçmiş". Asıl kazanç
tam geçmiş yüklendiğinde gelir; iskelet o güne hazır.

**Görünürlük:** `IndeksSonucu.hareketKaynagi` worker günlüğüne "kaynak: blok-indeksi (pencere içi
96,1 gün)" diye düşüyor. Hangi yoldan beslendiğini söylemeyen bir hızlanma, ölçülemez.

### M2 — `create_time` ile ilk taramayı indeksten yapma fikri ÖLDÜ (2026-09-22)

M1 uygulandıktan sonra ortaya çıkan sorun: takip koşusu YENİ adres keşfediyor, onların
`indexedThroughTs`'i boş, soru "bütün geçmiş" oluyor ve yönlendirme TronGrid'e gidiyor. Yani
M1'in 67 katlık hızlanması takip koşusuna HİÇ yansımıyordu.

Denenen fikir: adresin ömrü pencerenin içindeyse "bütün geçmiş" sorusunu da indeks karşılar; ömrün
başlangıcı TronGrid'in `create_time`'ı (adaptörde `firstSeen`).

```bash
node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/m2-kapi.mts --adres=12
```

**Sonuç: uyan 2, İHLAL 6, `create_time` hiç yok 1.** `create_time` ilk hareketin ALT SINIRI DEĞİL.

| Adres | create_time | En eski hareket | Fark |
|---|---|---|---|
| `TNCe7C4kMbKFHT2bLRBsrnGKvvnPMqFLcD` | 2026-09-17 | 2026-07-06 | **73 gün** |
| `TSFbLC7TXG4vZrdA2McFkRhaPdJYku7vYo` | 2026-07-31 14:48 | 2026-07-31 12:24 | 2,4 saat |
| `TJu4HxVRgb2pGnpDscywbx78EitpeaF2vy` | 2026-08-01 17:29 | 2026-08-01 17:26 | 2 dk |
| `TXZ9jpcp1yvgXTmRdJcWRwWjFJUvbb8Kqo` | **yok** | 2026-01-16 | — |

Sebep zincirin kendisinde: TRC20 bakiyesi SÖZLEŞMENİN deposunda tutuluyor, yani aktive EDİLMEMİŞ
bir adrese USDT gönderilebilir. `create_time` hesabın aktivasyonunu söyler, paranın ilk gelişini
değil. Buna dayanan bir kural adresin daha eski hareketlerini "yok" sayardı — bakılmamış bir yeri
temiz göstermek.

**Ölçülmeden yazılsaydı** takip koşusu sessizce eksik graf üretirdi ve hata ancak bir davada
görülürdü. `firstSeen` bir KAYNAK İDDİASIDIR; zincirin olgusu sanılmamalı.

### M3 — Melez tarama: dikiş yerine ÖRTÜŞME (2026-09-22)

M1 bittiğinde kural şuydu: aralığın bir ucu bile pencere dışındaysa soru komple kaynağa gider.
Gerekçe, iki parçayı birleştiren dikişin sınırda hareket kaybetmesi ya da çiftlemesiydi. M2, o
kuralın takip koşusuna hiçbir fayda bırakmadığını gösterdi — koşu YENİ adres keşfediyor, onların
sorusu "bütün geçmiş", yani hep kaynağa gidiyor.

**Gerekçenin düştüğü yer:** `occurrence` göçünden (20260921160000) sonra aynı hareketi iki kez
yazmak ZARARSIZ, çünkü kimlik kaynaktan bağımsız ve `skipDuplicates` onu eliyor. O hâlde dikişi
sıfır genişlikte tutmaya çalışmak yerine parçaları BİLEREK ÖRTÜŞTÜRMEK doğru cevap: boşluk riski
ortadan kalkar, bedeli olan mükerrerlik zaten bedava eleniyor.

Uygulama `apps/worker/src/blok-indeksli-adaptor.ts`: `ORTAK_PAY_SN = 300`. Birinci parça kaynaktan
`[fromTs, pencereBaşı + 5 dk]`, ikinci parça indeksten `[pencereBaşı, son]`.

**Sayaçlar AYRI olmalı.** Kaynak parçasını sarılan adaptör kendi `TekrarSayaci`'yla, indeks parçasını
sarmalayıcı kendisininkiyle numaralar. Ortak bir sayaç, örtüşen bölgede kaynağın #0 dediği kayda
indeks tarafında #1 derdi ve mükerrerlik kimlik düzeyinde BOZULURDU — örtüşme o an gerçek mükerrer
satıra dönüşür.

```bash
node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/m1-adaptor-dogrula.mts --adres=4
```

| Ölçüm | Adres | Hareket | Eksik | Fazla |
|---|---|---|---|---|
| pencere içi (saf indeks) | 2 | 226 | 0 | 0 |
| **melez** (fromTs pencereden 2 gün önce) | 3 | 234 | **0** | **0** |

`fazla 0` burada asıl bulgudur: bilerek örtüştürülen 5 dakika FAZLADAN satır üretmiyor.

Yönlendirme dört durumda da çalıştırılarak doğrulandı:

| Sorulan | Seçilen yol |
|---|---|
| `fromTs` yok | melez |
| `fromTs` pencereden önce | melez |
| `fromTs` pencere içinde | blok-indeksi |
| aralık tamamen pencere öncesi | trongrid |

**Hız dürüstçe:** melezin bedeli pencere ÖNCESİ geçmişin büyüklüğü. Ömrü yeni bir adreste o parça
birkaç boş isteğe iner; 2018'den beri işleyen bir adreste inmez. Ölçülen süreler 625–8.348 ms
arasında oynadı ve TronGrid kotası canlı worker'la paylaşıldığı için gürültülü — buradan tek bir
hızlanma katsayısı çıkarmak doğru olmaz. Kesin olan şey doğruluk.

### M4 — "Rastgele bir adres verdiğimde ne kadar sürüyor?" (2026-09-22)

Kullanıcının hedefi: *"Ben sana rastgele bir cüzdan adresi veya TX hash verdiğimde çok uzun
olmayan bir sürede bunun sankey diyagramını, takip koşusunu çıkarmanı isteyeceğim."*
M1–M3 motoru indekse bağladı; bu ölçüm uçtan uca karşılığını söyler.
Betik `scripts/olcum/m4-takip-suresi.mts` (koşu kuyruğa atılmaz, `takipKos` doğrudan çağrılır;
deneme koşusu sonunda SİLİNİR).

```bash
node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/m4-takip-suresi.mts --adres=T... --hop=2 --dugum=12
```

| Kök | Toplam | Kök indeksleme | Koşu | Graf | Yol dağılımı |
|---|---|---|---|---|---|
| `TLkwyaJU…` | **201,5 sn** | 4,0 sn (blok-indeksi) | 197,5 sn | 12 düğüm / 63 kenar | — |
| `TN3U9Ryq…` | **204,9 sn** | 6,3 sn (melez) | 198,5 sn | 10 düğüm / 28 kenar | **melez 8 / 8** |

**Süre nereye gidiyor:** koşunun keşfettiği 8 adresin 8'i de MELEZ yoldan indeksleniyor, yani
pencere öncesi geçmişleri TronGrid'den okunuyor. Adres başına ~25 sn ve koşu süresinin tamamı bu.
Pencere içi kısım ölçülmüş haliyle 106–498 ms; yani bugünkü 198 saniyenin içinde indeksin payı
saniyenin altında.

**Bir şey daha ortaya çıktı:** motor tohumu Postgres'ten okuyor (`tohumGirisleri`), dolayısıyla
İNDEKSLENMEMİŞ bir kökle koşu 1 düğümde biter. İlk denemede tam bu oldu: 10,9 sn, 0 kenar.
Arayüzdeki gerçek sıra da budur (adres aranır → indekslenir → takip başlatılır), ama "adresi
yapıştır, koşuyu al" diye tek adımlık bir akış yazılacaksa kök indekslemesini kendisi yapmalı.

**Tam geçmiş yüklendiğinde ne değişir:** 8 adresin 8'i de MELEZ değil saf İNDEKS yoluna düşer.
Ölçülen tek adres maliyeti 106–498 ms olduğuna göre aynı koşu ~198 sn yerine **birkaç saniyeye**
iner. Yani hedefteki "çok uzun olmayan süre" bugün 3,5 dakika, tam geçmişle saniyeler.
Bu, BigQuery kararının somut karşılığıdır.

## 2 TB diske göç — hazırlık ve sıra (2026-09-23)

Disk: **Lexar NM620 2 TB, PCIe 3.0 M.2** (sipariş verildi). Yerine takılacak: D: = *MLD M300 NVMe
465,8 GiB*. Her iki M.2 yuvası dolu, o yüzden bu bir TAKAS; çıkan 465 GiB disk boşta kalır.

### Bugün ölçülen durum

| | |
|---|---|
| `CustomWslDistroDir` | `D:\Docker\wsl` (doğru anahtar; `DataFolder` WSL2'de hiçbir şey yapmaz) |
| `docker_data.vhdx` | **117,9 GiB** (`D:\Docker\wsl\disk\`) |
| İçindeki gerçek kullanım | imaj 7,5 GB · konteyner 1,3 GB · **volume 73,4 GB** · derleme önbelleği 14,35 GB |
| Geri alınabilir | ~17,7 GB ölçüldü; **13,7 GB'ı 2026-09-23'te alındı** (`docker builder prune -f`: 14,78 → 1,08 GB) |
| D: boş | ~347 GiB |

Önbellek temizliği dosyayı KÜÇÜLTMEZ ama içeride yeniden kullanılabilir alan açar: doldurucu
büyütmeden önce oraya yazar, yani D:'nin boşu daha uzun süre yerinde kalır.

**VHDX kendiliğinden küçülmez** (CLAUDE.md'de bir kez yaşandı: içinde 6 GB veri varken dosya
125 GB'tı). Bu yüzden göçten önce küçültmek hem kopyalamayı kısaltır hem D:'yi hemen rahatlatır.

### Göç sırası (disk geldiğinde)

Adımların hepsi geri alınabilir; veri tek bir dosyada (`docker_data.vhdx`).

1. **Önce ölç:** `powershell -File deploy\pc\goc-onkontrol.ps1` — anahtar, vhdx yeri/boyutu,
   hedef diskte yer var mı, konteyner sayısı, ClickHouse satır sayısı. Çıkış 0 değilse durulur.
2. **El frenini çek:** `New-Item C:\srv\cry\doldurucu-dur` — bekçi doldurucuyu geri başlatmasın.
3. **Doldurucuyu durdur** (öldürmek zararsız, kapsam tablosu yeri biliyor).
4. **Çöpü at:** `docker builder prune -f`. (2026-09-23'te bir kez yapıldı, 13,7 GB.) `docker image
   prune -f` 0 döndü: 3,6 GB "geri alınabilir" imaj ETİKETLİ ama kullanılmayan imajlar ve `-a`
   olmadan silinmiyorlar — `-a` KULLANILMAZ, çalışan konteynerlerin imajını da götürebilir.
5. **İçeriden trim:** `wsl -d docker-desktop -e fstrim -av`.
6. **Docker'ı KAPAT** — `docker desktop stop` sonra `wsl --shutdown`. **Zorla kapatma**
   (`Stop-Process -Force`) Docker'ı "Inference manager" hatasıyla açılıp kapanır hâle getiriyor.
7. **Küçült (YÖNETİCİ):** `diskpart` → `select vdisk file="D:\Docker\wsl\disk\docker_data.vhdx"`
   → `attach vdisk readonly` → `compact vdisk` → `detach vdisk`. Bir kez 125 → 9,3 GB yapmıştı.
8. **Taşı:** `D:\Docker\wsl` klasörünü yeni diske kopyala (taşıma değil KOPYALA; eski kalsın).
9. **Anahtarı değiştir:** Docker KAPALIYKEN `settings-store.json` içindeki `CustomWslDistroDir`
   metin olarak yeni yola çevrilir. **BOM eklenmez** — `ConvertTo-Json` + `Set-Content -Encoding UTF8`
   BOM ekliyor ve dosyayı bozuyor; tek değer `[regex]::Replace` ile değiştirilip
   `UTF8Encoding($false)` ile yazılır (`kur.ps1`'deki AutoStart deseninin aynısı).
10. **Doğrula:** Docker açılır; kontrol `settings-store.json`a BAKARAK YAPILMAZ —
    backend API'sinden okunur: `\.\pipe\dockerBackendApiServer`, `GET /app/settings` →
    `vm.resources.wslDataFolder`. Sonra `docker ps` (6 konteyner) ve ClickHouse satır sayısı
    göçten önceki sayıyla karşılaştırılır.
11. **El frenini kaldır:** `Remove-Item C:\srv\cry\doldurucu-dur`. Bekçi 15 dk içinde doldurucuyu
    kendisi başlatır.
12. Eski `D:\Docker\wsl` birkaç gün durur, sonra silinir.

### Dosyaları elle taşıyıp kayıt düzenlemek YASAK

WSL kaydındaki `BasePath`'i elle değiştirmek işe yaramıyor: Docker açılışta kaydı C:'ye GERİ yazıyor
ve C:'de BOŞ yeni bir veri diski açıyor — yığın "yok olmuş" görünür, veri yerindedir. Başarısız bir
`wsl --manage --move` de adsız bir artık kayıt bırakmıştı. Tek desteklenen yol `CustomWslDistroDir`.

### Göçten sonra ne değişir

- D: (465 GiB) tamamen boşalır; blok indeksi 2 TB'ta kalır.
- Doldurucunun `--disk` parametresi yeni sürücüyü göstermeli, yoksa yanlış diskin boşunu ölçer.
- Tam geçmiş hedefi 832 GiB; 2 TB'ta birleştirme payı, yedek ve B7 için yer kalır.

### BigQuery maliyet ölçümü — KURU KOŞU (2026-09-21)

B3 geçmişi ücretsiz kaynaklardan uçtan geriye doluyor ve ~19,5 blok/sn'de tam geçmiş ~51 gün sürüyor.
Alternatif olarak Google'ın yönettiği `bigquery-public-data.goog_blockchain_tron_mainnet_us` veri seti
ölçüldü. **Hiçbir sorgu çalıştırılmadı**; sayılar konsolun kuru koşu ("This query will process N when
run") tahminidir ve o an ekranda okunmuştur. Sorgular ihtiyacımız olan sütunlarla yazıldı (`SELECT *`
değil) — BigQuery sütunlu okur ve fiyat taranan bayta bağlıdır.

| Görünüm | Ne için | 2018–2022 | Tam geçmiş |
|---|---|---|---|
| `logs` (USDT sözleşmesi + Transfer konusu) | USDT transferleri | 1,04 TB | 2,25 TB |
| `transactions` (`input` HARİÇ) | yerel TRX transferleri | 1,12 TB | ~3,47 TB (öngörü) |
| `receipts` | başarısız işlemi elemek | 356,22 GB | ~1,10 TB (öngörü) |
| `tron_internal_transactions` | sözleşme içi TRX | 803,21 GB | 909 GB |
| **Toplam** | | **~3,3 TB** | **~7,7 TB** |

- `transactions` `input` sütunuyla 1,50 TB, onsuz 1,12 TB — tek sütun %25 fark ediyor.
- İç transferlerin %88'i 2023 ÖNCESİNDE (803,21 + 106,18 = 909,39 GB; iki dilim tam geçmişe oturuyor).
  2023 sonrası TRON hacmi ağırlıkla TRC20 USDT ve o log tarafında sayılıyor.
- **Ölçülmemiş varsayım:** TRON'un sözleşme tipi için ayrı bir sütun YOK; `TransferContract`'ı
  `input = '0x'` üzerinden çıkarmak gerekiyor. Bu varsayım kendi verimizle karşılaştırılmadan
  `transactions` çıkarımı yazılmaz.
- Ücret: isteğe bağlı fiyatlandırmada 6,25 $/TiB, **ayda ilk 1 TiB ücretsiz** (kota her takvim ayı
  yenilenir). GCS'e dışa aktarım aynı bölgede ücretsiz; asıl kalem internete indirme (~0,12 $/GB).
  BigQuery Sandbox (kartsız) sorguyu ÇALIŞTIRIR ama dışa AKTARAMAZ — veri almak için faturalama şart.
- Kullanıcının ücretsiz deneme süresi 2026-09-21'de dolmuştu; 300 $ kredi YOK, tutarlar doğrudan karta yazar.

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
