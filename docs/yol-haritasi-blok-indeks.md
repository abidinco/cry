# Yerel blok indeksi — yol haritası

Aşamaların hepsinden çıkan **kurallar** [CLAUDE.md](../CLAUDE.md)'de; burada
yalnızca kararı doğuran ölçümler, aşamaların bugünkü durumu ve kalanlar var.
Bu dosya 2026-09-29'da kısaltıldı (66 KB → 8 KB): bitmiş aşamaların adım adım
tarifi ve kurulum betikleri silindi, ölçüm sayıları ve kapı sonuçları kaldı.
Tarihçe git geçmişinde.

## 0. Neden

Proje devri "kendi arşiv düğümü disk açısından imkânsız" diyor ve **vaka odaklı
artımlı indeksi** ana çözüm seçiyor. Onun iki yapısal sınırı var ve blok indeksi
tam bunları kapatıyor:

1. **Ters sorgu yok.** "Bu adrese kim gönderdi / kimi aktive etti" ancak o adres
   taranmışsa bilinir; 2026-09-15'te 30.525 adresin 30.404'ü "bakılmadı"ydı.
2. **Keşif kör.** Yapısal keşif yalnızca taranan adreslerin şeklini ölçebiliyor;
   servis cüzdanları taranmadıkça görünmüyor.

Blok indeksi bir arşiv düğümü DEĞİL: seçilmiş transferlerin (USDT-TRC20, TRX)
kendi tablomuz.

## 1. Zincir hacmi — kapsamı bu belirledi

Yeniden üretim:
```bash
node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/tron-blok-hacmi.mts
node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/olcum/tron-tutar-dagilimi.mts
```

