const logger = require("../lib/logger");

const DEFAULT_WINDOW_MS = 60_000;
const BUDGET_WINDOWS = new Map();

const BUILTIN_PROVIDER_LIMITS = {
  groq: { tpm: 6000, rpm: null },
  cerebras: { tpm: 60000, rpm: 30 },
};

const BUILTIN_MODEL_LIMITS = {
  "cerebras/llama3.1-8b": { tpm: 60000, rpm: 30 },
  "cerebras/gpt-oss-120b": { tpm: 64000, rpm: 30 },
};

function normalizeProviderName(provider) {
  const normalized = String(provider || "").toLowerCase().trim();
  if (normalized === "cloudflare-workers-ai" || normalized === "workers-ai") return "cloudflare";
  return normalized || "openai";
}

function isEnabled() {
  // Default OFF so token/rate budgets are opt-in during measurement runs.
  const raw = String(process.env.AI_BUDGET_ENABLED || "false").toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off");
}

function isVerbose() {
  const raw = String(process.env.AI_BUDGET_VERBOSE || "false").toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

function getWindowMs() {
  const value = Number(process.env.AI_BUDGET_WINDOW_MS || DEFAULT_WINDOW_MS);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_WINDOW_MS;
}

function toPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseLimitEntries(raw) {
  const out = new Map();
  const value = String(raw || "").trim();
  if (!value) return out;

  for (const part of value.split(/[,\n;]/)) {
    const entry = String(part || "").trim();
    if (!entry) continue;
    const eqIdx = entry.indexOf("=");
    if (eqIdx === -1) continue;

    const keyRaw = entry.slice(0, eqIdx).trim();
    const valRaw = entry.slice(eqIdx + 1).trim();
    const limitValue = toPositiveNumber(valRaw);
    if (!keyRaw || !limitValue) continue;

    const keyNorm = keyRaw
      .toLowerCase()
      .replace(/^cloudflare-workers-ai$/, "cloudflare")
      .replace(/^workers-ai$/, "cloudflare");
    out.set(keyNorm, limitValue);
  }
  return out;
}

function getParsedLimitMap(kind) {
  if (kind === "tpm") return parseLimitEntries(process.env.AI_TPM_LIMITS);
  return parseLimitEntries(process.env.AI_RPM_LIMITS);
}

function resolveEnvSpecificLimit(kind, provider, model, exactOnly = false) {
  const envMap = getParsedLimitMap(kind);
  const normalizedProvider = normalizeProviderName(provider);
  const normalizedModel = String(model || "").trim().toLowerCase();

  if (normalizedModel) {
    const exactSlash = `${normalizedProvider}/${normalizedModel}`;
    const exactColon = `${normalizedProvider}:${normalizedModel}`;
    if (envMap.has(exactSlash)) return envMap.get(exactSlash);
    if (envMap.has(exactColon)) return envMap.get(exactColon);
  }
  if (exactOnly) return null;
  if (envMap.has(normalizedProvider)) return envMap.get(normalizedProvider);

  const providerEnvPrefix = normalizedProvider.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const directEnv = process.env[`${providerEnvPrefix}_${kind.toUpperCase()}_LIMIT`];
  return toPositiveNumber(directEnv);
}

function resolveBuiltinLimit(kind, provider, model, exactOnly = false) {
  const normalizedProvider = normalizeProviderName(provider);
  const normalizedModel = String(model || "").trim().toLowerCase();
  if (normalizedModel) {
    const exact = BUILTIN_MODEL_LIMITS[`${normalizedProvider}/${normalizedModel}`];
    if (exact && toPositiveNumber(exact[kind])) return toPositiveNumber(exact[kind]);
  }
  if (exactOnly) return null;
  const providerLimit = BUILTIN_PROVIDER_LIMITS[normalizedProvider];
  return toPositiveNumber(providerLimit?.[kind]);
}

function resolveLimit(kind, provider, model, exactOnly = false) {
  const envLimit = resolveEnvSpecificLimit(kind, provider, model, exactOnly);
  if (envLimit) return envLimit;
  return resolveBuiltinLimit(kind, provider, model, exactOnly);
}

function createBucketKey(provider, model) {
  const p = normalizeProviderName(provider);
  const m = model ? String(model).trim().toLowerCase() : "*";
  return `${p}|${m}`;
}

function getBucket(bucketKey) {
  let bucket = BUDGET_WINDOWS.get(bucketKey);
  if (!bucket) {
    bucket = { events: [] };
    BUDGET_WINDOWS.set(bucketKey, bucket);
  }
  return bucket;
}

function pruneBucket(bucket, now, windowMs) {
  if (!bucket?.events?.length) return;
  const threshold = now - windowMs;
  while (bucket.events.length && bucket.events[0].at <= threshold) {
    bucket.events.shift();
  }
}

function getBucketTotals(bucket) {
  let requests = 0;
  let tokens = 0;
  for (const event of bucket?.events || []) {
    requests += Number(event.requests || 0);
    tokens += Number(event.tokens || 0);
  }
  return { requests, tokens };
}

function buildBudgetBuckets(provider, model) {
  const normalizedProvider = normalizeProviderName(provider);
  const normalizedModel = String(model || "").trim().toLowerCase();

  const exactLimits = normalizedModel
    ? {
        tpm: resolveLimit("tpm", normalizedProvider, normalizedModel, true),
        rpm: resolveLimit("rpm", normalizedProvider, normalizedModel, true),
      }
    : { tpm: null, rpm: null };

  const providerLimits = {
    tpm: resolveLimit("tpm", normalizedProvider, null, false),
    rpm: resolveLimit("rpm", normalizedProvider, null, false),
  };

  const buckets = [];
  if (providerLimits.tpm || providerLimits.rpm) {
    buckets.push({
      key: createBucketKey(normalizedProvider, null),
      scope: "provider",
      provider: normalizedProvider,
      model: null,
      limits: providerLimits,
    });
  }
  if (normalizedModel && (exactLimits.tpm || exactLimits.rpm)) {
    buckets.push({
      key: createBucketKey(normalizedProvider, normalizedModel),
      scope: "model",
      provider: normalizedProvider,
      model: normalizedModel,
      limits: exactLimits,
    });
  }
  return buckets;
}

function estimateReservedTokens({ inputTokensEst, maxTokens }) {
  const input = Math.max(0, Number(inputTokensEst || 0));
  const maxOut = Math.max(0, Number(maxTokens || 0));
  const outputFactor = Number(process.env.AI_BUDGET_OUTPUT_RESERVE_FACTOR || 1);
  const safeFactor = Number.isFinite(outputFactor) && outputFactor > 0 ? outputFactor : 1;
  return Math.ceil(input + (maxOut * safeFactor));
}

function createBudgetError({
  provider,
  model,
  scope,
  reason,
  currentRequests,
  currentTokens,
  requestLimit,
  tokenLimit,
  reserveTokens,
  windowMs,
}) {
  const err = new Error(
    `AI budget rate limit exceeded (429): provider=${provider} model=${model || "-"} scope=${scope} reason=${reason}` +
      ` current_rpm=${currentRequests} limit_rpm=${requestLimit || "none"}` +
      ` current_tpm=${currentTokens} limit_tpm=${tokenLimit || "none"}` +
      ` reserve_tokens=${reserveTokens} window_ms=${windowMs}`
  );
  err.status = 429;
  err.code = "AI_BUDGET_EXCEEDED";
  err.kind = "budget";
  return err;
}

function reserveAiBudget({ provider, model, inputTokensEst, maxTokens, trace }) {
  if (!isEnabled()) return { reserved: false, reserveTokens: 0 };

  const buckets = buildBudgetBuckets(provider, model);
  if (!buckets.length) return { reserved: false, reserveTokens: 0 };

  const now = Date.now();
  const windowMs = getWindowMs();
  const reserveTokens = estimateReservedTokens({ inputTokensEst, maxTokens });
  const reserveRequests = 1;

  const prepared = [];
  for (const spec of buckets) {
    const bucket = getBucket(spec.key);
    pruneBucket(bucket, now, windowMs);
    const totals = getBucketTotals(bucket);
    const nextRequests = totals.requests + reserveRequests;
    const nextTokens = totals.tokens + reserveTokens;

    const exceedsRpm = spec.limits.rpm && nextRequests > spec.limits.rpm;
    const exceedsTpm = spec.limits.tpm && nextTokens > spec.limits.tpm;
    if (exceedsRpm || exceedsTpm) {
      const reason = exceedsRpm ? "rpm" : "tpm";
      logger.warn("ai.budget_exceeded", {
        provider: spec.provider,
        model: spec.model || model || null,
        scope: spec.scope,
        reason,
        reserveTokens,
        reserveRequests,
        currentRequests: totals.requests,
        currentTokens: totals.tokens,
        limitRpm: spec.limits.rpm || null,
        limitTpm: spec.limits.tpm || null,
        windowMs,
        ...(trace && typeof trace === "object" ? trace : {}),
      });
      throw createBudgetError({
        provider: spec.provider,
        model: spec.model || model,
        scope: spec.scope,
        reason,
        currentRequests: totals.requests,
        currentTokens: totals.tokens,
        requestLimit: spec.limits.rpm,
        tokenLimit: spec.limits.tpm,
        reserveTokens,
        windowMs,
      });
    }

    prepared.push({ spec, bucket, totals });
  }

  for (const item of prepared) {
    item.bucket.events.push({
      at: now,
      requests: reserveRequests,
      tokens: reserveTokens,
      source: "reservation_estimate",
    });
  }

  if (isVerbose()) {
    logger.info("ai.budget_reserved", {
      provider: normalizeProviderName(provider),
      model: model || null,
      reserveTokens,
      reserveRequests,
      bucketScopes: prepared.map((p) => p.spec.scope),
      windowMs,
      ...(trace && typeof trace === "object" ? trace : {}),
    });
  }

  return { reserved: true, reserveTokens, reserveRequests, windowMs };
}

module.exports = {
  reserveAiBudget,
};
