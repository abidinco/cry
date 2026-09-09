/**
 * Yetki — "bu isteği kim yapıyor ve yapabilir mi" sorusunun TEK cevabı.
 *
 * Rol kontrolü sayfaya ve uç noktaya dağılırsa biri unutulur; unutulan yer
 * de tam olarak kimsenin bakmadığı yer olur. Her korumalı yol buradan geçer.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { OTURUM_CEREZI, oturumCoz, type Oturum } from "./oturum";

export async function oturumOku(): Promise<Oturum | null> {
  return oturumCoz((await cookies()).get(OTURUM_CEREZI)?.value);
}

/** Sayfalar için: oturum yoksa null döner, çağıran yönlendirir. */
export async function oturumGerek(): Promise<Oturum | null> {
  return oturumOku();
}

export function adminMi(oturum: Oturum | null): boolean {
  return oturum?.role === "admin";
}

/**
 * API uç noktaları için kapı. Yetkisizlikte HAZIR yanıt döner, böylece
 * çağıran "kontrol ettim ama dönmeyi unuttum" hatasına düşemez.
 */
export async function apiOturum(): Promise<
  { oturum: Oturum; yanit?: undefined } | { oturum?: undefined; yanit: NextResponse }
> {
  const oturum = await oturumOku();
  if (!oturum) {
    return { yanit: NextResponse.json({ error: "oturum gerekli" }, { status: 401 }) };
  }
  return { oturum };
}

export async function apiAdmin(): Promise<
  { oturum: Oturum; yanit?: undefined } | { oturum?: undefined; yanit: NextResponse }
> {
  const sonuc = await apiOturum();
  if (sonuc.yanit) return sonuc;
  if (!adminMi(sonuc.oturum)) {
    // 404 değil 403: kaynağın varlığı zaten biliniyor, gizlemenin faydası yok.
    return { yanit: NextResponse.json({ error: "yetkisiz" }, { status: 403 }) };
  }
  return sonuc;
}

/** Şifre ölçütü tek yerde; hem kullanıcı hem admin yolu aynı kuralı uygular. */
export const SIFRE_EN_AZ = 10;

export function sifreOlcutu(sifre: string): string | null {
  if (sifre.length < SIFRE_EN_AZ) return `Şifre en az ${SIFRE_EN_AZ} karakter olmalı`;
  if (/^\s|\s$/.test(sifre)) return "Şifre boşlukla başlayıp bitemez";
  return null;
}
