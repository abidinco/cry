<#
  cry - PC acilis betigi (oturum acilisinda zamanlanmis gorevle calisir).

  Sistemin calismasi icin gereken her seyi ayaga kaldirir ya da ayakta
  oldugunu dogrular. Tekrar tekrar calistirilabilir: ayakta olana dokunmaz.

    1. Docker Desktop (motor hazir olana kadar bekler)
    2. Konteynerler: cry-db, cry-redis, cry-clickhouse, cry-web, cry-worker, cry-blok-okuyucu
    3. Servisler: GitHub runner + WireGuard tuneli (yalnizca DENETLER;
       servis baslatmak yonetici ister, gorev kullanici haklariyla calisir)
    4. Saglik: http://localhost:1337/giris
    5. Yerel gelistirme sunucusu (3005) - -GelistirmeYok ile atlanir

  Neden var (2026-09-15): Docker Desktop'in kendi AutoStart ayari kapaliydi;
  makine acildiginda butun yigin dusuk kaldi ve belirti "sayfa acilmiyor" idi.

  GOVDE SAF ASCII: Windows PowerShell 5.1 BOM'suz dosyayi ANSI sanar ve
  Turkce karakterler ayristirma hatasi verir (runner'da yasandi, CLAUDE.md).

  Gunluk: C:\srv\cry\baslangic.log
#>
param(
  [switch]$GelistirmeYok,
  [string]$Depo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [int]$DockerBekleSn = 300
)

$ErrorActionPreference = "Continue"
$gunluk = "C:\srv\cry\baslangic.log"
New-Item -ItemType Directory -Force -Path (Split-Path $gunluk) | Out-Null

function Yaz([string]$mesaj, [string]$seviye = "BILGI") {
  $satir = "{0} [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $seviye, $mesaj
  Add-Content -Path $gunluk -Value $satir -Encoding UTF8
  Write-Output $satir
}

function DockerHazirMi {
  & docker info *> $null
  return ($LASTEXITCODE -eq 0)
}

# Gunluk sonsuz buyumesin: 2000 satirdan fazlaysa son 1000 kalir.
if ((Test-Path $gunluk) -and ((Get-Content $gunluk).Count -gt 2000)) {
  $son = Get-Content $gunluk -Tail 1000
  Set-Content -Path $gunluk -Value $son -Encoding UTF8
}

Yaz "--- baslangic (depo: $Depo) ---"

# 1. Docker Desktop -------------------------------------------------------
if (-not (DockerHazirMi)) {
  $exe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  if (-not (Get-Process "Docker Desktop" -ErrorAction SilentlyContinue)) {
    if (Test-Path $exe) {
      Yaz "Docker Desktop kapali, baslatiliyor"
      Start-Process -FilePath $exe
    } else {
      Yaz "Docker Desktop bulunamadi: $exe" "HATA"
      exit 1
    }
  }
  $bitis = (Get-Date).AddSeconds($DockerBekleSn)
  while (-not (DockerHazirMi)) {
    if ((Get-Date) -gt $bitis) {
      Yaz "Docker motoru $DockerBekleSn sn icinde hazir olmadi" "HATA"
      exit 1
    }
    Start-Sleep -Seconds 3
  }
  Yaz "Docker motoru hazir"
} else {
  Yaz "Docker motoru zaten hazir"
}

# 2. Konteynerler -----------------------------------------------------------
# Konteynerleri runner'in dagitimi olusturur (restart: unless-stopped). Burada
# `compose up` YAPILMAZ: yigini tanimlayan checkout runner'in klasorunde ve
# ortam dosyasi C:\srv\cry\.env. Durmus olan konteyner yalnizca baslatilir.
$konteynerler = @("cry-db", "cry-redis", "cry-clickhouse", "cry-web", "cry-worker", "cry-blok-okuyucu")
foreach ($ad in $konteynerler) {
  $durum = (& docker inspect -f "{{.State.Status}}" $ad 2>$null)
  if (-not $durum) {
    Yaz "$ad yok - once bir dagitim (push) gerekiyor" "UYARI"
  } elseif ($durum -ne "running") {
    Yaz "$ad durumu '$durum', baslatiliyor"
    & docker start $ad | Out-Null
  } else {
    Yaz "$ad calisiyor"
  }
}

# db ve redis saglikli olana kadar bekle (web/worker onlara bagli).
$bitis = (Get-Date).AddSeconds(120)
foreach ($ad in @("cry-db", "cry-redis")) {
  while ($true) {
    $saglik = (& docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{end}}" $ad 2>$null)
    if ($saglik -eq "healthy" -or -not $saglik) { break }
    if ((Get-Date) -gt $bitis) { Yaz "$ad saglik durumu: $saglik" "UYARI"; break }
    Start-Sleep -Seconds 2
  }
}

# 3. Servisler (yalnizca denetim) -------------------------------------------
foreach ($desen in @("actions.runner.*", "WireGuardTunnel*")) {
  $servisler = Get-Service -Name $desen -ErrorAction SilentlyContinue
  if (-not $servisler) { Yaz "servis bulunamadi: $desen" "UYARI"; continue }
  foreach ($s in $servisler) {
    if ($s.Status -ne "Running") {
      Yaz "$($s.Name) calismiyor ($($s.Status)) - yonetici olarak baslatilmali" "UYARI"
    } else {
      Yaz "$($s.Name) calisiyor"
    }
  }
}

# 4. Saglik ------------------------------------------------------------------
$saglikli = $false
$bitis = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $bitis) {
  try {
    $yanit = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0 "http://localhost:1337/giris" -ErrorAction Stop
    if ($yanit.StatusCode -eq 200) { $saglikli = $true; break }
  } catch { }
  Start-Sleep -Seconds 3
}
if ($saglikli) { Yaz "uygulama saglikli: http://localhost:1337" } else { Yaz "uygulama 90 sn icinde yanit vermedi (1337)" "UYARI" }

# 5. Yerel gelistirme sunucusu ----------------------------------------------
if ($GelistirmeYok) {
  Yaz "gelistirme sunucusu atlandi (-GelistirmeYok)"
} elseif (Get-NetTCPConnection -LocalPort 3005 -State Listen -ErrorAction SilentlyContinue) {
  Yaz "gelistirme sunucusu zaten 3005'te"
} elseif (-not (Test-Path (Join-Path $Depo "package.json"))) {
  Yaz "depo bulunamadi, gelistirme sunucusu baslatilmadi: $Depo" "UYARI"
} else {
  # npm.ps1 yurutme ilkesine takilir; npm.cmd kullanilir (CLAUDE.md).
  $devGunluk = Join-Path $Depo ".dev-3005.log"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm.cmd run dev > `"$devGunluk`" 2>&1" -WorkingDirectory $Depo -WindowStyle Hidden
  Yaz "gelistirme sunucusu baslatildi: http://localhost:3005 (gunluk: $devGunluk)"
}

Yaz "--- bitti ---"
exit 0
