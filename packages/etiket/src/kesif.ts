/**
 * Yapısal keşif: arşivin KENDİ şeklinden servis cüzdanı adayı çıkarır.
 *
 * Gerekçe: liste bayatlar, motor bayatlamaz. Ama bu motorun söyleyebildiği
 * şey dardır ve dar olduğu YAZILIR — "burası bir servis cüzdanı" der,
 * "burası Binance" DEMEZ. Kimlik ancak bir kaynaktan ya da insandan gelir.
 *
 * Ölçülmüş tuzak (2026-09-09): sinyal, taradığımız adreslerle karışıyor.
 * Arşivdeki 6.642 adresin en yüksek karşı taraf sayısı 3; hepsi
 * `index_state = "bilinmiyor"`. Küçük görünmelerinin sebebi küçük olmaları
 * değil, BAKMAMIŞ olmamız. O yüzden ölçüt indeks durumuna göre üç ayrı
 * cevap verir:
 *
 * - `tam`        → sayı bir ÖLÇÜMDÜR, hem "en az" hem "en çok" der.
 * - `kismi`      → sayı bir ALT SINIRDIR: "en az bu kadar" der, "en çok"
 *                  diyemez. Alt sınır zaten eşiği aşıyorsa aday geçerlidir.
 * - `bilinmiyor` → hiçbir şey söylenemez. Aday DEĞİL, "bakılmadı".
 */

export type IndeksDurumu = "tam" | "kismi" | "bilinmiyor";

export type AdresIstatistigi = {
  address: string;
  indeksDurumu: IndeksDurumu;
  /** Bu adrese gönderen KAÇ FARKLI adres. */
  gonderenSayisi: number;
  /** Bu adresin gönderdiği KAÇ FARKLI adres. */
  aliciSayisi: number;
  hareketSayisi: number;
};

/** Bir servis cüzdanının şekli — hangi yönü kalabalık. */
export type Sekil = "toplayici" | "dagitici" | "gecis";

export type ServisAdayi = {
  address: string;
  sekil: Sekil;
  /** 0..1 — kaba bir sıralama ölçüsü, olasılık değil. */
  guven: number;
  /** İnsanın okuyup onaylayacağı gerekçe; her satır bir ölçüm. */
  gerekce: string[];
  altSinirMi: boolean;
};

export type KesifSonucu = {
  adaylar: ServisAdayi[];
  /** Karar VERİLEMEYEN adres sayısı — "temiz" değil, "bakılmadı". */
  bakilmadi: number;
  /** Ölçülebilir olup eşiği geçmeyen adres sayısı. */
  eşiginAltinda: number;
};

export type KesifEsikleri = {
  /** Bir yönde kaç farklı karşı taraf "kalabalık" sayılır. */
  karsiTarafEsigi: number;
  /** İki yön de bunu aşarsa şekil "geçiş"tir. */
  gecisEsigi: number;
};

/**
 * Varsayılan eşikler ARŞİVDEN ölçüldü (2026-09-09): tam/kısmi indeksli 25
 * adresin karşı taraf sayıları 1…2248 arasında ve 50'nin üstünde 10 adres
 * var. 50, "aktif bir cüzdan" ile "bir servis" arasındaki ilk gerçek
 * boşluğun geçtiği yer.
 *
 * Eşik bir SEÇİMDİR ve raporda görünür — tıpkı atıf kuralı gibi.
 */
export const VARSAYILAN_KESIF: KesifEsikleri = {
  karsiTarafEsigi: 50,
  gecisEsigi: 100,
};

export function servisAdaylari(
  istatistikler: AdresIstatistigi[],
  esikler: KesifEsikleri = VARSAYILAN_KESIF,
): KesifSonucu {
  const adaylar: ServisAdayi[] = [];
  let bakilmadi = 0;
  let eşiginAltinda = 0;

  for (const s of istatistikler) {
    if (s.indeksDurumu === "bilinmiyor") {
      // Sayısı küçük olabilir ama bu bir bulgu değil: bakılmadı.
      bakilmadi++;
      continue;
    }

    const altSinirMi = s.indeksDurumu === "kismi";
    const gonderen = s.gonderenSayisi;
    const alici = s.aliciSayisi;
    const enKalabalik = Math.max(gonderen, alici);

    if (enKalabalik < esikler.karsiTarafEsigi) {
      eşiginAltinda++;
      continue;
    }

    const ikisiDe = gonderen >= esikler.gecisEsigi && alici >= esikler.gecisEsigi;
    const sekil: Sekil = ikisiDe ? "gecis" : gonderen > alici ? "toplayici" : "dagitici";

    const gerekce: string[] = [
      `${gonderen} farklı adresten alıyor, ${alici} farklı adrese gönderiyor` +
        (altSinirMi ? " (kısmi tarama — bunlar ALT SINIR)" : ""),
      `${s.hareketSayisi} hareket`,
    ];
    if (sekil === "toplayici") {
      gerekce.push("çok kaynaktan toplayıp az yere gönderiyor: borsa yatırma / süpürme şekli");
    } else if (sekil === "dagitici") {
      gerekce.push("az kaynaktan alıp çok yere gönderiyor: ödeme / dağıtım şekli");
    } else {
      gerekce.push("iki yönde de kalabalık: borsa sıcak cüzdanı şekli");
    }

    // Güven kaba bir SIRALAMA ölçüsü: eşiğin kaç katı olduğuna bakar ve
    // 1'e doygunlaşır. Olasılık iddiası değildir, o yüzden raporda sayı
    // değil GEREKÇE gösterilir.
    const kat = enKalabalik / esikler.karsiTarafEsigi;
    let guven = Math.min(0.9, 0.3 + 0.15 * Math.log2(kat + 1));
    if (sekil === "gecis") guven = Math.min(0.9, guven + 0.1);
    // Alt sınır, ölçümden zayıf bir kanıttır.
    if (altSinirMi) guven *= 0.8;

    adaylar.push({
      address: s.address,
      sekil,
      guven: Math.round(guven * 100) / 100,
      gerekce,
      altSinirMi,
    });
  }

  adaylar.sort((a, b) => b.guven - a.guven || a.address.localeCompare(b.address));
  return { adaylar, bakilmadi, eşiginAltinda };
}
