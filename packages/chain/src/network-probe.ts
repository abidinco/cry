/**
 * network-probe.ts
 *
 * detectNetwork() formattan çözemediği durumları burada ağ çağrısıyla çözeriz.
 * Sadece iki belirsizlik var:
 *   1) EVM adresi/hash'i hangi zincirde?
 *   2) Ön eksiz 64 hex: TRON tx mi Bitcoin txid mi?
 *
 * Maliyet kuralı: her zincir için EN FAZLA 2 çağrı. Sonuç Postgres'e yazılır,
 * aynı girdi bir daha yoklanmaz (probe_cache tablosu).
 */

import type { Detection, EvmChain } from "./network-detect";
import { EVM_CHAIN_IDS } from "./network-detect";

export type ProbeHit = {
  network: string;
  exists: boolean;
  /**
   * Yoklama YAPILAMADIYSA sebebi. "yok" ile "bakılamadı" ayrı sorulardır:
   * ikisini aynı kovaya koymak, kapsanmayan bir zinciri "temiz" gösterir.
   */
  hata?: string;
  /** adres için: bulunan aktivite özeti; hash için: blok/zaman */
  nativeTxCount?: number;
  tokenTxCount?: number;
  firstSeen?: string;
  lastSeen?: string;
  balanceRaw?: string;
};

export type ProbeResult = {
  hits: ProbeHit[];
  /** aktivite bulunan tek bir ağ varsa otomatik seçilir */
  autoSelected: string | null;
  probedAt: string;
  /** yoklanmayan, "daha fazla zincirde ara" ile açılabilecek ağlar */
  notProbed: string[];
};

/* ---------------- EVM ---------------- */

const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api";

/**
 * Etherscan hatayı 200 ile döndürüyor ve mesajı `result` alanına METİN olarak
 * koyuyor: {"status":"0","message":"NOTOK","result":"Free API access is not
 * supported for this chain..."}. `!!result` diye bakan bir kontrol bunu
 * "işlem var" sayar — ücretsiz planda kapsanmayan BSC'de tam olarak bu oldu ve
 * gerçek bir TRON işlemi "BSC'de bulundu" diye raporlandı.
 */
function etherscanHatasi(r: any): string | null {
  if (r && r.status === "0" && typeof r.result === "string") return r.result;
  if (r && typeof r.error?.message === "string") return r.error.message;
  return null;
}
const BLOCKSCOUT_V2 = "https://eth.blockscout.com/api"; // yedek; chain başına base URL değişir

/**
 * Tek bir EVM zincirinde adresin aktif olup olmadığını 2 çağrıda anlar.
 * Native işlemi olmayıp sadece token alan adresler var, o yüzden ikisine de bakılır.
 */
async function probeEvmAddress(
  address: string,
  chain: EvmChain,
  apiKey: string,
  fetchJson: FetchJson,
): Promise<ProbeHit> {
  const base = `${ETHERSCAN_V2}?chainid=${EVM_CHAIN_IDS[chain]}&apikey=${apiKey}`;
  const [native, token] = await Promise.all([
    fetchJson(`${base}&module=account&action=txlist&address=${address}&page=1&offset=1&sort=asc`),
    fetchJson(`${base}&module=account&action=tokentx&address=${address}&page=1&offset=1&sort=asc`),
  ]);
  const hata = etherscanHatasi(native) ?? etherscanHatasi(token);
  if (hata) return { network: chain, exists: false, hata };

  const n = Array.isArray(native?.result) ? native.result : [];
  const t = Array.isArray(token?.result) ? token.result : [];
  const first = n[0]?.timeStamp ?? t[0]?.timeStamp;
  return {
    network: chain,
    exists: n.length > 0 || t.length > 0,
    nativeTxCount: n.length,
    tokenTxCount: t.length,
    firstSeen: first ? new Date(Number(first) * 1000).toISOString() : undefined,
  };
}

