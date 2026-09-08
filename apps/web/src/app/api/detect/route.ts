/**
 * POST /api/detect — yapıştırılan metnin hangi ağa ait olduğunu çözer.
 * Ağ çağrısı YOK; yalnızca format. Belirsizlik kalırsa yoklama ayrı adımdır.
 */
import { NextResponse } from "next/server";
import { detectNetwork } from "@cry/chain";

export async function POST(istek: Request) {
  let govde: unknown;
  try {
    govde = await istek.json();
  } catch {
    return NextResponse.json({ error: "geçersiz JSON" }, { status: 400 });
  }

  const girdi = (govde as { input?: unknown })?.input;
  if (typeof girdi !== "string" || girdi.trim().length === 0) {
    return NextResponse.json({ error: "input alanı gerekli" }, { status: 400 });
  }
  // Yapıştırılan metin uzun olabilir (explorer linki), ama sınırsız değil.
  if (girdi.length > 500) {
    return NextResponse.json({ error: "girdi çok uzun" }, { status: 400 });
  }

  return NextResponse.json(detectNetwork(girdi));
}
