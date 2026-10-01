# Yazı tipi — neden depoda, neden bu

PDF'te Türkçe yazmak için **gömülü yazı tipi şart**: PDF'in yerleşik 14 yazı
tipi WinAnsi (Latin-1) kodluyor ve Latin-1'de `ğ ş İ ı` YOK. Lira işareti
(`₺`, U+20BA) de yok — rapor TL tutarı basıyor, yani yerleşik yazı tipiyle
bir rapor sessizce yanlış karakter basardı.

**Seçim: DejaVu 2.37.3** (`dejavu-fonts-ttf` npm paketi, Bitstream Vera +
Arev lisansı — serbest, yeniden dağıtılabilir; `LICENSE` yanında).
Üç dosya: gövde (`DejaVuSans`), başlık (`DejaVuSans-Bold`), hash ve defter
(`DejaVuSansMono`).

Ölçüldü (2026-10-01): raporun bastığı karakter kümesinin tamamı — Türkçe
büyük/küçük harfler, `₺`, `· — … ✓ ▸ ×` — üç yazı tipinde de **eksiksiz**.
Kapsamayan bir karakter sessizce boş basılmaz: `pdf.ts` onu `?` yapar ve
KAÇ tanesinin basılamadığını raporun ilk sayfasına yazar.

Yazı tipi seçimi mührü DEĞİŞTİRMEZ: kanonik hash kanıt paketinin (JSON)
hash'idir, PDF'in kendi hash'i ayrı sütunda durur.

Alt küme (küçük dosya) DENENDİ ve ELENDİ: fontkit'in `createSubset()` çıktısı
`cmap` tablosu taşımıyor, yani yeniden okunamıyor (ölçüldü: `hasGlyphForCodePoint`
düşüyor). pdf-lib zaten gömerken alt kümeliyor — PDF küçük kalıyor, depoda
duran dosya tam.
