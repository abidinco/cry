import { redirect } from "next/navigation";
import { oturumOku } from "@/lib/yetki";
import SifreFormu from "./SifreFormu";

export default async function SifreDegistirSayfasi() {
  const oturum = await oturumOku();
  if (!oturum) redirect("/giris");

  return (
    <main className="kutu" style={{ maxWidth: 420 }}>
      <h1 style={{ fontSize: 20 }}>Şifre değiştir</h1>
      {oturum.mustChangePassword && (
        <p className="soluk">
          İlk giriş: devam etmeden önce şifreni değiştirmen gerekiyor.
        </p>
      )}
      <SifreFormu zorunlu={oturum.mustChangePassword} />
    </main>
  );
}
