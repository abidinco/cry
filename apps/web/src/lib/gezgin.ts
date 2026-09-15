/**
 * Blok gezgini bağlantıları — zincire göre işlem ve adres sayfası.
 *
 * Tek yerde durur: adres sayfası TronScan adresini elle yazıyordu ve takip
 * defteri de aynısını isteyince ikinci bir kopya doğacaktı.
 *
 * Gizlilik: gezgin bir ÜÇÜNCÜ TARAFTIR. Bağlantılar `rel="noopener
 * noreferrer"` ile açılır, böylece gezgin hangi soruşturma sayfasından
 * gelindiğini (Referer) görmez. İşlem hash'inin kendisi zaten herkese açık.
 */

const ISLEM: Record<string, (hash: string) => string> = {
  tron: (h) => `https://tronscan.org/#/transaction/${h}`,
  ethereum: (h) => `https://etherscan.io/tx/${h}`,
  bsc: (h) => `https://bscscan.com/tx/${h}`,
  polygon: (h) => `https://polygonscan.com/tx/${h}`,
  arbitrum: (h) => `https://arbiscan.io/tx/${h}`,
  optimism: (h) => `https://optimistic.etherscan.io/tx/${h}`,
  base: (h) => `https://basescan.org/tx/${h}`,
  avalanche: (h) => `https://snowtrace.io/tx/${h}`,
  bitcoin: (h) => `https://mempool.space/tx/${h}`,
  solana: (h) => `https://solscan.io/tx/${h}`,
};

const ADRES: Record<string, (a: string) => string> = {
  tron: (a) => `https://tronscan.org/#/address/${a}`,
  ethereum: (a) => `https://etherscan.io/address/${a}`,
  bsc: (a) => `https://bscscan.com/address/${a}`,
  polygon: (a) => `https://polygonscan.com/address/${a}`,
  arbitrum: (a) => `https://arbiscan.io/address/${a}`,
  optimism: (a) => `https://optimistic.etherscan.io/address/${a}`,
  base: (a) => `https://basescan.org/address/${a}`,
  avalanche: (a) => `https://snowtrace.io/address/${a}`,
  bitcoin: (a) => `https://mempool.space/address/${a}`,
  solana: (a) => `https://solscan.io/account/${a}`,
};

/** Zincir tanınmıyorsa `null`: uydurma bir bağlantı kırık bir bağlantıdan kötüdür. */
export function islemGezgini(zincir: string, hash: string): string | null {
  return ISLEM[zincir]?.(encodeURIComponent(hash)) ?? null;
}

export function adresGezgini(zincir: string, adres: string): string | null {
  return ADRES[zincir]?.(encodeURIComponent(adres)) ?? null;
}

/** "58e112…46fd" — defterde hash'in ayırt edici iki ucu. */
export function kisaHash(hash: string): string {
  return hash.length > 14 ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : hash;
}
