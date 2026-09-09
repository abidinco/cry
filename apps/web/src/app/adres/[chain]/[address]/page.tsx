import { redirect } from "next/navigation";
import { adminMi, oturumOku } from "@/lib/yetki";
import UstBar from "@/components/UstBar";
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
    <main className="kutu">
      <UstBar username={oturum.username} admin={adminMi(oturum)} />
      <AdresGorunumu chain={chain} address={decodeURIComponent(address)} />
    </main>
  );
}
