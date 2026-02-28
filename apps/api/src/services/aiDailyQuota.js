const logger = require("../lib/logger");
const { getRedis } = require("../lib/redis");
const { getTenantContext } = require("../tenancy/tenantContext");

const KEY_TTL_SECONDS = 60 * 60 * 48; // 48h; the date is part of the key, so exact midnight expiry is not required.
const CONFIG_CACHE_TTL_MS = 60_000;
const LOCAL_COUNTERS = new Map();
const CONFIG_CACHE = new Map();

function normalizeProviderName(provider) {
  const normalized = String(provider || "").toLowerCase().trim();
  if (normalized === "cloudflare-workers-ai" || normalized === "workers-ai") {
    return "cloudflare";
  }
  return normalized || "openai";
}

function toPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function toNonNegativeNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function getBudgetDay() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.AI_DAILY_QUOTA_TIMEZONE || "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function getDefaultAiQuotaConfig() {
  const rawEnabled = String(process.env.AI_DAILY_QUOTA_ENABLED || "true").toLowerCase();
  const rawProviders = String(process.env.AI_DAILY_QUOTA_PROVIDERS || "cerebras").trim();

  return {
    enabled: !(rawEnabled === "0" || rawEnabled === "false" || rawEnabled === "off"),
    tracked_providers: normalizeTrackedProviders(rawProviders, ["cerebras"]),
    tenant_daily_token_limit: toPositiveNumber(process.env.AI_TENANT_DAILY_TOKEN_LIMIT || 1000000),
    chat_daily_token_limit: toPositiveNumber(process.env.AI_CHAT_DAILY_TOKEN_LIMIT || 10000),
    output_weight: toNonNegativeNumber(process.env.AI_DAILY_QUOTA_OUTPUT_WEIGHT || 0.35, 0.35),
  };
}

function isVerbose() {
  const raw = String(process.env.AI_DAILY_QUOTA_VERBOSE || "false").toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

function normalizeTrackedProviders(value, fallback = []) {
  const input = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[,\s;]+/)
        .map((item) => item.trim())
        .filter(Boolean);

  const normalized = [...new Set(input.map((item) => normalizeProviderName(item)).filter(Boolean))];
  if (normalized.length) {
    return normalized;
  }
  return Array.isArray(fallback) ? [...fallback] : [];
}

function normalizeAiQuotaConfig(input, defaults = getDefaultAiQuotaConfig()) {
  const source = input && typeof input === "object" ? input : {};
  const trackedProvidersValue =
    source.tracked_providers ??
    source.trackedProviders ??
    source.providers ??
    defaults.tracked_providers;

  return {
    enabled: source.enabled === undefined ? Boolean(defaults.enabled) : Boolean(source.enabled),
    tracked_providers: normalizeTrackedProviders(trackedProvidersValue, defaults.tracked_providers),
    tenant_daily_token_limit:
      toPositiveNumber(source.tenant_daily_token_limit ?? source.tenantDailyTokenLimit) ??
      defaults.tenant_daily_token_limit,
    chat_daily_token_limit:
      toPositiveNumber(source.chat_daily_token_limit ?? source.chatDailyTokenLimit) ??
      defaults.chat_daily_token_limit,
    output_weight: toNonNegativeNumber(
      source.output_weight ?? source.outputWeight,
      defaults.output_weight
    ),
  };
}

function getConfigCacheKey(tenantId) {
  return `ai_quota_cfg:${tenantId || "legacy"}`;
}

function invalidateAiQuotaConfigCache(tenantId) {
  if (!tenantId) {
    CONFIG_CACHE.clear();
    return;
  }
  CONFIG_CACHE.delete(getConfigCacheKey(tenantId));
}

async function loadStoredAiQuotaConfig(tenantId) {
  const cacheKey = getConfigCacheKey(tenantId);
  const cached = CONFIG_CACHE.get(cacheKey);
  if (cached && (Date.now() - cached.at) < CONFIG_CACHE_TTL_MS) {
    if (isVerbose()) {
      logger.info("ai.daily_quota_config_cache_hit", { tenantId });
    }
    return cached.value;
  }

  const context = getTenantContext();
  const prisma = context?.prisma;
  if (!tenantId || !prisma?.settings) {
    return null;
  }

  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 1 },
      select: { bot_identity_json: true },
    });
    const rawConfig = settings?.bot_identity_json?.ai_quota || null;
    CONFIG_CACHE.set(cacheKey, {
      at: Date.now(),
      value: rawConfig,
    });
    if (isVerbose()) {
      logger.info("ai.daily_quota_config_loaded", {
        tenantId,
        source: rawConfig ? "settings.bot_identity_json.ai_quota" : "defaults",
      });
    }
    return rawConfig;
  } catch (error) {
    logger.warn("ai.daily_quota_config_load_failed", {
      tenantId,
      message: error.message,
    });
    return null;
  }
}

async function getEffectiveAiQuotaConfig({ tenantId } = {}) {
  const defaults = getDefaultAiQuotaConfig();
  const resolvedTenantId = tenantId || getTenantContext().tenantId || "legacy";
  const stored = await loadStoredAiQuotaConfig(resolvedTenantId);
  return normalizeAiQuotaConfig(stored, defaults);
}

