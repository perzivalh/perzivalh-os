const prisma = require("../db");
const logger = require("../lib/logger");
const { getControlClient } = require("../control/controlClient");
const { resolveTenantContextById } = require("../tenancy/tenantResolver");
const { runWithTenantContext } = require("../tenancy/tenantContext");
const contactImportService = require("./contactImportService");

const POLL_INTERVAL_MS = 60 * 1000;
const LOCK_STALE_MS = 10 * 60 * 1000;

let workerInterval = null;
let workerRunning = false;

function getNextDueAt(intervalMinutes = 5) {
  return new Date(Date.now() + Math.max(1, Number(intervalMinutes) || 5) * 60 * 1000);
}

async function acquireSyncLock(control, config) {
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS);
  const result = await control.odooConfig.updateMany({
    where: {
      id: config.id,
      OR: [
        { locked_at: null },
        { locked_at: { lt: staleBefore } },
      ],
    },
    data: {
      locked_at: new Date(),
      locked_by: `api_${process.pid}`,
    },
  });
  return result.count > 0;
}

async function releaseSyncLock(control, configId, updates = {}) {
  await control.odooConfig.update({
    where: { id: configId },
    data: {
      locked_at: null,
      locked_by: null,
      ...updates,
    },
  });
}

async function processOdooSyncConfig(config) {
  const control = getControlClient();
  const acquired = await acquireSyncLock(control, config);
  if (!acquired) {
    return false;
  }

  try {
    const tenantContext = await resolveTenantContextById(config.tenant_id);
    if (!tenantContext?.prisma) {
      throw new Error("tenant_context_missing");
    }

    const result = await runWithTenantContext(
      { prisma: tenantContext.prisma, tenantId: config.tenant_id, channel: null },
      () =>
        contactImportService.refreshFromOdoo({
          lastPartnerWriteAt: config.last_partner_write_at || null,
          lastPatientWriteAt: config.last_patient_write_at || null,
        })
    );

    await releaseSyncLock(control, config.id, {
      last_partner_write_at: result?.cursors?.last_partner_write_at || config.last_partner_write_at || null,
      last_patient_write_at: result?.cursors?.last_patient_write_at || config.last_patient_write_at || null,
      last_success_at: new Date(),
      last_error_at: null,
      last_error_message: null,
      next_due_at: getNextDueAt(config.sync_interval_minutes),
    });
    return true;
  } catch (error) {
    logger.error("odoo.sync_failed", {
      tenantId: config.tenant_id,
      message: error.message || String(error),
    });
    await releaseSyncLock(control, config.id, {
      last_error_at: new Date(),
      last_error_message: error.message || String(error),
      next_due_at: getNextDueAt(config.sync_interval_minutes),
    });
    return false;
  }
}

async function processDueOdooSyncs() {
  if (!process.env.CONTROL_DB_URL) {
    return;
  }
  const control = getControlClient();
  const now = new Date();
  const dueConfigs = await control.odooConfig.findMany({
    where: {
      sync_enabled: true,
      OR: [
        { next_due_at: null },
        { next_due_at: { lte: now } },
      ],
    },
    orderBy: [
      { next_due_at: "asc" },
      { created_at: "asc" },
    ],
    take: 10,
  });

  for (const config of dueConfigs) {
    await processOdooSyncConfig(config);
  }
}

async function initializeOdooSyncWorker() {
  if (workerRunning || !process.env.CONTROL_DB_URL) {
    return;
  }
  workerRunning = true;
  logger.info("odoo.sync_worker_started");

  workerInterval = setInterval(async () => {
    try {
      await processDueOdooSyncs();
    } catch (error) {
      logger.error("odoo.sync_worker_poll_failed", {
        message: error.message || String(error),
      });
    }
  }, POLL_INTERVAL_MS);

  void processDueOdooSyncs().catch((error) => {
    logger.error("odoo.sync_worker_bootstrap_failed", {
      message: error.message || String(error),
    });
  });
}

function stopOdooSyncWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  workerRunning = false;
}

module.exports = {
  initializeOdooSyncWorker,
  stopOdooSyncWorker,
  processDueOdooSyncs,
};
