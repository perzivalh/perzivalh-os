const { PrismaClient } = require("@prisma/client-control");

let controlClient = null;

function getControlClient() {
  const url = process.env.CONTROL_DB_URL || "";
  if (!url) {
    throw new Error("CONTROL_DB_URL missing");
  }
  if (!controlClient) {
    controlClient = new PrismaClient({
      datasources: { db: { url } },
    });
  }
  return controlClient;
}

async function disconnectControlClient() {
  if (controlClient) {
    await controlClient.$disconnect();
    controlClient = null;
  }
}

module.exports = {
  getControlClient,
  disconnectControlClient,
};