function estimateQuotaTokens({ inputTokensEst, maxTokens, outputWeight }) {
  const input = Math.max(0, Number(inputTokensEst || 0));
  const maxOut = Math.max(0, Number(maxTokens || 0));
  const weight = toNonNegativeNumber(outputWeight, 0.35);
  return Math.max(1, Math.ceil(input + (maxOut * weight)));
}

function buildTenantQuotaKey(tenantId, day = getBudgetDay()) {
  return `ai:quota:tenant:${tenantId || "legacy"}:${day}`;
}

function buildChatQuotaKey(tenantId, waId, day = getBudgetDay()) {
  return `ai:quota:chat:${tenantId || "legacy"}:${waId}:${day}`;
}

async function incrementCounter(key, amount) {
  try {
    const client = getRedis();
    const nextValue = await client.incrby(key, amount);
    if (nextValue === amount) {
      await client.expire(key, KEY_TTL_SECONDS);
    }
    return nextValue;
  } catch {
    const nextValue = Number(LOCAL_COUNTERS.get(key) || 0) + amount;
    LOCAL_COUNTERS.set(key, nextValue);
    return nextValue;
  }
}

async function decrementCounter(key, amount) {
  try {
    const client = getRedis();
    const nextValue = await client.decrby(key, amount);
    if (nextValue <= 0) {
      await client.del(key);
    }
    return nextValue;
  } catch {
    const nextValue = Number(LOCAL_COUNTERS.get(key) || 0) - amount;
    if (nextValue <= 0) {
      LOCAL_COUNTERS.delete(key);
      return 0;
    }
    LOCAL_COUNTERS.set(key, nextValue);
    return nextValue;
  }
}

async function getCounterValue(key) {
  try {
    const client = getRedis();
    const raw = await client.get(key);
    return Number(raw || 0);
  } catch {
    return Number(LOCAL_COUNTERS.get(key) || 0);
  }
}

async function scanChatKeys(tenantId, day) {
  const pattern = `ai:quota:chat:${tenantId || "legacy"}:*:${day}`;
  try {
    const client = getRedis();
    let cursor = "0";
    const keys = [];

    do {
      const reply = await client.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = String(reply?.[0] || "0");
      const batch = Array.isArray(reply?.[1]) ? reply[1] : [];
      for (const key of batch) {
        keys.push(key);
      }
    } while (cursor !== "0");

    return keys;
  } catch {
    return [...LOCAL_COUNTERS.keys()].filter((key) => key.startsWith(`ai:quota:chat:${tenantId || "legacy"}:`) && key.endsWith(`:${day}`));
  }
}

function createQuotaError({
  provider,
  model,
  scope,
  used,
  limit,
  reserveTokens,
}) {
  const err = new Error(
    `Daily AI quota exceeded (429): provider=${provider} model=${model || "-"} scope=${scope}` +
      ` used=${used} limit=${limit} reserve_tokens=${reserveTokens}`
  );
  err.status = 429;
  err.code = "AI_CHAT_DAILY_BUDGET_EXCEEDED";
  err.kind = "budget";
  err.scope = scope;
  return err;
}

async function rollbackReservations(applied) {
  for (let idx = applied.length - 1; idx >= 0; idx--) {
    const item = applied[idx];
    try {
      await decrementCounter(item.key, item.amount);
    } catch {
      // Best effort rollback.
    }
  }
}

function maskWaId(waId) {
  const raw = String(waId || "").trim();
  if (!raw) {
    return "sin-chat";
  }
  if (raw.length <= 4) {
    return raw;
  }
  return `***${raw.slice(-4)}`;
}

function getChatIdFromQuotaKey(key) {
  const parts = String(key || "").split(":");
  return parts.length >= 6 ? parts[4] : "";
}

async function getDailyAiQuotaSnapshot({ tenantId, topChatsLimit = 8 } = {}) {
  const resolvedTenantId = tenantId || getTenantContext().tenantId || "legacy";
  const config = await getEffectiveAiQuotaConfig({ tenantId: resolvedTenantId });
  const day = getBudgetDay();
  const tenantUsed = await getCounterValue(buildTenantQuotaKey(resolvedTenantId, day));
  const chatKeys = await scanChatKeys(resolvedTenantId, day);

  const chatUsage = [];
  for (const key of chatKeys) {
    const waId = getChatIdFromQuotaKey(key);
    const usedTokens = await getCounterValue(key);
    if (!waId || usedTokens <= 0) {
      continue;
    }
    chatUsage.push({
      wa_id: waId,
      wa_id_masked: maskWaId(waId),
      used_tokens: usedTokens,
      limit_tokens: config.chat_daily_token_limit,
      remaining_tokens: config.chat_daily_token_limit
        ? Math.max(0, config.chat_daily_token_limit - usedTokens)
        : null,
    });
  }

  chatUsage.sort((a, b) => b.used_tokens - a.used_tokens);

  const snapshot = {
    day,
    config,
    usage: {
      tenant: {
        used_tokens: tenantUsed,
        limit_tokens: config.tenant_daily_token_limit,
        remaining_tokens: config.tenant_daily_token_limit
          ? Math.max(0, config.tenant_daily_token_limit - tenantUsed)
          : null,
      },
      chats: chatUsage.slice(0, Math.max(1, Number(topChatsLimit || 8))),
    },
  };

  logger.info("ai.daily_quota_snapshot", {
    tenantId: resolvedTenantId,
    day,
    enabled: config.enabled,
    tenantUsedTokens: snapshot.usage.tenant.used_tokens,
    tenantLimitTokens: snapshot.usage.tenant.limit_tokens,
    trackedChats: snapshot.usage.chats.length,
  });

  return snapshot;
}

