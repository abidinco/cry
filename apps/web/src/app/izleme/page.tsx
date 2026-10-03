/**
 * /izleme — 7/24 izleme listesi ve EŞİKLERİ.
 *
 * Neden var: servis (`apps/watcher`) yazılmıştı ama listeyi dolduracak tek bir
 * ekran yoktu; `watches` tablosu boştu, yani kimse bir şey izlemiyordu.
 * **Kurulu ama sorulmayan bir servis, olmayan servistir** — `/etiket`ten önceki
 * 764 etiketin başına gelen şey buydu.
 *
 * Sayfa üç şeyi yan yana koyar: neyi izliyoruz, hangi eşikle (yoksa bunu
 * UYARIR), ve servisten en son ne geldi. Son sütun önemli: eşik üstü bir
 * hareket Telegram'a gidiyor, ama "hiç mesaj gelmedi" iki şey anlatabilir —
 * hareket yok ya da servis bakmıyor.
 */
import { redirect } from "next/navigation";
import { prisma } from "@cry/db";
import { adminMi, oturumOku } from "@/lib/yetki";
import UstBar from "@/components/UstBar";
import IzlemeListesi, { type TakipSatiri } from "./IzlemeListesi";

export const dynamic = "force-dynamic";

export default async function IzlemeSayfasi() {
  const oturum = await oturumOku();
  if (!oturum) redirect("/giris");

  const takipler = await prisma.watch.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      chain: true,
      label: true,
      active: true,
      lastCheckedAt: true,
      createdAt: true,
      address: { select: { address: true } },
      thresholds: {
        select: { assetSymbol: true, minAmount: true },
        orderBy: { assetSymbol: "asc" },
      },
      alerts: {
        orderBy: { ts: "desc" },
        take: 1,
        select: { ts: true, assetSymbol: true, amountRaw: true, path: true, reason: true },
      },
      _count: { select: { alerts: true } },
    },
  });

  const satirlar: TakipSatiri[] = takipler.map((t) => ({
    id: t.id,
    chain: t.chain,
    address: t.address.address,
    label: t.label,
    active: t.active,
    lastCheckedAt: t.lastCheckedAt?.toISOString() ?? null,
    thresholds: t.thresholds,
    uyariSayisi: t._count.alerts,
    sonUyari: t.alerts[0]
      ? {
          ts: t.alerts[0].ts.toISOString(),
          assetSymbol: t.alerts[0].assetSymbol,
          amountRaw: t.alerts[0].amountRaw,
          path: t.alerts[0].path,
          reason: t.alerts[0].reason,
        }
      : null,
  }));

  // Günlük özete giren (eşik altı) hareketler servisin kendi kaydında durur;
  // PC'ye yalnızca MESAJ olanlar itiliyor. Sayfa bu yüzden "mesaj" sayısını
  // söyler, "bütün hareketler" demez.
  const mesajSayisi = await prisma.alert.count({ where: { path: "mesaj" } });

  return (
    <main className="sayfa">
      <UstBar username={oturum.username} admin={adminMi(oturum)} />
      <section className="panel" style={{ marginTop: 12 }}>
        <h1>İzleme — 15 dakikada bir bakılır</h1>
        <p className="m2" style={{ fontSize: 13, lineHeight: 1.6 }}>
          Servis Hetzner&apos;da döner ve <b>PC kapalıyken de çalışır</b>. Eşiği{" "}
          <b>AŞAN</b> hareket anında Telegram mesajı olur; eşik <b>altı</b> hareketler gün
          sonunda tek bir özette toplanır. Gün sınırı <b>UTC</b>&apos;dir: 03:00 TSİ&apos;deki
          bir hareket bir ÖNCEKİ günün özetine girer.
        </p>
        <p className="m2" style={{ fontSize: 13, lineHeight: 1.6 }}>
          Eşik yazılmamış bir adreste <b>her hareket mesaj olur</b> (sebep{" "}
          <span className="veri">esik_yok</span>) — toz dahil. Ondalığı bilinmeyen bir token&apos;ın
          tutarı eşikle karşılaştırılamaz; o hareket susturulmaz,{" "}
          <span className="veri">ondalik_bilinmiyor</span> sebebiyle mesaj olur.
        </p>
        <p className="veri m3" style={{ fontSize: 12 }}>
          izlenen: {satirlar.filter((s) => s.active).length} aktif / {satirlar.length} kayıt
          {" — "}servisten itilen mesaj: {mesajSayisi}
        </p>
      </section>
      <IzlemeListesi satirlar={satirlar} />
    </main>
  );
}
