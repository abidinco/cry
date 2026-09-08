/**
 * network-detect.ts
 *
 * Yapıştırılan herhangi bir metinden (adres, tx hash veya explorer linki)
 * hangi ağa ait olduğunu tespit eder.
 *
 * Tasarım kuralı: bu modül HİÇBİR ağ çağrısı yapmaz. Sadece formatı çözer ve
 * "kesin" ile "yoklanması gereken" adayları ayırır. Ağ çağrısı bir üst
 * katmanın (probe) işidir.
 *
 * bağımlılıklar: bs58, bech32, @noble/hashes
 */

import bs58 from "bs58";
import { bech32, bech32m } from "bech32";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export type ChainFamily = "evm" | "tron" | "bitcoin" | "solana";

export type EvmChain =
  | "ethereum" | "bsc" | "polygon"
  | "arbitrum" | "optimism" | "base" | "avalanche";

/** İlk turda otomatik yoklanan zincirler. */
export const PRIMARY_EVM_CHAINS: EvmChain[] = ["ethereum", "bsc", "polygon"];
/** "Daha fazla zincirde ara" butonuyla açılanlar. */
export const SECONDARY_EVM_CHAINS: EvmChain[] = ["arbitrum", "optimism", "base", "avalanche"];

export const EVM_CHAIN_IDS: Record<EvmChain, number> = {
  ethereum: 1, bsc: 56, polygon: 137,
  arbitrum: 42161, optimism: 10, base: 8453, avalanche: 43114,
};

export type Candidate = {
  family: ChainFamily;
  /** EVM'de hangi zincir olduğu formattan bilinemez -> null + needsProbe. */
  network: string | null;
  /** 1.0 = formattan kesin, <1.0 = yoklama gerekiyor. */
  confidence: number;
  /** Neden bu sonuca varıldığı — UI'da ve denetim kaydında gösterilir. */
  reason: string;
  needsProbe: boolean;
  /** needsProbe true ise hangi zincirlerde yoklanacağı. */
  probeChains?: string[];
};

export type Detection = {
  raw: string;
  normalized: string;
  kind: "address" | "tx" | "ens" | "unknown";
  candidates: Candidate[];
  /** Kullanıcıya gösterilecek uyarılar (checksum hatası, kırpılmış girdi vb.) */
  warnings: string[];
};

/* ------------------------------------------------------------------ */
/* yardımcılar                                                         */
/* ------------------------------------------------------------------ */

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;

function b58checkDecode(s: string): Uint8Array | null {
  try {
    const raw = bs58.decode(s);
    if (raw.length < 5) return null;
    const payload = raw.slice(0, raw.length - 4);
    const cks = raw.slice(raw.length - 4);
    const calc = sha256(sha256(payload)).slice(0, 4);
    for (let i = 0; i < 4; i++) if (cks[i] !== calc[i]) return null;
    return payload;
  } catch {
    return null;
  }
}

function b58decodeRaw(s: string): Uint8Array | null {
  try {
    return bs58.decode(s);
  } catch {
    return null;
  }
}

/** EIP-55 büyük/küçük harf checksum'ı. Adres tek düze harfliyse kontrol edilemez. */
function eip55Valid(addr: string): boolean | null {
  const body = addr.slice(2);
  const isMixed = /[a-f]/.test(body) && /[A-F]/.test(body);
  if (!isMixed) return null; // hepsi küçük ya da hepsi büyük -> kontrol yok
  const lower = body.toLowerCase();
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(lower)));
  for (let i = 0; i < 40; i++) {
    const hashBasamagi = hash[i];
    const c = body[i];
    // Adres 40 haneli olarak doğrulanmış hâlde geliyor; yine de eksik hane
    // sessizce "checksum geçti" saymaz — kontrol edilemeyen adres reddedilir.
    if (hashBasamagi === undefined || c === undefined) return false;
    const shouldUpper = parseInt(hashBasamagi, 16) >= 8;
    if (/[0-9]/.test(c)) continue;
    if (shouldUpper && c !== c.toUpperCase()) return false;
    if (!shouldUpper && c !== c.toLowerCase()) return false;
  }
  return true;
}

/**
 * Yapıştırılan explorer linkinden adres/hash çıkarır.
 * tronscan.org/#/address/T... , etherscan.io/tx/0x... , solscan.io/account/... ,
 * mempool.space/tx/... , blockchair.com/... hepsini yakalar.
 */
