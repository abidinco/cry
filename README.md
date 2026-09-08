# cry

Kripto para akışını takip eden analiz aracı. Bir cüzdan adresi ya da işlem
hash'i verilir; paranın cüzdanlar arasında nasıl dolaştığı, nerede beklediği
ve **hangi borsanın hot wallet'ına ne zaman girdiği** çıkarılır.

Çıktı, resmi yazı için gereken dört şeydir: **borsa adı + deposit adresi +
tx hash + tarih.**

> Bu bir analiz aracıdır, delil üretim sistemi değil. Çıktısı bağlayıcı
> değildir; adli merci her seferinde kendi sorgusunu yapar. Yine de her
> etiketin kaynağı ve güven derecesi kayıt altındadır.

## Mimari

```
tarayıcı → cry.abidin.dev → Hetzner: Caddy (TLS)
         → WireGuard tüneli (10.99.0.1 → 10.99.0.2)
         → PC: Next.js :1337 + Postgres + Redis + worker'lar
```

Ağır iş evdeki makinede döner (14 çekirdek / 32 GB / ~350 GB); sunucu yalnızca
TLS sonlandırma, proxy ve **7/24 izleme servisi** yapar. PC kapalıyken Caddy
çevrimdışı sayfasını gösterir, Telegram uyarıları gelmeye devam eder.

Evdeyken kestirme: `http://localhost:1337` (trafik Hetzner'a gidip gelmez).

## Yapı

| Yol | Ne |
|---|---|
| `packages/chain` | Ağ tespiti, yoklama, **zincir adaptörleri** (TRON dolu; EVM/BTC/Solana iskelet) |
| `packages/db` | Prisma şeması, istemci, seed |
| `apps/web` | Next.js — arayüz ve API |
| `apps/worker` | BullMQ tüketicileri: artımlı indeks, takip koşusu |
| `apps/watcher` | Hetzner'daki izleme servisi (SQLite + Telegram, bağımlılık yok) |
| `docs/` | [Devir dosyası](docs/proje-devir.md) · [PRD](docs/prd.md) · görevler |

## Kurulum (PC)

```bash
cp .env.example .env      # değerleri doldur — .env asla commit edilmez
npm install
npx prisma generate --schema packages/db/prisma/schema.prisma
docker compose up -d
npm run db:migrate
npm run db:seed           # SEED_ADMIN_PASSWORD dolu olmalı
```

`http://localhost:1337` açılır. İlk girişte şifre değiştirilir.

## Fazlar

1. **TRON** — Türkiye dosyalarının çoğu burada (USDT-TRC20). *Şu an burası.*
2. **EVM** — Ethereum, BSC, Polygon + ikincil zincirler.
3. **Bitcoin** — UTXO modeli, ayrı motor (para üstü, ortak girdi kümelemesi).
4. **Solana** — türetilmiş token hesapları, sahiplik çözümlemesi.

Adaptör arayüzü baştan dördünü de kaldırıyor; fazlar sırayla **doldurulur**.

## Kurallar

- **Tutar ham tam sayıdır.** Float'a çevirme yalnızca gösterim sınırında —
  bir adli raporda 0.1+0.2 hatası tutarı sessizce kaydırır.
- **Her etiket kaynağını, güven skorunu ve doğrulama tarihini taşır.**
  Doğrulanmamış etiket rapora "doğrulanmamış" ibaresiyle girer.
- **Checksum'ı bozuk adres sessizce kabul edilmez.** Yanlış kopyalanmış tek
  karakter tüm soruşturmayı başka cüzdana yönlendirir.
- **Sır repoda durmaz.** Depo public; `.env` `.gitignore`'da, şablonu
  `.env.example`.
- **`git push` yalnızca kullanıcı açıkça "PUSH" dediğinde yapılır** — push
  deploy tetikliyor.
