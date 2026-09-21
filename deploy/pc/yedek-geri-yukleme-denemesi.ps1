# cry - yedegi GERI YUKLEYEREK dogrula.
#
# Neden ayri bir betik: bir dosyanin var olmasi, hatta `pg_restore --list` ile okunabilmesi, ondan
# calisir bir veritabani cikacagini GOSTERMEZ. Bu projede kural: "N kayit yazildi" bir dogrulama
# degildir (CLAUDE.md). Yedegin olcusu, geri yuklenip SAYILARIN tutmasidir.
#
# Ne yapar: en yeni dump'i gecici bir veritabanina yukler, satir sayilarini CANLIYLA karsilastirir,
# sonra gecici veritabanini siler. CANLI VERITABANINA DOKUNMAZ.
#
# Betik govdesi SAF ASCII (CLAUDE.md: PS 5.1 BOM'suz dosyayi ANSI okur).
#
# Elle: powershell -NoProfile -ExecutionPolicy Bypass -File deploy\pc\yedek-geri-yukleme-denemesi.ps1
[CmdletBinding()]
param(
  [string]$Hedef = "E:\04_Yedek\cry\postgres",
  [string]$Gunluk = "C:\srv\cry\yedek.log",
  [string]$DenemeDb = "cry_geri_deneme"
)

$ErrorActionPreference = "Stop"

function Damga {
  $d = Get-Date
  $f = [System.TimeZoneInfo]::Local.GetUtcOffset($d)
  $isaret = if ($f.Ticks -lt 0) { "-" } else { "+" }
  "{0}{1}{2:00}:{3:00}" -f $d.ToString("yyyy-MM-ddTHH:mm:ss"), $isaret, [math]::Abs($f.Hours), [math]::Abs($f.Minutes)
}
function Yaz([string]$Metin) {
  $satir = "$(Damga) [geri-yukleme] $Metin"
  Write-Output $satir
  try { Add-Content -Path $Gunluk -Value $satir -Encoding UTF8 } catch { }
}

# Sayilari tutulan tablolar: vaka verisinin iskeleti. Bos olanlar da listede kalir - bir gun
# dolduklarinda denemeye kendiliginden girsinler.
$TABLOLAR = @("transfers", "addresses", "assets", "labels", "trace_runs", "trace_nodes", "trace_edges", "reports", "users", "audit_logs", "cases")

function Say([string]$Db) {
  $sorgu = ($TABLOLAR | ForEach-Object { "select '$_' t, count(*) n from $_" }) -join " union all "
  # `sh -lc` icinde tek tirnak kullanildigi icin sorgu PowerShell'den TEK ARGUMAN olarak gecmeli;
  # docker'a ayri ayri arguman vermek PS 5.1'in tirnak bozmasindan kacinmanin yoludur.
  $cikti = docker exec cry-db psql -tA -F "|" -U cry -d $Db -c $sorgu
  if ($LASTEXITCODE -ne 0) { throw "$Db sayilamadi" }
  $m = @{}
  foreach ($satir in $cikti) {
    $p = "$satir".Split("|")
    if ($p.Count -eq 2) { $m[$p[0]] = [int64]$p[1] }
  }
  return $m
}

