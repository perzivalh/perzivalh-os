const logger = require("../lib/logger");
const { getRedis } = require("../lib/redis");
const { getTenantContext } = require("../tenancy/tenantContext");

const KEY_TTL_SECONDS = 60 * 60 * 48; // 48h; the date is part of the key, so exact midnight expiry is not required.
const CONFIG_CACHE_TTL_MS = 60_000;
const HISTORY_HASH_TTL_SECONDS = 60 * 60 * 24 * 35; // 35 days
const HISTORY_MAX_DAYS = 30;
const ALL_TRACKED_PROVIDERS = ["openai", "gemini", "cloudflare", "groq", "cerebras"];
const LOCAL_COUNTERS = new Map();
const LOCAL_HISTORY = new Map();
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

function formatBudgetDay(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.AI_DAILY_QUOTA_TIMEZONE || "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function getBudgetDay() {
  return formatBudgetDay(new Date());
}

function getDefaultAiQuotaConfig() {
  const rawEnabled = String(process.env.AI_DAILY_QUOTA_ENABLED || "true").toLowerCase();
  const rawProviders = String(
    process.env.AI_DAILY_QUOTA_PROVIDERS || ALL_TRACKED_PROVIDERS.join(",")
  ).trim();

  return {
    enabled: !(rawEnabled === "0" || rawEnabled === "false" || rawEnabled === "off"),
    tracked_providers: normalizeTrackedProviders(rawProviders, ALL_TRACKED_PROVIDERS),
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

function getLocalHistoryStore(tenantId) {
  const resolvedTenantId = tenantId || "legacy";
  let store = LOCAL_HISTORY.get(resolvedTenantId);
  if (!store) {
    store = new Map();
    LOCAL_HISTORY.set(resolvedTenantId, store);
  }
  return store;
}

function writeLocalHistoryRecord(tenantId, record) {
  if (!record?.day) {
    return;
  }
  const store = getLocalHistoryStore(tenantId);
  store.set(record.day, record);

  const orderedDays = [...store.keys()].sort();
  while (orderedDays.length > HISTORY_MAX_DAYS + 7) {
    const day = orderedDays.shift();
    if (!day) {
      continue;
    }
    store.delete(day);
  }
}

function listRecentBudgetDays(days) {
  const totalDays = Math.min(HISTORY_MAX_DAYS, Math.max(1, Number(days) || HISTORY_MAX_DAYS));
  const base = new Date();
  base.setUTCHours(12, 0, 0, 0);

  const out = [];
  for (let offset = totalDays - 1; offset >= 0; offset--) {
    const cursor = new Date(base);
    cursor.setUTCDate(base.getUTCDate() - offset);
    out.push(formatBudgetDay(cursor));
  }
  return out;
}

function normalizeHistoryRecord(day, entry = {}) {
  return {
    day,
    used_tokens: Math.max(0, Number(entry.used_tokens || 0)),
    limit_tokens:
      entry.limit_tokens == null || entry.limit_tokens === ""
        ? null
        : Math.max(0, Number(entry.limit_tokens || 0)) || null,
    chat_count: Math.max(0, Number(entry.chat_count || 0)),
    top_chats: Array.isArray(entry.top_chats) ? entry.top_chats : [],
  };
}

function fillHistoryWindow(entries, days) {
  const recentDays = listRecentBudgetDays(days);
  const byDay = new Map();

  for (const entry of entries || []) {
    const day = String(entry?.day || "").trim();
    if (!day) {
      continue;
    }
    byDay.set(day, normalizeHistoryRecord(day, entry));
  }

  return recentDays.map((day) => (
    byDay.get(day) || normalizeHistoryRecord(day)
  ));
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

  try {
    await persistDailySnapshotToHistory({ tenantId: resolvedTenantId });
  } catch {
    // Best effort only. Quota reservation must not fail because analytics history couldn't persist.
  }

  return {
    reserved: true,
    reserveTokens,
    tenantLimit: config.tenant_daily_token_limit || null,
    chatLimit: config.chat_daily_token_limit || null,
    config,
  };
}

function buildHistoryHashKey(tenantId) {
  return `ai:quota:history:${tenantId || "legacy"}`;
}

async function persistDailySnapshotToHistory({ tenantId, snapshot } = {}) {
  const resolvedTenantId = tenantId || getTenantContext().tenantId || "legacy";
  const usedSnapshot = snapshot || (await getDailyAiQuotaSnapshot({ tenantId: resolvedTenantId }));
  const day = usedSnapshot.day || getBudgetDay();
  const hashKey = buildHistoryHashKey(resolvedTenantId);

  const record = {
    day,
    used_tokens: usedSnapshot.usage?.tenant?.used_tokens ?? 0,
    limit_tokens: usedSnapshot.usage?.tenant?.limit_tokens ?? null,
    chat_count: usedSnapshot.usage?.chats?.length ?? 0,
    top_chats: (usedSnapshot.usage?.chats || []).slice(0, 10).map((c) => ({
      wa_id_masked: c.wa_id_masked,
      used_tokens: c.used_tokens,
    })),
  };

  writeLocalHistoryRecord(resolvedTenantId, record);

  try {
    const client = getRedis();
    await client.hset(hashKey, day, JSON.stringify(record));
    await client.expire(hashKey, HISTORY_HASH_TTL_SECONDS);
    if (isVerbose()) {
      logger.info("ai.daily_quota_history_persisted", { tenantId: resolvedTenantId, day });
    }
  } catch (error) {
    logger.warn("ai.daily_quota_history_persist_failed", {
      tenantId: resolvedTenantId,
      day,
      message: error.message,
    });
  }

  return record;
}

async function getDailyUsageHistory({ tenantId, days = HISTORY_MAX_DAYS } = {}) {
  const resolvedTenantId = tenantId || getTenantContext().tenantId || "legacy";
  const hashKey = buildHistoryHashKey(resolvedTenantId);
  const allEntries = [];

  try {
    const client = getRedis();
    const rawMap = await client.hgetall(hashKey);
    if (rawMap) {
      for (const [, rawValue] of Object.entries(rawMap)) {
        try {
          const parsed = JSON.parse(rawValue);
          if (parsed && parsed.day) {
            allEntries.push(parsed);
          }
        } catch {
          // skip malformed entries
        }
      }
    }
  } catch (error) {
    logger.warn("ai.daily_quota_history_read_failed", {
      tenantId: resolvedTenantId,
      message: error.message,
    });
  }

  const localEntries = [...getLocalHistoryStore(resolvedTenantId).values()];
  return fillHistoryWindow([...allEntries, ...localEntries], days);
}

module.exports = {
  normalizeAiQuotaConfig,
  getEffectiveAiQuotaConfig,
  getDailyAiQuotaSnapshot,
  reserveDailyAiQuota,
  invalidateAiQuotaConfigCache,
  persistDailySnapshotToHistory,
  getDailyUsageHistory,
};
