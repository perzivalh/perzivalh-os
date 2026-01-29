const { getControlClient } = require("../control/controlClient");
const { decryptString } = require("../core/crypto");
const { getTenantClient } = require("./tenantPrismaManager");

const CACHE_TTL_MS = 5 * 60 * 1000;
const tenantDbCache = new Map();
const channelCache = new Map();

function getCachedChannel(phoneNumberId) {
  const cached = channelCache.get(phoneNumberId);
  if (isFresh(cached)) {
    return cached.value;
  }
  return null;
}

function isFresh(entry) {
  return entry && Date.now() - entry.cachedAt < CACHE_TTL_MS;
}

async function getTenantDbUrl(tenantId) {
  if (!tenantId) {
    return null;
  }
  if (!process.env.CONTROL_DB_URL) {
    return null;
  }
  const cached = tenantDbCache.get(tenantId);
  if (isFresh(cached)) {
    return cached.url;
  }
  const control = getControlClient();
  const record = await control.tenantDatabase.findUnique({
    where: { tenant_id: tenantId },
  });
  if (!record) {
    return null;
  }
  const url = decryptString(record.db_url_encrypted);
  tenantDbCache.set(tenantId, { url, cachedAt: Date.now() });
  return url;
}

async function resolveChannelByPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) {
    return null;
  }
  if (!process.env.CONTROL_DB_URL) {
    return null;
  }
  const cached = getCachedChannel(phoneNumberId);
  if (cached) {
    return cached;
  }
  const control = getControlClient();
  const channel = await control.channel.findUnique({
    where: { phone_number_id: phoneNumberId },
  });
  if (!channel || !channel.is_active) {
    return null;
  }
  const value = {
    tenantId: channel.tenant_id,
    phone_number_id: channel.phone_number_id,
    waba_id: channel.waba_id || null,
    verify_token: channel.verify_token,
    wa_token: decryptString(channel.wa_token_encrypted),
    app_secret: channel.app_secret_encrypted
      ? decryptString(channel.app_secret_encrypted)
      : null,
  };
  channelCache.set(phoneNumberId, { value, cachedAt: Date.now() });
  return value;
}

async function resolveTenantContextById(tenantId) {
  if (!tenantId) {
    return null;
  }
  if (!process.env.CONTROL_DB_URL) {
    return null;
  }
  try {
    const dbUrl = await getTenantDbUrl(tenantId);
    if (!dbUrl) {
      return null;
    }
    const control = getControlClient();
    const channel = await control.channel.findFirst({
      where: {
        tenant_id: tenantId,
        provider: "whatsapp",
        is_active: true,
      },
      orderBy: [
        { is_default: "desc" },
        { created_at: "desc" }
      ],
    });
    return {
      tenantId,
      prisma: getTenantClient(tenantId, dbUrl),
      channel: channel
        ? {
          tenantId,
          phone_number_id: channel.phone_number_id,
          waba_id: channel.waba_id || null,
          verify_token: channel.verify_token,
          wa_token: decryptString(channel.wa_token_encrypted),
          app_secret: channel.app_secret_encrypted
            ? decryptString(channel.app_secret_encrypted)
            : null,
        }
        : null,
    };
  } catch (error) {
    console.error("tenant.resolve_failed", error.message || error);
    return null;
  }
}

async function resolveTenantContextByPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) {
    return null;
  }
  if (!process.env.CONTROL_DB_URL) {
    return null;
  }
  try {
    const channelConfig = await resolveChannelByPhoneNumberId(phoneNumberId);
    if (!channelConfig || !channelConfig.tenantId) {
      return null;
    }
    const dbUrl = await getTenantDbUrl(channelConfig.tenantId);
    if (!dbUrl) {
      return null;
    }
    return {
      tenantId: channelConfig.tenantId,
      prisma: getTenantClient(channelConfig.tenantId, dbUrl),
      channel: channelConfig,
    };
  } catch (error) {
    console.error("tenant.resolve_failed", error.message || error);
    return null;
  }
}

module.exports = {
  resolveTenantContextById,
  resolveTenantContextByPhoneNumberId,
  getTenantDbUrl,
  resolveChannelByPhoneNumberId,
  clearTenantDbCache: (tenantId) => {
    if (tenantId) {
      tenantDbCache.delete(tenantId);
    }
  },
  clearChannelCache: (phoneNumberId) => {
    if (phoneNumberId) {
      channelCache.delete(phoneNumberId);
    }
  },
};
