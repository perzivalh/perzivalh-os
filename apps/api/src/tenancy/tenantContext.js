const { AsyncLocalStorage } = require("async_hooks");

const tenantStorage = new AsyncLocalStorage();

function runWithTenantContext(context, fn) {
  return tenantStorage.run(context, fn);
}

function getTenantContext() {
  return tenantStorage.getStore() || {};
}

module.exports = {
  runWithTenantContext,
  getTenantContext,
};
