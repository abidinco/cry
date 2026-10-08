import { redirect } from "next/navigation";
import { adminMi, oturumOku } from "@/lib/yetki";
import Kabuk from "@/components/Kabuk";
import IslemGorunumu from "./IslemGorunumu";

export default async function IslemSayfasi({
  params,
}: {
  params: Promise<{ chain: string; hash: string }>;
}) {
  const oturum = await oturumOku();
  if (!oturum) redirect("/giris");
  const { chain, hash } = await params;

  return (
    <Kabuk username={oturum.username} admin={adminMi(oturum)}>
      <IslemGorunumu chain={chain} hash={decodeURIComponent(hash)} />
    </Kabuk>
  );
}
