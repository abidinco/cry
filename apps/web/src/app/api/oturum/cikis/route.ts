/** POST /api/oturum/cikis — çerezi düşürür. */
import { NextResponse } from "next/server";
import { prisma } from "@cry/db";
import { OTURUM_CEREZI } from "@/lib/oturum";
import { oturumOku } from "@/lib/yetki";

export async function POST() {
  const oturum = await oturumOku();
  if (oturum) {
    await prisma.auditLog.create({ data: { userId: oturum.userId, action: "cikis", meta: {} } });
  }
  const yanit = NextResponse.json({ ok: true });
  // maxAge 0: tarayıcı çerezi hemen atar.
  yanit.cookies.set(OTURUM_CEREZI, "", { httpOnly: true, path: "/", maxAge: 0 });
  return yanit;
}
