/**
 * aiRouterUtils.js — Pure utilities, no business logic
 */
const { normalizeText } = require("../lib/normalize");

const DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  gemini: "gemini-2.5-flash",
  cloudflare: "@cf/meta/llama-3-8b-instruct",
  groq: "llama-3.1-8b-instant",
  cerebras: "llama3.1-8b",
};

const ROUTER_ACTIONS = ["respond", "route", "handoff", "clarify", "show_services", "menu", "out_of_scope", "services"];

// Schema para respuestas de la IA
const ROUTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ROUTER_ACTIONS,
    },
    text: { type: "string" },           // Respuesta conversacional
    route_id: { type: "string" },       // Nodo destino si action=route
    question: { type: "string" },       // Pregunta si action=clarify
    reason: { type: "string" },         // Razón interna (debug)
  },
  required: ["action"],
};

const ROUTER_DECISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ROUTER_ACTIONS,
    },
    route_id: { type: "string" },
    question: { type: "string" },
    reason: { type: "string" },
  },
  required: ["action"],
};

const DEFAULT_PRICE_QUALIFIER_PHRASES = [
  "precio",
  "precios",
  "costo",
  "costos",
  "tarifa",
  "tarifas",
  "cuanto cuesta",
  "cuanto vale",
  "cuanto cobran",
  "valor",
  "costo aproximado",
  "precio aproximado",
];
const DEFAULT_WALK_IN_ATTENTION_PHRASES = [
  "ficha",
  "sacar ficha",
  "hacerse atender",
  "hacerme atender",
  "para hacerse atender",
  "cita",
  "citas",
  "sacar cita",
  "agendar",
  "agenda",
  "agendar cita",
  "agendar una cita",
  "turno",
  "turnos",
  "sacar turno",
  "reservar",
  "reserva",
  "reservar cita",
  "reservar turno",
];
const GENERIC_ROUTE_IDS = new Set([
  "MAIN_MENU",
  "PRECIOS_INFO",
  "HORARIOS_INFO",
  "CONTACT_METHOD",
  "SERVICIOS_MENU",
  "AI_HANDOFF_OFFER",
  "OUT_OF_SCOPE",
]);

// In-memory cache to avoid repeating expensive router/copy calls for the same message context.
const ROUTER_DECISION_CACHE = new Map();
const ROUTER_CACHE_TTL_MS = Number(process.env.AI_ROUTER_CACHE_TTL_MS || 10 * 60 * 1000);
const ROUTER_CACHE_MAX_ENTRIES = Number(process.env.AI_ROUTER_CACHE_MAX_ENTRIES || 500);

/**
 * Safe JSON parsing with fallbacks
 */
