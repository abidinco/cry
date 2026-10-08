/**
 * /rapor/[id] — dondurulmuş raporun kendisi.
 *
 * Sayfa üç şeyi birlikte gösteriyor ve hiçbiri süs değil:
 *  1. **Mühür:** kanıt paketinin kanonik SHA-256'sı, ve paket her açılışta
 *     yeniden hash'lenip kayıtlı hash ile karşılaştırılıyor. "Mühür tutuyor"
 *     cümlesi koda değil ölçüme bağlı.
 *  2. **Metodoloji:** atıf kuralı, kur kaynağı, gün sınırının UTC olduğu ve
 *     geriye yürüme kuralları. Kuralı söylemeyen bir yüzde savunulamaz.
 *  3. **Eksikler:** fiyatı ya da kuru bulunamayan kenarların SEBEBİ ve SAYISI,
 *     ve TL toplamının alt sınır olup olmadığı. "Yok" ile "bakılamadı" ayrı
 *     cevaplardır; bir rapor bunu gizlerse okuyan eksiksiz sanır.
 */
import { notFound, redirect } from "next/navigation";
import { prisma } from "@cry/db";
import { kanonikJson, sha256, type KanitPaketi } from "@cry/rapor";
import { adminMi, oturumOku } from "@/lib/yetki";
import Kabuk from "@/components/Kabuk";
import { Adres, Kayit, Rozet, Satir, Tarih } from "@/components/ui";
import { sayi, tarih } from "@/lib/bicim";

