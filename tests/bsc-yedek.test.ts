import { describe, expect, it } from "vitest";
import {
  BSC_RPC,
  BSC_USDT,
  probeBscRpcAddress,
  probeBscRpcTx,
} from "../packages/chain/src/network-probe";

const ADRES = "0x1111111111111111111111111111111111111111";

/** RPC yöntemine göre sahte cevap veren fetchJson. */
function sahte(cevaplar: Record<string, unknown>) {
  const cagrilar: { url: string; method: string; params: unknown[] }[] = [];
  const fetchJson = async (url: string, init?: RequestInit) => {
    const govde = JSON.parse(String(init?.body));
    cagrilar.push({ url, method: govde.method, params: govde.params });
    return { jsonrpc: "2.0", id: 1, ...(cevaplar[govde.method] as object) };
  };
  return { fetchJson, cagrilar };
}

describe("BSC yedeği — işlem", () => {
  it("nesne dönerse işlem vardır, null dönerse yoktur (kesin cevap)", async () => {
    const var_ = sahte({ eth_getTransactionByHash: { result: { hash: "0xab" } } });
    expect(await probeBscRpcTx("0xab", var_.fetchJson)).toEqual({ network: "bsc", exists: true });
    expect(var_.cagrilar[0]!.url).toBe(BSC_RPC);

    const yok = sahte({ eth_getTransactionByHash: { result: null } });
    const h = await probeBscRpcTx("0xab", yok.fetchJson);
    expect(h.exists).toBe(false);
    expect(h.hata).toBeUndefined();
  });
});

describe("BSC yedeği — adres", () => {
  it("yalnızca USDT bakiyesi olan adres VARDIR", async () => {
    const s = sahte({
      eth_getTransactionCount: { result: "0x0" },
      eth_getBalance: { result: "0x0" },
      eth_call: { result: "0x" + "0".repeat(60) + "03e8" },
    });
    const h = await probeBscRpcAddress(ADRES, s.fetchJson);
    expect(h.exists).toBe(true);
    const cagri = s.cagrilar.find((c) => c.method === "eth_call")!;
    expect((cagri.params[0] as { to: string }).to).toBe(BSC_USDT);
    expect((cagri.params[0] as { data: string }).data).toBe(
      "0x70a08231" + ADRES.slice(2).padStart(64, "0"),
    );
  });

  it("hiç iz yoksa 'yok' DENMEZ: hata taşır, yani 'bakılamadı' kovasına düşer", async () => {
    const s = sahte({
      eth_getTransactionCount: { result: "0x0" },
      eth_getBalance: { result: "0x0" },
      eth_call: { result: "0x" + "0".repeat(64) },
    });
    const h = await probeBscRpcAddress(ADRES, s.fetchJson);
    expect(h.exists).toBe(false);
    expect(h.hata).toMatch(/kısmen yoklandı/);
  });

  it("gönderim sayısı nonce'tan okunur", async () => {
    const s = sahte({
      eth_getTransactionCount: { result: "0x1a" },
      eth_getBalance: { result: "0x0" },
      eth_call: { result: "0x" },
    });
    const h = await probeBscRpcAddress(ADRES, s.fetchJson);
    expect(h).toMatchObject({ exists: true, nativeTxCount: 26 });
  });

  it("RPC hatası sessizce 'yok' olmaz", async () => {
    const s = sahte({
      eth_getTransactionCount: { error: { message: "rate limited" } },
      eth_getBalance: { result: "0x0" },
      eth_call: { result: "0x" },
    });
    const h = await probeBscRpcAddress(ADRES, s.fetchJson);
    expect(h.hata).toBe("BSC RPC: rate limited");
  });
});
