const { getTenantContext, runWithTenantContext } = require("./tenancy/tenantContext");

function getClient() {
  const context = getTenantContext();
  if (!context.prisma) {
    throw new Error("tenant_context_missing");
  }
  return context.prisma;
}

const helpers = {
  runWithPrisma: (prisma, fn, extra = {}) =>
    runWithTenantContext({ prisma, ...extra }, fn),
  getCurrentClient: () => getClient(),
};

const prisma = new Proxy(helpers, {
  get(target, prop) {
    if (prop in target) {
      return target[prop];
    }
    const client = getClient();
    const value = client[prop];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

module.exports = prisma;