async function probeEvmTx(
  hash: string,
  chain: EvmChain,
  apiKey: string,
  fetchJson: FetchJson,
): Promise<ProbeHit> {
  const url = `${ETHERSCAN_V2}?chainid=${EVM_CHAIN_IDS[chain]}&module=proxy&action=eth_getTransactionByHash&txhash=${hash}&apikey=${apiKey}`;
  const r = await fetchJson(url);
  const hata = etherscanHatasi(r);
  if (hata) return { network: chain, exists: false, hata };
  // Var olan işlem bir NESNE döner; metin gelen her şey cevap değil şikâyettir.
  const bulundu = typeof r?.result === "object" && r.result !== null;
  return { network: chain, exists: bulundu };
}

/* ---------------- TRON ---------------- */

async function probeTronTx(hash: string, apiKey: string, fetchJson: FetchJson): Promise<ProbeHit> {
  const r = await fetchJson("https://api.trongrid.io/wallet/gettransactionbyid", {
    method: "POST",
    headers: { "TRON-PRO-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ value: hash }),
  });
  return { network: "tron", exists: !!r?.txID };
}

/* ---------------- Bitcoin ---------------- */

async function probeBtcTx(txid: string, fetchJson: FetchJson): Promise<ProbeHit> {
  try {
    const r = await fetchJson(`https://mempool.space/api/tx/${txid}`);
    return { network: "bitcoin", exists: !!r?.txid };
  } catch {
    return { network: "bitcoin", exists: false };
  }
}

/* ---------------- orkestrasyon ---------------- */

type FetchJson = (url: string, init?: RequestInit) => Promise<any>;

export type ProbeDeps = {
  etherscanKey: string;
  trongridKey: string;
  fetchJson: FetchJson;              // rate limiter + retry burada sarmalanır
  cacheGet: (k: string) => Promise<ProbeResult | null>;
  cacheSet: (k: string, v: ProbeResult) => Promise<void>;
};

export async function probe(
  det: Detection,
  deps: ProbeDeps,
  extraChains: EvmChain[] = [],
): Promise<ProbeResult> {
  const key = `${det.kind}:${det.normalized}:${extraChains.join(",")}`;
  const cached = await deps.cacheGet(key);
  if (cached) return cached;

  const hits: ProbeHit[] = [];
  const notProbed: string[] = [];

  for (const c of det.candidates) {
    if (!c.needsProbe) {
      hits.push({ network: c.network!, exists: true });
      continue;
    }
    const chains = [...(c.probeChains ?? []), ...extraChains];

    if (c.family === "evm") {
      const evmChains = chains.filter((x): x is EvmChain => x in EVM_CHAIN_IDS);
      const results = await Promise.all(
        evmChains.map((ch) =>
          det.kind === "address"
            ? probeEvmAddress(det.normalized, ch, deps.etherscanKey, deps.fetchJson)
            : probeEvmTx(det.normalized, ch, deps.etherscanKey, deps.fetchJson),
        ),
      );
      hits.push(...results);
      notProbed.push(
        ...Object.keys(EVM_CHAIN_IDS).filter((k) => !evmChains.includes(k as EvmChain)),
      );
    } else if (c.family === "tron" && det.kind === "tx") {
      hits.push(await probeTronTx(det.normalized, deps.trongridKey, deps.fetchJson));
    } else if (c.family === "bitcoin" && det.kind === "tx") {
      hits.push(await probeBtcTx(det.normalized, deps.fetchJson));
    }
  }

  // Yoklanamayan zincir "yok" sayılmaz; tek bulgu varmış gibi görünüp yanlış
  // zinciri otomatik seçmesin diye hatalı yoklamalar kararın dışında tutulur.
  const found = hits.filter((h) => h.exists && !h.hata);
  const result: ProbeResult = {
    hits,
    autoSelected: found.length === 1 ? (found[0]?.network ?? null) : null,
    probedAt: new Date().toISOString(),
    notProbed: [...new Set(notProbed)],
  };

  // negatif sonuç da cache'lenir ama kısa TTL ile (adres sonradan aktif olabilir)
  await deps.cacheSet(key, result);
  return result;
}
