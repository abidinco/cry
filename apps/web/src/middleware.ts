/**
 * Kapı: oturumsuz her istek /giris'e döner.
 *
 * Kapının UYGULAMA katmanında olması bilinçli — sunucu tarafında bir
 * basic_auth kutusu hem kendi giriş ekranımızı gölgeler hem tarayıcı kimlik
 * önbelleğine takılır (hafıza projesinde yaşandı).
 */
import { NextResponse, type NextRequest } from "next/server";
import { OTURUM_CEREZI, oturumCoz } from "@/lib/oturum";

// Bu yollar oturum kapısının DIŞINDA; her biri kendi korumasını taşıyor:
// /giris ile /api/oturum/giris kapının kendisi, /saglik veri döndürmüyor,
// /api/izleme/liste paylaşılan jetonla korunuyor (servis tarayıcı değil).
export const ACIK_YOLLAR = ["/giris", "/api/oturum/giris", "/saglik", "/api/izleme/liste"];

// Şifre değiştirme zorunluluğu sürerken AÇIK kalan yollar. Kapının kendisi
// kapalı olursa kullanıcı zorunluluğu yerine getiremez ve hesap kilitlenir —
// bu tam olarak yaşandı ve testi aşağıda.
export const SIFRE_KAPISI_DISI = [
  "/sifre-degistir",
  "/api/oturum/sifre",
  "/api/oturum/cikis",
];

export async function middleware(istek: NextRequest) {
  const yol = istek.nextUrl.pathname;
  if (ACIK_YOLLAR.some((a) => yol === a || yol.startsWith(a + "/"))) {
    return NextResponse.next();
  }

  const oturum = await oturumCoz(istek.cookies.get(OTURUM_CEREZI)?.value);
  if (!oturum) {
    const hedef = new URL("/giris", istek.url);
    // Girişten sonra kullanıcı gitmek istediği yere düşsün.
    hedef.searchParams.set("callbackUrl", yol + istek.nextUrl.search);
    return NextResponse.redirect(hedef, 307);
  }

  // Şifre değiştirmeden başka hiçbir sayfaya gidilemez.
  if (oturum.mustChangePassword && !SIFRE_KAPISI_DISI.includes(yol)) {
    return NextResponse.redirect(new URL("/sifre-degistir", istek.url), 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
