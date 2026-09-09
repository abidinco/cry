# Görevler

Her dosya **tek oturumda bitecek** büyüklükte, kendi bitiş ölçütünü taşır.

| # | Görev | Durum |
|---|---|---|
| 01 | [WireGuard tüneli](01-ag.md) | ✅ bitti (2026-09-08) — engel Hetzner Cloud Firewall'du, 51830/UDP açıldı |
| 02 | Depo iskeleti, şema, PRD | ✅ bitti (2026-09-08) |
| 03 | Kimlik: şifre değiştirme + çıkış + kullanıcı yönetimi | ✅ bitti (2026-09-09) |
| 04 | Adres görünümü + indeks işini kuyruğa atma (uçtan uca ilk TRON sorgusu) | ✅ bitti (2026-09-09) |
| 05 | Yoklama katmanının uç noktası + `probe_cache` | ⏳ |
| 06 | Takip motoru: FIFO, durma sezgiselleri, terminal düğüm | ⏳ |
| 07 | Graf görünümü (kütüphane kararı bekliyor) | ⏸ karar bekliyor |
| 08 | Deposit sezgiseli + aktivasyon kümelemesi | ⏳ |
| 09 | Fiyat/kur (TCMB) + rapor + PDF + SHA-256 | ⏳ |
| 10 | İzleme: takip listesi arayüzü + self-hosted runner kurulumu | ⏳ |

## Sırayı belirleyen kural

Bir görev, **kendinden önceki görevin ürettiği veriyi ekranda gösterebiliyorsa**
bitmiştir. "Yazıldı ama hiçbir sayfa sormuyor" bitmiş sayılmaz.
