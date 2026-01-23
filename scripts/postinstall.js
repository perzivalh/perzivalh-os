const { execSync } = require("child_process");
const path = require("path");
const dotenv = require("dotenv");

const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

if (isVercel) {
  console.log("postinstall: skipping prisma generate on Vercel.");
  process.exit(0);
}

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const fallbackUrl =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/postgres";

if (!process.env.TENANT_DB_URL) {
  process.env.TENANT_DB_URL = fallbackUrl;
}
if (!process.env.CONTROL_DB_URL) {
  process.env.CONTROL_DB_URL = fallbackUrl;
}

execSync("npm run prisma:generate", { stdio: "inherit" });
