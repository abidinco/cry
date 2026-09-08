/**
 * GET /saglik — Caddy'nin ve izleme servisinin "PC ayakta mı" sorusu.
 * Oturum İSTEMEZ (açık yollarda), veritabanına dokunmaz: bu uç noktanın
 * cevabı "uygulama süreci yaşıyor mu" olmalı, "her şey çalışıyor mu" değil.
 */
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}
