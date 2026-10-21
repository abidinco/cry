import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { bloktanSatirlar, bloktanSatirlarLogla, loglariBloklaraBol, logsuzAraliksupheli, satirIzi, type RpcLog } from "@cry/blok-indeks";

// Aynı GERÇEK bloklar (tron-bloklar.json): işlem bilgisinin olayları `eth_getLogs` biçimine çevrilir ve iki yolun
// satırlarının BİREBİR aynı olduğu (idx dahil) doğrulanır. Gerçek TronGrid yanıtıyla karşılaştırma:
// scripts/olcum/log-yolu-dogrula.mts.
const fixture = JSON.parse(readFileSync(new URL("./fixtures/tron-bloklar.json", import.meta.url), "utf8")) as {
  bloklar: { blok: { block_header: { raw_data: { number: number } } }; bilgi: { id: string; log?: { address: string; topics: string[]; data: string }[] }[] }[];
};

function rpcLoglar(i: number, ters = false): RpcLog[] {
  const { blok, bilgi } = fixture.bloklar[i]!;
  const no = blok.block_header.raw_data.number;
  let n = 0;
  const l: RpcLog[] = [];
  for (const b of bilgi) for (const o of b.log ?? []) {
    l.push({ address: "0x" + o.address, topics: o.topics.map((t) => "0x" + t), data: "0x" + o.data, transactionHash: "0x" + b.id, logIndex: "0x" + (n++).toString(16), blockNumber: "0x" + no.toString(16) });
  }
  return ters ? l.reverse() : l;
}

describe("log yolu", () => {
  for (let i = 0; i < fixture.bloklar.length; i++) {
    it(`blok #${i}: eski yolla BİREBİR aynı satırlar (idx dahil), olay sırası ters gelse de`, () => {
      const f = fixture.bloklar[i]!;
      const eski = bloktanSatirlar(f.blok as never, f.bilgi as never);
      expect(satirIzi(bloktanSatirlarLogla(f.blok as never, rpcLoglar(i)))).toBe(satirIzi(eski));
      expect(satirIzi(bloktanSatirlarLogla(f.blok as never, rpcLoglar(i, true)))).toBe(satirIzi(eski));
    });
  }

  it("fixture satır içeriyor (boş karşılaştırma ispat değildir)", () => {
    const toplam = fixture.bloklar.reduce((t, f) => t + bloktanSatirlar(f.blok as never, f.bilgi as never).satirlar.length, 0);
    expect(toplam).toBeGreaterThan(0);
  });

  it("bloğun işlemlerinde olmayan işlemin olayı HATADIR", () => {
    const f = fixture.bloklar[0]!;
    const l = rpcLoglar(0);
    l[0] = { ...l[0]!, transactionHash: "0x" + "ab".repeat(32) };
    expect(() => bloktanSatirlarLogla(f.blok as never, l)).toThrow(/bloğun işlemlerinde yok/);
  });

  it("başka bloğun olayı ve tekrarlanan logIndex HATADIR", () => {
    const f = fixture.bloklar[0]!;
    const l = rpcLoglar(0);
    expect(() => bloktanSatirlarLogla(f.blok as never, [{ ...l[0]!, blockNumber: "0x1" }])).toThrow(/başka bloğun/);
    expect(() => bloktanSatirlarLogla(f.blok as never, [l[0]!, { ...l[0]! }])).toThrow(/iki kez/);
  });

  it("aralık dışı blok numarası HATADIR; olaylar bloğa bölünür", () => {
    const l = rpcLoglar(0);
    const no = fixture.bloklar[0]!.blok.block_header.raw_data.number;
    expect(loglariBloklaraBol(l, no, no).get(no)).toHaveLength(l.length);
    expect(() => loglariBloklaraBol(l, no + 1, no + 5)).toThrow(/olmayan blok/);
  });

  it("olaysız aralık, başarılı sözleşme çağrısı varsa ŞÜPHELİDİR; çağrı yoksa ya da olay varsa değil", () => {
    const cagri = { block_header: {}, transactions: [{ txID: "a", raw_data: { contract: [{ type: "TriggerSmartContract" }] } }] };
    const basarisiz = { block_header: {}, transactions: [{ txID: "a", ret: [{ contractRet: "REVERT" }], raw_data: { contract: [{ type: "TriggerSmartContract" }] } }] };
    const trx = { block_header: {}, transactions: [{ txID: "a", raw_data: { contract: [{ type: "TransferContract" }] } }] };
    expect(logsuzAraliksupheli([cagri] as never[], 0)).toBe(true);
    expect(logsuzAraliksupheli([cagri] as never[], 3)).toBe(false);
    expect(logsuzAraliksupheli([basarisiz] as never[], 0)).toBe(false);
    expect(logsuzAraliksupheli([trx] as never[], 0)).toBe(false);
  });
});
