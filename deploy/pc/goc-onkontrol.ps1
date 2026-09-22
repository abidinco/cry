# cry - 2 TB diske gocun ON KONTROLU. Hicbir seyi DEGISTIRMEZ, yalnizca olcer.
#
# Neden: goc gunu dogaclama yapilmaz. Bu betik gocun dayandigi her varsayimi BUGUN sinar ve
# bozuk olani soyler. Sira ve gerekceler: docs/yol-haritasi-blok-indeks.md -> "2 TB diske goc".
#
# -Hedef verilirse hedef surucude yer olup olmadigi da olculur:
#   powershell -NoProfile -ExecutionPolicy Bypass -File deploy\pc\goc-onkontrol.ps1 -Hedef F:
#
# GOVDE SAF ASCII (CLAUDE.md: PS 5.1 BOM'suz dosyayi ANSI okur).
[CmdletBinding()]
param([string]$Hedef = "")

$ErrorActionPreference = "Continue"
$sorun = 0
function Tamam([string]$m) { Write-Output "  OK    $m" }
function Sorun([string]$m) { Write-Output "  SORUN $m"; $script:sorun++ }
function Bilgi([string]$m) { Write-Output "        $m" }

Write-Output "cry - goc on kontrolu"

# 1) Ayar anahtari. WSL2'de disk yerinin anahtari CustomWslDistroDir'dir; DataFolder Hyper-V
#    motorunun anahtari ve WSL2'de HICBIR SEY yapmaz (bir kez yanlis teshise yol acti).
$ayarDosyasi = Join-Path $env:APPDATA "Docker\settings-store.json"
$vhdx = $null
if (-not (Test-Path $ayarDosyasi)) {
  Sorun "Docker ayar dosyasi yok: $ayarDosyasi"
} else {
  $metin = [IO.File]::ReadAllText($ayarDosyasi)
  $json = $metin | ConvertFrom-Json
  $kok = $json.CustomWslDistroDir
  if (-not $kok) {
    Sorun "CustomWslDistroDir BOS - veri diski varsayilan yerde (C:). Goc yolu bu anahtardir."
  } else {
    Tamam "CustomWslDistroDir = $kok"
    if ($metin -notmatch '"CustomWslDistroDir"') { Sorun "anahtar JSON metninde bulunamadi - metin degisimi calismaz" }
    $vhdx = Join-Path $kok "disk\docker_data.vhdx"
  }
}

# 2) Veri diski dosyasi.
$vhdxGiB = 0
if ($vhdx -and (Test-Path $vhdx)) {
  $vhdxGiB = [math]::Round((Get-Item $vhdx).Length / 1GB, 1)
  Tamam "veri diski $vhdx - $vhdxGiB GiB"
} else {
  Sorun "veri diski bulunamadi: $vhdx"
}

# 3) Icerideki gercek kullanim ve geri alinabilir cop. VHDX kendiliginden KUCULMEZ; gocten once
#    prune + fstrim + compact yapilmazsa 100 GiB'lik bos alan da kopyalanir.
$df = docker system df 2>$null
if ($LASTEXITCODE -eq 0) {
  Tamam "docker erisilebilir"
  foreach ($satir in $df) { if ($satir -match "^(Images|Containers|Local Volumes|Build Cache)") { Bilgi $satir.Trim() } }
} else {
  Sorun "docker system df calismadi - Docker Desktop kapali olabilir"
}

# 4) Konteynerler ve veri. Goc SONRASI bu sayilar birebir ayni cikmali.
$konteyner = @(docker ps --format "{{.Names}}" 2>$null)
if ($LASTEXITCODE -eq 0) { Tamam "$($konteyner.Count) konteyner calisiyor: $($konteyner -join ', ')" } else { Sorun "docker ps calismadi" }

$chSatir = docker exec cry-clickhouse clickhouse-client --database cry --query 'SELECT count() FROM blok_indeks' 2>$null
$chBlok = docker exec cry-clickhouse clickhouse-client --database cry --query 'SELECT max(blok) FROM blok_okundu' 2>$null
if ($chSatir) { Tamam "ClickHouse $($chSatir.Trim()) satir, $($chBlok.Trim()) bloga kadar - GOC SONRASI AYNI OLMALI" } else { Sorun "ClickHouse sayilamadi" }

$pg = docker exec cry-db psql -tA -U cry -d cry -c "select count(*) from transfers" 2>$null
if ($pg) { Tamam "Postgres $($pg.Trim()) hareket - GOC SONRASI AYNI OLMALI" } else { Sorun "Postgres sayilamadi" }

# 5) Yedek: goc oncesi taze bir yedek SART. Gocun kendisi veriyi tasimiyor olsa bile,
#    diskin fiziksel olarak sokulecegi bir islemde tek kopya kabul edilemez.
$yedek = Get-ChildItem "E:\04_Yedek\cry\postgres" -Filter "cry-*.dump" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $yedek) { Sorun "E:'de Postgres yedegi YOK" }
elseif (((Get-Date) - $yedek.LastWriteTime).TotalHours -gt 26) { Sorun "en yeni yedek $([math]::Round(((Get-Date) - $yedek.LastWriteTime).TotalHours,1)) saatlik - goc oncesi yenile" }
else { Tamam "yedek taze: $($yedek.Name)" }

# 6) El freni ve bekci: goc sirasinda bekci doldurucuyu geri baslatmamali.
if (Get-ScheduledTask -TaskName "cry-doldurucu-bekci" -ErrorAction SilentlyContinue) {
  Tamam "bekci gorevi var - goc sirasinda EL FRENI cekilmeli: New-Item C:\srv\cry\doldurucu-dur"
} else {
  Bilgi "bekci gorevi yok"
}

# 7) Hedef surucu.
if ($Hedef) {
  $h = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($Hedef.TrimEnd('\',':'))':'" -ErrorAction SilentlyContinue
  if (-not $h) { $h = Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DeviceID -eq ($Hedef.TrimEnd('\') ) } }
  if (-not $h) { Sorun "hedef surucu bulunamadi: $Hedef" }
  else {
    $bos = [math]::Round($h.FreeSpace / 1GB, 1)
    if ($bos -lt $vhdxGiB + 20) { Sorun "hedefte $bos GiB bos, veri diski $vhdxGiB GiB - yer YETMEZ" }
    else { Tamam "hedef $($h.DeviceID) $bos GiB bos (veri diski $vhdxGiB GiB)" }
  }
} else {
  Bilgi "hedef surucu verilmedi (-Hedef F:) - yer kontrolu atlandi"
}

Write-Output ""
if ($sorun -eq 0) { Write-Output "SONUC: engel yok, goc sirasi izlenebilir." } else { Write-Output "SONUC: $sorun SORUN - once bunlar cozulur." }
exit $(if ($sorun -eq 0) { 0 } else { 1 })
