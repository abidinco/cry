/**
 * Hız sınırı geri çekilmesi İPTAL EDİLEBİLİR olmalı.
 *
 * `getJson` 429 alınca `Retry-After`a uyar ve bu 60 sn'ye kadar çıkabilir. Uyku iptal edilemezse
 * kullanıcının "durdur"u o kadar bekler — düğme basıldıktan sonra geçen süre, düğmenin ne kadar
 * doğru söylediğinin ölçüsüdür. Testin ölçtüğü şey tam olarak budur: sahte kaynak 30 sn bekle
 * diyor, iptal 50 ms sonra geliyor, çağrı SANİYELER değil MİLİSANİYELER içinde dönmeli.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getJson } from "@cry/chain";

const gercekFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = gercekFetch; });

describe("getJson — geri çekilme uykusu iptal edilebilir", () => {
  it("30 sn'lik Retry-After beklerken gelen iptal, çağrıyı hemen bitirir", async () => {
    let cagri = 0;
    globalThis.fetch = vi.fn(async () => {
      cagri++;
      return new Response("", { status: 429, headers: { "retry-after": "30" } });
    }) as unknown as typeof fetch;

    const kontrol = new AbortController();
    setTimeout(() => kontrol.abort(), 50);

    const t0 = Date.now();
    await expect(
      getJson("https://ornek.invalid/x", { chain: "tron", signal: kontrol.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    const gecen = Date.now() - t0;

    // İptal edilemeyen uyku 30.000 ms sürerdi; eşik cömert tutuldu ki yavaş makinede
    // titremesin, ama iki hâl arasındaki fark üç büyüklük mertebesi.
    expect(gecen).toBeLessThan(3_000);
    expect(cagri).toBe(1);
  });

  it("iptal gelmezse geri çekilme normal işler ve kaynak yeniden denenir", async () => {
    let cagri = 0;
    globalThis.fetch = vi.fn(async () => {
      cagri++;
      // İlk çağrı hız sınırı (kısa bekleme), ikincisi başarılı.
      return cagri === 1
        ? new Response("", { status: 429, headers: { "retry-after": "0" } })
        : new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    await expect(getJson("https://ornek.invalid/x", { chain: "tron" })).resolves.toEqual({ ok: true });
    expect(cagri).toBe(2);
  });
});
