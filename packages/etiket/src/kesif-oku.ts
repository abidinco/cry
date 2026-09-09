/**
 * Keşfin veritabanı tarafı: arşivin şeklini okur, saf katmana verir,
 * çıkan adayları etiket biçimine çevirir.
 *
 * Saf katman (`kesif.ts`) SQL bilmez; buradaki tek iş sorgu ve çeviridir.
 */

import { prisma } from "@cry/db";
import { servisAdaylari, VARSAYILAN_KESIF, type AdresIstatistigi, type KesifEsikleri } from "./kesif";
import type { Atlanan, TohumEtiket, TohumSonucu } from "./tipler";

type Satir = {
  address: string;
  index_state: string;
  gonderen: bigint;
  alici: bigint;
  hareket: bigint;
};

export async function arsivdenAdaylar(
  esikler: KesifEsikleri = VARSAYILAN_KESIF,
): Promise<TohumSonucu> {
  // Tek sorgu: karşı taraf sayıları adres başına. Prisma zinciriyle bu
  // adres başına gidiş-dönüş olurdu ve 14.798 adreste tünelde saatler sürer.
  const satirlar = await prisma.$queryRaw<Satir[]>`
    select a.address,
           a.index_state,
           count(distinct t.from_address_id) filter (where t.to_address_id = a.id)   as gonderen,
           count(distinct t.to_address_id)   filter (where t.from_address_id = a.id) as alici,
           count(*)                                                                  as hareket
    from addresses a
    join transfers t on t.to_address_id = a.id or t.from_address_id = a.id
    where a.chain = 'tron'
    group by a.id, a.address, a.index_state
  `;

  const istatistikler: AdresIstatistigi[] = satirlar.map((s) => ({
    address: s.address,
    indeksDurumu:
      s.index_state === "tam" ? "tam" : s.index_state === "kismi" ? "kismi" : "bilinmiyor",
    gonderenSayisi: Number(s.gonderen),
    aliciSayisi: Number(s.alici),
    hareketSayisi: Number(s.hareket),
  }));

  const sonuc = servisAdaylari(istatistikler, esikler);

  const etiketler: TohumEtiket[] = sonuc.adaylar.map((a) => ({
    chain: "tron",
    address: a.address,
    // Başlık kimlik İDDİA ETMEZ: hangi borsa olduğunu keşif bilemez.
    title: `Servis cüzdanı adayı (${a.sekil})`,
    description: a.gerekce.join(" · "),
    category: "exchange_hot",
    exchange: null,
    source: "kesif",
    sourceUrl: null,
    confidence: a.guven,
    // Keşif ONAYLAMAZ. Doğrulanmamış etiket motorda `terminal_aday` sebebi
    // üretir; rapor "borsaya girdi" değil "borsa adayına girdi" der.
    dogrulanmisMi: false,
    evidence: {
      sekil: a.sekil,
      gerekce: a.gerekce,
      altSinirMi: a.altSinirMi,
      esikler,
      olcumTarihi: new Date().toISOString().slice(0, 10),
    },
  }));

  // "Bakılmadı" bir bulgu değil ama SAYILIR: kapsamın ne kadarı hakkında
  // konuşamadığımız görünür kalmalı.
  const atlananlar: Atlanan[] = [
    {
      ham: `${sonuc.bakilmadi} adres`,
      sebep: "taranmamış (index_state=bilinmiyor) — şekli ölçülemez, aday da değil",
    },
    {
      ham: `${sonuc.eşiginAltinda} adres`,
      sebep: `ölçüldü, eşiğin altında (karşı taraf < ${esikler.karsiTarafEsigi})`,
    },
  ];

  return { etiketler, atlananlar, kaynakSurumu: `keşif, eşik ${esikler.karsiTarafEsigi}` };
}
