import { redirect } from "next/navigation";
import { adminMi, oturumOku } from "@/lib/yetki";
import UstBar from "@/components/UstBar";
import AramaKutusu from "./AramaKutusu";

export default async function AnaSayfa() {
  const oturum = await oturumOku();
  if (!oturum) redirect("/giris");

  return (
    <main className="sayfa">
      <UstBar username={oturum.username} admin={adminMi(oturum)} />
      <AramaKutusu />
    </main>
  );
}
