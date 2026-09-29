/**
 * Bir adaptörün NE GÖREMEDİĞİ — insan diliyle, ekrana basılmak üzere.
 *
 * `capabilities` bugüne kadar yalnızca `activation` için soruluyordu; geri kalanı kodda duran ama
 * kimsenin sormadığı bir İDDİAYDI. Bu projede kural şu: "yeteneği doğrulanmamış bayrak, kapsanmamış
 * bir yeri kapsanmış gösterir". Bayrağı düşürmek yarısı, EKRANDA söyletmek öteki yarısı — yazılmış
 * ama hiçbir sayfanın sormadığı bilgi, olmayan bilgidir.
 *
 * Listeye yalnızca O ZİNCİRDE VAR OLUP okuyamadığımız şeyler girer. `utxo` ve `activation` model
 * farkıdır, körlük değil: Bitcoin'de sözleşme içi hareket YOKTUR, Ethereum'da "hesabı kim aktive
 * etti" diye bir alan YOKTUR. Onları saymak, olmayan bir eksiği varmış gibi göstermek olurdu —
 * "yok ≠ bakılamadı" kuralının ikinci yanlış yönü.
 */
import type { Capabilities } from "./types";

export function gorulemeyenler(c: Capabilities): string[] {
  // UTXO zincirinde sözleşme de token da yoktur; oradaki eksik AYRI cinsten (para üstü tahmini,
  // ortak girdi kümelemesi) ve bu listenin işi değil.
  if (c.utxo) return [];
  const eksik: string[] = [];
  // TRON'da ölçüldü (2026-09-29): iç transfer zincirde var (1.275 işlemin 7'si) ama hesap ucu
  // vermiyor — alan her kayıtta MEVCUT ve hep BOŞ.
  if (!c.internalTransfers) eksik.push("sözleşme içi değer hareketleri (internal transfer)");
  if (!c.tokenTransfers) eksik.push("token transferleri");
  if (!c.contractDetection) eksik.push("adresin sözleşme olup olmadığı");
  return eksik;
}
