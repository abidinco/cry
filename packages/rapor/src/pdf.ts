/**
 * PDF üretici — saf yerleşimi (`pdf-duzen.ts`) kâğıda çizen İNCE katman.
 *
 * İki şey burada bilinçli:
 *
 *  1. **Yazı tipi GİRDİdir.** Bayt dizilerini çağıran veriyor; bu dosya
 *     dosya sistemine bakmıyor. Böylece aynı üretici testte de, Next
 *     sunucusunda da, betikte de aynı şeyi yapıyor.
 *  2. **Üretim DETERMİNİSTİK olmak zorunda.** PDF'in hash'i kayda yazılıyor
 *     (`reports.pdf_sha256`); aynı rapordan ikinci kez üretilen PDF farklı
 *     baytlar verirse o sütun bir YALAN olur. pdf-lib varsayılan olarak
 *     üretim anını ve ID'yi PDF'e koyar — ikisi de burada SABİTLENİYOR:
 *     tarihler raporun kendi `uretildi` anından, ID mührün kendisinden.
 *
 * Kanonik olan JSON kanıt paketidir (kullanıcı kararı). PDF ondan üretilir;
 * yazı tipi ya da kütüphane sürümü değişince PDF'in hash'i değişir, mühür
 * değişmez.
 */

import { createHash } from "node:crypto";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFHexString, PDFName, rgb, type PDFFont } from "pdf-lib";
import { BOYUT, pdfDuzeni, type Duzen, type PdfGirdisi, type Stil } from "./pdf-duzen";

export type YaziTipleri = {
  /** DejaVuSans.ttf */
  govde: Uint8Array;
  /** DejaVuSans-Bold.ttf */
  kalin: Uint8Array;
  /** DejaVuSansMono.ttf */
  tekAralik: Uint8Array;
};

const TON = {
  normal: rgb(0.09, 0.09, 0.11),
  soluk: rgb(0.42, 0.43, 0.46),
  vurgu: rgb(0.62, 0.11, 0.11),
} as const;

export type PdfSonucu = {
  bayt: Uint8Array;
  sha256: string;
  sayfa: number;
  /** Yazı tipinin basamadığı karakter sayısı — 0 değilse PDF'in ilk sayfasında da yazılı. */
  basilamayan: number;
};

/** Stil → hangi yazı tipi. */
function yaziTipi(stil: Stil, y: { govde: PDFFont; kalin: PDFFont; tekAralik: PDFFont }): PDFFont {
  switch (stil) {
    case "baslik":
    case "bolum":
    case "ad":
      return y.kalin;
    case "mono":
    case "monoKucuk":
      return y.tekAralik;
    default:
      return y.govde;
  }
}

export async function raporPdfi(girdi: PdfGirdisi, yaziTipleri: YaziTipleri): Promise<PdfSonucu> {
  const belge = await PDFDocument.create();
  belge.registerFontkit(fontkit);
  const y = {
    govde: await belge.embedFont(yaziTipleri.govde, { subset: true }),
    kalin: await belge.embedFont(yaziTipleri.kalin, { subset: true }),
    tekAralik: await belge.embedFont(yaziTipleri.tekAralik, { subset: true }),
  };

  const olc = (metin: string, stil: Stil) => yaziTipi(stil, y).widthOfTextAtSize(metin, BOYUT[stil]);
  // Yazı tipinin kapsamı ÖLÇÜLÜR, varsayılmaz: kapsamayan karakter sessizce
  // boş basılırsa hash'in ortasında kaybolan bir hane doğrulanamaz bir mühür
  // demektir. Üç yazı tipinin de kapsaması şart — hangi stilde çıkacağı
  // yerleşimin kararı.
  // Küme BİR KEZ kurulur: defterde yüz binlerce karakter var, her biri için
  // altı bin kod noktasını taramak ölçülebilir bir yavaşlık olurdu.
  const kapsam = [y.govde, y.kalin, y.tekAralik].map((f) => new Set(f.getCharacterSet()));
  const kapsar = (kod: number) => kapsam.every((k) => k.has(kod));

  const duzen: Duzen = pdfDuzeni(girdi, olc, kapsar);

  for (const sayfa of duzen.sayfalar) {
    const kagit = belge.addPage([sayfa.genislik, sayfa.yukseklik]);
    for (const oge of sayfa.ogeler) {
      if (oge.tur === "cizgi") {
        kagit.drawLine({
          start: { x: oge.x1, y: oge.y1 },
          end: { x: oge.x2, y: oge.y2 },
          thickness: oge.kalinlik,
          color: TON[oge.ton],
        });
        continue;
      }
      const font = yaziTipi(oge.stil, y);
      const boyut = BOYUT[oge.stil];
      const x = oge.hiza === "sag" ? oge.x - font.widthOfTextAtSize(oge.metin, boyut) : oge.x;
      kagit.drawText(oge.metin, { x, y: oge.y, size: boyut, font, color: TON[oge.ton] });
    }
  }

  belge.setTitle(girdi.paket.baslik);
  belge.setSubject(`${girdi.paket.vaka.baslik} · kanıt paketi SHA-256 ${girdi.sha256}`);
  belge.setProducer("cry");
  belge.setCreator("cry");
  // Üretim anı rapordan gelir, saatten DEĞİL: aynı rapor her zaman aynı PDF'i
  // vermeli, yoksa kayıttaki pdf_sha256 ikinci indirmede tutmaz.
  const an = new Date(girdi.paket.uretildi);
  belge.setCreationDate(an);
  belge.setModificationDate(an);
  // Dosya kimliği de sabitlenir (pdf-lib bunu üretim anından türetiyor).
  const kimlik = PDFHexString.of(girdi.sha256.slice(0, 32).toUpperCase());
  belge.context.trailerInfo.ID = belge.context.obj([kimlik, kimlik]);
  belge.catalog.set(PDFName.of("Lang"), PDFHexString.fromText("tr-TR"));

  const bayt = await belge.save({ useObjectStreams: false });
  return {
    bayt,
    // Kanıt paketinin hash'i METNİN üstünden alınıyordu; PDF ikili, hash
    // baytların üstünden alınır.
    sha256: createHash("sha256").update(bayt).digest("hex"),
    sayfa: duzen.sayfalar.length,
    basilamayan: duzen.basilamayan,
  };
}