TRON, gün içine yayılmış örnek bloklar: blok başına 424 işlem, **93 USDT-TRC20**
(TRC20 hacminin ~%98'i USDT) ve **146 TRX** transferi → günde ~6,7 Mn satır
eşiksiz, ~16 GB ham JSON. Blok+bilgi çifti ~258 ms.

**Yıla göre** (yılda 125 blok): 2018'de USDT yok, TRX 1,5/blok; 2021'de 24,5/35,6;
2026'da 77,5/155,3. **Tam geçmiş ~9,7 Mr satır** (USDT ~3,6 + TRX ~6,1).

**Tutar dağılımı:** USDT'nin %99,5'i ≥1, %70'i ≥100. TRX'in yalnızca **%23,9'u
≥1** — hacmin çoğu toz. Buna rağmen **eşik konmadı**: eşikli bir indeks "başka
para girmedi" dedirtemez (CLAUDE.md → keşifte toz ayrı sayılır, elenmez).

**Adresin çoğu bir kez görünüyor:** 1 saatte 397.381 transferde 316.618 tekil
adres, 203.206'sı tek kez (toz / adres zehirleme). Sıkıştırmayı belirleyen bu.

**Başarısız transfer 0** — bir alan eksikliği değil: başarısızlar yalnızca
sözleşme çağrılarında (`OUT_OF_ENERGY`) ve Transfer olayı üretmiyorlar. Aynı
saatte 469 USDT **onay** olayı atlandı.

## 2. Motor seçimi (B0, 2026-09-15/16)

Gerçek saat 48 kez zamanda kaydırılarak 2 gün (19.074.288 satır) üretildi;
üretim deterministik, yani dört motor da BİREBİR aynı veriyi okudu ve her
sorguya aynı cevabı verdi. Adres tekrarı iki sınırla ölçüldü: `ayni` (iyimser)
→ `taze` (kötümser).

| Motor | B/satır | Yoğun alıcı | `kimden` sorgusu |
|---|---|---|---|
| **ClickHouse** (projeksiyonsuz) | **34,5 → 52,1** | 14 → 13 ms | 18 → 34 ms |
| **Parquet** (ZSTD, kime sıralı) | **39,2 → 55,6** | 8 → 22 ms | 24 → 70 ms |
| TimescaleDB (sıkıştırılmış) | 48,8 → 69,5 | 220 → 221 ms | 748 → 1.014 ms |
| DuckDB kendi dosyası | 50,9 → 70,5 | 13 → 62 ms | 8 → 24 ms |
| ClickHouse + `kimden` projeksiyonu | 75,8 → 117,1 | 13 → 18 ms | 5 → 7 ms |
| Postgres bölümlü tablo | 324,5 | 489 → 503 ms | 52 ms |

Lisanslar: ClickHouse Apache 2.0 (ücretli olan yalnızca *Cloud*), Postgres
PostgreSQL, TimescaleDB sıkıştırması "Timescale License" (açık kaynak değil),
DuckDB MIT, Parquet biçimi Apache 2.0.

**Projeksiyon ikinci bir sıralı kopyadır**, öbür motorlarda karşılığı yok; adil
sıra projeksiyonsuz hâl. **Postgres'in dizinleri tablosundan büyük** (190 ⟷ 134
B/satır) ve yoğun adreste en yavaş olan o — sorun ölçek, dizin değil. Sütun
payı (CH): tx hash 582 MiB (rastgele 32 bayt, hiç sıkışmaz, toplamın %26'sı).

**Projeksiyon — eşiksiz tam geçmiş 335–505 GB (CH) / 380–540 GB (Parquet) /
~790 GB bir yıl (PG).** Karar anında D:'de 198 GB boştu; bu yüzden sıra "önce
canlı uç, geçmiş geriye doğru" oldu. 2 TB disk sonrası sorun kalmadı.

**Hız kapısı şart:** kapısız 4 eş zamanlı işçi 123 isteğin 72'sinde yeniden
denemeye düştü (ortak `RateGate`'in gerekçesi).

**Toplu geçmiş kaynağı:** BigQuery'de Google yönetimli TRON veri seti
**önizleme** durumunda (`blockchain-analytics-tron-mainnet-us`), `token_transfers`
tablosu YOK — USDT `logs`tan süzülür; satın alınmadı. java-tron anlık görüntüsü
tam düğüm ~2,9–3,6 TB (sığmaz), lite düğüm yalnızca ~2,3 gün taşır, **geçmiş
kaynağı olamaz**.

**DuckDB'nin bozuk Parquet BLOB bloom filtresi** burada ölçüldü; ders CLAUDE.md'de.

## 3. Aşamalar

| | Ne | Durum |
|---|---|---|
| B0 | Ölçüm ve motor kararı | ✅ 2026-09-16 |
| B1 | Şema ve kursör | ✅ 2026-09-16 |
| B2 | Blok okuyucu (tek aralık) | ✅ 2026-09-16 |
| B3 | Geçmiş doldurma | ✅ kod 2026-09-17 · **koşu sürüyor** |
| B4 | Canlı uç | ✅ 2026-09-17 |
| B5 | Motor ve arayüz entegrasyonu | ✅ 2026-09-17 |
| M1–M4 | Motorun indeksi okuması, melez tarama, süre analizi | ✅ 2026-09-21/22 |
| — | 2 TB diske göç | ✅ 2026-09-28 |
| B6 | İşletim | kısmen |
| B7 | EVM (Faz 1b) | başlamadı |

Kapı sonuçları (hepsi CLAUDE.md'de kural olarak duruyor):

- **B2:** tur 200. blokta zorla öldürüldü; kapsam 200 blok ve satırlar kapsamın
  saydığıyla birebir, devam turu kalan 800'ü okudu. `FINAL`sız sayım aynı
  transferi iki kez gösteriyor (323.170 ⟷ 292.641).
- **B3:** TronGrid'de 180/180 blok işlem bilgisiyle eşleşti; anahtarsız düğümler
  tutmadıkları blokta HTTP 200 + boş dizi dönüyordu.
- **B4:** 10 dk'lık kapıda publicnode'un ucu hiç geri gitmedi ve 188 blok
  TronGrid'le satır satır aynıydı; 188'de 4 blokta işlem bilgisi 3–13 sn geç geldi.
- **B5:** pencere o gün 279.224 blok = **9,70 gün** / 63 Mn satır. Keşif 31.896
  arşiv adresi üzerinde 71 aday üretti (69'u yepyeni); **mevcut 17 keşif
  etiketinin 16'sı pencerede eşiğin ALTINDA kaldı** — pencere ölçümü bir ALT
  SINIRDIR, aday EKLER, var olanı düşürmez. Sorgular 245–655 ms.
- **M1:** 13 adres / 560 hareket, TronGrid'le eksik 0 / fazla 0 → pencere içinde
  indeks HÜKÜM verebilir. Üç sorgu 498 ms ⟷ TronGrid 8.764 ms (17,6 kat).
- **M1-E:** `transfers.index` kaynağa bağlı çıktı (2.270 harekette 60 uyuşmazlık);
  `occurrence` 0 uyuşmazlık verdi.
- **M2:** `create_time` alt sınır değil (8 adresin 6'sında ilk hareketten sonra,
  birinde 73 gün) → pencere öncesi her zaman kaynağa sorulur.
- **M3:** melez tarama örtüşmeyle 3 adres / 234 hareket, eksik 0 **ve fazla 0**.
- **M4:** 10–12 düğümlük koşu ~200 sn ve ~198'i pencere öncesi geçmişi
  TronGrid'den okumak; indeksin payı saniyenin altında.

## 4. Kalanlar

**B6 — işletim.** Yapıldı: doldurucunun bekçisi, boşluk kapatıcı, açılış betiği,
Postgres yedeği ve haftalık geri yükleme denemesi, disk ölçümü günlükte.
Kalan: blok indeksinin yedeği (`cozulmesi-gerekenler §11`, karar yeniden
düşünülecek) ve pencere dışı bölümler için arşivleme/silme politikası — bugün
hiçbir şey silinmiyor, gerek de yok (1.776 GiB boş).

**B7 — EVM (Faz 1b).** Aynı iskelet, farklı okuyucu: ERC-20 `Transfer` olayları
(USDT/USDC) + yerel transfer. Önce B0'ın EVM karşılığı ölçülür (BSC hacmi TRON'a
yakın). Adaptörün kendisi ve engelleri: `cozulmesi-gerekenler.md` §2.

## 5. Riskler ve açık sorular

- **Kota paylaşımı:** canlı uç kotanın ~%58'ini tüketir; aynı gün yoğun bir vaka
  taraması kotayı aşabilir. Öncelik kuralı yazıldı (vaka > indeks).
- **İç (internal) TRX transferleri** sözleşme çağrısı içinde gerçekleşir ve
  `getblockbynum`'da görünmez. Blok indeksi bunları KAÇIRIR ve kapsam notunda
  söyler (`cozulmesi-gerekenler §4`).
- **Sahte token:** varlık kimliği sembol değil sözleşme adresidir.
- **Tam geçmiş ne zaman biter** sorusunun cevabı sabit değil: doldurucunun kendi
  tahmini uçta 87 gün, derinde ~164 gün. Her zaman günlüğün son satırından okunur.
