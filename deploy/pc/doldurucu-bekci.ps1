# cry - B3 gecmis doldurucusunun BEKCISI. 15 dakikada bir calisir.
#
# Neden: doldurucu tek bir ayrik surectir ve `doldur-devam.ps1` yalnizca OTURUM ACILISINDA
# devreye giriyor. Gun icinde surec duserse (gecici ag hatasi, Docker yeniden baslatmasi, elle
# oldurulme) bir sonraki oturum acilisina kadar kimse fark etmiyor ve gunler kaybedilir.
#
# NE YAPMAZ:
#   - Surec calisiyorsa DOKUNMAZ. Takildigindan supheleniyorsa bile OLDURMEZ - 2026-09-18'de bir
#     denetim tam bunu yapip sapasaglam calisan bir doldurucuyu bosuna yeniden baslatti (CLAUDE.md).
#   - IKINCI bir surec baslatmaz. Bir tane bile calisiyorsa cikar; birden fazla gorurse ALARM yazar
#     ama yine dokunmaz.
#   - Disk dolduysa baslatmaz: doldurucu 50 GiB'de kendisi durur, yeniden baslatmak sonsuz dongudur.
#   - Isi gercekten bittiyse (blok 1'e inildi) baslatmaz.
#   - `doldur-devam.ps1` o sirada calisiyorsa karismaz; o betik sureci bekleyip bildirim gonderiyor.
#
# EL FRENI: C:\srv\cry\doldurucu-dur dosyasi varsa bekci HICBIR SEY yapmaz. Bakim icin duraklatmanin
# temiz yolu budur - yoksa siz durdurursunuz, bekci geri baslatir.
#
# GOVDE SAF ASCII (CLAUDE.md: PS 5.1 BOM'suz dosyayi ANSI okur).
#
# Elle: powershell -NoProfile -ExecutionPolicy Bypass -File deploy\pc\doldurucu-bekci.ps1
[CmdletBinding()]
param(
  # Bos birakilirsa govdede cozulur: `-File` ile cagrildiginda $PSScriptRoot param
  # VARSAYILANINDA bos geliyor (olculdu) ve Join-Path hata veriyor.
  [string]$Depo = "",
  [string]$Gunluk = "C:\srv\cry\blok-doldur.log",
  [string]$KendiGunluk = "C:\srv\cry\doldurucu-bekci.log",
  [string]$DurumDosyasi = "C:\srv\cry\doldurucu-bekci.durum.json",
  [string]$FrenDosyasi = "C:\srv\cry\doldurucu-dur",
  # Doldurucu 50 GiB'de durur; bekci 55'in altinda hic denemez ki durup durup baslamasin.
  [int]$DiskEsigiGiB = 55,
  [int]$EnAzAralikDk = 10,
  [int]$GunlukSatirSiniri = 3000,
  # YEDEGIN nabzi: bekci her 15 dakikada bir kosan tek sey oldugu icin,
  # yedegin HIC KOSMADIGINI gorebilecek tek yer de burasi.
  [string]$YedekNabzi = "C:\srv\cry\yedek-nabiz.txt",
  [string]$YedekAlarmDamgasi = "C:\srv\cry\yedek-alarm-damgasi",
  [int]$YedekEnFazlaSaat = 36,
  [string]$EnvDosyasi = "C:\srv\cry\.env"
)

$ErrorActionPreference = "Continue"

if (-not $Depo) {
  $kok = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Definition }
  $Depo = (Resolve-Path (Join-Path $kok "..\..")).Path
}

function Damga {
  $d = Get-Date
  $f = [System.TimeZoneInfo]::Local.GetUtcOffset($d)
  $i = if ($f.Ticks -lt 0) { "-" } else { "+" }
  "{0}{1}{2:00}:{3:00}" -f $d.ToString("yyyy-MM-ddTHH:mm:ss"), $i, [math]::Abs($f.Hours), [math]::Abs($f.Minutes)
}
function Yaz([string]$m) {
  $satir = "$(Damga) $m"
  Write-Output $satir
  try { Add-Content -Path $KendiGunluk -Value $satir -Encoding UTF8 } catch { }
}

. (Join-Path $(if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Definition }) "telegram.ps1")

