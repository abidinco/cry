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
    <main className="sayfa">
      <UstBar username={oturum.username} admin />
      <KullaniciYonetimi />
    </main>
  );
}
