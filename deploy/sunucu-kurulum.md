# Hetzner tarafı — bir kerelik kurulum

Sunucuda yalnızca **izleme servisi** çalışır. Caddy bloğu ve WireGuard tüneli
Görev 01'de kuruldu (bkz. `docs/gorevler/01-ag.md`).

## 1. Dizin ve ortam dosyası

```bash
sudo -i
mkdir -p /srv/cry
cat > /srv/cry/.env <<'EOF'
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
TRONGRID_API_KEY=...
WATCHER_TOKEN=...          # PC'deki .env ile AYNI değer olmalı
PC_BASE_URL=http://10.99.0.2:1337
WATCHER_POLL_SECONDS=60
EOF
chmod 600 /srv/cry/.env
```

`WATCHER_TOKEN` iki tarafta da aynı olmalı; farklıysa servis listeyi çekemez
ve **sessizce eski kopyayla** çalışmaya devam eder (bu bilinçli: PC kapalıyken
de çalışsın diye). Senkronun gerçekten olduğu log'da `↻ liste tazelendi`
satırıyla görülür.

## 2. Caddy

`cry.abidin.dev` bloğu `/srv/proxy/Caddyfile` içinde ve **tam olarak bir kez**
bulunmalı — iki kez olursa "ambiguous site definition" hatası verir.

```bash
grep -c "cry.abidin.dev" /srv/proxy/Caddyfile   # 1 olmalı
```

Değişiklik yapılacaksa: önce yedekle, sonra `caddy validate`, sonra
`caddy reload`. **Diğer dört siteyi (pt, hessap.la, hafiza, blog) bozacak
hiçbir değişiklik yapılmaz.**

## 3. Servisi başlat

```bash
cd /srv/cry/repo/deploy && docker compose -f compose.watcher.yml up -d --build
```

## 4. Disk

Sunucuda ~17 GB boş alan var; birkaç build'de tükenir. Deploy akışı her
turda `docker image prune -f` çalıştırıyor.
