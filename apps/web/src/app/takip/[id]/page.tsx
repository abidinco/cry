import { redirect } from "next/navigation";
import { adminMi, oturumOku } from "@/lib/yetki";
import UstBar from "@/components/UstBar";
import TakipGorunumu from "./TakipGorunumu";

export default async function TakipSayfasi({ params }: { params: Promise<{ id: string }> }) {
  const oturum = await oturumOku();
  if (!oturum) redirect("/giris");
  const { id } = await params;

  return (
    <main className="sayfa sayfa-genis">
      <UstBar username={oturum.username} admin={adminMi(oturum)} />
      <TakipGorunumu id={id} />
    </main>
  );
}
