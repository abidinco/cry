import { redirect } from "next/navigation";
import { adminMi, oturumOku } from "@/lib/yetki";
import UstBar from "@/components/UstBar";
import AramaKutusu from "./AramaKutusu";

export default async function AnaSayfa() {
  const oturum = await oturumOku();
  if (!oturum) redirect("/giris");

  return (
    <main className="kutu">
      <UstBar username={oturum.username} admin={adminMi(oturum)} />
      <p className="soluk">
        Cüzdan adresi, işlem hash&apos;i ya da explorer bağlantısı yapıştır. Hangi ağ olduğu
        formattan çözülür; çözülemeyen durumlar yoklanır.
      </p>
      <AramaKutusu />
    </main>
  );
}
