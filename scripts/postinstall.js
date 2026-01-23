const { execSync } = require("child_process");

const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

if (isVercel) {
  console.log("postinstall: skipping prisma generate on Vercel.");
  process.exit(0);
}

execSync("npm run prisma:generate", { stdio: "inherit" });