export default async function RaporSayfasi({ params }: { params: Promise<{ id: string }> }) {
  const oturum = await oturumOku();
  if (!oturum) redirect("/giris");
  const { id } = await params;

  let raporId: bigint;
  try {
    raporId = BigInt(id);
  } catch {
    notFound();
  }

  const rapor = await prisma.report.findUnique({
    where: { id: raporId },
    include: { case: { select: { slug: true, title: true } } },
  });
  if (!rapor) notFound();

  const paket = rapor.snapshot as unknown as KanitPaketi;
  const yeniden = sha256(kanonikJson(rapor.snapshot));
  const tutuyor = yeniden === rapor.sha256;

  return (
    <Kabuk username={oturum.username} admin={adminMi(oturum)} genis>

      <Kayit
        koken="indeks"
        baslik={<h2 className="etiket">{rapor.title}</h2>}
        sag={
          <span className="veri m3">
            {rapor.case.title} · rapor {rapor.id.toString()} ·{" "}
            <Tarih deger={rapor.createdAt} metin={tarih(rapor.createdAt)} />
          </span>
        }
      >
        <Satir ad="mühür (kanıt paketi SHA-256)" not={tutuyor ? undefined : "paket değişmiş"}>
          <code className="veri">{rapor.sha256}</code>{" "}
          <Rozet
            ton={tutuyor ? "gelen" : "hata"}
            baslik={
              tutuyor
                ? "saklanan paket yeniden hash'lendi ve kayıtlı hash ile birebir çıktı"
                : `yeniden hesaplanan: ${yeniden}`
            }
          >
            {tutuyor ? "mühür tutuyor" : "MÜHÜR TUTMUYOR"}
          </Rozet>
        </Satir>
        <Satir ad="PDF SHA-256">
          {rapor.pdfSha256 ? (
            <code className="veri">{rapor.pdfSha256}</code>
          ) : (
            <span className="m2">
              PDF henüz üretilmedi; ilk indirmede üretilir ve hash'i bu satıra YAZILIR. Kanonik
              olan kanıt paketidir.
            </span>
          )}
        </Satir>
        <Satir ad="PDF">
          <a className="veri" href={`/api/rapor/${rapor.id}/pdf`}>
            indir (okunur hâli) ▾
          </a>
          <span className="m3">
            {" "}
            · aynı rapordan her zaman aynı baytlar; üretilen hash kayıttakiyle karşılaştırılır
          </span>
        </Satir>
        <Satir ad="kanıt paketi">
          <a className="veri" href={`/api/rapor/${rapor.id}/kanit`}>
            indir (mühürlenen baytlar) ▾
          </a>
          <span className="m3"> · doğrulama: sha256sum cry-kanit-{rapor.id.toString()}.json</span>
        </Satir>
      </Kayit>

      <Kayit koken="indeks" baslik="Koşu">
        <Satir ad="kök adres">
          <Adres deger={paket.kosu.kok} zincir={paket.kosu.zincir} kisa={false} />
        </Satir>
        <Satir ad="zincir · yön">
          {paket.kosu.zincir} · {paket.kosu.yon}
        </Satir>
        <Satir ad="durum">
          {paket.kosu.durum}
          {paket.kosu.durmaSebebi ? ` · durma sebebi: ${paket.kosu.durmaSebebi}` : ""}
        </Satir>
        <Satir ad="eşikler">
          <code className="veri">{JSON.stringify(paket.kosu.esikler)}</code>
        </Satir>
        <Satir ad="graf">
          {sayi(paket.ozet.dugum)} düğüm · {sayi(paket.ozet.kenar)} hareket
          {paket.ozet.devam > 0 ? ` · ${sayi(paket.ozet.devam)} devam` : ""}
        </Satir>
        <Satir ad="durma sebepleri">
          {Object.keys(paket.ozet.durma).length === 0
            ? "—"
            : Object.entries(paket.ozet.durma)
                .sort((a, b) => b[1] - a[1])
                .map(([s, n]) => `${s}: ${n}`)
                .join(" · ")}
        </Satir>
        <Satir ad="takip">
          <a className="veri" href={`/takip/${paket.kosu.id}`}>
            koşu {paket.kosu.id} ▸
          </a>
        </Satir>
      </Kayit>

      <Kayit koken="indeks" baslik="Hareket eden para">
        <table className="tablo">
          <thead>
            <tr>
              <th>varlık</th>
              <th className="sag">hareket</th>
              <th className="sag">tutar</th>
              <th className="sag">işlem günü ₺</th>
              <th className="sag">rapor günü ₺</th>
              <th className="sag">fiyatsız</th>
            </tr>
          </thead>
          <tbody>
            {paket.ozet.varliklar.map((v) => (
              <tr key={`${v.sozlesme ?? ""}|${v.sembol}`}>
                <td title={v.sozlesme ?? "native varlık"}>{v.sembol}</td>
                <td className="sag">{sayi(v.kenar)}</td>
                <td className="sag veri">
                  {v.tutar ?? (
                    <span className="m2" title="ondalığı bilinmeyen tutar çevrilmez">
                      {v.hamToplam} (ham)
                    </span>
                  )}
                </td>
                {/* Tek bir fiyat yoksa hücre "0 ₺" DEĞİL, yokluktur. */}
                <td className="sag veri">{v.islemGunuTry ?? <span className="m2">—</span>}</td>
                <td className="sag veri">{v.raporGunuTry ?? <span className="m2">—</span>}</td>
                <td className="sag">{v.fiyatsizKenar > 0 ? `${sayi(v.fiyatsizKenar)}/${sayi(v.kenar)}` : "0"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Kayit>

      <Kayit koken="supheli" baslik="Metodoloji ve sınırlar">
        <Satir ad="atıf kuralı">{paket.metodoloji.atifCumlesi}</Satir>
        <Satir ad="kur kaynağı">{paket.metodoloji.kurKaynagi}</Satir>
        <Satir ad="gün sınırı">{paket.metodoloji.gunSiniri}</Satir>
        <Satir ad="fiyatta geriye yürüme">{paket.metodoloji.fiyatGeriyeYurume}</Satir>
        <Satir ad="kurda geriye yürüme">
          en çok {paket.metodoloji.kurGeriyeYurumeGun} gün; kullanılan bültenin tarihi her satırda
          durur
        </Satir>
        <Satir ad="kapsam">{paket.kapsam.korlukCumlesi}</Satir>
        {paket.metodoloji.uyarilar.length > 0 && (
          <Satir ad="uyarılar">
            <ul className="satirlar">
              {paket.metodoloji.uyarilar.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </Satir>
        )}
      </Kayit>

      {paket.ozet.eksikler.length > 0 && (
        <Kayit koken="supheli" baslik="Bakılamayanlar">
          <table className="tablo">
            <thead>
              <tr>
                <th>sebep</th>
                <th className="sag">hareket</th>
              </tr>
            </thead>
            <tbody>
              {paket.ozet.eksikler.map((e) => (
                <tr key={e.sebep}>
                  <td>{e.sebep}</td>
                  <td className="sag">{sayi(e.kenar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Kayit>
      )}
    </Kabuk>
  );
}
