const { provisionDatabase } = require("./provision-db");

try {
  provisionDatabase({
    envVarName: "CONTROL_DB_URL",
    schemaPath: "prisma/control/schema.prisma",
    inputUrl: process.env.CONTROL_DB_URL || process.argv[2],
    label: "Control plane",
  });
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
