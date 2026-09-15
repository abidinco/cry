<#
  cry - acilis otomasyonunu KURAR (bir kez calistirilir, tekrari zararsizdir).

    powershell -NoProfile -ExecutionPolicy Bypass -File deploy\pc\kur.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File deploy\pc\kur.ps1 -Kaldir

  Yaptiklari:
    - "cry-baslangic" zamanlanmis gorevi: oturum acilisinda baslangic.ps1
      (kullanici haklariyla; Docker Desktop bir oturum uygulamasidir, servis degil)
    - Docker Desktop'in KENDI "oturum acilisinda basla" ayarini acar
      (settings-store.json -> AutoStart). Olculdu 2026-09-15: False idi.

  Makine geneli yurutme ilkesi DEGISTIRILMEZ: Bypass yalnizca bu gorevin
  komut satirinda verilir (runner'daki kuralin aynisi).

  GOVDE SAF ASCII (bkz. baslangic.ps1).
#>
param([switch]$Kaldir, [switch]$GelistirmeYok)

$gorevAdi = "cry-baslangic"
$betik = Join-Path $PSScriptRoot "baslangic.ps1"

if ($Kaldir) {
  Unregister-ScheduledTask -TaskName $gorevAdi -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output "gorev kaldirildi: $gorevAdi"
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
