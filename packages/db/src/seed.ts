/**
 * İlk kurulum verisi: roller + admin kullanıcısı.
 *
 * Şifre ASLA kaynak kodda, git geçmişinde ya da log'da durmaz — yalnızca
 * .env üzerinden okunur ve `mustChangePassword` ile ilk girişte değiştirilir.
 * Değişken boşsa script kayıt açmaz ve sebebini söyler: sessiz bir varsayılan
 * şifre, unutulduğu gün açık kapıdır.
 */
import { hash } from "@node-rs/argon2";
import { prisma } from "./index";

const ROLLER = [
  { key: "admin", name: "Yönetici", permissions: ["*"] },
  {
    key: "analist",
    name: "Analist",
    permissions: ["case.read", "case.write", "trace.run", "report.create", "label.propose"],
  },
];

async function main() {
  for (const rol of ROLLER) {
    await prisma.role.upsert({
      where: { key: rol.key },
      update: { name: rol.name, permissions: rol.permissions },
      create: { key: rol.key, name: rol.name, permissions: rol.permissions },
    });
  }
  console.log(`✓ ${ROLLER.length} rol hazır`);

  const kullaniciAdi = process.env.SEED_ADMIN_USER ?? "abidin";
  const sifre = process.env.SEED_ADMIN_PASSWORD;

  const mevcut = await prisma.user.findUnique({ where: { username: kullaniciAdi } });
  if (mevcut) {
    console.log(`• "${kullaniciAdi}" zaten var, dokunulmadı`);
    return;
  }

  if (!sifre) {
    console.log(
      `⊘ "${kullaniciAdi}" AÇILMADI — SEED_ADMIN_PASSWORD boş.\n` +
        `  .env'e rastgele bir şifre yaz (ör. openssl rand -base64 24) ve tekrar çalıştır.`,
    );
    return;
  }

  const admin = await prisma.role.findUniqueOrThrow({ where: { key: "admin" } });
  await prisma.user.create({
    data: {
      username: kullaniciAdi,
      passwordHash: await hash(sifre),
      displayName: kullaniciAdi,
      roleId: admin.id,
      mustChangePassword: true,
    },
  });
  console.log(`✓ admin "${kullaniciAdi}" açıldı — ilk girişte şifre değiştirilecek`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
