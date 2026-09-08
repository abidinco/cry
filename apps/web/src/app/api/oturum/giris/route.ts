/**
 * POST /api/oturum/giris — kullanıcı adı + şifre.
 *
 * Kayıt akışı YOK; kullanıcıları admin elle açar.
 */
import { NextResponse } from "next/server";
import { verify } from "@node-rs/argon2";
import { prisma } from "@cry/db";
import { OTURUM_CEREZI, OTURUM_SURESI_SN, oturumImzala } from "@/lib/oturum";

export async function POST(istek: Request) {
  const { username, password } = (await istek.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };

  if (!username || !password) {
    return NextResponse.json({ error: "kullanıcı adı ve şifre gerekli" }, { status: 400 });
  }

  const kullanici = await prisma.user.findUnique({
    where: { username },
    include: { role: true },
  });

  // "Kullanıcı yok" ile "şifre yanlış" AYNI cevabı verir; fark, var olan
  // kullanıcı adlarını dışarıdan sayılabilir hâle getirir.
  const gecerli =
    kullanici?.active === true && (await verify(kullanici.passwordHash, password).catch(() => false));

  if (!kullanici || !gecerli) {
    return NextResponse.json({ error: "kullanıcı adı ya da şifre hatalı" }, { status: 401 });
  }

  const jeton = await oturumImzala({
    userId: kullanici.id,
    username: kullanici.username,
    role: kullanici.role.key,
    mustChangePassword: kullanici.mustChangePassword,
  });

  await prisma.user.update({
    where: { id: kullanici.id },
    data: { lastLoginAt: new Date() },
  });
  await prisma.auditLog.create({
    data: { userId: kullanici.id, action: "login", meta: {} },
  });

  // `secure` bayrağı ORTAMA değil İSTEĞİN protokolüne bakar: aynı üretim
  // derlemesi hem https://cry.abidin.dev hem evdeki http://localhost:1337
  // kestirmesiyle kullanılıyor. Ortama bakan bir bayrak ikincisinde çerezi
  // sessizce düşürür ve "giriş çalışmıyor" gibi görünür.
  const proto =
    istek.headers.get("x-forwarded-proto") ?? new URL(istek.url).protocol.replace(":", "");

  const yanit = NextResponse.json({ ok: true });
  yanit.cookies.set(OTURUM_CEREZI, jeton, {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    path: "/",
    maxAge: OTURUM_SURESI_SN,
  });
  return yanit;
}
