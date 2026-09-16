/**
 * Tamponlu, SERİ yazıcı — okuyucu (B2) ve doldurucu (B3) paylaşır.
 *
 * Sıra kuralı (CLAUDE.md → Blok indeksi): bir partide önce transfer satırları, SONRA kapsam satırları.
 * Süreç iki yazma arasında ölürse blok "okunmadı" kalır ve yeniden okunur; tersi sırada "okundu, 0
 * transfer" görünürdü. Yazmalar tek bir söz zincirinde sıralanır: iki parti aynı anda yazılmaz.
 */
import { ekle, satirDizisi, kapsamDizisi, EKLE_SQL, KAPSAM_EKLE_SQL, type Ayar, type AyristirmaSonucu } from "@cry/blok-indeks";

export class Yazici {
  private tampon: AyristirmaSonucu[] = [];
  private zincir: Promise<void> = Promise.resolve();
  private readonly zamanlayici: NodeJS.Timeout;
  /** Yazılan (kapsamı kaydedilen) blok sayısı. */
  yazilan = 0;
  /** İlk yazma hatası; doluysa sonraki partiler yazılmaz. */
  hata: unknown = null;

  /**
   * @param uygula `false` ise KURU: tampon boşaltılır ama hiçbir şey yazılmaz.
   * @param hatada Yazma hatasında bir kez çağrılır — yazamıyorsak okumaya devam etmek kotayı boşa harcar.
   */
  constructor(
    private readonly a: Ayar,
    private readonly uygula: boolean,
    private readonly hatada: (e: unknown) => void,
    private readonly tamponBlok = 50,
    tamponMs = 2_000,
  ) {
    this.zamanlayici = setInterval(() => void this.bosalt(), tamponMs);
  }

  ekle(r: AyristirmaSonucu): void {
    this.tampon.push(r);
    if (this.tampon.length >= this.tamponBlok) void this.bosalt();
  }

  bosalt(): Promise<void> {
    const parti = this.tampon;
    this.tampon = [];
    if (parti.length === 0) return this.zincir;
    this.zincir = this.zincir.then(async () => {
      if (this.hata) return;
      try {
        if (this.uygula) {
          const satirlar = parti.flatMap((r) => r.satirlar.map(satirDizisi));
          if (satirlar.length) await ekle(this.a, EKLE_SQL, satirlar);
          await ekle(this.a, KAPSAM_EKLE_SQL, parti.map(kapsamDizisi)); // SONRA
          this.yazilan += parti.length;
        }
      } catch (e) {
        this.hata = e;
        this.hatada(e);
      }
    });
    return this.zincir;
  }

  async kapat(): Promise<void> {
    clearInterval(this.zamanlayici);
    await this.bosalt();
  }
}
