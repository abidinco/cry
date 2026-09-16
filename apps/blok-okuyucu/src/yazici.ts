/**
 * Tamponlu, SERİ yazıcı — okuyucu (B2) ve doldurucu (B3) paylaşır.
 *
 * Sıra kuralı (CLAUDE.md → Blok indeksi): bir partide önce transfer satırları, SONRA kapsam satırları.
 * Süreç iki yazma arasında ölürse blok "okunmadı" kalır ve yeniden okunur; tersi sırada "okundu, 0
 * transfer" görünürdü. Yazmalar tek bir söz zincirinde sıralanır: iki parti aynı anda yazılmaz.
 */
import { ekle, satirDizisi, kapsamDizisi, EKLE_SQL, KAPSAM_EKLE_SQL, type Ayar, type AyristirmaSonucu } from "@cry/blok-indeks";

/** Geçici yazma hatası bu kadar süre yeniden denenir; sonra kalıcı sayılır. */
const GECICI_HATA_SURESI_MS = 10 * 60_000;

/** Bağlantı kopması ve sunucu tarafı 5xx geçicidir; 4xx (sorgu/şema hatası) kalıcıdır. */
export function geciciMi(e: unknown): boolean {
  const m = (e as Error)?.message ?? "";
  return /fetch failed|ECONNREFUSED|ECONNRESET|EAI_AGAIN|socket hang up|other side closed|ClickHouse 5\d\d|Can't reach database server|terminating connection|Server has closed the connection|P1001|P1017/i.test(m);
}

/** Geçici hatada (deploy sırasında yeniden başlayan ClickHouse/Postgres) bekleyip yeniden dener. */
export async function geciciyseTekrarla<T>(ad: string, fn: () => Promise<T>): Promise<T> {
  const bitis = Date.now() + GECICI_HATA_SURESI_MS;
  for (let deneme = 0; ; deneme++) {
    try {
      return await fn();
    } catch (e) {
      if (!geciciMi(e) || Date.now() > bitis) throw e;
      if (deneme === 0) console.log(`${ad}: geçici hata, yeniden denenecek: ${(e as Error).message.slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, Math.min(30_000, 1_000 * 2 ** deneme)));
    }
  }
}

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
      if (!this.uygula) return;
      const satirlar = parti.flatMap((r) => r.satirlar.map(satirDizisi));
      const bitis = Date.now() + GECICI_HATA_SURESI_MS;
      for (let deneme = 0; ; deneme++) {
        try {
          if (satirlar.length) await ekle(this.a, EKLE_SQL, satirlar);
          await ekle(this.a, KAPSAM_EKLE_SQL, parti.map(kapsamDizisi)); // SONRA
          this.yazilan += parti.length;
          if (deneme > 0) console.log(`yazma ${deneme} denemeden sonra geçti`);
          return;
        } catch (e) {
          // Her PUSH deploy'u yığını ClickHouse DAHİL yeniden oluşturuyor (ölçüldü 2026-09-17: doldurucu
          // "fetch failed" ile durdu, ClickHouse 3 sn sonra ayağa kalktı). Bağlantı/5xx hatası geçicidir:
          // aynı parti yeniden yazılır — yarım kalan ilk yazma mükerrer satır bırakır ve ReplacingMergeTree
          // onu siler, kapsam satırı ise ikisi de başarılı olmadan yazılmaz.
          if (!geciciMi(e) || Date.now() > bitis) {
            this.hata = e;
            this.hatada(e);
            return;
          }
          if (deneme === 0) console.log(`yazma geçici hatası, ${GECICI_HATA_SURESI_MS / 60_000} dk boyunca yeniden denenecek: ${(e as Error).message.slice(0, 120)}`);
          await new Promise((r) => setTimeout(r, Math.min(30_000, 1_000 * 2 ** deneme)));
        }
      }
    });
    return this.zincir;
  }

  async kapat(): Promise<void> {
    clearInterval(this.zamanlayici);
    await this.bosalt();
  }
}
