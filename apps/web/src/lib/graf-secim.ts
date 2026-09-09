/**
 * Grafın SAF katmanı: hangi düğüm hangi sınıfa girer, hangileri çizilir.
 *
 * Cytoscape'ten ayrı tutuluyor ki kural bir tarayıcı olmadan sınanabilsin —
 * ve kırpma gibi bir kararın testi, çizim kütüphanesinin sürümüne bağlı
 * kalmasın.
 */

export type GrafDugumu = {
  address: string;
  hop: number;
  isTerminal: boolean;
  terminalReason: string | null;
  etiketler: { title: string; category: string; exchange: string | null }[];
};

export type GrafKenari = {
  from: string;
  to: string;
  hop: number;
  taintShare: number;
  symbol: string;
};

/** Rapora giren görselin okunabilir kalması için üst sınır. */
export const CIZIM_SINIRI = 100;

export type Sinif =
  | "kok"
  | "terminal"
  | "terminal_aday"
  | "bakilamadi"
  | "kontrat"
  | "bizim_sinirimiz"
  | "devam";

export function dugumSinifi(d: GrafDugumu, kokAdres: string): Sinif {
  if (d.address === kokAdres) return "kok";
  switch (d.terminalReason) {
    case "terminal":
      return "terminal";
    case "terminal_aday":
      return "terminal_aday";
    case "indekssiz":
      return "bakilamadi";
    case "kontrat":
      return "kontrat";
    // Bunlar BİZİM koyduğumuz sınırlar; izin kendisi bitmedi.
    case "butce":
    case "dugum_siniri":
    case "dallanma":
    case "esik":
      return "bizim_sinirimiz";
    default:
      return "devam";
  }
}

/**
 * Hangi düğümler çizilir?
 *
 * Kırpma bir BULGUYU kaybetmemeli: önce kök ve iz gerçekten biten düğümler
 * (borsa/aday), sonra hop sırası, sonra adres — sıralama TAMAMEN
 * deterministik, çünkü aynı koşu aynı resmi vermeli.
 */
export function cizilecekler(
  dugumler: GrafDugumu[],
  kokAdres: string,
  sinir = CIZIM_SINIRI,
): { secilen: GrafDugumu[]; kirpilan: number } {
  const oncelik = (d: GrafDugumu) => {
    if (d.address === kokAdres) return 0;
    if (d.terminalReason === "terminal") return 1;
    if (d.terminalReason === "terminal_aday") return 2;
    return 3;
  };
  const sirali = [...dugumler].sort(
    (a, b) => oncelik(a) - oncelik(b) || a.hop - b.hop || a.address.localeCompare(b.address),
  );
  return { secilen: sirali.slice(0, sinir), kirpilan: Math.max(0, sirali.length - sinir) };
}

export function kisaAdres(a: string): string {
  return a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export function dugumEtiketi(d: GrafDugumu): string {
  const borsa = d.etiketler.find((e) => e.category.startsWith("exchange"));
  if (borsa) return `${kisaAdres(d.address)}\n${borsa.exchange ?? borsa.title}`;
  return kisaAdres(d.address);
}
