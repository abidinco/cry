/**
 * POST /api/takip — takip koşusu başlatır.
 *
 * Koşu HTTP isteği içinde yürütülmez: bir tarama dakikalarca sürebilir ve
 * sekme kapanınca yarım kalan bir graf "tamamlanmış" görünür.
 */
import { NextResponse } from "next/server";
import { prisma } from "@cry/db";
import { registryFromEnv, type ChainId } from "@cry/chain";
import { VARSAYILAN_ESIKLER } from "@cry/motor";
import { esikleriDogrula } from "@/lib/kosu-baslatma";
import { apiOturum } from "@/lib/yetki";
import { takipIstegi, zamanAsimi } from "@/lib/kuyruk";

const registry = registryFromEnv();
const KURALLAR = ["fifo", "orantisal", "zaman_pencereli"];

export async function POST(istek: Request) {
  const { oturum, yanit: kapi } = await apiOturum();
  if (kapi) return kapi;

  const govde = (await istek.json().catch(() => ({}))) as {
    chain?: string;
    address?: string;
    caseId?: number;
    vakaBasligi?: string;
    taintRule?: string;
    maxHop?: number;
    maxDugum?: number;
    dallanmaEsigi?: number;
    minTutar?: string;
    pencereSaat?: number;
    tohumTx?: string;
    yalnizYerel?: boolean;
  };

  const { chain, address } = govde;
  if (!chain || !address) {
    return NextResponse.json({ error: "chain ve address gerekli" }, { status: 400 });
  }

  let kok: string;
  try {
    kok = registry.get(chain as ChainId).normalizeAddress(address);
  } catch (hata) {
    return NextResponse.json(
      { error: hata instanceof Error ? hata.message : "geçersiz adres" },
      { status: 400 },
    );
  }

  const kural = govde.taintRule ?? "fifo";
  if (!KURALLAR.includes(kural)) {
    return NextResponse.json({ error: `bilinmeyen atıf kuralı: ${kural}` }, { status: 400 });
  }

  // Eşikler artık ARAYÜZDEN geliyor (2026-09-28), yani doğrulanmaları şart. Hatalı değer sessizce
  // varsayılana düşmez: 500 isteyip 300 koşan bir rapor kendi yazdığı sınırla çelişir.
  const esikSonuc = esikleriDogrula(govde);
  if ("hata" in esikSonuc) {
    return NextResponse.json({ error: esikSonuc.hata }, { status: 400 });
  }
  const esikler = esikSonuc.esikler;

  // Tohum işlemi: koşu adresin bütün girişlerinden değil, SEÇİLEN işlemden başlar. Biçimi burada
  // sınanır; o işlemin köke gerçekten para getirip getirmediğini worker ÖLÇER ve `stats.tohum`a
  // yazar — kapıda "getirmiyor" demek için tarama gerekir, tarama da koşunun kendi işidir.
  const tohumTx = govde.tohumTx?.trim();
  if (tohumTx !== undefined && tohumTx !== "" && !/^(0x)?[0-9a-fA-F]{64}$/.test(tohumTx)) {
    return NextResponse.json({ error: "işlem hash'i 64 onaltılık karakter olmalı" }, { status: 400 });
  }

  // Vaka zorunlu (şema kararı): koşu bir dosyaya ait olmalı ki denetim kaydı
  // ve rapor bir yere bağlansın. Vaka verilmezse o adres için biri açılır ve
  // bu vaka KARALAMAdır (`isDraft`): adını kimse koymadı. Bedeli rapor
  // istenince ödenir — karalamadan rapor alınmaz, adlandırma o anda sorulur.
  const vaka = govde.caseId
    ? await prisma.case.findUnique({ where: { id: govde.caseId } })
    : await prisma.case.create({
        data: {
          slug: `${chain}-${kok.slice(0, 8).toLowerCase()}-${Date.now().toString(36)}`,
          title: govde.vakaBasligi ?? `${kok.slice(0, 10)}… takibi`,
          ownerId: oturum.userId,
          isDraft: !govde.vakaBasligi,
        },
      });
  if (!vaka) return NextResponse.json({ error: "vaka bulunamadı" }, { status: 404 });

  const kosu = await prisma.traceRun.create({
    data: {
      caseId: vaka.id,
      chain,
      rootAddress: kok,
      taintRule: kural,
      // Eşikler kayda YAZILIR: rapor hangi sınırlarla üretildiğini söylemeli.
      params: {
        maxHop: esikler.maxHop,
        maxDugum: esikler.maxDugum,
        dallanmaEsigi: esikler.dallanmaEsigi,
        minTutar: govde.minTutar ?? VARSAYILAN_ESIKLER.minTutar.toString(),
        pencereSaat: govde.pencereSaat ?? 24,
        tohumTx: tohumTx || null,
        // Kip de bir SINIRDIR ve kayda yazılır: "bu cevap yalnızca yerel indeksten
        // verildi" bilgisi rapora girmeden, graf tam sanılır.
        yalnizYerel: govde.yalnizYerel === true,
      },
    },
  });

  try {
    await zamanAsimi(takipIstegi(kosu.id.toString()));
  } catch (hata) {
    // Kuyruğa girmeyen koşu "kuyrukta" kalmamalı: hiç işlenmeyecek.
    const mesaj = hata instanceof Error ? hata.message : "koşu kuyruğa atılamadı";
    await prisma.traceRun.update({
      where: { id: kosu.id },
      data: { status: "hata", finishedAt: new Date(), stopReason: mesaj.slice(0, 200) },
    });
    return NextResponse.json({ error: mesaj, traceRunId: kosu.id.toString() }, { status: 503 });
  }
  await prisma.auditLog.create({
    data: {
      userId: oturum.userId,
      action: "takip.baslat",
      target: `${chain}:${kok}`,
      meta: {
        traceRunId: kosu.id.toString(),
        kural,
        ...esikler,
        tohumTx: tohumTx || null,
        yalnizYerel: govde.yalnizYerel === true,
      },
    },
  });

  return NextResponse.json({
    traceRunId: kosu.id.toString(),
    caseSlug: vaka.slug,
    kural,
  });
}
