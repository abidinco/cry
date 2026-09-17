/**
 * Blok indeksinden keşif (B5): arşivdeki adreslerin şeklini TARANMAMIŞ olsalar da ölçer.
 *
 * Arşiv keşfi (`kesif-oku.ts`) yalnızca taranmış adresler hakkında konuşabiliyordu, 31.780 adres
 * "bakılmadı" kalıyordu. Blok indeksi, penceresi içinde her adresin karşı taraflarını görüyor. Üç kural:
 *
 * - **`index_state` ile KARIŞTIRILMAZ.** Adres taranmış sayılmaz; kaynak `kesif_blok` ve kanıtta
 *   pencere (blok ve tarih) yazılı.
 * - **Pencere ölçümü bir ALT SINIRDIR** (`kismi` gibi): 9,7 günlük pencerede 17 arşiv keşif etiketinin
 *   16'sı eşiğin altındaydı (B5 kapısı). Aday EKLER; eşiğin altında kalmak "servis değil" demek değildir.
 * - **Sayım eşiksiz, toz AYRI** (kullanıcı kararı 2026-09-17): gerekçe kaç karşı tarafın yalnızca toz
 *   (<1 TRX/USDT) gönderdiğini söyler.
 *
 * Yazılmayan adaylar sebebiyle SAYILIR: güven eşiğinin altı (CLAUDE.md: > 0,7), zaten doğrulanmış
 * kimliği olan adres, arşiv keşfinin zaten aday yazdığı adres.
 */

import { prisma } from "@cry/db";
import { base58ToHex } from "@cry/chain";
import { ayarOku, pencereOku, kesifSayilari, TOZ_SINIRI } from "@cry/blok-indeks";
import { servisAdaylari, VARSAYILAN_KESIF, type AdresIstatistigi, type KesifEsikleri } from "./kesif";
import type { Atlanan, TohumEtiket, TohumSonucu } from "./tipler";

type Satir = { address: string; kaynaklar: string[] | null; dogrulanmis: boolean };

export async function bloktanAdaylar(
  esikler: KesifEsikleri = VARSAYILAN_KESIF,
  minGuven = 0.7,
): Promise<TohumSonucu> {
  const a = ayarOku();
  const p = await pencereOku(a);
  if (!p) throw new Error("blok indeksinin kapsamı boş — pencere yok, keşif yapılamaz");
  const tarih = (sn: number) => new Date(sn * 1000).toISOString().slice(0, 16).replace("T", " ");
  const pencereMetni = `blok indeksi ${p.bas}–${p.son} (${tarih(p.zamanBas)} → ${tarih(p.zamanSon)} UTC)`;

  const arsiv = await prisma.$queryRaw<Satir[]>`
    select a.address,
           array_agg(distinct l.source) filter (where l.id is not null) as kaynaklar,
           coalesce(bool_or(l.verified_at is not null), false) as dogrulanmis
    from addresses a left join labels l on l.address_id = a.id
    where a.chain = 'tron' group by a.id`;
  const hexten = new Map<string, Satir>();
  for (const r of arsiv) hexten.set(base58ToHex(r.address).slice(2).toLowerCase(), r);

  const sayilar = await kesifSayilari(a, [...hexten.keys()], p);
  const istatistikler: AdresIstatistigi[] = [...sayilar].map(([h, s]) => ({
    address: hexten.get(h)!.address,
    indeksDurumu: "kismi",
    altSinirNotu: "blok indeksi penceresi",
    gonderenSayisi: s.gonderen,
    aliciSayisi: s.alici,
    tozGonderenSayisi: s.tozGonderen,
    tozAliciSayisi: s.tozAlici,
    hareketSayisi: s.hareket,
  }));
  const sonuc = servisAdaylari(istatistikler, esikler);
  const adresten = new Map(arsiv.map((r) => [r.address, r]));
  const sayiAdresten = new Map([...sayilar].map(([h, s]) => [hexten.get(h)!.address, s]));

  const etiketler: TohumEtiket[] = [];
  const atlananlar: Atlanan[] = [
    { ham: `${arsiv.length - sayilar.size} adres`, sebep: `pencerede hiç hareketi yok (${pencereMetni}) — "bakılmadı" değil, pencerede yok` },
    { ham: `${sonuc.eşiginAltinda} adres`, sebep: `pencerede eşiğin altında (karşı taraf < ${esikler.karsiTarafEsigi}) — pencere kısa, bu bir ALT SINIR` },
    ...sonuc.yakma.map((adres) => ({ ham: adres, sebep: "yakma adresi — kalabalık görünür ama servis değil, aday yazılmaz" })),
  ];

  for (const c of sonuc.adaylar) {
    const kayit = adresten.get(c.address)!;
    if (kayit.dogrulanmis) { atlananlar.push({ ham: c.address, sebep: "zaten doğrulanmış kimliği var — zayıf aday bilgi katmaz" }); continue; }
    if (kayit.kaynaklar?.includes("kesif")) { atlananlar.push({ ham: c.address, sebep: "arşiv keşfi zaten aday yazmış (taramaya dayanan, daha uzun ölçüm)" }); continue; }
    if (c.guven <= minGuven) { atlananlar.push({ ham: c.address, sebep: `güven ≤ ${minGuven}`, ayrinti: `${c.guven} · ${c.gerekce[0]}` }); continue; }
    const s = sayiAdresten.get(c.address)!;
    etiketler.push({
      chain: "tron",
      address: c.address,
      title: `Servis cüzdanı adayı (${c.sekil})`,
      description: [...c.gerekce, pencereMetni].join(" · "),
      category: "exchange_hot",
      exchange: null,
      source: "kesif_blok",
      sourceUrl: null,
      confidence: c.guven,
      dogrulanmisMi: false,
      evidence: {
        sekil: c.sekil,
        gerekce: c.gerekce,
        altSinirMi: true,
        esikler,
        pencere: p,
        sayilar: s,
        tozSiniriHam: TOZ_SINIRI.toString(),
        olcumTarihi: new Date().toISOString().slice(0, 10),
      },
    });
  }

  return { etiketler, atlananlar, kaynakSurumu: `${pencereMetni}, eşik ${esikler.karsiTarafEsigi}, güven > ${minGuven}` };
}
