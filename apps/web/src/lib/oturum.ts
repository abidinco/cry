/**
 * Oturum — imzalı çerez (JWT), sunucu tarafında doğrulanır.
 *
 * Neden ayrı bir kütüphane değil: tek kullanıcı türü, tek çerez, kayıt akışı
 * yok. Kural basit ve tek yerde durmalı — "giriş yapılmadan uygulama
 * kullanılamaz" bir güvenlik sınırıdır, üç dosyaya dağılmamalı.
 */
import { SignJWT, jwtVerify } from "jose";

const CEREZ = "cry_oturum";
const SURE_SN = 60 * 60 * 12;

export type Oturum = {
  userId: number;
  username: string;
  role: string;
  /** İlk girişte şifre değiştirme zorunluluğu sürüyor mu. */
  mustChangePassword: boolean;
};

function anahtar(): Uint8Array {
  const gizli = process.env.AUTH_SECRET;
  // Varsayılan bir sır ASLA konmaz: unutulduğu gün herkes admin olur.
  if (!gizli || gizli.length < 32) {
    throw new Error("AUTH_SECRET tanımlı değil ya da 32 karakterden kısa");
  }
  return new TextEncoder().encode(gizli);
}

export async function oturumImzala(o: Oturum): Promise<string> {
  return new SignJWT({ ...o })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SURE_SN}s`)
    .sign(anahtar());
}

export async function oturumCoz(jeton: string | undefined): Promise<Oturum | null> {
  if (!jeton) return null;
  try {
    const { payload } = await jwtVerify(jeton, anahtar());
    return {
      userId: Number(payload.userId),
      username: String(payload.username),
      role: String(payload.role),
      mustChangePassword: Boolean(payload.mustChangePassword),
    };
  } catch {
    return null;
  }
}

export const OTURUM_CEREZI = CEREZ;
export const OTURUM_SURESI_SN = SURE_SN;
