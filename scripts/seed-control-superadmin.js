const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client-control");

dotenv.config();

const email = (process.env.SUPERADMIN_EMAIL || "").toLowerCase().trim();
const password = process.env.SUPERADMIN_PASSWORD || "";
const controlUrl = process.env.CONTROL_DB_URL || "";

if (!email || !password) {
  console.error("Missing SUPERADMIN_EMAIL or SUPERADMIN_PASSWORD.");
  process.exit(1);
}
if (!controlUrl) {
  console.error("Missing CONTROL_DB_URL.");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: controlUrl } } });

async function run() {
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.userControl.upsert({
    where: { email },
    update: {
      password_hash: passwordHash,
      role: "superadmin",
      is_active: true,
      tenant_id: null,
    },
    create: {
      email,
      password_hash: passwordHash,
      role: "superadmin",
      is_active: true,
      tenant_id: null,
    },
  });
  console.log("Superadmin ready.");
}

run()
  .catch((error) => {
    console.error("Seed failed:", error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
