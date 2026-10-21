# Bekleyen kararlar

Ölçülmüş, sebebi anlaşılmış ama **bir tercih bekleyen** durumlar. Kod
cevaplayamaz; cevabı insan verir.

Madde şu altı başlıkla yazılır: **soru · ölçüm · seçenekler · karar verilmezse
ne bozuk kalır · geri alınabilir mi · karar verilince nereye yazılır.** Karar
verilince madde **silinir** ve kuralı [CLAUDE.md](../CLAUDE.md)'ye yazılır.
Burası arşiv değil; tarihçe git geçmişinde.

Kardeş dosyalar: [cozulmesi-gerekenler.md](cozulmesi-gerekenler.md) (karar
beklemeyen eksikler), [oneriler.md](oneriler.md).

**Karar MASADA verilir** (kullanıcı kuralı 2026-10-04): artifact
[cry karar masası](https://claude.ai/artifact/MKQ4Zj2X4grwjb2KiCYHwS). Bu dosya
masanın aynasıdır — madde oraya yazılır, şık orada seçilir, ajan okuyup uygular.

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

**Yerel taramada sayfa bütçesi kaç olsun?** (2026-10-08)

- **Soru:** bir adresin geçmişi okunurken kaç sayfa okunsun? Bugün 10; aşılınca
  tarama `sayfa_butcesi` ile YARIDA kalıyor ve adres `kismi` işaretleniyor.
- **Ölçüm:** koşu 37 (2026-10-07, kuyruktan, hiç taranmamış kök): kök 10 sayfada
  20.189 hareket okudu ve BİTMEDİ (`tamamlandi: false`, sebep `sayfa_butcesi`);
  yani o kökün geçmişi eksik okundu ve graf onun üzerine kuruldu. Bütün koşu 25
  düğüm / 75 kenar, 82 sn. Yerel okumada bir sayfa bir ClickHouse sorgusudur,
  kaynakta bir API turu (adres başına ~25 sn).
- **Seçenekler:** yerelde 50, kaynaklı kipte 10 · ikisi de 10 (bugünkü, varsayılan)
  · yerelde SINIRSIZ, yerine adres başına süre sınırı (ör. 60 sn) · yalnızca KÖK
  için büyük (ör. 100) · başka bir sayı.
- **Karar verilmezse:** 10'da kalır; yoğun adreslerin geçmişi eksik okunmaya
  devam eder. Eksiklik SESSİZ değil (`kismi` + sebep yazılı) ama graf alt sınır olur.
- **Geri alınabilir mi:** evet, tek sayı (`adresIndeksle`ın `maxSayfa` argümanı).
- **Karar verilince:** CLAUDE.md → *Yalnızca yerel koşu* başlığına bir satır; bu
  madde silinir.

---

**Yalnızca yerel kip varsayılan açık mı kalsın?** (2026-10-08)

- **Soru:** yeni koşu başlatılırken "yalnızca yerel indeks" anahtarı varsayılan
  AÇIK geliyor (ajan seçti, 2026-10-06). Böyle mi kalsın?
- **Ölçüm:** aynı kökle kaynaklı koşu 28 hız sınırına takılıp 1 düğüm / 0 kenar
  verdi; yerel kip 29 düğüm / 67 kenar verdi ve giden istek sayısı ölçüldü: 33
  isteğin hepsi yerel ClickHouse, TronGrid 0. Bedeli: pencere (2025-11-03→bugün)
  ÖNCESİNE bakılmıyor; o koşuda 29 düğümün 20'si pencere dışına uzanıyordu ve
  `pencere_oncesi` diye işaretlendi.
- **Seçenekler:** AÇIK kalsın — hız ve kota önce (varsayılan) · KAPALI gelsin —
  tam cevap önce, yavaş ve hız sınırına açık · seçenek KALKSIN, her koşu yerel
  (kaynak yalnızca tek işlem/bakiye sorularında) · şimdilik açık, tam geçmiş
  yüklenince (~138 gün) soru kendiliğinden kapansın · başka bir kural.
- **Karar verilmezse:** açık kalır; koşular hızlı ve kotasız ama cevaplar pencere
  ile SINIRLI (ekran bunu yazıyor), yine de varsayılanı ajan seçmiş olur.
- **Geri alınabilir mi:** evet, ekrandaki anahtarın başlangıç değeri; her
  koşuda elle değiştirilebiliyor.
- **Karar verilince:** CLAUDE.md → *Yalnızca yerel koşu* başlığına bir satır; bu
  madde silinir.

---

**Yukarıdakiler masadaki AÇIK maddelerin tamamıdır** (2026-10-21: `kararlar`
üç belge, `cevaplar` boş). Son kapanan: doldurma hızı (2026-10-21, tek anahtar +
Es=6 kalsın; kuralı CLAUDE.md → *Geçmişin sırası ve bedeli*). Eklerken ve düşürürken önce masaya bakılır.

Eski yedi madde kullanıcının "önerdiğin gibi devam et" talimatıyla kapatıldı (2026-09-29) ve
kuralları CLAUDE.md → *Kalan kararlar* başlığında: tohumun kaynağı, vaka
zorunluluğunun kalkması, fiyatın iki kurla yazılması, rapor hash'inin kanıt
paketinden alınması, izleme sıklığı ve eşiği, arayüzün geri kalanının tembel
elden geçirilmesi. Altısı da geri alınabilir.

Daha önce kapananlar: blok indeksi motoru ve kapsamı, geçmişin yönü, BigQuery,
739 borsa adayının tembel incelenmesi, takip akışının çizim biçimi.

**Yeni madde eklerken:** karar gerçekten bir TERCİH mi, yoksa ölçülmemiş bir
soru mu? Ölçülebilen şey buraya değil, ölçüme gider.
