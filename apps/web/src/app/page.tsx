import { cookies } from "next/headers";
import { OTURUM_CEREZI, oturumCoz } from "@/lib/oturum";
import AramaKutusu from "./AramaKutusu";

export default async function AnaSayfa() {
  const oturum = await oturumCoz((await cookies()).get(OTURUM_CEREZI)?.value);

  return (
    <main className="kutu">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>cry</h1>
        <span className="soluk mono">{oturum?.username}</span>
      </header>
      <p className="soluk">
        Cüzdan adresi, işlem hash&apos;i ya da explorer bağlantısı yapıştır. Hangi ağ olduğu
        formattan çözülür; çözülemeyen durumlar yoklanır.
      </p>
      <AramaKutusu />
    </main>
  );
}
