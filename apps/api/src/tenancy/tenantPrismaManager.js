const { PrismaClient } = require("@prisma/client-tenant");

const clientCache = new Map();

function normalizeTenantDbUrl(dbUrl) {
  if (!dbUrl) {
    return dbUrl;
  }
  try {
    const url = new URL(dbUrl);
    if (url.hostname.includes("-pooler.") && !url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
    }
    return url.toString();
  } catch (error) {
    return dbUrl;
  }
}

function isRetryableTenantClientError(error) {
  const message = String(error?.message || "");
  return message.includes("cached plan must not change result type");
}

function createTenantClient(dbUrl) {
  return new PrismaClient({
    datasources: { db: { url: normalizeTenantDbUrl(dbUrl) } },
  });
}

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
  const client = createTenantClient(dbUrl);
  clientCache.set(tenantId, client);
  return client;
}

async function clearTenantClient(tenantId) {
  if (!tenantId) {
    return;
  }
  const client = clientCache.get(tenantId);
  clientCache.delete(tenantId);
  if (!client) {
    return;
  }
  try {
    await client.$disconnect();
  } catch (error) {
    // Ignore disconnect failures while recycling a stale pooled client.
  }
}

async function withTenantClientRetry(tenantId, dbUrl, operation) {
  try {
    return await operation(getTenantClient(tenantId, dbUrl));
  } catch (error) {
    if (!isRetryableTenantClientError(error)) {
      throw error;
    }
    await clearTenantClient(tenantId);
    return operation(getTenantClient(tenantId, dbUrl));
  }
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
  clearTenantClient,
  withTenantClientRetry,
  normalizeTenantDbUrl,
  isRetryableTenantClientError,
  disconnectAllTenantClients,
};
