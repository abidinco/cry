<#
  cry - acilis otomasyonunu KURAR (bir kez calistirilir, tekrari zararsizdir).

    powershell -NoProfile -ExecutionPolicy Bypass -File deploy\pc\kur.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File deploy\pc\kur.ps1 -Kaldir

  Yaptiklari:
    - "cry-baslangic" zamanlanmis gorevi: oturum acilisinda baslangic.ps1
      (kullanici haklariyla; Docker Desktop bir oturum uygulamasidir, servis degil)
    - "cry-yedek" gorevi: her gun 03:15'te Postgres yedegi (yedek.ps1)
    - "cry-yedek-denemesi" gorevi: her pazar 03:45'te yedegi GERI YUKLEYEREK dogrular.
      Alinmis ama geri yuklenmemis bir yedek, yedek degildir.
    - "cry-doldurucu-bekci" gorevi: 15 dakikada bir B3 doldurucusunun ayakta olup
      olmadigina bakar, dusmusse yeniden baslatir. doldur-devam.ps1 yalnizca oturum
      acilisinda calisiyor; gun ici bir dusus bir sonraki acilisa kadar fark edilmiyordu.
    - Docker Desktop'in KENDI "oturum acilisinda basla" ayarini acar
      (settings-store.json -> AutoStart). Olculdu 2026-09-15: False idi.

  Makine geneli yurutme ilkesi DEGISTIRILMEZ: Bypass yalnizca bu gorevin
  komut satirinda verilir (runner'daki kuralin aynisi).

  GOVDE SAF ASCII (bkz. baslangic.ps1).
#>
param([switch]$Kaldir, [switch]$GelistirmeYok)

$gorevAdi = "cry-baslangic"
$betik = Join-Path $PSScriptRoot "baslangic.ps1"
$yedekBetik = Join-Path $PSScriptRoot "yedek.ps1"
$denemeBetik = Join-Path $PSScriptRoot "yedek-geri-yukleme-denemesi.ps1"
$bekciBetik = Join-Path $PSScriptRoot "doldurucu-bekci.ps1"

if ($Kaldir) {
  foreach ($g in @($gorevAdi, "cry-yedek", "cry-yedek-denemesi", "cry-doldurucu-bekci")) {
    Unregister-ScheduledTask -TaskName $g -Confirm:$false -ErrorAction SilentlyContinue
    Write-Output "gorev kaldirildi: $g"
  }
  exit 0
}

if (-not (Test-Path $betik)) { Write-Error "betik yok: $betik"; exit 1 }

$arguman = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$betik`""
if ($GelistirmeYok) { $arguman += " -GelistirmeYok" }

$eylem = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguman
# Oturum acildiktan 30 sn sonra: Docker Desktop'in kendi baslangicina firsat ver.
$tetik = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$tetik.Delay = "PT30S"
$ayar = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
$kim = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $gorevAdi -Action $eylem -Trigger $tetik -Settings $ayar -Principal $kim `
  -Description "cry: Docker Desktop, konteynerler, saglik denetimi ve yerel gelistirme sunucusu (deploy\pc\baslangic.ps1)" -Force | Out-Null
Write-Output "gorev kaydedildi: $gorevAdi (oturum acilisi + 30 sn)"

# --- Yedek gorevleri ---
# Zamanlar gece: yedek 03:15, dogrulama pazar 03:45. `-StartWhenAvailable` bilgisayar o saatte
# kapaliysa acilista telafi eder - yoksa gunu kapali geciren bir makine hic yedek almaz.
function Gorev([string]$Ad, [string]$Yol, $Tetik, [string]$Aciklama) {
  if (-not (Test-Path $Yol)) { Write-Output "ATLANDI ($Ad): betik yok - $Yol"; return }
  $e = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Yol`""
  $a = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
  $k = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
  # Kayit SONUCU DOGRULANIR. Register-ScheduledTask hata verip devam edebiliyor (olculdu:
  # gecersiz RepetitionDuration -> HRESULT 0x80041318) ve kosulsuz bir "kaydedildi" satiri
  # olmayan bir gorevi var gosterir.
  try {
    Register-ScheduledTask -TaskName $Ad -Action $e -Trigger $Tetik -Settings $a -Principal $k `
      -Description $Aciklama -Force -ErrorAction Stop | Out-Null
  } catch {
    Write-Output "HATA ($Ad): gorev KAYDEDILEMEDI - $($_.Exception.Message)"
    return
  }
  if (Get-ScheduledTask -TaskName $Ad -ErrorAction SilentlyContinue) {
    Write-Output "gorev kaydedildi: $Ad"
  } else {
    Write-Output "HATA ($Ad): kayit sonrasi gorev bulunamadi"
  }
}

Gorev "cry-yedek" $yedekBetik (New-ScheduledTaskTrigger -Daily -At 3:15am) `
  "cry: Postgres yedegi E: diskine (deploy\pc\yedek.ps1). Blok indeksi yedeklenmez - yeniden turetilebilir."
Gorev "cry-yedek-denemesi" $denemeBetik (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 3:45am) `
  "cry: en yeni yedegi gecici bir veritabanina geri yukleyip satir sayilarini karsilastirir (deploy\pc\yedek-geri-yukleme-denemesi.ps1)."

# Bekci 15 dakikada bir. Sure 10 yil: `[TimeSpan]::MaxValue` Task Scheduler tarafindan
# REDDEDILIYOR (HRESULT 0x80041318, olculdu). Oturum acilisinda da 2 dk gecikmeyle bir kez daha calisir:
# doldur-devam.ps1 o sirada zaten devrede olabilir, bekci ona yol verir.
$bekciTetik = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 3650)
Gorev "cry-doldurucu-bekci" $bekciBetik $bekciTetik `
  "cry: B3 doldurucusu dusmusse yeniden baslatir; calisiyorsa DOKUNMAZ (deploy\pc\doldurucu-bekci.ps1). El freni: C:\srv\cry\doldurucu-dur"

# Docker Desktop'in kendi otomatik baslatma ayari.
$dosya = Join-Path $env:APPDATA "Docker\settings-store.json"
if (Test-Path $dosya) {
  # Dosya YENIDEN BICIMLENDIRILMEZ ve BOM EKLENMEZ: yalnizca tek deger metin
  # olarak degistirilir. PS 5.1'in ConvertTo-Json + Set-Content -Encoding UTF8
  # ikilisi BOM ekler ve Docker'in kendi ayar dosyasini bozabilir.
  $metin = [IO.File]::ReadAllText($dosya)
  $json = $metin | ConvertFrom-Json
  if ($json.AutoStart -eq $true) {
    Write-Output "Docker Desktop AutoStart zaten acik"
  } elseif ($metin -match '"AutoStart"\s*:\s*false') {
    Copy-Item $dosya "$dosya.yedek" -Force
    $yeni = [regex]::Replace($metin, '"AutoStart"\s*:\s*false', '"AutoStart": true')
    [IO.File]::WriteAllText($dosya, $yeni, (New-Object Text.UTF8Encoding $false))
    Write-Output "Docker Desktop AutoStart acildi (yedek: settings-store.json.yedek)"
  } else {
    Write-Output "AutoStart anahtari dosyada yok; Docker ayarlarindan elle acilabilir. Gorev yine de Docker'i baslatir."
  }
} else {
  Write-Output "Docker ayar dosyasi bulunamadi; gorev yine de Docker'i baslatir"
}
