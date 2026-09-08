/**
 * TRON adresi iki biçimde yaşıyor: base58check ("T…") ve hex ("41…").
 * TronGrid bazı uç noktalarda birini, bazılarında ötekini döndürüyor; motorun
 * gördüğü adres HER ZAMAN base58 olmalı, yoksa aynı cüzdan grafın iki ayrı
 * düğümü olur.
 */
import bs58 from "bs58";
import { sha256 } from "@noble/hashes/sha2.js";

const TRON_ONEK = 0x41;

function checksum(gövde: Uint8Array): Uint8Array {
  return sha256(sha256(gövde)).slice(0, 4);
}

export function hexToBase58(hex: string): string {
  const temiz = hex.replace(/^0x/i, "").toLowerCase();
  if (!/^41[0-9a-f]{40}$/.test(temiz)) throw new Error(`geçersiz TRON hex adresi: ${hex}`);
  const gövde = Uint8Array.from(temiz.match(/../g)!.map((b) => parseInt(b, 16)));
  const tam = new Uint8Array(gövde.length + 4);
  tam.set(gövde);
  tam.set(checksum(gövde), gövde.length);
  return bs58.encode(tam);
}

export function base58ToHex(adres: string): string {
  const ham = bs58.decode(adres);
  if (ham.length !== 25 || ham[0] !== TRON_ONEK) throw new Error(`geçersiz TRON adresi: ${adres}`);
  const gövde = ham.slice(0, 21);
  const bekl = checksum(gövde);
  for (let i = 0; i < 4; i++) {
    if (ham[21 + i] !== bekl[i]) throw new Error(`TRON adresi checksum'ı bozuk: ${adres}`);
  }
  return Buffer.from(gövde).toString("hex");
}

/** Hangi biçimde gelirse gelsin base58'e çeker. Geçersizse hata atar. */
export function tronNormalize(girdi: string): string {
  const s = girdi.trim();
  if (/^(0x)?41[0-9a-fA-F]{40}$/.test(s)) return hexToBase58(s);
  base58ToHex(s); // doğrular
  return s;
}

export function tronGecerliMi(girdi: string): boolean {
  try {
    tronNormalize(girdi);
    return true;
  } catch {
    return false;
  }
}
