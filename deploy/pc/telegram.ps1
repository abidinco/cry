# cry - Telegram gonderici (PC betikleri icin TEK kopya).
#
# Neden ayri dosya: ayni gonderici iki betikte (doldur-devam.ps1, yedek.ps1)
# ayri ayri yasiyordu. Bir kural bir yerde uygulanip kardesinde unutulabiliyor
# (CLAUDE.md'nin en pahali dersi); jeton okuma ve hata yutma tek yerde durur.
#
# Fonksiyon LOG YAZMAZ, SONUC DONDURUR: cagiranin kendi gunlugu ve kendi damga
# bicimi var. Donen degerler: "gonderildi" | "yapilandirilmamis" | "hata: ..."
#
# Govde SAF ASCII (CLAUDE.md: PS 5.1 BOM'suz dosyayi ANSI okur).
#
# Kullanim:
#   . (Join-Path $PSScriptRoot "telegram.ps1")
#   $sonuc = TelegramGonder -Mesaj "..." -EnvDosyasi "C:\srv\cry\.env"

function EnvDegeriOku([string]$Anahtar, [string]$EnvDosyasi = "C:\srv\cry\.env") {
  if (-not (Test-Path $EnvDosyasi)) { return $null }
  $satir = Get-Content $EnvDosyasi -Encoding UTF8 |
    Where-Object { $_ -match "^$Anahtar=" } |
    Select-Object -First 1
  if (-not $satir) { return $null }
  return $satir.Substring($Anahtar.Length + 1).Trim()
}

function TelegramGonder([string]$Mesaj, [string]$EnvDosyasi = "C:\srv\cry\.env") {
  $jeton = EnvDegeriOku -Anahtar "TELEGRAM_BOT_TOKEN" -EnvDosyasi $EnvDosyasi
  $hedef = EnvDegeriOku -Anahtar "TELEGRAM_CHAT_ID" -EnvDosyasi $EnvDosyasi
  # Jeton yoksa bu bir HATA DEGIL: kanal kurulmamis demektir ve cagiran bunu
  # gunlugune "yapilandirilmamis" diye yazar. Sessiz kalmak, gonderilmemis bir
  # mesaji gonderilmis saymak olurdu.
  if (-not $jeton -or -not $hedef) { return "yapilandirilmamis" }
  try {
    $govde = @{ chat_id = $hedef; text = $Mesaj } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$jeton/sendMessage" `
      -ContentType "application/json; charset=utf-8" `
      -Body ([System.Text.Encoding]::UTF8.GetBytes($govde)) | Out-Null
    return "gonderildi"
  } catch {
    return "hata: $($_.Exception.Message)"
  }
}
