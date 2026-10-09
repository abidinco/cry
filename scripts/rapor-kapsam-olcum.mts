/**
 * Ölçüm: raporun KAPSAM bölümü ne diyor?
 *
 * "Bakılmayan yerler" bölümü, grafın izlenmeyen tarafını sayıyor. Bu betik
 * gerçek koşulardan paket kurup o sayıları basar; bir koşunun düğümlerinin
 * indeks durumunu arşivden tek tek doğrular (sayı tek başına doğrulama değil).
 *
 * Koşu:
 *   node --env-file=.env --env-file=apps/web/.env.local --import tsx scripts/rapor-kapsam-olcum.mts <kosuId...>
 */
import { prisma } from "@cry/db";
import { kanitKaynagi } from "../apps/web/src/lib/rapor-kaynagi";

const kosular = process.argv.slice(2).map((x) => BigInt(x));

for (const kosuId of kosular) {
  const k = await kanitKaynagi(kosuId, `kapsam ölçümü — koşu ${kosuId}`, "Ölçüm vakası");
  if ("hata" in k) {
    console.log(`koşu ${kosuId}: ${k.durum} ${k.hata}`);
    continue;
  }
  const b = k.paket.kapsam.bakilmayanlar;
  console.log(`\n=== koşu ${kosuId} · ${k.paket.surum} · mühür ${k.sha256.slice(0, 12)}`);
  console.log(`graf: ${k.paket.ozet.dugum} düğüm / ${k.paket.ozet.kenar} hareket`);
  console.log(`kapsam: tam ${b.taranan} · kısmi ${b.kismi} · bilinmiyor ${b.bakilmayan}` +
    ` · sınır ${b.sinirDugumu} · doğrulanmamış terminal ${b.dogrulanmamisTerminal}`);
  console.log(`notlar: ${JSON.stringify(b.taramaNotlari)}`);
  console.log(`cümle: ${b.cumle}`);
  console.log(`uyarılar: ${JSON.stringify(k.paket.metodoloji.uyarilar)}`);

  // Sayının yanında bir örneğe ELLE bak: paketin dediği ile arşivin dediği aynı mı?
  const ornek = k.paket.dugumler.slice(0, 3);
  for (const d of ornek) {
    const a = await prisma.address.findFirst({
      where: { chain: k.paket.kosu.zincir, address: d.adres },
      select: { indexState: true, indexNote: true },
    });
    console.log(
      `  ${d.adres} → paket ${d.indeksDurumu}/${d.indeksNotu} · arşiv ${a?.indexState ?? "KAYIT YOK"}/${a?.indexNote ?? "-"}`,
    );
  }
}
await prisma.$disconnect();
