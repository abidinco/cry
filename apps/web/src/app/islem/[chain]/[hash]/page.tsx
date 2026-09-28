import { redirect } from "next/navigation";
import { adminMi, oturumOku } from "@/lib/yetki";
import UstBar from "@/components/UstBar";
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
    <main className="sayfa">
      <UstBar username={oturum.username} admin={adminMi(oturum)} />
      <IslemGorunumu chain={chain} hash={decodeURIComponent(hash)} />
    </main>
  );
}
