/**
 * POST /api/oturum/sifre — kendi şifresini değiştirir.
 *
 * Mevcut şifre HER ZAMAN sorulur, ilk giriş zorunluluğunda bile: o an elde
 * olan tek kanıt oturum çerezidir ve çerez çalınmış olabilir.
 */
import { NextResponse } from "next/server";
import { hash, verify } from "@node-rs/argon2";
import { prisma } from "@cry/db";
import { OTURUM_CEREZI, OTURUM_SURESI_SN, oturumImzala } from "@/lib/oturum";
import { apiOturum, sifreOlcutu } from "@/lib/yetki";

export async function POST(istek: Request) {
  const { oturum, yanit: kapi } = await apiOturum();
  if (kapi) return kapi;

  const { mevcut, yeni } = (await istek.json().catch(() => ({}))) as {
    mevcut?: string;
    yeni?: string;
  };
  if (!mevcut || !yeni) {
    return NextResponse.json({ error: "mevcut ve yeni şifre gerekli" }, { status: 400 });
  }

  const hata = sifreOlcutu(yeni);
  if (hata) return NextResponse.json({ error: hata }, { status: 400 });
  if (mevcut === yeni) {
    return NextResponse.json({ error: "Yeni şifre eskisiyle aynı olamaz" }, { status: 400 });
  }

  const kullanici = await prisma.user.findUnique({
    where: { id: oturum.userId },
    include: { role: true },
  });
  if (!kullanici || !kullanici.active) {
    return NextResponse.json({ error: "kullanıcı bulunamadı" }, { status: 401 });
  }

  const dogru = await verify(kullanici.passwordHash, mevcut).catch(() => false);
  if (!dogru) {
    await prisma.auditLog.create({
      data: { userId: kullanici.id, action: "sifre.hatali", meta: {} },
    });
    return NextResponse.json({ error: "Mevcut şifre hatalı" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: kullanici.id },
    data: { passwordHash: await hash(yeni), mustChangePassword: false },
  });
  await prisma.auditLog.create({
    data: { userId: kullanici.id, action: "sifre.degisti", meta: {} },
  });

  // Çerez YENİLENİR: eski jeton mustChangePassword=true taşıyor ve kapı
  // kullanıcıyı bu sayfaya geri yollardı.
  const jeton = await oturumImzala({
    userId: kullanici.id,
    username: kullanici.username,
    role: kullanici.role.key,
    mustChangePassword: false,
  });
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
