const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

require("dotenv").config();

const prisma = new PrismaClient();

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || "Admin";
  const role = process.env.ADMIN_ROLE || "admin";

  if (!email || !password) {
    throw new Error("Missing ADMIN_EMAIL or ADMIN_PASSWORD");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: {
        name,
        role,
        is_active: true,
        password_hash: passwordHash,
      },
    });
    console.log(`Admin updated: ${email}`);
    return;
  }

  await prisma.user.create({
    data: {
      name,
      email,
      password_hash: passwordHash,
      role,
      is_active: true,
    },
  });
  console.log(`Admin created: ${email}`);
}

seedAdmin()
  .catch((error) => {
    console.error("Seed error", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
