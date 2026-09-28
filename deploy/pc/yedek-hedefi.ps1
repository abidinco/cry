# cry - yedek HEDEFINI secer (yedek.ps1, yedek-geri-yukleme-denemesi.ps1 ve goc-onkontrol.ps1
# nokta-kaynaklar). Betik govdesi SAF ASCII (CLAUDE.md: PS 5.1 BOM'suz dosyayi ANSI okur).
#
# KURAL: ayni fiziksel diske yedek, yedek degildir. Canli veri Docker'in veri diskinde, yani D:'de.
# Hedef bu yuzden SURUCU HARFIYLE degil FIZIKSEL DISKLE secilir - USB diskin harfi takildigi yere
# gore degisir (2026-09-28: sabit "E:\04_Yedek\cry" harici disk takili olmadigi icin bir gun boyunca
# sessizce yedeksiz kaldi).
#
# Sira:
#  1) Kokunde "04_Yedek\cry" klasoru olan ve D: ile AYNI fiziksel diskte OLMAYAN surucu (harici disk).
#     Yeni bir harici diski hedef yapmak icin o klasoru acmak yeter:
#       New-Item -ItemType Directory F:\04_Yedek\cry
#  2) Yoksa GECICI hedef C:\srv\cry\yedek - yalnizca C: da D: ile ayni fiziksel diskte degilse
#     (2026-09-28 olcumu: C: Kingston 1 TB, D: Lexar 2 TB). Makine ayni kaldigi icin bu gercek bir
#     dis yedek DEGILDIR; disk arizasina karsi korur, makine kaybina karsi korumaz. Gunluge yazilir.
#  3) Hicbiri yoksa hedef yok: $null doner.

$script:YedekKlasorAdi = "04_Yedek\cry"
$script:GeciciYedekKoku = "C:\srv\cry\yedek"

function FizikselDiskNo([string]$Harf) {
  $h = $Harf.TrimEnd('\', ':')
  try { return (Get-Partition -DriveLetter $h -ErrorAction Stop | Select-Object -First 1).DiskNumber }
  catch { return $null }
}

function YedekHedefleri {
  # Butun ADAYLARI dondurur (en guclu once). Geri yukleme denemesi en yeni dump'i hepsinde arar:
  # gecici hedefe alinmis bir yedek, harici disk sonradan takilinca kaybolmus sayilmamali.
  $canli = FizikselDiskNo "D"
  $adaylar = @()
  foreach ($v in (Get-Volume | Where-Object { $_.DriveLetter })) {
    $harf = [string]$v.DriveLetter
    if ($harf -eq "C" -or $harf -eq "D") { continue }
    $yol = "${harf}:\$script:YedekKlasorAdi"
    if (-not (Test-Path $yol)) { continue }
    $no = FizikselDiskNo $harf
    if ($null -ne $canli -and $no -eq $canli) { continue }
    $adaylar += [pscustomobject]@{ Yol = $yol; Tur = "harici"; Disk = $no }
  }
  $cNo = FizikselDiskNo "C"
  if ($null -ne $canli -and $null -ne $cNo -and $cNo -ne $canli) {
    $adaylar += [pscustomobject]@{ Yol = $script:GeciciYedekKoku; Tur = "gecici"; Disk = $cNo }
  }
  return ,$adaylar
}

function EnYeniYedek {
  # Butun adaylardaki en yeni dump. Yoksa $null.
  $dosyalar = foreach ($a in @(YedekHedefleri)) {
    Get-ChildItem (Join-Path $a.Yol "postgres") -Filter "cry-*.dump" -ErrorAction SilentlyContinue
  }
  return $dosyalar | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

function YedekHedefi {
  $a = @(YedekHedefleri)
  if ($a.Count -eq 0) { return $null }
  return $a[0]
}
