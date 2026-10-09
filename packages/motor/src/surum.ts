/**
 * Koşunun SÜRÜM DAMGASI — "bu rakam neden değişti" sorusunun tek cevabı.
 *
 * Bir taramanın sonucu, o gün çalışan kodun atıf kuralına, eşiklerine ve
 * durma ölçütlerine bağlı. Eşikler (`params`) ve atıf kuralı (`taint_rule`)
 * kayıtta zaten duruyordu; eksik olan KODUN KENDİSİydi. İki ay sonra aynı
 * kökten alınan farklı bir graf, kuralların mı yoksa kodun mu değiştiğini
 * söyleyemiyordu.
 *
 * Saf katman: damga, ortam değişkeninden ve (varsa) git başından KURULUR,
 * okunmaz. Okuma çağıranın işi — böylece "ortam ne derse o" kuralı testle
 * sabitlenebiliyor.
 *
 * UYDURMA YOK: hiçbir kaynak sürümü söyleyemiyorsa damga `bilinmiyor` olur.
 * Bir sürüm numarası, yanlış olduğunda hiç olmamasından daha kötüdür.
 */

export type SurumKaynagi = "ortam" | "git" | "bilinmiyor";

export type SurumDamgasi = {
  /** Tam değer (genelde 40 haneli commit sha); bilinmiyorsa `null`. */
  sha: string | null;
  /** Ekranda basılan kısa hâli; bilinmiyorsa "bilinmiyor". */
  kisa: string;
  kaynak: SurumKaynagi;
};

/** En uzun kabul edilen damga: bir sha ya da kısa bir etiket. Fazlası kesilir. */
const EN_UZUN = 64;

function temizle(deger: string | undefined | null): string | null {
  if (typeof deger !== "string") return null;
  // Konteyner ortamında değer bir dosyadan/şablondan gelebiliyor: boşluk ve
  // satır sonu yapışması "aynı sürüm" iki farklı metin gösterirdi.
  const t = deger.trim();
  if (!t) return null;
  // Çözülmemiş şablon (`${...}`, `$CRY_SURUM`) bir sürüm DEĞİLDİR; damgayı
  // "bilinmiyor" yapmak, ekrana `${GITHUB_SHA}` basmaktan dürüsttür.
  if (t.includes("$") || t.includes("{")) return null;
  return t.slice(0, EN_UZUN);
}

/** 40 haneli sha ise ilk 12 hane; değilse değerin kendisi. */
export function kisaSurum(sha: string): string {
  return /^[0-9a-f]{40}$/.test(sha) ? sha.slice(0, 12) : sha;
}

export function surumDamgasi(
  ortam: string | undefined | null,
  gitBasi?: string | undefined | null,
): SurumDamgasi {
  const o = temizle(ortam);
  if (o) return { sha: o, kisa: kisaSurum(o), kaynak: "ortam" };
  const g = temizle(gitBasi);
  if (g) return { sha: g, kisa: kisaSurum(g), kaynak: "git" };
  return { sha: null, kisa: "bilinmiyor", kaynak: "bilinmiyor" };
}

/** Raporun bastığı CÜMLE: damga yoksa bunun ne anlama geldiği de yazılır. */
export function surumCumlesi(damga: SurumDamgasi | null | undefined): string {
  if (!damga || damga.kaynak === "bilinmiyor") {
    return "Koşuyu üreten kod sürümü BİLİNMİYOR: koşu bu damgayı yazmayan bir sürümde koştu. Aynı kökten alınan başka bir grafın farkı kurallardan mı koddan mı geliyor, bu rapordan okunamaz.";
  }
  const nereden = damga.kaynak === "ortam" ? "imaja yazılan damga" : "çalışma kopyasının git başı";
  return `Koşuyu üreten kod sürümü ${damga.kisa} (${nereden}). Eşikler ve atıf kuralı koşu kaydında ayrıca durur.`;
}
