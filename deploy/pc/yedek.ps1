# cry - Postgres yedegi (PC).
#
# NE YEDEKLENIR: yalnizca Postgres. Vaka verisi, takip kosulari, etiketler, raporlar ve denetim
# kaydi ZINCIRDEN YENIDEN TURETILEMEZ; blok indeksi turetilebilir (olculdu: bu hizla tam gecmis
# ~98 gun) ve zaten 53 GiB, buyuyor. Yeri doldurulamayan veri 57 MB - onu yedeksiz birakmak,
# "kanit dondurma" iddiasindaki bir raporu kanitsiz birakmaktir.
#
# NEREYE: E: (harici disk). Ayni fiziksel diske yedek, yedek degildir.
#
# DOGRULAMA: dosyanin var olmasi yedek oldugunu GOSTERMEZ. Her kosu `pg_restore --list` ile
# arsivi okur (bozuk dump burada yakalanir). Ayrica dump'in YANINA o anki satir sayilari yazilir
# (`.sayim`): geri yukleme denemesi boylece ESITLIK arayabilir. Sayim olmadan "geri yuklenen satir
# canlidan az" normal gorunur (canli yedekten sonra buyumus olabilir) ve EKSIK bir dump fark
# edilmezdi. Tam deneme: deploy\pc\yedek-geri-yukleme-denemesi.ps1
#
# Betik govdesi SAF ASCII (CLAUDE.md: PS 5.1 BOM'suz dosyayi ANSI okur).
#
# Elle: powershell -NoProfile -ExecutionPolicy Bypass -File deploy\pc\yedek.ps1
[CmdletBinding()]
param(
  [string]$Hedef = "E:\04_Yedek\cry",
  [int]$Saklanan = 14,
  [string]$Gunluk = "C:\srv\cry\yedek.log"
)

$ErrorActionPreference = "Stop"

function Damga {
  # Zaman damgasi kendi dilimini SOYLER (CLAUDE.md: UTC damga bir kez "surec takildi" sanilmasina
  # yol acti). Ornek: 2026-09-22T01:14:03+03:00
  $d = Get-Date
  $f = [System.TimeZoneInfo]::Local.GetUtcOffset($d)
  $isaret = if ($f.Ticks -lt 0) { "-" } else { "+" }
  "{0}{1}{2:00}:{3:00}" -f $d.ToString("yyyy-MM-ddTHH:mm:ss"), $isaret, [math]::Abs($f.Hours), [math]::Abs($f.Minutes)
}

function Yaz([string]$Metin) {
  $satir = "$(Damga) $Metin"
  Write-Output $satir
  try { Add-Content -Path $Gunluk -Value $satir -Encoding UTF8 } catch { }
}

