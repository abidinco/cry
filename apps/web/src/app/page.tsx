import { redirect } from "next/navigation";
import { prisma } from "@cry/db";
import { adminMi, oturumOku } from "@/lib/yetki";
import { b3Dogrula, type B3Olcumu } from "@/lib/b3-durum";
import Kabuk from "@/components/Kabuk";
import AramaKutusu from "./AramaKutusu";
import B3Karti from "./B3Karti";

// Kart her istekte okunur: ölçüm saatler içinde değişiyor ve derleme zamanında
// donmuş bir sayı, bayat bir ölçümün en kötü hâli olurdu.
export const dynamic = "force-dynamic";

async function b3Oku(): Promise<B3Olcumu | null> {
  try {
    const kayit = await prisma.durumOlcumu.findUnique({ where: { anahtar: "b3" } });
    if (!kayit) return null;
    // Kayıt kapıdan geçmiş olsa da okurken yeniden doğrulanır: bozuk bir kayıt
    // sayfayı düşürmez, "rutin yazmadı" gibi görünür.
    const s = b3Dogrula(kayit.veri);
    return "olcum" in s ? s.olcum : null;
  } catch {
    return null;
  }
}

export default async function AnaSayfa() {
  const oturum = await oturumOku();
  if (!oturum) redirect("/giris");
  const b3 = await b3Oku();

  return (
    <Kabuk username={oturum.username} admin={adminMi(oturum)} aktif="ara">
      <AramaKutusu />
      <B3Karti olcum={b3} />
    </Kabuk>
  );
}
