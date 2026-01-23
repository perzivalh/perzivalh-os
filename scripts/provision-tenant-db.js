const { execSync } = require("child_process");

const inputUrl = process.env.TENANT_DB_URL || process.argv[2];

if (!inputUrl) {
  console.error("Missing tenant DB url. Set TENANT_DB_URL or pass an argument.");
  process.exit(1);
}

let dbName = "";
let host = "";
try {
  const url = new URL(inputUrl);
  host = url.hostname;
  dbName = (url.pathname || "").replace("/", "");
} catch (error) {
  console.error("Invalid database url.");
  process.exit(1);
}

if (host === "localhost" || host === "127.0.0.1") {
  console.log("Local database detected. Create it with:");
  console.log(`  CREATE DATABASE ${dbName};`);
} else {
  console.log("Non-local database detected. Create the database manually.");
}

process.env.TENANT_DB_URL = inputUrl;

execSync("npx prisma migrate deploy --schema prisma/tenant/schema.prisma", {
  stdio: "inherit",
});
