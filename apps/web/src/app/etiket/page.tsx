/**
 * /etiket — doğrulanmamış borsa iddialarını insana sorar.
 *
 * Neden var: keşif ve TronScan 764 doğrulanmamış `exchange_hot` etiketi yazdı ve hiçbirini
 * karara bağlayacak bir ekran yoktu. Her biri motorda `terminal_aday` üretiyor, yani her biri bir
 * izi durdurabilen bir İDDİA — ve iddiayı hükme çeviren tek şey insanın bakışı. "Yazıldı ama
 * hiçbir sayfa sormuyor" bitmiş sayılmaz.
 *
 * Sayfa üç şeyi yan yana koyar: adresin ARŞİVDEKİ ağırlığı (kaç koşuda göründü, kaç kez durdurdu),
 * iddianın GEREKÇESİ (keşfin ölçtüğü şekil ya da TronScan'ın etiketi) ve gezginde TIKLANIP
 * bakılabilecek bağlantı. Gerekçesiz bir onay, kaynağı olmayan bir hükümdür.
 */
import { redirect } from "next/navigation";
import { prisma } from "@cry/db";
import { adminMi, oturumOku } from "@/lib/yetki";
import { incelemeSirasi, type IncelemeSatiri } from "@/lib/etiket-inceleme";
import UstBar from "@/components/UstBar";
import IncelemeListesi from "./IncelemeListesi";

/** Bir turda insana sunulan en fazla satır — 764 satırlık bir sayfa kimsenin bakmadığı sayfadır. */
const SAYFA = 50;

export default async function EtiketSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ kaynak?: string }>;
}) {
  const oturum = await oturumOku();
  if (!oturum) redirect("/giris");
  const { kaynak } = await searchParams;

  // Doğrulanmamış borsa iddiaları + arşivdeki ağırlıkları. Ağırlık tek sorguda geliyor:
  // satır başına sorgu atmak 764 gidiş dönüş demekti.
  const ham = await prisma.$queryRaw<
    {
      id: number; chain: string; address: string; title: string; description: string | null;
      source: string; source_url: string | null; confidence: number;
      kosuda: bigint; durdurdu: bigint;
    }[]
  >`
    select l.id, l.chain, a.address, l.title, l.description, l.source, l.source_url, l.confidence,
           count(distinct n.trace_run_id) as kosuda,
           count(*) filter (where n.terminal_reason = 'terminal_aday') as durdurdu
      from labels l
      join addresses a on a.id = l.address_id
      left join trace_nodes n on n.chain = l.chain and n.address = a.address
     where l.category like 'exchange%' and l.verified_at is null
       and (${kaynak ?? null}::text is null or l.source = ${kaynak ?? null}::text)
       -- Kimliği ZATEN doğrulanmış adresi yeniden sormak, insanın vaktini bilmediği bir şeye
       -- değil bildiği bir şeye harcatır. Ölçüldü: keşif Binance-Hot 1'e de aday yazmıştı ve
       -- listenin ikinci sırasında çıkıyordu. (Blok keşfi bunu zaten eliyor; eski satırlar kalmış.)
       and not exists (
         select 1 from labels d
          where d.address_id = l.address_id and d.verified_at is not null
            and d.category like 'exchange%')
     group by l.id, a.address
     order by durdurdu desc, kosuda desc, l.confidence desc, a.address
     limit ${SAYFA}`;

  const satirlar: IncelemeSatiri[] = ham.map((r) => ({
    id: r.id, chain: r.chain, address: r.address, title: r.title, description: r.description,
    source: r.source, sourceUrl: r.source_url, confidence: r.confidence,
    kosuda: Number(r.kosuda), durdurdu: Number(r.durdurdu),
  }));

  // Kaynak dağılımı: "kaç tane var" sorusu sayfadaki 50 satırla cevaplanamaz.
  const dagilim = await prisma.label.groupBy({
    by: ["source"],
    where: { category: { startsWith: "exchange" }, verifiedAt: null },
    _count: true,
  });
  const karara = await prisma.label.count({
    where: { verifiedBy: { startsWith: "kullanici:" } },
  });

  return (
    <main className="sayfa">
      <UstBar username={oturum.username} admin={adminMi(oturum)} />
      <section className="panel" style={{ marginTop: 12 }}>
        <h1>Borsa iddiaları — doğrulama bekliyor</h1>
        <p className="m2" style={{ fontSize: 13, lineHeight: 1.6 }}>
          Bunların her biri motorda <b>terminal_aday</b> üretir: iz orada durur ama
          &laquo;borsaya girdi&raquo; denmez. Onaylanan iddia <b>terminal</b> olur ve rapora
          hüküm olarak girer. Karar tek yönlüdür: verdiğiniz karara sonraki kaynak turları
          DOKUNMAZ.
        </p>
        <p className="veri m3" style={{ fontSize: 12 }}>
          bekleyen:{" "}
          {dagilim
            .sort((a, b) => b._count - a._count)
            .map((d) => `${d.source} ${d._count}`)
            .join(" · ") || "yok"}
          {" — "}karara bağlanan: {karara}
        </p>
        <p className="etiket">
          {(["", "kesif_blok", "kesif", "tronscan", "kullanici"] as const).map((k) => (
            <a
              key={k || "hepsi"}
              href={k ? `/etiket?kaynak=${k}` : "/etiket"}
              style={{
                marginRight: 12,
                color: (kaynak ?? "") === k ? "var(--m1)" : "var(--m2)",
              }}
            >
              {k || "hepsi"}
            </a>
          ))}
        </p>
      </section>
      <IncelemeListesi satirlar={incelemeSirasi(satirlar)} />
    </main>
  );
}