$cikis = 0
try {
  $dump = Get-ChildItem $Hedef -Filter "cry-*.dump" -ErrorAction Stop | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $dump) { throw "yedek dosyasi yok: $Hedef" }
  Yaz "deneniyor: $($dump.Name) ($([math]::Round($dump.Length/1MB,1)) MB)"

  $sure = [Diagnostics.Stopwatch]::StartNew()
  docker cp "$($dump.FullName)" "cry-db:/tmp/deneme.dump" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "docker cp basarisiz" }

  docker exec cry-db psql -q -U cry -d postgres -c "drop database if exists $DenemeDb" -c "create database $DenemeDb" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "deneme veritabani olusturulamadi" }

  # `--exit-on-error` YOK bilerek: pg_restore sahiplik/uzanti uyarilari verebilir ve bunlar veriyi
  # etkilemez. Hukmu UYARILAR degil, SAYILAR verir.
  docker exec cry-db pg_restore -U cry -d $DenemeDb --no-owner --no-privileges /tmp/deneme.dump 2>$null | Out-Null
  $sure.Stop()

  $canli = Say "cry"
  $geri = Say $DenemeDb

  # Olcut CANLI DEGIL, yedek ANINDAKI sayimdir (`.sayim` dosyasi). Canliyla karsilastirmak yalnizca
  # "geri > canli" gibi absurt bir durumu yakalar; EKSIK bir dump "canli buyumustur" diye normal
  # gorunurdu. Sayim yoksa (eski yedek) kontrol zayiflar ve bunu SOYLER.
  $sayimYolu = "$($dump.FullName).sayim"
  $olcut = $null
  if (Test-Path $sayimYolu) {
    $olcut = @{}
    foreach ($satir in (Get-Content $sayimYolu)) {
      $p = "$satir".Split("|")
      if ($p.Count -eq 2) { $olcut[$p[0]] = [int64]$p[1] }
    }
  }

  $uyusmaz = @()
  $toplam = 0
  foreach ($t in $TABLOLAR) {
    $c = if ($canli.ContainsKey($t)) { $canli[$t] } else { -1 }
    $g = if ($geri.ContainsKey($t)) { $geri[$t] } else { -1 }
    $toplam += [math]::Max($g, 0)
    if ($g -lt 0) { $uyusmaz += "${t}: geri yuklenen tabloda YOK"; continue }
    if ($olcut) {
      # Sayim dump'tan SONRA alindi: arada yazan bir satir sayimi buyutmus olabilir, o yuzden
      # "geri < sayim" hosgorulur DEGIL - tam tersi. Dump once alindi, yani dump'ta olan satir
      # sayimda da vardir. Eksik = veri kaybi, fazla = yaris. Ikisi de bildirilir.
      $b = if ($olcut.ContainsKey($t)) { $olcut[$t] } else { -1 }
      if ($b -lt 0) { $uyusmaz += "${t}: sayimda yok" }
      elseif ($g -lt $b) { $uyusmaz += "${t}: geri $g < yedek anindaki $b - EKSIK" }
      elseif ($g -gt $b) { Yaz "not: ${t} geri $g > sayim $b (dump ile sayim arasinda yazilmis)" }
    }
    elseif ($g -gt $c) { $uyusmaz += "${t}: geri $g > canli $c" }
  }

  if ($uyusmaz.Count -gt 0) {
    foreach ($u in $uyusmaz) { Yaz "UYUSMAZLIK $u" }
    throw "geri yukleme dogrulanamadi"
  }
  $fark = ($TABLOLAR | Where-Object { $geri[$_] -lt $canli[$_] } | ForEach-Object { "$_ $($geri[$_])/$($canli[$_])" }) -join ", "
  Yaz ("TAMAM: {0} tablo, {1} satir geri yuklendi, {2} sn - olcut: {3}{4}" -f $TABLOLAR.Count, $toplam,
    [math]::Round($sure.Elapsed.TotalSeconds, 1),
    $(if ($olcut) { "yedek anindaki sayim" } else { "YOK (eski yedek) - yalnizca canliyla kaba kiyas" }),
    $(if ($fark) { " - yedekten bu yana canlida artan: $fark" } else { "" }))
}
catch {
  Yaz "HATA: $($_.Exception.Message)"
  $cikis = 1
}
finally {
  # Deneme veritabani HER HALUKARDA silinir; yoksa her kosuda bir kopya birikir.
  docker exec cry-db psql -q -U cry -d postgres -c "drop database if exists $DenemeDb" 2>$null | Out-Null
  docker exec cry-db sh -lc "rm -f /tmp/deneme.dump" 2>$null | Out-Null
}
exit $cikis
