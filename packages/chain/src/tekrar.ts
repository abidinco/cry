/**
 * `occurrence` — hareketin KAYNAKTAN BAĞIMSIZ kimliği, TEK yerde.
 *
 * Kural: bir işlem içinde birebir aynı (from, to, asset, amountRaw) dörtlüsünün kaçıncı tekrarı
 * olduğu, 0'dan sayılarak. Neden gerekli ve neden `index` olmaz — ölçüm M1-E (2026-09-21):
 * TronGrid `index`'i adresin o işlemdeki kayıtlarını BÜTÜN token'lar boyunca sayıyor, blok indeksi
 * yalnızca USDT+TRX gördüğü için aynı sayıyı üretemiyor ve 2.270 harekette 60'ı kayıyor. İki
 * kaynağın yazdığı bir tabloda tekillik, ikisinin de GÖREBİLDİĞİ şeyden kurulur.
 *
 * Özdeş kayıtlarda hangisine 0 dendiği önemsizdir: özdeşler birbirinin yerine geçer, çokluk aynı
 * kalır. Gerçek bir durumdur — bir işlemde 20 özdeş Transfer olayı ölçüldü.
 *
 * Bu sınıf iki ayrı yolda kullanılıyor (TronGrid adaptörü ve blok indeksi okuyucusu). Aynı kuralı
 * iki yere yazmak bu projede bir kez başa geldi: "bir kural bir yerde uygulanıp kardeşinde
 * unutulabiliyor" (CLAUDE.md).
 */
export class TekrarSayaci {
  private sayac = new Map<string, number>();

  /**
   * Sayacın ömrü bir TURDUR, bir sayfa değil: bir işlemin kayıtları sayfa sınırında bölünebiliyor
   * ve parti başına sıfırlanan bir sayaç ikinci yarıya yeniden 0 verir — tekillik o satırı sessizce
   * düşürür. Yeni tur başlarken sıfırlanır ki aynı adres yeniden okunduğunda aynı numaralar çıksın.
   */
  sifirla(): void {
    this.sayac.clear();
  }

  /** Bu dörtlüden kaçıncısı olduğunu söyler ve sayacı ilerletir. */
  sonraki(txHash: string, from: string | null, to: string | null, contract: string | null, amountRaw: string): number {
    const anahtar = `${txHash}|${from ?? ""}|${to ?? ""}|${contract ?? ""}|${amountRaw}`;
    const n = this.sayac.get(anahtar) ?? 0;
    this.sayac.set(anahtar, n + 1);
    return n;
  }
}
