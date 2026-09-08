# watcher — 7/24 izleme servisi (Hetzner)

Takip listesindeki adres hareket edince Telegram'dan bildirir. **PC kapalıyken
de çalışması gerektiği için** ana yığından bağımsızdır:

- **Bağımlılık yok.** SQLite Node'un kendi `node:sqlite` modülü, HTTP `fetch`.
  Sunucuda 3,7 GB RAM var ve üstünde iki Postgres + bir MySQL zaten dönüyor;
  bu servis için üçüncü bir veritabanı kurulmuyor.
- **Kendi kaydı minimal:** takip listesi + her adresin son görülen işlemi.
- **Liste ANA veritabanında.** PC ayaktayken tünelden (`10.99.0.2:1337`)
  senkronlanır, kapalıyken elindeki son kopyayla çalışmaya devam eder.

TypeScript değil düz JavaScript: sunucuda derleme adımı olmasın diye.
