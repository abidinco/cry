/**
 * GET  /api/kullanici — kullanıcı listesi (admin)
 * POST /api/kullanici — yeni kullanıcı (admin)
 *
 * Kayıt akışı YOK; kullanıcıları admin açar. Üretilen şifre yalnızca YANITTA
 * bir kez döner ve hiçbir yere yazılmaz — log'a düşseydi bir daha silinemezdi.
 */
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { prisma } from "@cry/db";
import { apiAdmin } from "@/lib/yetki";

export async function GET() {
  const { yanit: kapi } = await apiAdmin();
  if (kapi) return kapi;

  const kullanicilar = await prisma.user.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      active: true,
      mustChangePassword: true,
      createdAt: true,
      lastLoginAt: true,
      role: { select: { key: true, name: true } },
    },
  });
  const roller = await prisma.role.findMany({ select: { key: true, name: true } });
  return NextResponse.json({ kullanicilar, roller });
}

/** URL'de ve komut satırında sorun çıkarmayan, okunabilir şifre. */
function sifreUret(): string {
  return randomBytes(12).toString("base64url");
}

export async function POST(istek: Request) {
  const { oturum, yanit: kapi } = await apiAdmin();
  if (kapi) return kapi;

  const { username, displayName, role } = (await istek.json().catch(() => ({}))) as {
    username?: string;
    displayName?: string;
    role?: string;
  };

  if (!username || !/^[a-z0-9._-]{3,32}$/.test(username)) {
    return NextResponse.json(
      { error: "Kullanıcı adı 3-32 karakter olmalı: küçük harf, rakam, . _ -" },
      { status: 400 },
    );
  }

  const rolKaydi = await prisma.role.findUnique({ where: { key: role ?? "analist" } });
  if (!rolKaydi) return NextResponse.json({ error: "rol bulunamadı" }, { status: 400 });

  const mevcut = await prisma.user.findUnique({ where: { username } });
  if (mevcut) return NextResponse.json({ error: "Bu kullanıcı adı zaten var" }, { status: 409 });

  const sifre = sifreUret();
  const yeni = await prisma.user.create({
    data: {
      username,
      displayName: displayName || username,
      passwordHash: await hash(sifre),
      roleId: rolKaydi.id,
      mustChangePassword: true,
    },
    select: { id: true, username: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: oturum.userId,
      action: "kullanici.olustur",
      target: String(yeni.id),
      meta: { username: yeni.username, role: rolKaydi.key },
    },
  });

  // Şifre BİR KEZ döner; admin'in onu kullanıcıya iletmesi gerekir.
  return NextResponse.json({ kullanici: yeni, sifre });
}
