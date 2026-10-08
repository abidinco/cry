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
import Kabuk from "@/components/Kabuk";
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

  // Servisin NABZI: en son bakış damgası. Damga yalnızca uyarı geldiğinde
  // ilerlerse hareketsiz bir adres hiç bakılmamış gibi görünür ve sessiz bir
  // kopma fark edilmez — canlı okuyucuda ölçüldü, 45,6 saat geride "healthy".
  // Servis artık her turda baktığı adresleri bildiriyor; aşağıdaki satır o
  // bildirimin EKRANDAKİ karşılığı. Yoksa "mesaj gelmedi" iki şeyi birden
  // anlatır: hareket yok ya da servis bakmıyor.
  const sonBakis = satirlar
    .map((s) => s.lastCheckedAt)
    .filter((t): t is string => Boolean(t))
    .sort()
    .at(-1);
  const gerideDk = sonBakis
    ? Math.round((Date.now() - new Date(sonBakis).getTime()) / 60000)
    : null;

  return (
    <Kabuk username={oturum.username} admin={adminMi(oturum)} aktif="izleme">
      <div className="tepe">
        <h1>İzleme</h1>
        <span className="cip">15 dakikada bir</span>
        <span className="cip">özet 06:00 UTC (09:00 TSİ)</span>
        <span className="cip" data-ton={gerideDk !== null && gerideDk > 45 ? "dikkat" : sonBakis ? "iyi" : "hata"}>
          {sonBakis ? `son bakış ${gerideDk} dk önce` : "servis henüz bakmadı"}
        </span>
      </div>

      <div className="kartlar">
        <div className="kart">
          <div className="etiket">izlenen adres</div>
          <div className="kart-deger">
            {satirlar.filter((s) => s.active).length}
            <small> aktif</small>
          </div>
          <div className="kart-alt">{satirlar.length} kayıt · pasifler sayılmadı</div>
        </div>
        <div className="kart">
          <div className="etiket">itilen mesaj</div>
          <div className="kart-deger">{mesajSayisi}</div>
          <div className="kart-alt">eşik ÜSTÜ hareketler; eşik altı günlük özette</div>
        </div>
        <div className="kart">
          <div className="etiket">eşiksiz adres</div>
          <div className="kart-deger" data-ton={satirlar.some((s) => s.active && s.thresholds.length === 0) ? "dikkat" : undefined}>
            {satirlar.filter((s) => s.active && s.thresholds.length === 0).length}
          </div>
          <div className="kart-alt">eşik yoksa toz dahil HER hareket mesaj olur</div>
        </div>
      </div>

      <section className="panel">
        <h2 className="etiket" style={{ marginBottom: 8 }}>
          nasıl çalışır
        </h2>
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
          {" — "}
          {sonBakis
            ? `servisin son bakışı: ${sonBakis.replace("T", " ").slice(0, 19)} UTC (${gerideDk} dk önce)`
            : "servis HENÜZ bakmadı — kurulu mu, listeye ulaşabiliyor mu?"}
        </p>
      </section>
      {gerideDk !== null && gerideDk > 45 && (
        <div className="uyari" style={{ marginTop: 12 }}>
          <span aria-hidden>⚠</span>
          <span>
            Son bakış {gerideDk} dakika önce; periyot 15 dakika. Servis duruyor ya da PC&apos;ye
            ulaşamıyor olabilir — &laquo;mesaj yok&raquo;u &laquo;hareket yok&raquo; diye okumayın.
          </span>
        </div>
      )}
      <IzlemeListesi satirlar={satirlar} />
    </Kabuk>
  );
}
