/**
 * ClickHouse HTTP istemcisi — bağımlılıksız, `fetch` üstünde.
 *
 * Neden resmî paket değil: ihtiyacımız iki çağrı (sorgu, toplu ekleme) ve bir bağımlılık daha
 * eklemek bu iki çağrının bakımından pahalı. HTTP arayüzü ClickHouse'un kendi sözleşmesidir.
 *
 * Kaynağın HATASI veri gibi görünebilir (CLAUDE.md): ClickHouse hatayı HTTP 200 gövdesinde de
 * döndürebiliyor (akış başladıktan sonra), o yüzden yanıtın ŞEKLİ de denetlenir.
 */
export type Ayar = { url: string; kullanici: string; parola: string; veritabani: string };

export function ayarOku(env: NodeJS.ProcessEnv = process.env): Ayar {
  const url = env.CLICKHOUSE_URL;
  const parola = env.CLICKHOUSE_PASSWORD;
  // Eksik ayarı varsayılanla doldurmak, yanlış yere yazmak demektir: açıkça hata verir.
  if (!url || !parola) throw new Error("CLICKHOUSE_URL ve CLICKHOUSE_PASSWORD gerekli (.env / C:\\srv\\cry\\.env)");
  return { url, parola, kullanici: env.CLICKHOUSE_USER ?? "cry", veritabani: env.CLICKHOUSE_DB ?? "cry" };
}

async function istek(a: Ayar, govde: string, sorguParam?: string): Promise<string> {
  const adres = new URL(a.url);
  adres.searchParams.set("database", a.veritabani);
  if (sorguParam) adres.searchParams.set("query", sorguParam);
  const r = await fetch(adres, {
    method: "POST",
    headers: { "X-ClickHouse-User": a.kullanici, "X-ClickHouse-Key": a.parola, "Content-Type": "text/plain; charset=utf-8" },
    body: govde,
  });
  const metin = await r.text();
  if (!r.ok) throw new Error(`ClickHouse ${r.status}: ${metin.slice(0, 500)}`);
  // 200 gövdesinde de hata gelebiliyor.
  if (/^Code: \d+\. DB::(Exception|NetException)/m.test(metin)) throw new Error(`ClickHouse: ${metin.slice(0, 500)}`);
  return metin;
}

/** Tek sorgu; sonucu ham metin döndürür (biçimi sorgunun kendi FORMAT'ı belirler). */
export function sorgu(a: Ayar, sql: string): Promise<string> {
  return istek(a, sql);
}

/**
 * Toplu ekleme: INSERT sorgusu URL'de, satırlar gövdede gider — böylece milyonlarca satır
 * tek bir SQL metnine dizilmez (bellek) ve ClickHouse akışı okurken ayrıştırır.
 */
export function ekle(a: Ayar, insertSql: string, satirlar: readonly unknown[][]): Promise<string> {
  return istek(a, satirlar.map((s) => JSON.stringify(s)).join("\n") + "\n", insertSql);
}
