import { redirect } from "next/navigation";
import { adminMi, oturumOku } from "@/lib/yetki";
import Kabuk from "@/components/Kabuk";
import TakipGorunumu from "./TakipGorunumu";

export default async function TakipSayfasi({ params }: { params: Promise<{ id: string }> }) {
  const oturum = await oturumOku();
  if (!oturum) redirect("/giris");
  const { id } = await params;

  return (
    <Kabuk username={oturum.username} admin={adminMi(oturum)} genis>
      <TakipGorunumu id={id} />
    </Kabuk>
  );
}
