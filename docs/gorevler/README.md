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
| E | Etiket tohumlaması (OFAC + aday borsa adresleri) | ✅ bitti (2026-09-09) — 324 etiket; arşivle kesişim 0, bkz. bekleyen §1 |
| 07 | Graf görünümü (Cytoscape.js, dagre soldan sağa) | ◐ kod bitti (2026-09-09), gözle doğrulama bekliyor |
| 08 | Deposit sezgiseli + aktivasyon kümelemesi | ⏳ |
| 09 | Fiyat/kur (TCMB) + rapor + PDF + SHA-256 | ⏳ |
| 10 | İzleme: takip listesi arayüzü + self-hosted runner kurulumu | ⏳ |

**Sıra karara bağlanmıştı ve karar verildi (2026-09-09): önce etiket,
sonra graf.** Etiket tohumlaması yapıldı — ama ölçüm sırayı doğrulamakla
kalmadı, sorunun yerini de değiştirdi: 324 etiket yazıldı ve arşivdeki
14.798 adresle kesişimi **0**. Yani graf bugün çizilirse hâlâ "hangi borsa"
diyemez, ama sebebi artık "etiket yok" değil, "TRON'da ücretsiz borsa
etiketi kaynağı yok" ([bekleyen-kararlar §1](../bekleyen-kararlar.md)).
Graf bu yüzden bekletilmiyor: kalan iş etiketin KAYNAĞI, grafın kendisi
değil.

Yan dosyalar: [kurallar](../../CLAUDE.md) · [bekleyen kararlar](../bekleyen-kararlar.md) ·
[çözülmesi gerekenler](../cozulmesi-gerekenler.md) · [öneriler](../oneriler.md).

## Sırayı belirleyen kural

Bir görev, **kendinden önceki görevin ürettiği veriyi ekranda gösterebiliyorsa**
bitmiştir. "Yazıldı ama hiçbir sayfa sormuyor" bitmiş sayılmaz.
