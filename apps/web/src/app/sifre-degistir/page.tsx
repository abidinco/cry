import { redirect } from "next/navigation";
import { oturumOku } from "@/lib/yetki";
import SifreFormu from "./SifreFormu";

export default async function SifreDegistirSayfasi() {
  const oturum = await oturumOku();
  if (!oturum) redirect("/giris");

  return (
    <main className="sayfa" style={{ maxWidth: 420 }}>
      <h1 style={{ marginBottom: 6 }}>Şifre değiştir</h1>
      {oturum.mustChangePassword && (
        <p className="m2" style={{ marginTop: 0 }}>
          İlk giriş. Devam etmeden önce şifreni değiştir.
        </p>
      )}
      <SifreFormu zorunlu={oturum.mustChangePassword} />
    </main>
  );
}