<#
  YEDEGIN nabzini DENETLE - bekcinin ikinci isi.

  Neden burada: yedek gorevi gunde bir kosuyor ve BASARISIZ olursa kendi
  alarmini atabiliyor; ama HIC KOSMAZSA (gorev silinmis, makine o saatte kapali,
  zamanlayici bozulmus) kimse bunu soylemez. Olculdu: yedek 2026-09-28'den beri
  her turda "harici disk takili degil" yazdi ve 13 gun boyunca kimse okumadi.
  Bir surecin kostugu, kendi gunlugunden DEGIL disardan olculur.

  Alarm gunde EN COK BIR: ayni cumleyi 96 kez atan bir kanal, okunmayan bir
  kanaldir.
#>
function YedekNabziniDenetle {
  try {
    if (-not (Test-Path $YedekNabzi)) {
      # Nabiz dosyasi YOK: yedek bu surumden beri hic kosmamis olabilir. Bu bir
      # ALARM degil, bir BILGI satiri - yeni kurulumda da boyle gorunur.
      Yaz "yedek nabzi yok ($YedekNabzi) - yedek bu surumle henuz kosmamis"
      return
    }
    $satir = (Get-Content $YedekNabzi -First 1 -ErrorAction Stop).Trim()
    $parca = $satir -split "\s+"
    $ms = [int64]$parca[0]
    $sonuc = $parca[1]
    $yasSaat = [math]::Round(((([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) - $ms) / 3600000.0), 1)
    if ($yasSaat -le $YedekEnFazlaSaat -and $sonuc -eq "tamam") {
      Yaz ("yedek nabzi: {0}, {1} saat once" -f $sonuc, $yasSaat)
      return
    }
    $mesaj = if ($yasSaat -gt $YedekEnFazlaSaat) {
      "cry YEDEK NABZI BAYAT: son yedek turu {0} saat once ({1}). Gunluk yedek gorevi kosmuyor olabilir." -f $yasSaat, $sonuc
    } else {
      "cry YEDEK SONUCU: {0} ({1} saat once) - son tur basarili degil." -f $sonuc, $yasSaat
    }
    Yaz "UYARI: $mesaj"
    # Gunde bir: damga dosyasi son gonderimi tasir.
    $gonder = $true
    if (Test-Path $YedekAlarmDamgasi) {
      try {
        $son = [int64](Get-Content $YedekAlarmDamgasi -First 1).Trim()
        if (((([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) - $son) / 3600000.0) -lt 24) { $gonder = $false }
      } catch { }
    }
    if ($gonder) {
      $g = TelegramGonder -Mesaj $mesaj -EnvDosyasi $EnvDosyasi
      Yaz "yedek alarmi: $g"
      if ($g -eq "gonderildi") {
        Set-Content -Path $YedekAlarmDamgasi -Value ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) -Encoding ASCII
      }
    } else {
      Yaz "yedek alarmi bugun zaten gonderildi, tekrarlanmadi"
    }
  } catch {
    # Yedek denetimi bekciyi DUSURMEZ: bekcinin asil isi doldurucu.
    Yaz "not: yedek nabzi denetlenemedi (bekciyi etkilemez): $($_.Exception.Message)"
  }
}

function SurecleriBul {
  @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'blok-okuyucu[\/]src[\/]doldur\.ts' })
}

# DIKKAT: "komut satirinda gecen metin" yetmez. Betigin ADINDAN soz eden HER surec eslesir -
# olculdu: dosya adini iceren bir tani komutu kendini "devam betigi calisiyor" sandi. Olcut
# `-File <...>doldur-devam.ps1` kalibi ve KENDI surecimiz haric tutuluyor.
function DevamBetigiCalisiyorMu {
  [bool](Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match '-File\s+"?[^"]*doldur-devam\.ps1"?' })
}

# Son "doldurma ... -> ..." baslangic satirindan SONRA bir "bitti:" var mi, ve sebebi ne?
# Damga iki bicimde olabilir: eski "2026-09-16 21:47:22 " ve yeni "2026-09-22T00:32:26+03:00 ".
# Yalnizca birini taniyan bir arama, son kosuyu bulamayip ESKI bir "bitti:" satirina takilir.
function SonBitisSebebi {
  if (-not (Test-Path $Gunluk)) { return $null }
  $satirlar = @(Get-Content $Gunluk -Encoding UTF8 -ErrorAction SilentlyContinue)
  if ($satirlar.Count -eq 0) { return $null }
  $bas = -1
  for ($i = $satirlar.Count - 1; $i -ge 0; $i--) {
    if ($satirlar[$i] -match '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}\S*\s+doldurma ') { $bas = $i; break }
  }
  if ($bas -lt 0) { return $null }
  for ($i = $bas; $i -lt $satirlar.Count; $i++) {
    if ($satirlar[$i] -match 'bitti:\s*(\S+)') { return $Matches[1] }
  }
  return $null
}

