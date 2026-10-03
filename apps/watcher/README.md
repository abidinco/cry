# watcher — 7/24 izleme servisi (Hetzner)

Takip listesindeki adres **eşiği aşan** bir hareket yapınca Telegram'dan
bildirir; eşik altı hareketler gün sonunda tek bir özette toplanır (kullanıcı
kararı, CLAUDE.md → *İzleme*). **PC kapalıyken de çalışması gerektiği için** ana
yığından bağımsızdır:

- **Bağımlılık yok.** SQLite Node'un kendi `node:sqlite` modülü, HTTP `fetch`.
  Sunucuda 3,7 GB RAM var ve üstünde iki Postgres + bir MySQL zaten dönüyor;
  bu servis için üçüncü bir veritabanı kurulmuyor.
- **Kendi kaydı minimal:** takip listesi, eşikler, her adresin son bakış anı,
  gönderilen uyarılar ve henüz özetlenmemiş eşik altı hareketler.
- **Liste ve EŞİKLER ANA veritabanında.** PC ayaktayken tünelden
  (`10.99.0.2:1337`) senkronlanır, kapalıyken elindeki son kopyayla çalışmaya
  devam eder. Gönderdiği mesajları PC'ye geri iter
  (`POST /api/izleme/bildirim`), yoksa `/izleme` ekranı servisten ne geldiğini
  göremezdi.

TypeScript değil düz JavaScript: sunucuda derleme adımı olmasın diye. Bedeli,
ondalık ayrıştırıcının ve TRON adres çeviricisinin ikinci kez yazılması; o
yüzden ikisi de ana yığınla YAN YANA test ediliyor (`tests/izleme-esik.test.ts`,
`tests/izleme-tron.test.ts`).

## Dosyalar

| dosya | iş |
|---|---|
| `src/esik.js` | **saf**: eşik seçimi, yol kararı, özet/mesaj metni, UTC gün anahtarı |
| `src/tron.js` | **saf çevirici + ağ**: TRC20/yerli hareketler, hız sınırı penceresi, hareket kimliği |
| `src/depo.js` | SQLite: liste, eşikler, uyarılar, bekleyen özet |
| `src/index.js` | döngü: senkron → özet → adresler → geri itme |

## Ortam

| değişken | varsayılan | not |
|---|---|---|
| `WATCHER_POLL_SECONDS` | `900` | 15 dakika (kullanıcı kararı) |
| `WATCHER_TOKEN` | — | yoksa senkron ve geri itme ATLANIR |
| `PC_BASE_URL` | `http://10.99.0.2:1337` | WireGuard üzerinden PC |
| `WATCHER_CALL_GAP_MS` | `1200` | TronGrid `allowed_rps(1)` diyor (ölçüldü) |
| `WATCHER_DIGEST_HOUR_UTC` | `6` | günlük özetin saati (09:00 TSİ); birikmiş gün beklemez |
| `WATCHER_DRY_HOURS` | `24` | yalnızca kuru koşuda pencere |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | — | yoksa mesaj GİTMEZ ve bu söylenir |

## Kuru koşu

```bash
node --experimental-sqlite apps/watcher/src/index.js --kuru
```

Tek tur koşar; Telegram'a gitmez, kursör ilerletmez, uyarı/özet yazmaz ve PC'ye
hiçbir şey itmez — yalnızca hangi hareketin hangi yola gittiğini sayar. Listeyi
yine de tazeler, çünkü eşikler PC'de durur.
