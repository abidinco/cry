/**
 * Unutulan şifreyi sıfırlar — yalnızca makinenin başındaki kişi için.
 *
 * Şifre GİZLİ girdiyle sorulur; bayraktan, ortam değişkeninden ya da
 * dosyadan ALINMAZ. Komut satırından geçen bir şifre kabuk geçmişine ve
 * süreç listesine düşer, yani "değiştirdim" denen anda iki yerde birden
 * durur. Web arayüzünde bir "şifremi unuttum" akışı BİLEREK yok: veritabanına
 * erişebilen kişi zaten her şeye erişebiliyor, internetten açılan bir
 * sıfırlama kapısı ise yeni bir saldırı yüzeyi olurdu.
 *
 * Kullanım (depo kökünden):
 *   node --env-file=apps/web/.env.local --import tsx packages/db/src/sifre-sifirla.ts [kullanıcı-adı]
 */
import { hash } from "@node-rs/argon2";
import { prisma } from "./index";

/** apps/web/src/lib/yetki.ts → SIFRE_EN_AZ ile aynı. */
const SIFRE_EN_AZ = 10;

function gizliSor(soru: string): Promise<string> {
  return new Promise((coz, reddet) => {
    const girdi = process.stdin;
    if (!girdi.isTTY) {
      reddet(new Error("Bu script etkileşimli bir terminal ister (şifre gizli girilir)."));
      return;
    }
    process.stdout.write(soru);
    girdi.setRawMode(true);
    girdi.resume();
    girdi.setEncoding("utf8");
    let deger = "";
    const dinle = (parca: string) => {
      for (const k of parca) {
        if (k === "\r" || k === "\n") {
          girdi.setRawMode(false);
          girdi.pause();
          girdi.off("data", dinle);
          process.stdout.write("\n");
          coz(deger);
          return;
        }
        const kod = k.charCodeAt(0);
        // 3 = Ctrl+C, 8 / 127 = geri silme
        if (kod === 3) {
          girdi.setRawMode(false);
          process.stdout.write("\n");
          process.exit(130);
        }
        if (kod === 8 || kod === 127) deger = deger.slice(0, -1);
        else deger += k;
      }
    };
    girdi.on("data", dinle);
  });
}

async function main() {
  const hedef = process.argv[2];
  const kullanicilar = await prisma.user.findMany({
    select: { id: true, username: true, active: true },
    orderBy: { id: "asc" },
  });
  if (kullanicilar.length === 0) {
    console.error("Veritabanında hiç kullanıcı yok — önce `npm run db:seed`.");
    process.exit(1);
  }

  const kullanici = hedef
    ? kullanicilar.find((k) => k.username === hedef)
    : kullanicilar.length === 1
      ? kullanicilar[0]
      : undefined;
  if (!kullanici) {
    console.error(
      hedef
        ? `"${hedef}" adında kullanıcı yok.`
        : "Birden çok kullanıcı var; adını argüman olarak ver.",
    );
    console.error("Kullanıcılar:", kullanicilar.map((k) => k.username).join(", "));
    process.exit(1);
  }

  console.log(`Kullanıcı: ${kullanici.username}${kullanici.active ? "" : " (PASİF — giriş yapamaz)"}`);
  const sifre = await gizliSor("Yeni şifre: ");
  if (sifre.length < SIFRE_EN_AZ) {
    console.error(`Şifre en az ${SIFRE_EN_AZ} karakter olmalı. Hiçbir şey değişmedi.`);
    process.exit(1);
  }
  if (/^\s|\s$/.test(sifre)) {
    console.error("Şifre boşlukla başlayıp bitemez. Hiçbir şey değişmedi.");
    process.exit(1);
  }
  if ((await gizliSor("Tekrar: ")) !== sifre) {
    console.error("İki giriş aynı değil. Hiçbir şey değişmedi.");
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: kullanici.id },
    data: { passwordHash: await hash(sifre), mustChangePassword: false },
  });
  await prisma.auditLog.create({
    data: { userId: kullanici.id, action: "sifre.sifirlandi", meta: { yol: "cli" } },
  });
  console.log(`✅ ${kullanici.username} için şifre değişti.`);
  // Oturum çerezleri imzalı ve sunucuda tutulmuyor: önceden açılmış oturumlar
  // süresi dolana kadar geçerli kalır. Hepsini kesmenin yolu AUTH_SECRET'i döndürmek.
  console.log("Not: önceden açılmış oturumlar süreleri dolana kadar geçerli kalır.");
}

main()
  .catch((h) => {
    console.error(h instanceof Error ? h.message : h);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
