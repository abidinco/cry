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
      <div className="tepe">
        <h1>{rapor.title}</h1>
        <span className="cip">{rapor.case.title}</span>
        <span className="cip">rapor {rapor.id.toString()}</span>
        <span className="cip">
          <Tarih deger={rapor.createdAt} metin={tarih(rapor.createdAt)} />
        </span>
        <span className="tepe-sag">
          <a className="dugme" href={`/api/rapor/${rapor.id}/kanit`}>
            kanıt paketi ▾
          </a>
          <a className="dugme birincil" href={`/api/rapor/${rapor.id}/pdf`}>
            PDF indir ▾
          </a>
        </span>
      </div>

      {/*
        Mühür en üstte ve TEK başına durur: bu sayfanın cevapladığı ilk soru "bu rapor
        değişmiş mi". Paket her açılışta yeniden kanonikleştirilip kayıtlı hash ile
        karşılaştırılıyor; cümle koda değil ÖLÇÜME bağlı.
      */}
      <div className="uyari" data-ton={tutuyor ? "iyi" : "hata"} style={{ marginBottom: 14 }}>
        <span aria-hidden>{tutuyor ? "✓" : "⚠"}</span>
        <span style={{ minWidth: 0 }}>
          <b>{tutuyor ? "Mühür tutuyor." : "MÜHÜR TUTMUYOR."}</b>{" "}
          {tutuyor
            ? "Saklanan paket yeniden hash'lendi ve kayıtlı hash ile birebir çıktı."
            : `Yeniden hesaplanan: ${yeniden}`}
          <code className="veri" style={{ display: "block", wordBreak: "break-all", marginTop: 4 }}>
            {rapor.sha256}
          </code>
          <span className="koken-notu" style={{ display: "block", margin: "4px 0 0" }}>
            kanonik hash KANIT PAKETİNİN (JSON) hash&apos;idir, PDF&apos;in değil · doğrulama:
            sha256sum cry-kanit-{rapor.id.toString()}.json
          </span>
        </span>
      </div>

      <div className="ikili">
        <div className="sutun">

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
                <td className="sag">
                  {v.fiyatsizKenar > 0 ? (
                    <>
                      {sayi(v.fiyatsizKenar)}/{sayi(v.kenar)}{" "}
                      {/* Fiyatsız kenar varsa o satırın TL'si bir ALT SINIRdır — ve bu
                          satırın KENDİSİNDE yazar. Varlıklar arası toplam ALINMAZ. */}
                      <Rozet ton="dikkat" baslik="fiyatı olmayan kenar var: bu satırın TL toplamı bir alt sınırdır">
                        alt sınır
                      </Rozet>
                    </>
                  ) : (
                    "0"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="koken-notu" style={{ display: "block", marginBottom: 0 }}>
          Varlıklar karışmaz ve varlıklar arası toplam alınmaz — &laquo;1 TRX + 1 USDT = 2&raquo;
          diye bir büyüklük yok. Fiyatı bulunamayan kenar varsa o satırın TL&apos;si alt sınırdır;
          sebepleri aşağıda sayılı.
        </p>
      </Kayit>
        </div>

        <div className="sutun">

      <Kayit koken="indeks" baslik="Mühür ve dosyalar">
        <div className="panel satirlar">
          <Satir ad="PDF SHA-256">
            {rapor.pdfSha256 ? (
              <code className="veri" style={{ wordBreak: "break-all" }}>
                {rapor.pdfSha256}
              </code>
            ) : (
              <span className="m2">
                PDF henüz üretilmedi; ilk indirmede üretilir ve hash&apos;i bu satıra YAZILIR.
                Kanonik olan kanıt paketidir.
              </span>
            )}
          </Satir>
          <Satir ad="PDF" not="aynı rapordan her zaman aynı baytlar">
            <a className="veri" href={`/api/rapor/${rapor.id}/pdf`}>
              indir (okunur hâli) ▾
            </a>
          </Satir>
          <Satir ad="kanıt paketi" not="mühürlenen baytlar">
            <a className="veri" href={`/api/rapor/${rapor.id}/kanit`}>
              indir ▾
            </a>
          </Satir>
        </div>
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

      <div className="uyari" data-ton="iyi">
        <span aria-hidden>✓</span>
        <span>
          Bu rapor bir <b>ANIN</b> tutanağıdır: üretim zamanı pakete girer, yani aynı koşudan
          alınan iki rapor farklı hash taşır.
        </span>
      </div>
        </div>
      </div>
    </Kabuk>
  );
}