async function reserveDailyAiQuota({
  tenantId,
  waId,
  provider,
  model,
  inputTokensEst,
  maxTokens,
}) {
  const resolvedTenantId = tenantId || getTenantContext().tenantId || "legacy";
  const config = await getEffectiveAiQuotaConfig({ tenantId: resolvedTenantId });

  if (!config.enabled) {
    if (isVerbose()) {
      logger.info("ai.daily_quota_skipped", {
        tenantId: resolvedTenantId,
        provider: normalizeProviderName(provider),
        reason: "disabled",
      });
    }
    return { reserved: false, reason: "disabled", config };
  }

  const normalizedProvider = normalizeProviderName(provider);
  const trackedProviders = normalizeTrackedProviders(config.tracked_providers, []);
  if (trackedProviders.length && !trackedProviders.includes(normalizedProvider)) {
    if (isVerbose()) {
      logger.info("ai.daily_quota_skipped", {
        tenantId: resolvedTenantId,
        provider: normalizedProvider,
        reason: "provider_not_tracked",
      });
    }
    return { reserved: false, reason: "provider_not_tracked", config };
  }

  if (!config.tenant_daily_token_limit && !config.chat_daily_token_limit) {
    if (isVerbose()) {
      logger.info("ai.daily_quota_skipped", {
        tenantId: resolvedTenantId,
        provider: normalizedProvider,
        reason: "limits_not_configured",
      });
    }
    return { reserved: false, reason: "limits_not_configured", config };
  }

  const reserveTokens = estimateQuotaTokens({
    inputTokensEst,
    maxTokens,
    outputWeight: config.output_weight,
  });
  const day = getBudgetDay();
  const chatScopeId = String(waId || "").trim();
  const applied = [];

  try {
    if (config.tenant_daily_token_limit) {
      const tenantKey = buildTenantQuotaKey(resolvedTenantId, day);
      const tenantUsed = await incrementCounter(tenantKey, reserveTokens);
      applied.push({ key: tenantKey, amount: reserveTokens });
      if (tenantUsed > config.tenant_daily_token_limit) {
        logger.warn("ai.daily_quota_exceeded", {
          provider: normalizedProvider,
          model: model || null,
          scope: "tenant_daily",
          tenantId: resolvedTenantId,
          used: tenantUsed,
          limit: config.tenant_daily_token_limit,
          reserveTokens,
        });
        throw createQuotaError({
          provider: normalizedProvider,
          model,
          scope: "tenant_daily",
          used: tenantUsed,
          limit: config.tenant_daily_token_limit,
          reserveTokens,
        });
      }
    }

    if (config.chat_daily_token_limit && chatScopeId) {
      const chatKey = buildChatQuotaKey(resolvedTenantId, chatScopeId, day);
      const chatUsed = await incrementCounter(chatKey, reserveTokens);
      applied.push({ key: chatKey, amount: reserveTokens });
      if (chatUsed > config.chat_daily_token_limit) {
        logger.warn("ai.daily_quota_exceeded", {
          provider: normalizedProvider,
          model: model || null,
          scope: "chat_daily",
          tenantId: resolvedTenantId,
          waIdSuffix: chatScopeId.slice(-4),
          used: chatUsed,
          limit: config.chat_daily_token_limit,
          reserveTokens,
        });
        throw createQuotaError({
          provider: normalizedProvider,
          model,
          scope: "chat_daily",
          used: chatUsed,
          limit: config.chat_daily_token_limit,
          reserveTokens,
        });
      }
    }
  } catch (error) {
    await rollbackReservations(applied);
    throw error;
  }

  if (isVerbose()) {
    logger.info("ai.daily_quota_reserved", {
      provider: normalizedProvider,
      model: model || null,
      tenantId: resolvedTenantId,
      hasChatScope: Boolean(chatScopeId),
      reserveTokens,
      tenantLimit: config.tenant_daily_token_limit || null,
      chatLimit: config.chat_daily_token_limit || null,
    });
  }

  return {
    reserved: true,
    reserveTokens,
    tenantLimit: config.tenant_daily_token_limit || null,
    chatLimit: config.chat_daily_token_limit || null,
    config,
  };
}

module.exports = {
  normalizeAiQuotaConfig,
  getEffectiveAiQuotaConfig,
  getDailyAiQuotaSnapshot,
  reserveDailyAiQuota,
  invalidateAiQuotaConfigCache,
};
