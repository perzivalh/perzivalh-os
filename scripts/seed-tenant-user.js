const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const { PrismaClient: TenantClient } = require("@prisma/client-tenant");
const { PrismaClient: ControlClient } = require("@prisma/client-control");

dotenv.config();

const tenantId = process.env.TENANT_ID || "";
const tenantDbUrl = process.env.TENANT_DB_URL || "";
const controlDbUrl = process.env.CONTROL_DB_URL || "";
const email = (process.env.TENANT_USER_EMAIL || "").toLowerCase().trim();
const password = process.env.TENANT_USER_PASSWORD || "";
const name = process.env.TENANT_USER_NAME || "Admin";
const role = process.env.TENANT_USER_ROLE || "admin";

const allowedRoles = new Set([
  "admin",
  "recepcion",
  "caja",
  "marketing",
  "doctor",
]);

if (!tenantId) {
  console.error("Missing TENANT_ID.");
  process.exit(1);
}
if (!tenantDbUrl) {
  console.error("Missing TENANT_DB_URL.");
  process.exit(1);
}
if (!controlDbUrl) {
  console.error("Missing CONTROL_DB_URL.");
  process.exit(1);
}
if (!email || !password) {
  console.error("Missing TENANT_USER_EMAIL or TENANT_USER_PASSWORD.");
  process.exit(1);
}
if (!allowedRoles.has(role)) {
  console.error("Invalid TENANT_USER_ROLE.");
  process.exit(1);
}

const tenantPrisma = new TenantClient({
  datasources: { db: { url: tenantDbUrl } },
});
const controlPrisma = new ControlClient({
  datasources: { db: { url: controlDbUrl } },
});

async function run() {
  const passwordHash = await bcrypt.hash(password, 10);
  const tenantUser = await tenantPrisma.user.upsert({
    where: { email },
    update: {
      name,
      password_hash: passwordHash,
      role,
      is_active: true,
    },
    create: {
      name,
      email,
      password_hash: passwordHash,
      role,
      is_active: true,
    },
  });

  await controlPrisma.userControl.upsert({
    where: { email },
    update: {
      password_hash: passwordHash,
      role,
      is_active: true,
      tenant_id: tenantId,
    },
    create: {
      email,
      password_hash: passwordHash,
      role,
      is_active: true,
      tenant_id: tenantId,
    },
  });

  console.log(`Tenant user ready: ${tenantUser.email}`);
}

run()
  .catch((error) => {
    console.error("Seed failed:", error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await tenantPrisma.$disconnect();
    await controlPrisma.$disconnect();
  });
