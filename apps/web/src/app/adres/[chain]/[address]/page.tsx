import { redirect } from "next/navigation";
import { adminMi, oturumOku } from "@/lib/yetki";
import Kabuk from "@/components/Kabuk";
import AdresGorunumu from "./AdresGorunumu";

export default async function AdresSayfasi({
  params,
}: {
  params: Promise<{ chain: string; address: string }>;
}) {
  const oturum = await oturumOku();
  if (!oturum) redirect("/giris");
  const { chain, address } = await params;

  return (
    <Kabuk username={oturum.username} admin={adminMi(oturum)}>
      <AdresGorunumu chain={chain} address={decodeURIComponent(address)} />
    </Kabuk>
  );
}
