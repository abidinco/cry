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
