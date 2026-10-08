import { redirect } from "next/navigation";
import { adminMi, oturumOku } from "@/lib/yetki";
import Kabuk from "@/components/Kabuk";
import AramaKutusu from "./AramaKutusu";

export default async function AnaSayfa() {
  const oturum = await oturumOku();
  if (!oturum) redirect("/giris");

  return (
    <Kabuk username={oturum.username} admin={adminMi(oturum)} aktif="ara">
      <AramaKutusu />
    </Kabuk>
  );
}
