/**
 * PATCH /api/kullanici/[id] — durum, rol ya da şifre sıfırlama (admin).
 *
 * Kullanıcı SİLİNMEZ, pasife çekilir: denetim kaydı ona atıfta bulunuyor ve
 * "kim sorguladı" sorusunun cevabı silinen bir satırla birlikte kaybolur.
 */
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { prisma } from "@cry/db";
import { apiAdmin } from "@/lib/yetki";

export async function PATCH(istek: Request, ctx: { params: Promise<{ id: string }> }) {
  const { oturum, yanit: kapi } = await apiAdmin();
  if (kapi) return kapi;

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "geçersiz id" }, { status: 400 });

  const hedef = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!hedef) return NextResponse.json({ error: "kullanıcı yok" }, { status: 404 });

  const { active, role, sifreSifirla } = (await istek.json().catch(() => ({}))) as {
    active?: boolean;
    role?: string;
    sifreSifirla?: boolean;
  };

  // Kendi yetkisini düşürmek ya da kendini kapatmak: arşiv admin'siz kalır.
  if (hedef.id === oturum.userId && (active === false || (role && role !== "admin"))) {
    return NextResponse.json(
      { error: "Kendi hesabını kapatamaz ya da yetkisini düşüremezsin" },
      { status: 400 },
    );
  }

  // Son aktif admin korunur — aynı sebep, başka yoldan.
  if (hedef.role.key === "admin" && (active === false || (role && role !== "admin"))) {
    const adminSayisi = await prisma.user.count({
      where: { active: true, role: { key: "admin" } },
    });
    if (adminSayisi <= 1) {
      return NextResponse.json({ error: "Son yönetici kapatılamaz" }, { status: 400 });
    }
  }

  const veri: Record<string, unknown> = {};
  let yeniSifre: string | undefined;

  if (typeof active === "boolean") veri.active = active;
  if (role) {
    const rolKaydi = await prisma.role.findUnique({ where: { key: role } });
    if (!rolKaydi) return NextResponse.json({ error: "rol bulunamadı" }, { status: 400 });
    veri.roleId = rolKaydi.id;
  }
  if (sifreSifirla) {
    yeniSifre = randomBytes(12).toString("base64url");
    veri.passwordHash = await hash(yeniSifre);
    veri.mustChangePassword = true;
  }

  if (Object.keys(veri).length === 0) {
    return NextResponse.json({ error: "değişiklik yok" }, { status: 400 });
  }

  await prisma.user.update({ where: { id }, data: veri });
  await prisma.auditLog.create({
    data: {
      userId: oturum.userId,
      action: "kullanici.guncelle",
      target: String(id),
      meta: { active, role, sifreSifirla: Boolean(sifreSifirla) },
    },
  });

  return NextResponse.json({ ok: true, sifre: yeniSifre });
}