function extractFromUrl(input: string): { value: string; hintNetwork?: string } | null {
  if (!/^https?:\/\//i.test(input)) return null;
  const hostHints: Record<string, string> = {
    "tronscan.org": "tron",
    "tronscan.io": "tron",
    "etherscan.io": "ethereum",
    "bscscan.com": "bsc",
    "polygonscan.com": "polygon",
    "arbiscan.io": "arbitrum",
    "optimistic.etherscan.io": "optimism",
    "basescan.org": "base",
    "snowtrace.io": "avalanche",
    "solscan.io": "solana",
    "mempool.space": "bitcoin",
    "blockstream.info": "bitcoin",
  };
  let host = "";
  try {
    host = new URL(input).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  // yol + hash fragmanındaki son anlamlı parçayı al
  const tail = input.split(/[/#?]/).filter(Boolean).pop() ?? "";
  if (!tail) return null;
  return { value: tail, hintNetwork: hostHints[host] };
}

/* ------------------------------------------------------------------ */
/* ana fonksiyon                                                       */
/* ------------------------------------------------------------------ */

export function detectNetwork(input: string): Detection {
  const warnings: string[] = [];
  let s = (input ?? "").trim();

  // görünmez karakterler ve kopyala-yapıştır kırıntıları
  s = s.replace(/[\u200B-\u200D\uFEFF\s]/g, "");

  let urlHint: string | undefined;
  const fromUrl = extractFromUrl(s);
  if (fromUrl) {
    s = fromUrl.value;
    urlHint = fromUrl.hintNetwork;
  }

  const out = (kind: Detection["kind"], candidates: Candidate[]): Detection => {
    // URL ipucu varsa o adayı öne al
    if (urlHint) {
      candidates.sort((a, b) => {
        const av = a.network === urlHint || a.family === urlHint ? -1 : 0;
        const bv = b.network === urlHint || b.family === urlHint ? -1 : 0;
        return av - bv;
      });
    }
    return { raw: input, normalized: s, kind, candidates, warnings };
  };

  if (!s) return out("unknown", []);

  /* --- ENS / isim --- */
  if (/^[a-z0-9-]+\.eth$/i.test(s)) {
    return out("ens", [{
      family: "evm", network: null, confidence: 0.9,
      reason: "ENS alan adı — adrese çözümlenmesi gerekiyor",
      needsProbe: true, probeChains: ["ethereum"],
    }]);
  }

  /* --- 0x ile başlayanlar: EVM --- */
  if (/^0x[0-9a-fA-F]{40}$/.test(s)) {
    const ck = eip55Valid(s);
    if (ck === false) {
      warnings.push("EIP-55 checksum tutmuyor — adres yanlış kopyalanmış olabilir.");
    }
    return out("address", [{
      family: "evm", network: null, confidence: 0.99,
      reason: "0x + 40 hex: EVM adresi. Aynı adres tüm EVM zincirlerinde geçerli olduğu için hangi zincirde aktif olduğu yoklamayla bulunur.",
      needsProbe: true,
      probeChains: PRIMARY_EVM_CHAINS,
    }]);
  }

  if (/^0x[0-9a-fA-F]{64}$/.test(s)) {
    return out("tx", [{
      family: "evm", network: null, confidence: 0.99,
      reason: "0x + 64 hex: EVM işlem hash'i. Zincir yoklamayla bulunur.",
      needsProbe: true,
      probeChains: PRIMARY_EVM_CHAINS,
    }]);
  }

  /* --- TRON adresi (base58check, 21 bayt, 0x41 ön eki) --- */
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(s)) {
    const payload = b58checkDecode(s);
    if (payload && payload.length === 21 && payload[0] === 0x41) {
      return out("address", [{
        family: "tron", network: "tron", confidence: 1.0,
        reason: "base58check doğrulandı, 21 bayt, 0x41 ön eki: kesin TRON adresi.",
        needsProbe: false,
      }]);
    }
    warnings.push("TRON adresine benziyor ama checksum tutmuyor — eksik veya hatalı kopyalanmış olabilir.");
  }

  /* --- TRON adresinin hex biçimi (API'ler bazen böyle döner) --- */
  if (/^41[0-9a-fA-F]{40}$/.test(s)) {
    return out("address", [{
      family: "tron", network: "tron", confidence: 0.95,
      reason: "41 + 40 hex: TRON adresinin hex gösterimi.",
      needsProbe: false,
    }]);
  }

  /* --- Bitcoin: bech32 / bech32m --- */
  if (/^(bc1|tb1)[0-9a-z]{6,}$/i.test(s)) {
    const lower = s.toLowerCase();
    let ok = false;
    try { bech32.decode(lower); ok = true; } catch { /* ignore */ }
    if (!ok) { try { bech32m.decode(lower); ok = true; } catch { /* ignore */ } }
    if (ok) {
      return out("address", [{
        family: "bitcoin", network: "bitcoin", confidence: 1.0,
        reason: "bech32/bech32m doğrulandı: kesin Bitcoin (SegWit/Taproot) adresi.",
        needsProbe: false,
      }]);
    }
    warnings.push("Bitcoin bech32 adresine benziyor ama checksum tutmuyor.");
  }

  /* --- base58 gövdeli olanlar: BTC eski format vs Solana --- */
  if (BASE58_RE.test(s)) {
    // Bitcoin P2PKH (0x00) / P2SH (0x05)
    if (/^[13][1-9A-HJ-NP-Za-km-z]{24,33}$/.test(s)) {
      const payload = b58checkDecode(s);
      if (payload && payload.length === 21 && (payload[0] === 0x00 || payload[0] === 0x05)) {
        return out("address", [{
          family: "bitcoin", network: "bitcoin", confidence: 1.0,
          reason: `base58check doğrulandı, sürüm baytı 0x${payload[0].toString(16).padStart(2, "0")}: kesin Bitcoin adresi.`,
          needsProbe: false,
        }]);
      }
    }

    const raw = b58decodeRaw(s);

    // Solana adresi: checksum yok, ham 32 bayt
    if (raw && raw.length === 32 && s.length >= 32 && s.length <= 44) {
      return out("address", [{
        family: "solana", network: "solana", confidence: 0.9,
        reason: "base58, ham 32 bayt: Solana adresi (Solana'da checksum yoktur, bu yüzden %100 kesinlik mümkün değil).",
        needsProbe: false,
      }]);
    }

    // Solana işlem imzası: ham 64 bayt
    if (raw && raw.length === 64) {
      return out("tx", [{
        family: "solana", network: "solana", confidence: 0.95,
        reason: "base58, ham 64 bayt: Solana işlem imzası.",
        needsProbe: false,
      }]);
    }
  }

  /* --- ön eksiz 64 hex: TRON tx VEYA Bitcoin txid. Tek gerçek çakışma. --- */
  if (/^[0-9a-fA-F]{64}$/.test(s)) {
    return out("tx", [
      {
        family: "tron", network: "tron", confidence: 0.5,
        reason: "Ön eksiz 64 hex. TRON işlem hash'i bu formatta. Bitcoin txid ile ayırt edilemez, ikisi de yoklanır.",
        needsProbe: true, probeChains: ["tron"],
      },
      {
        family: "bitcoin", network: "bitcoin", confidence: 0.5,
        reason: "Ön eksiz 64 hex. Bitcoin txid de bu formatta.",
        needsProbe: true, probeChains: ["bitcoin"],
      },
      {
        family: "evm", network: null, confidence: 0.15,
        reason: "0x ön eki unutulmuş bir EVM hash'i de olabilir (düşük ihtimal).",
        needsProbe: true, probeChains: PRIMARY_EVM_CHAINS,
      },
    ]);
  }

  /* --- 0x'siz 40 hex: EVM adresinden ön ek düşmüş olabilir --- */
  if (/^[0-9a-fA-F]{40}$/.test(s)) {
    warnings.push("0x ön eki eksik görünüyor, EVM adresi varsayıldı.");
    return out("address", [{
      family: "evm", network: null, confidence: 0.6,
      reason: "40 hex, ön eksiz: büyük ihtimalle 0x'i kopyalanmamış bir EVM adresi.",
      needsProbe: true, probeChains: PRIMARY_EVM_CHAINS,
    }]);
  }

  warnings.push("Girdi bilinen hiçbir adres veya işlem hash'i formatına uymuyor.");
  return out("unknown", []);
}