function safeJsonParse(text) {
  if (!text || typeof text !== "string") return null;

  // Clean markdown code blocks
  let cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch {
    // Extract JSON object
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function parseLooseRouterResponse(text) {
  if (!text || typeof text !== "string") return null;

  const plain = String(text)
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .replace(/\*\*/g, "")
    .replace(/\r/g, "")
    .trim();

  if (!plain) return null;

  const normalizeLooseKey = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, "_");

  const toCanonicalLooseKey = (value) => {
    const normalized = normalizeLooseKey(value);
    if (normalized === "accion" || normalized === "action") return "action";
    if (normalized === "texto" || normalized === "text") return "text";
    if (normalized === "pregunta" || normalized === "question") return "question";
    if (normalized === "razon" || normalized === "reason") return "reason";
    if (
      normalized === "ruta" ||
      normalized === "route" ||
      normalized === "route_id" ||
      normalized === "ruta_id"
    ) {
      return "route_id";
    }
    return normalized;
  };

  const fieldMatches = [];
  const fieldRegex = /(?:^|\n)\s*#*\s*(action|acci[oó]n|text|texto|route[_ ]?id|ruta(?:[_ ]?id)?|pregunta|question|raz[oó]n|reason)\s*:\s*/gi;
  let match;
  while ((match = fieldRegex.exec(plain))) {
    fieldMatches.push({
      key: toCanonicalLooseKey(match[1]),
      start: match.index,
      valueStart: fieldRegex.lastIndex,
    });
  }

  if (!fieldMatches.length) {
    const lines = plain
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return null;

      const firstLine = lines[0]
        .toLowerCase()
        .replace(/^[:\-\s]+/, "")
        .replace(/[^\w\s]/g, " ")
        .trim();
    const firstToken = firstLine.split(/\s+/)[0];
    const validActions = new Set(["respond", "route", "handoff", "clarify", "show_services"]);

    if (validActions.has(firstToken)) {
      const remainingText = lines.slice(1).join("\n").trim();
      return {
        action: firstToken,
        ...(remainingText ? { text: remainingText } : {}),
      };
    }

    return null;
  }

  const parsed = {};
  for (let i = 0; i < fieldMatches.length; i++) {
    const current = fieldMatches[i];
    const next = fieldMatches[i + 1];
    const rawValue = plain
      .slice(current.valueStart, next ? next.start : plain.length)
      .trim()
      .replace(/^[-–—]\s*/, "")
      .replace(/^["'`]+/, "")
      .replace(/["'`]+$/, "")
      .trim();

    const key = current.key === "route_id" ? "route_id" : current.key;
    if (!rawValue) continue;

    if (key === "action") {
      parsed.action = rawValue
        .toLowerCase()
        .replace(/[^a-z_]/g, " ")
        .trim()
        .split(/\s+/)[0];
      continue;
    }

    if (key === "route_id") {
      parsed.route_id = rawValue.split(/\s+/)[0].replace(/[^A-Za-z0-9_-]/g, "");
      continue;
    }

    parsed[key] = rawValue;
  }

  if (!parsed.action) return null;
  return parsed;
}

function parseRouterResponse(text) {
  return safeJsonParse(text) || parseLooseRouterResponse(text);
}

function normalizeRouterAction(action) {
  const normalized = String(action || "").toLowerCase().trim();
  if (!normalized) return null;
  if (normalized === "services") return "show_services";
  return normalized;
}

function isCloudflareProvider(provider) {
  const normalized = String(provider || "").toLowerCase();
  return normalized === "cloudflare" || normalized === "cloudflare-workers-ai" || normalized === "workers-ai";
}

function withChatBudget(options, chatBudget) {
  if (!chatBudget?.waId) {
    return options;
  }
  return {
    ...options,
    chatBudget,
  };
}

function cloneAiDecision(decision) {
  if (!decision || typeof decision !== "object") return null;
  return {
    ...decision,
    services_discussed: Array.isArray(decision.services_discussed)
      ? [...decision.services_discussed]
      : decision.services_discussed,
  };
}

function cleanupRouterDecisionCache(now = Date.now()) {
  for (const [key, entry] of ROUTER_DECISION_CACHE.entries()) {
    if (!entry || entry.expiresAt <= now) ROUTER_DECISION_CACHE.delete(key);
  }
  if (ROUTER_DECISION_CACHE.size <= ROUTER_CACHE_MAX_ENTRIES) return;
  const sorted = [...ROUTER_DECISION_CACHE.entries()].sort((a, b) => (a[1]?.at || 0) - (b[1]?.at || 0));
  const deleteCount = ROUTER_DECISION_CACHE.size - ROUTER_CACHE_MAX_ENTRIES;
  for (let i = 0; i < deleteCount; i++) {
    ROUTER_DECISION_CACHE.delete(sorted[i][0]);
  }
}

function buildRouterCacheKey({ flowId, provider, model, text, summary, previousQuestion, session }) {
  const normalized = normalizeText(text || "").toLowerCase().trim();
  if (!normalized) return null;
  const currentNode = summary?.currentNode || session?.data?.current_node_id || session?.state || "";
  return [
    "v2",
    flowId || "",
    provider || "",
    model || "",
    currentNode,
    previousQuestion ? "pending:1" : "pending:0",
    `clarify:${Number(summary?.clarificationsAsked || 0)}`,
    normalized,
  ].join("|");
}

function getRouterDecisionFromCache(cacheKey) {
  if (!cacheKey) return null;
  const entry = ROUTER_DECISION_CACHE.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    ROUTER_DECISION_CACHE.delete(cacheKey);
    return null;
  }
  const logger = require("../lib/logger");
  logger.info("ai.router_cache_hit", {
    action: entry.value?.action || null,
    route_id: entry.value?.route_id || null,
  });
  return cloneAiDecision(entry.value);
}

function setRouterDecisionCache(cacheKey, decision) {
  if (!cacheKey || !decision?.action) return;
  if (decision.action === "clarify") return;
  const now = Date.now();
  cleanupRouterDecisionCache(now);
  ROUTER_DECISION_CACHE.set(cacheKey, {
    at: now,
    expiresAt: now + ROUTER_CACHE_TTL_MS,
    value: cloneAiDecision(decision),
  });
}

function tokenizeDomainText(text) {
  return normalizeText(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function escapeRegexLiteral(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesWholePhrase(normalizedText, phrase) {
  const text = String(normalizedText || "").trim();
  const p = normalizeText(phrase || "").toLowerCase().trim();
  if (!text || !p) return false;
  const pattern = "(^|\\b)" + escapeRegexLiteral(p).replace(/\s+/g, "\\s+") + "(\\b|$)";
  try {
    return new RegExp(pattern, "i").test(text);
  } catch (_) {
    return text.includes(p);
  }
}

function stripLeadingSoftConnector(normalizedText) {
  return String(normalizedText || "")
    .replace(/^(y|ademas|tambien|pero)\s+/i, "")
    .trim();
}

function getConfiguredPhrases(flowAi, key, defaults) {
  const configured = flowAi?.[key];
  return Array.isArray(configured) && configured.length ? configured : defaults;
}

function findBestPhraseMatch(normalizedText, phrases) {
  const normalized = String(normalizedText || "").trim();
  if (!normalized || !Array.isArray(phrases) || phrases.length === 0) {
    return null;
  }

  let best = null;
  for (const phrase of phrases) {
    if (!includesWholePhrase(normalized, phrase)) continue;
    const normalizedPhrase = normalizeText(phrase).toLowerCase().trim();
    const score = normalizedPhrase.length * 10;
    if (!best || score > best.score) {
      best = {
        phrase: normalizedPhrase,
        score,
      };
    }
  }
  return best;
}

function isSpecificServiceRouteId(routeId) {
  return Boolean(routeId) && !GENERIC_ROUTE_IDS.has(String(routeId).trim());
}

function estimateTokensApproxFromText(text) {
  const str = String(text || "");
  if (!str) return 0;
  return Math.max(1, Math.ceil(str.length / 4));
}

function buildCompactRouteUserPrompt({ message, summary, previousQuestion, session }) {
  const parts = [];
  const currentNode = summary?.currentNode || session?.data?.current_node_id || session?.state || null;
  if (currentNode) parts.push(`[nodo_actual]: ${currentNode}`);
  if (previousQuestion) parts.push(`[pregunta_anterior_no_repetir]: ${previousQuestion}`);
  if (summary?.clarificationsAsked > 0) parts.push(`[clarificaciones_previas]: ${summary.clarificationsAsked}`);
  if (summary?.lastUserMessage && summary.lastUserMessage !== message) {
    parts.push(`[ultimo_mensaje_usuario]: ${summary.lastUserMessage}`);
  }
  if (Array.isArray(summary?.servicesDiscussed) && summary.servicesDiscussed.length) {
    parts.push(`[servicios_ya_mencionados]: ${summary.servicesDiscussed.slice(-3).join(", ")}`);
  }
  parts.push(`[mensaje]: ${message}`);
  return parts.join("\n");
}

module.exports = {
  normalizeText,
  DEFAULT_MODELS,
  ROUTER_ACTIONS,
  ROUTER_SCHEMA,
  ROUTER_DECISION_SCHEMA,
  DEFAULT_PRICE_QUALIFIER_PHRASES,
  DEFAULT_WALK_IN_ATTENTION_PHRASES,
  GENERIC_ROUTE_IDS,
  ROUTER_DECISION_CACHE,
  ROUTER_CACHE_TTL_MS,
  ROUTER_CACHE_MAX_ENTRIES,
  safeJsonParse,
  parseLooseRouterResponse,
  parseRouterResponse,
  normalizeRouterAction,
  isCloudflareProvider,
  withChatBudget,
  cloneAiDecision,
  cleanupRouterDecisionCache,
  buildRouterCacheKey,
  getRouterDecisionFromCache,
  setRouterDecisionCache,
  tokenizeDomainText,
  escapeRegexLiteral,
  includesWholePhrase,
  stripLeadingSoftConnector,
  getConfiguredPhrases,
  findBestPhraseMatch,
  isSpecificServiceRouteId,
  estimateTokensApproxFromText,
  buildCompactRouteUserPrompt,
};