$cikis = 0
try {
  New-Item -ItemType Directory -Force -Path (Split-Path $Gunluk) | Out-Null
  if (-not (Test-Path (Split-Path $Hedef -Qualifier))) {
    Yaz "HATA: hedef surucu yok ($Hedef). Harici disk takili mi?"
    exit 2
  }
  $klasor = Join-Path $Hedef "postgres"
  New-Item -ItemType Directory -Force -Path $klasor | Out-Null

  $ad = "cry-{0}.dump" -f (Get-Date -Format "yyyyMMdd-HHmm")
  $yol = Join-Path $klasor $ad
  $gecici = "/tmp/$ad"

  Yaz "yedek basliyor -> $yol"
  $sure = [Diagnostics.Stopwatch]::StartNew()

  # Dump konteyner ICINDE alinir, sonra kopyalanir: `docker exec ... > dosya` PowerShell'de
  # ikili ciktiyi metne cevirip arsivi BOZAR.
  docker exec cry-db sh -lc "pg_dump -U `"`$POSTGRES_USER`" -d `"`$POSTGRES_DB`" --format=custom --file=$gecici"
  if ($LASTEXITCODE -ne 0) { throw "pg_dump basarisiz (exit $LASTEXITCODE)" }

  # Arsivi ONCE konteynerde dogrula: bozuksa diske hic yazilmasin.
  $tablolar = docker exec cry-db sh -lc "pg_restore --list $gecici | grep -c 'TABLE DATA'"
  if ($LASTEXITCODE -ne 0) { throw "pg_restore --list arsivi okuyamadi" }

  docker cp "cry-db:$gecici" "$yol"
  if ($LASTEXITCODE -ne 0) { throw "docker cp basarisiz" }
  docker exec cry-db sh -lc "rm -f $gecici" | Out-Null

  # Dump'in ANINDAKI satir sayilari yanina yazilir. Sayim dump'tan SONRA alinir; arada yazan bir
  # satir sayimi buyutebilir, o yuzden deneme "geri >= sayim" degil "geri <= sayim" bekler - eksik
  # olan hatadir, fazla olan yaristir.
  $tablolar2 = "transfers","addresses","assets","labels","trace_runs","trace_nodes","trace_edges","reports","users","audit_logs","cases"
  $sorgu = ($tablolar2 | ForEach-Object { "select '$_' t, count(*) n from $_" }) -join " union all "
  $sayim = docker exec cry-db psql -tA -F "|" -U cry -d cry -c $sorgu
  if ($LASTEXITCODE -eq 0) { Set-Content -Path "$yol.sayim" -Value $sayim -Encoding ASCII }

  $sure.Stop()
  $boyut = [math]::Round((Get-Item $yol).Length / 1MB, 1)
  Yaz ("tamam: {0} MB, {1} tablo verisi, {2} sn" -f $boyut, ($tablolar -replace '\s',''), [math]::Round($sure.Elapsed.TotalSeconds, 1))

  # Eskileri sil - ama once YENI dosyanin yazildigini gordukten sonra.
  $hepsi = Get-ChildItem $klasor -Filter "cry-*.dump" | Sort-Object LastWriteTime -Descending
  if ($hepsi.Count -gt $Saklanan) {
    $silinecek = $hepsi | Select-Object -Skip $Saklanan
    foreach ($f in $silinecek) {
      Remove-Item $f.FullName -Force
      Remove-Item "$($f.FullName).sayim" -Force -ErrorAction SilentlyContinue
      Yaz "eski yedek silindi: $($f.Name)"
    }
  }

  # Yedeklenmeyen ama DURUMU bilinmesi gereken sey: blok indeksi. Yeniden turetilebilir, o yuzden
  # yedegi alinmiyor; ama hangi noktada oldugu yedek gunlugunde dursun ki bir kayipta ne kadar
  # yeniden okumak gerektigi bilinsin.
  # Bu blok BILGI amaclidir ve yedegi BASARISIZ SAYMAZ: ClickHouse'a ulasilamamasi Postgres
  # yedeginin alinmadigi anlamina gelmez. Kimlik konteynerin KENDI ortamindan okunur; deger
  # PowerShell'e hic gecmez, ekrana hic basilmaz (CLAUDE.md: hicbir sir ekrana basilmaz).
  try {
    $bos = [math]::Round((Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='D:'").FreeSpace / 1GB, 1)
    # Komut PowerShell'de TEK TIRNAKLA tasinir: `$CLICKHOUSE_*` PowerShell tarafindan degil, sh
    # tarafindan cozulsun. Cift tirnakli bir PS dizesi once kendi degiskenlerini arar ve sorguyu
    # bozar (olculdu: "Syntax error: failed at position 7").
    # `sh -lc "..."` KULLANILMAZ: PS 5.1 gomulu cift tirnaklari yerli exe'ye gecirirken bozuyor ve
    # ClickHouse sorguyu "SELECT"e kirpilmis goruyordu (olculdu). Argumanlar AYRI AYRI verilince
    # dogru gidiyor. Kimlik `clickhouse-client`in kendi ortam degiskenlerinden geliyor
    # (CLICKHOUSE_USER / CLICKHOUSE_PASSWORD konteynerde tanimli) - deger buraya hic gelmiyor.
    # Ayrica `2>&1` YOK: PS 5.1 yerli exe'nin stderr'ini ErrorRecord'a cevirir ve
    # $ErrorActionPreference="Stop" ile bu saglam bir komutu bile hataya dusurur.
    $blok = (docker exec cry-clickhouse clickhouse-client --database cry --query 'SELECT max(blok) FROM blok_okundu') -replace '\s', ''
    $okBlok = $LASTEXITCODE -eq 0
    $satir = (docker exec cry-clickhouse clickhouse-client --database cry --query 'SELECT count() FROM blok_indeks') -replace '\s', ''
    if ($okBlok -and $LASTEXITCODE -eq 0) {
      Yaz ("yedeklenmeyen: blok indeksi {0} bloga kadar, {1} satir (yeniden turetilebilir) - D: {2} GiB bos" -f $blok, $satir, $bos)
    } else {
      Yaz "not: blok indeksi durumu okunamadi (yedegi etkilemez) - D: $bos GiB bos"
    }
    if ($bos -lt 60) { Yaz "UYARI: D: 60 GiB altinda - doldurucu 50 GiB'de DURUR." }
  } catch {
    Yaz "not: durum satiri yazilamadi (yedegi etkilemez): $($_.Exception.Message)"
  }
}
catch {
  Yaz "HATA: $($_.Exception.Message)"
  $cikis = 1
}
exit $cikis
