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
| 07 | Takip görünümü: akış (sankey) + tek ekran | ✅ bitti (2026-09-15) — canlıda koşu 9 ile gözle doğrulandı; devam, gizleme, yakıldı, şerit yolu, kaydır/yakınlaştır, ilerleme/durdur |
| 08 | Deposit sezgiseli + aktivasyon kümelemesi | ⏳ |
| 09 | Fiyat/kur (TCMB) + rapor + PDF + SHA-256 | ⏳ |
| 10 | İzleme: takip listesi arayüzü + self-hosted runner kurulumu | ⏳ |
| 11 | [Yerel blok indeksi (TRON)](../yol-haritasi-blok-indeks.md) — B0 ölçüm → B7 EVM | ⏳ B0+B1 bitti (2026-09-16) — motor ClickHouse; sırada B2 (blok okuyucu) |

**Son durum (2026-09-15):**
- **Push:** 2026-09-15'te yapıldı (`df6e270`, dağıtım başarılı). Sonrasında
  açılış otomasyonu ve blok indeksi yol haritası commit'lendi, push
  bekliyor: `git log --oneline origin/main..HEAD`.
- **Açılış otomasyonu kurulu:** `cry-baslangic` zamanlanmış görevi +
  Docker Desktop AutoStart (bkz. CLAUDE.md → Yerel çalışma ortamı).
- **Canlı veride kalan koşular:** 5, 6, 7, 9. Koşu 9 dört devamla büyütüldü
  (86 adres); 8, 10, 11 deneme koşularıydı ve silindi.
- **Kullanıcının seçtiği yön: görev 11 (yerel blok indeksi).** B0 ölçümleri ve B1 (şema + ayrıştırıcı + kursör) bitti; kapsam kararı verildi (CLAUDE.md → Blok indeksi). Sırada B2: blok okuyucu betiği.
- Görev 08 (deposit sezgiseli + aktivasyon kümelemesi); karar
  bekleyenler `bekleyen-kararlar.md` §1b ve §2–§7'da, eksikler
  `cozulmesi-gerekenler.md` §1–§15'te.

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
