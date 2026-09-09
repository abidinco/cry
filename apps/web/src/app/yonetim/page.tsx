import { redirect } from "next/navigation";
import { adminMi, oturumOku } from "@/lib/yetki";
import UstBar from "@/components/UstBar";
import KullaniciYonetimi from "./KullaniciYonetimi";

export default async function YonetimSayfasi() {
  const oturum = await oturumOku();
  if (!oturum) redirect("/giris");
  // Kapı sayfada da var: middleware yalnızca oturumu sorar, ROLÜ değil.
  if (!adminMi(oturum)) redirect("/");

  return (
    <main className="kutu">
      <UstBar username={oturum.username} admin />
      <h1 style={{ fontSize: 20 }}>Yönetim</h1>
      <KullaniciYonetimi />
    </main>
  );
}
