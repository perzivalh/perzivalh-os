const { PrismaClient } = require("@prisma/client-tenant");

const clientCache = new Map();

function getTenantClient(tenantId, dbUrl) {
  if (!tenantId) {
    throw new Error("Tenant id missing");
  }
  if (clientCache.has(tenantId)) {
    return clientCache.get(tenantId);
  }
  if (!dbUrl) {
    throw new Error("Tenant database url missing");
  }
  const client = new PrismaClient({
    datasources: { db: { url: dbUrl } },
  });
  clientCache.set(tenantId, client);
  return client;
}

async function disconnectAllTenantClients() {
  const tasks = [];
  for (const client of clientCache.values()) {
    tasks.push(client.$disconnect());
  }
  clientCache.clear();
  if (tasks.length) {
    await Promise.allSettled(tasks);
  }
}

module.exports = {
  getTenantClient,
  disconnectAllTenantClients,
};
