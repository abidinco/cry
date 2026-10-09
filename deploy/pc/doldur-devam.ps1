<#
  cry - B3 gecmis doldurucusu: acilista kaldigi yerden devam ettirir,
  bittiginde Windows bildirimi ve Telegram mesaji gonderir.

  Cagiran: baslangic.ps1 (ayri, gizli bir surec olarak baslatir - kendisi
  gunlerce calisabilecegi icin acilis akisini BLOKE ETMEZ).

  Mantik:
    1. doldur.ts komut satirinda gecen bir node.exe halihazirda calisiyorsa
       dokunma, cik.
    2. Gunlukte en son "doldurma ..." baslangic satirindan SONRA bir
       "bitti:" satiri varsa is zaten tamamlanmis demektir, dokunma, cik.
    3. Ikisi de degilse (guc kesintisi/yeniden baslatma sonrasi yarim
       kalmis): ayni komutla YENIDEN baslat, calismasini BEKLE (bu surec
       zaten ayri baslatildigi icin beklemek sorun degil).
    4. Node sureci bitince gunlugun son "bitti:" satirini oku, Windows
       toast bildirimi ve Telegram mesaji gonder.

  GOVDE SAF ASCII (CLAUDE.md): Windows PowerShell 5.1 BOM'suz dosyayi ANSI
  sanar, Turkce karakterler ayristirma hatasi verir.
#>
param(
  [string]$Depo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$Gunluk = "C:\srv\cry\blok-doldur.log",
  [string]$EnvDosyasi = "C:\srv\cry\.env"
)

$ErrorActionPreference = "Continue"
$kendiGunluk = "C:\srv\cry\blok-doldur-devam.log"
New-Item -ItemType Directory -Force -Path (Split-Path $kendiGunluk) | Out-Null

function Yaz([string]$mesaj) {
  $satir = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $mesaj
  Add-Content -Path $kendiGunluk -Value $satir -Encoding UTF8
  Write-Output $satir
}

function SurecCalisiyorMu {
  $p = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*doldur.ts*" }
  return [bool]$p
}

function SonKosuBittiMi {
  if (-not (Test-Path $Gunluk)) { return $false }
  $satirlar = Get-Content $Gunluk -Encoding UTF8
  $sonBaslangic = -1
  for ($i = $satirlar.Count - 1; $i -ge 0; $i--) {
    if ($satirlar[$i] -match "^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} doldurma ") {
      $sonBaslangic = $i
      break
    }
  }
  if ($sonBaslangic -lt 0) { return $false }
  for ($i = $sonBaslangic; $i -lt $satirlar.Count; $i++) {
    if ($satirlar[$i] -match "bitti:") { return $true }
  }
  return $false
}

function SonBittiSatiri {
  if (-not (Test-Path $Gunluk)) { return $null }
  $satirlar = Get-Content $Gunluk -Encoding UTF8
  for ($i = $satirlar.Count - 1; $i -ge 0; $i--) {
    if ($satirlar[$i] -match "bitti:") { return $satirlar[$i] }
  }
  return $null
}

function WindowsBildirGonder([string]$baslik, [string]$mesaj) {
  try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $ni = New-Object System.Windows.Forms.NotifyIcon
    $ni.Icon = [System.Drawing.SystemIcons]::Information
    $ni.Visible = $true
    $ni.ShowBalloonTip(20000, $baslik, $mesaj, [System.Windows.Forms.ToolTipIcon]::Info)
    Start-Sleep -Seconds 21
    $ni.Dispose()
    Yaz "Windows bildirimi gonderildi"
  } catch {
    Yaz "Windows bildirimi basarisiz: $($_.Exception.Message)"
  }
}

# Gonderici ve .env okuyucu TEK kopyada (deploy\pc	elegram.ps1); burada
# yalnizca sonucu gunluge yazan ince bir sarmal var.
. (Join-Path $PSScriptRoot "telegram.ps1")

function TelegramBildir([string]$mesaj) {
  $sonuc = TelegramGonder -Mesaj $mesaj -EnvDosyasi $EnvDosyasi
  if ($sonuc -eq "gonderildi") { Yaz "Telegram bildirimi gonderildi" }
  elseif ($sonuc -eq "yapilandirilmamis") { Yaz "Telegram yapilandirilmamis, atlandi" }
  else { Yaz "Telegram bildirimi basarisiz: $sonuc" }
}

Yaz "--- devam denetimi (depo: $Depo) ---"

if (SurecCalisiyorMu) {
  Yaz "doldur.ts zaten calisiyor, dokunulmadi"
  exit 0
}

if (SonKosuBittiMi) {
  Yaz "son kosu zaten bitmis (gunlukte 'bitti:' satiri var), yeniden baslatilmadi"
  exit 0
}

Yaz "yarim kalmis kosu tespit edildi, ayni komutla yeniden baslatiliyor"

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "cmd.exe"
$psi.Arguments = "/c node --env-file=.env --env-file=apps/web/.env.local --import tsx apps/blok-okuyucu/src/doldur.ts --uygula --ilerlemeSn=60 >> `"$Gunluk`" 2>&1"
$psi.WorkingDirectory = $Depo
$psi.UseShellExecute = $false
$psi.WindowStyle = "Hidden"
$psi.CreateNoWindow = $true

$surec = [System.Diagnostics.Process]::Start($psi)
Yaz "baslatildi, pid=$($surec.Id), bitmesi bekleniyor"
$surec.WaitForExit()
Yaz "surec bitti, cikis kodu=$($surec.ExitCode)"

Start-Sleep -Seconds 3
$bittiSatiri = SonBittiSatiri
if ($bittiSatiri) {
  $mesaj = "cry B3 doldurma bitti: $bittiSatiri"
} else {
  $mesaj = "cry B3 doldurma sureci sona erdi ama gunlukte 'bitti:' satiri yok - beklenmedik cikis olabilir (cikis kodu $($surec.ExitCode))"
}
Yaz $mesaj

WindowsBildirGonder "cry - B3 doldurma" $mesaj
TelegramBildir $mesaj

Yaz "--- devam denetimi bitti ---"
exit 0
