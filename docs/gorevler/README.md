# Görevler

Her dosya **tek oturumda bitecek** büyüklükte, kendi bitiş ölçütünü taşır.

| # | Görev | Durum |
|---|---|---|
| 01 | [WireGuard tüneli](01-ag.md) | ✅ bitti (2026-09-08) — engel Hetzner Cloud Firewall'du, 51830/UDP açıldı |
| 02 | Depo iskeleti, şema, PRD | ✅ bitti (2026-09-08) |
| 03 | Kimlik: şifre değiştirme + çıkış + kullanıcı yönetimi | ✅ bitti (2026-09-09) |
| 04 | Adres görünümü + indeks işini kuyruğa atma (uçtan uca ilk TRON sorgusu) | ✅ bitti (2026-09-09) |
| 4b | [Arayüz: tasarım dili](../arayuz.md) | ✅ bitti (2026-09-09) |
| 05 | Yoklama katmanının uç noktası + `probe_cache` | ✅ bitti (2026-09-09) |
| 06 | Takip motoru: FIFO, durma sezgiselleri, terminal düğüm | ✅ bitti (2026-09-09) |
| 07 | Graf görünümü (Cytoscape.js) | ⏳ |
| 08 | Deposit sezgiseli + aktivasyon kümelemesi | ⏳ |
| 09 | Fiyat/kur (TCMB) + rapor + PDF + SHA-256 | ⏳ |
| 10 | İzleme: takip listesi arayüzü + self-hosted runner kurulumu | ⏳ |

**Sıradaki iş bir KARARA bağlı:** 07 mi, yoksa sıradan dışarıdaki etiket
tohumlaması mı önce? Gerekçesi ve ölçümü
[bekleyen-kararlar §6](../bekleyen-kararlar.md). Kısası: etiket olmadan graf
"hangi borsa" sorusunu cevaplayamıyor, çünkü arşivde 0 etiket var.

Yan dosyalar: [kurallar](../../CLAUDE.md) · [bekleyen kararlar](../bekleyen-kararlar.md) ·
[çözülmesi gerekenler](../cozulmesi-gerekenler.md) · [öneriler](../oneriler.md).

## Sırayı belirleyen kural

Bir görev, **kendinden önceki görevin ürettiği veriyi ekranda gösterebiliyorsa**
bitmiştir. "Yazıldı ama hiçbir sayfa sormuyor" bitmiş sayılmaz.