function DurumOku {
  if (Test-Path $DurumDosyasi) {
    try { return Get-Content $DurumDosyasi -Raw | ConvertFrom-Json } catch { }
  }
  return $null
}
function DurumYaz($d) {
  try { ($d | ConvertTo-Json -Compress) | Set-Content -Path $DurumDosyasi -Encoding ASCII } catch { }
}

function GunluguKirp([string]$yol, [int]$sinir) {
  try {
    if (-not (Test-Path $yol)) { return }
    $s = @(Get-Content $yol -Encoding UTF8)
    if ($s.Count -gt $sinir) { $s[($s.Count - $sinir)..($s.Count - 1)] | Set-Content $yol -Encoding UTF8 }
  } catch { }
}

# Iki bekci kosusu ayni anda baslatmasin. Zamanlanmis gorev gecikirse ust uste binebiliyor.
$kilit = New-Object System.Threading.Mutex($false, "Global\cry-doldurucu-bekci")
if (-not $kilit.WaitOne(0)) { Write-Output "$(Damga) baska bir bekci kosuyor, cikildi"; exit 0 }

try {
  New-Item -ItemType Directory -Force -Path (Split-Path $KendiGunluk) | Out-Null

  # Yedek denetimi EL FRENINDEN once: fren doldurucu icindir, yedek bagimsizdir.
  YedekNabziniDenetle

  if (Test-Path $FrenDosyasi) { Yaz "EL FRENI cekili ($FrenDosyasi), hicbir sey yapilmadi"; exit 0 }

  $durum = DurumOku
  if (-not $durum) { $durum = [pscustomobject]@{ gunlukBoyut = 0; durgunTur = 0; sonBaslatma = ""; ardisikKisaOmur = 0 } }

  # `@(...)` ZORUNLU: PowerShell tek elemanli diziyi fonksiyondan donerken SKALERE cevirir ve
  # skalerin `.Count`'u $null olur. Bu yuzden bekci calisan bir doldurucuyu "yok" sandi (olculdu).
  $surecler = @(SurecleriBul)
  $boyut = if (Test-Path $Gunluk) { (Get-Item $Gunluk).Length } else { 0 }

  if ($surecler.Count -gt 1) {
    # Iki doldurucu ayni araligi iki kez okur ve kotayi bosa harcar. Oldurmek BEKCININ isi degil.
    Yaz ("ALARM: {0} doldurucu sureci birden calisiyor (pid {1}) - elle bakilmali, bekci dokunmadi" -f $surecler.Count, (($surecler | ForEach-Object { $_.ProcessId }) -join ","))
    $durum.gunlukBoyut = $boyut
    DurumYaz $durum
    exit 0
  }

  if ($surecler.Count -eq 1) {
    # HER TURDA bir satir yazilir. Sessiz kalmak "her sey yolunda" ile "gorev hic calismadi"yi
    # ayirt edilemez kilardi; 15 dakikada bir satir, 3000 satir sinirinda ~31 gunluk gecmis eder.
    # Takilma DAMGAYLA degil ILERLEMEYLE olculur: gunluk iki denetim arasinda buyudu mu?
    $artis = $boyut - [int64]$durum.gunlukBoyut
    if ($boyut -gt $durum.gunlukBoyut) {
      $onceDurgundu = [int]$durum.durgunTur -gt 0
      $durum.durgunTur = 0
      $durum.ardisikKisaOmur = 0
      Yaz ("nabiz: calisiyor, pid {0}, gunluk +{1} B{2}" -f $surecler[0].ProcessId, $artis, $(if ($onceDurgundu) { " - ilerleme geri geldi" } else { "" }))
    } else {
      $durum.durgunTur = [int]$durum.durgunTur + 1
      # Iki tur (30 dk) hic buyumemek anormal: gunluk dakikada bir satir yaziyor. Yine de
      # OLDURULMEZ - yalnizca gorunur kilinir.
      if ($durum.durgunTur -ge 2) { Yaz ("UYARI: gunluk {0} turdur (~{1} dk) buyumuyor, pid {2} - bekci oldurmez, elle bakin" -f $durum.durgunTur, ($durum.durgunTur * 15), $surecler[0].ProcessId) }
      else { Yaz ("nabiz: calisiyor, pid {0}, gunluk BUYUMEDI (1. tur)" -f $surecler[0].ProcessId) }
    }
    $durum.gunlukBoyut = $boyut
    DurumYaz $durum
    GunluguKirp $KendiGunluk $GunlukSatirSiniri
    exit 0
  }

  # --- Surec YOK ---
  if (DevamBetigiCalisiyorMu) { Yaz "doldur-devam.ps1 calisiyor, ona birakildi"; exit 0 }

  $sebep = SonBitisSebebi
  if ($sebep -eq "taban") { Yaz "is BITMIS (bitti: taban) - blok 1'e inildi, baslatilmadi"; exit 0 }

  $bos = [math]::Round((Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='D:'").FreeSpace / 1GB, 1)
  if ($bos -lt $DiskEsigiGiB) {
    Yaz ("disk bekliyor: D: {0} GiB bos (esik {1}) - son bitis '{2}'. Yer acilinca kendiliginden devam eder." -f $bos, $DiskEsigiGiB, $sebep)
    exit 0
  }

  if ($durum.sonBaslatma) {
    $gecen = (Get-Date) - [datetime]::Parse($durum.sonBaslatma)
    if ($gecen.TotalMinutes -lt $EnAzAralikDk) { Yaz ("son baslatma {0:N0} dk once, en az {1} dk beklenir" -f $gecen.TotalMinutes, $EnAzAralikDk); exit 0 }
    # Ust uste hemen olen bir surec: sorun gecici degil. Saatte bir denemeye geri cekilir ki
    # gunluk yuzlerce basarisiz baslatmayla dolmasin.
    if ([int]$durum.ardisikKisaOmur -ge 3 -and $gecen.TotalMinutes -lt 60) {
      Yaz ("{0} kez ust uste kisa surede oldu, saatte bir denenecek (son bitis '{1}')" -f $durum.ardisikKisaOmur, $sebep)
      exit 0
    }
  }

  Yaz ("doldurucu calismiyor (son bitis '{0}', D: {1} GiB bos) - baslatiliyor" -f $(if ($sebep) { $sebep } else { "yok" }), $bos)

  # Baslatma bicimi `doldur-devam.ps1` ile BIREBIR AYNI: cmd uzerinden, gunluge EKLEYEREK.
  # Start-Process'in yonlendirmesi dosyayi EZER; gunluk kaybi kapsam kadar degerlidir.
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "cmd.exe"
  $psi.Arguments = "/c node --env-file=.env --env-file=apps/web/.env.local --import tsx apps/blok-okuyucu/src/doldur.ts --uygula --ilerlemeSn=60 >> `"$Gunluk`" 2>&1"
  $psi.WorkingDirectory = $Depo
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $surec = [System.Diagnostics.Process]::Start($psi)

  Start-Sleep -Seconds 20
  $simdi = @(SurecleriBul)
  if ($simdi.Count -ge 1) {
    Yaz ("baslatildi, node pid {0}" -f (($simdi | ForEach-Object { $_.ProcessId }) -join ","))
    $durum.ardisikKisaOmur = 0
  } else {
    $durum.ardisikKisaOmur = [int]$durum.ardisikKisaOmur + 1
    Yaz ("BASLATILAMADI: 20 sn sonra surec yok (cmd cikis {0}), ardisik {1}. kez" -f $(if ($surec.HasExited) { $surec.ExitCode } else { "-" }), $durum.ardisikKisaOmur)
  }
  $durum.sonBaslatma = (Get-Date).ToString("o")
  $durum.gunlukBoyut = if (Test-Path $Gunluk) { (Get-Item $Gunluk).Length } else { 0 }
  $durum.durgunTur = 0
  DurumYaz $durum
  GunluguKirp $KendiGunluk $GunlukSatirSiniri
}
finally {
  $kilit.ReleaseMutex()
  $kilit.Dispose()
}
exit 0
