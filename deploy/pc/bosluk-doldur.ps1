# cry - blok indeksindeki bosluklari kapatan turu calistirir (gunluk).
#
# Neden onemli: pencere, kapsam tablosunun BOSLUKSUZ son araligidir. Tam gecmis yuklendikten sonra
# 84.000.000'daki tek bir bosluk, ALTINDAKI 84 milyon blogu motora kapatir - veri diskte dursa bile.
# Bosluk "biraz eksik veri" degil, o noktanin altindaki her seyin kaybidir.
#
# Bu sarmalayici yalnizca node betigini cagirir ve ciktisini gunluge yazar; butun mantik orada
# (scripts/blok-indeks-bosluk-doldur.mts). Betik doldurucunun CEPHESINE yaklasmaz, yani ikisi ayni
# blogu okumaz.
#
# GOVDE SAF ASCII (CLAUDE.md: PS 5.1 BOM'suz dosyayi ANSI okur).
#
# Elle: powershell -NoProfile -ExecutionPolicy Bypass -File deploy\pc\bosluk-doldur.ps1
[CmdletBinding()]
param(
  [string]$Depo = "",
  [string]$Gunluk = "C:\srv\cry\bosluk-doldur.log",
  [int]$EnFazla = 400
)

$ErrorActionPreference = "Continue"

if (-not $Depo) {
  $kok = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Definition }
  $Depo = (Resolve-Path (Join-Path $kok "..\..")).Path
}

New-Item -ItemType Directory -Force -Path (Split-Path $Gunluk) | Out-Null

$d = Get-Date
$f = [System.TimeZoneInfo]::Local.GetUtcOffset($d)
$i = if ($f.Ticks -lt 0) { "-" } else { "+" }
$damga = "{0}{1}{2:00}:{3:00}" -f $d.ToString("yyyy-MM-ddTHH:mm:ss"), $i, [math]::Abs($f.Hours), [math]::Abs($f.Minutes)
Add-Content -Path $Gunluk -Value "$damga --- bosluk turu basliyor ---" -Encoding UTF8

# cmd uzerinden, gunluge EKLEYEREK: Start-Process'in yonlendirmesi dosyayi EZER.
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "cmd.exe"
$psi.Arguments = "/c node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/blok-indeks-bosluk-doldur.mts --uygula --enFazla=$EnFazla >> `"$Gunluk`" 2>&1"
$psi.WorkingDirectory = $Depo
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$surec = [System.Diagnostics.Process]::Start($psi)
$surec.WaitForExit()

Add-Content -Path $Gunluk -Value "$damga --- bosluk turu bitti, cikis $($surec.ExitCode) ---" -Encoding UTF8
exit $surec.ExitCode
