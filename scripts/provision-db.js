const { execFileSync } = require("child_process");

function parseDatabaseUrl(inputUrl) {
  let url;
  try {
    url = new URL(inputUrl);
  } catch (error) {
    throw new Error("Invalid database url.");
  }

  const dbName = decodeURIComponent((url.pathname || "").replace(/^\/+/, ""));
  if (!dbName) {
    throw new Error("Database name missing in url.");
  }

  return {
    host: url.hostname,
    dbName,
  };
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function provisionDatabase({ envVarName, schemaPath, inputUrl, label }) {
  if (!inputUrl) {
    throw new Error(
      `Missing database url. Set ${envVarName} or pass it as the first argument.`
    );
  }

  const { host, dbName } = parseDatabaseUrl(inputUrl);
  const createDbSql = `CREATE DATABASE ${quoteIdentifier(dbName)};`;

  if (host === "localhost" || host === "127.0.0.1") {
    console.log(`${label} local database detected: ${dbName}`);
    console.log("Create it first in pgAdmin or psql with:");
    console.log(`  ${createDbSql}`);
  } else {
    console.log(
      `${label} remote database detected: ${dbName}. Make sure it already exists.`
    );
  }

  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "migrate", "deploy", "--schema", schemaPath],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        [envVarName]: inputUrl,
      },
    }
  );
}

module.exports = {
  provisionDatabase,
};
