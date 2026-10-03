# Bekleyen kararlar

Ölçülmüş, sebebi anlaşılmış ama **bir tercih bekleyen** durumlar. Kod
cevaplayamaz; cevabı insan verir.

Madde şu altı başlıkla yazılır: **soru · ölçüm · seçenekler · karar verilmezse
ne bozuk kalır · geri alınabilir mi · karar verilince nereye yazılır.** Karar
verilince madde **silinir** ve kuralı [CLAUDE.md](../CLAUDE.md)'ye yazılır.
Burası arşiv değil; tarihçe git geçmişinde.

Kardeş dosyalar: [cozulmesi-gerekenler.md](cozulmesi-gerekenler.md) (karar
beklemeyen eksikler), [oneriler.md](oneriler.md).

---

**Günlük özet hangi saatte gelsin?** (2026-10-04)

- **Soru:** eşik altı hareketlerin günlük özeti hangi saatte gönderilsin?
- **Ölçüm:** gün sınırı UTC ve gün **00:00 UTC**'de kapanıyor — bu **03:00
  TSİ**'dir. Özeti gün dönünce göndermek, kimsenin okumadığı bir saatte telefon
  çaldırmak demek. Eşiğin işi ölçüldü (Binance 2, 1 saat: 442 hareketin 325'i
  özete gidiyor), yani özet gerçekten dolu bir mesaj olacak.
- **Seçenekler:** 06:00 UTC = 09:00 TSİ (bugünkü varsayılan) · 00:00 UTC =
  03:00 TSİ (gün dönünce) · başka bir saat · özet hiç gönderilmesin, yalnızca
  ekranda dursun.
- **Karar verilmezse:** varsayılan işler; kimse uyanmaz ama saat de seçilmemiş olur.
- **Geri alınabilir mi:** evet, `WATCHER_DIGEST_HOUR_UTC` (tek ortam değişkeni).
- **Karar verilince:** CLAUDE.md → *İzleme* başlığına bir satır; bu madde silinir.

Birikmiş günler (dünden eskisi) saat BEKLEMİYOR: servis kapalı kalmışsa o özet
bir sonraki pencereyi de kaçırıp hiç gitmeyebilirdi. Testli.

---

**Başka bekleyen karar YOK** (2026-09-29'dan beri).

Son yedi madde kullanıcının "önerdiğin gibi devam et" talimatıyla kapatıldı ve
kuralları CLAUDE.md → *Kalan kararlar* başlığında: tohumun kaynağı, vaka
zorunluluğunun kalkması, fiyatın iki kurla yazılması, rapor hash'inin kanıt
paketinden alınması, izleme sıklığı ve eşiği, arayüzün geri kalanının tembel
elden geçirilmesi. Altısı da geri alınabilir.

Daha önce kapananlar: blok indeksi motoru ve kapsamı, geçmişin yönü, BigQuery,
739 borsa adayının tembel incelenmesi, takip akışının çizim biçimi.

**Yeni madde eklerken:** karar gerçekten bir TERCİH mi, yoksa ölçülmemiş bir
soru mu? Ölçülebilen şey buraya değil, ölçüme gider.
