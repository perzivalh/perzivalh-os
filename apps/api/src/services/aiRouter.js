const logger = require("../lib/logger");
const { normalizeText } = require("../lib/normalize");
const { callAiProvider } = require("./aiProviders");

const DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  gemini: "gemini-flash-latest",
};

const ROUTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["route", "menu", "services", "handoff", "clarify"],
    },
    route_id: { type: "string" },
    question: { type: "string" },
  },
  required: ["action"],
};

const SYMPTOM_KEYWORDS = [
  "dolor",
  "duele",
  "inflamacion",
  "inflamación",
  "hinchado",
  "hinchazon",
  "hinchazón",
  "rojo",
  "rojizo",
  "sangra",
  "sangrado",
  "supura",
  "pus",
  "fiebre",
  "ulcera",
  "úlcera",
];

const ROUTE_STOP_WORDS = new Set([
  "info",
  "informacion",
  "servicio",
  "servicios",
  "tratamiento",
  "tratamientos",
  "tipo",
  "menu",
  "volver",
  "necesito",
  "quiero",
  "saber",
  "mas",
  "porfa",
  "porfavor",
  "hola",
  "ayuda",
  "ayudame",
  "puedo",
  "podria",
  "podrias",
  "donde",
  "cuando",
  "costo",
  "precio",
  "precios",
  "horario",
  "horarios",
  "ubicacion",
  "ubicaciones",
  "central",
  "sucursal",
]);


function normalizeLabel(value) {
  return normalizeText(value || "").replace(/\s+/g, " ").trim();
}

function routeByRules(normalizedMessage, routes) {
  if (!normalizedMessage || !routes?.length) {
    return null;
  }
  let best = null;

  for (const route of routes) {
    const labels = Array.isArray(route.labels) ? route.labels : [];
    for (const label of labels) {
      const normalizedLabel = normalizeLabel(label);
      if (normalizedLabel && normalizedMessage.includes(normalizedLabel)) {
        return route.id;
      }
    }

    const tokens = new Set();
    labels.forEach((label) => {
      normalizeLabel(label)
        .split(" ")
        .filter(Boolean)
        .forEach((token) => tokens.add(token));
    });
    (route.keywords || []).forEach((keyword) => {
      normalizeLabel(keyword)
        .split(" ")
        .filter(Boolean)
        .forEach((token) => tokens.add(token));
    });

    let score = 0;
    tokens.forEach((token) => {
      if (token.length < 4) return;
      if (ROUTE_STOP_WORDS.has(token)) return;
      if (normalizedMessage.includes(token)) {
        score += 1;
      }
    });

    if (score > 0 && (!best || score > best.score)) {
      best = { id: route.id, score };
    }
  }

  return best?.id || null;
}

function buildNodeMap(flow) {
  const map = new Map();
  for (const node of flow.nodes || []) {
    if (node?.id) {
      map.set(node.id, node);
    }
  }
  return map;
}

function summarizeNode(node) {
  const raw = (node?.text || node?.title || "").toString().trim();
  if (!raw) {
    return "";
  }
  const firstLine = raw.split("\n")[0].trim();
  return firstLine.slice(0, 120);
}

function buildRouteCandidates(flow) {
  const nodeMap = buildNodeMap(flow);
  const candidates = new Map();
  const excluded = new Set(
    [flow.ai?.handoff_node_id, "CONTACT_METHOD"].filter(Boolean)
  );

  for (const node of flow.nodes || []) {
    if (!Array.isArray(node?.buttons)) {
      continue;
    }
    for (const btn of node.buttons) {
      const nextId = btn?.next;
      if (!nextId || excluded.has(nextId)) {
        continue;
      }
      const target = nodeMap.get(nextId);
      if (target?.type === "action") {
        continue;
      }
      if (!candidates.has(nextId)) {
        candidates.set(nextId, {
          id: nextId,
          labels: new Set(),
          summary: summarizeNode(target),
          keywords: new Set(
            nextId
              .split("_")
              .map((part) => normalizeLabel(part))
              .filter(Boolean)
          ),
        });
      }
      const entry = candidates.get(nextId);
      if (btn?.label) {
        entry.labels.add(btn.label);
      }
    }
  }

  return Array.from(candidates.values()).map((item) => ({
    id: item.id,
    labels: Array.from(item.labels),
    summary: item.summary,
    keywords: Array.from(item.keywords),
  }));
}

function buildSystemPrompt() {
  return [
    "Eres un enrutador de intenciones para un bot de una clinica podologica.",
    "Tu objetivo es llevar al usuario al flujo correcto con la menor cantidad de mensajes.",
    "Responde SOLO con JSON valido segun el esquema. No agregues texto extra ni explicaciones.",
    "Reglas:",
    "- Si el mensaje describe sintomas, dolor o dudas medicas complejas: action=handoff.",
    "- Si el mensaje esta fuera de tema: action=menu.",
    "- Si hay ambiguedad y necesitas una sola aclaracion corta: action=clarify con question.",
    "- Si no se identifica el servicio: action=services.",
    "- Si se identifica un servicio o tema del flujo: action=route con route_id valido.",
  ].join("\n");
}

function buildUserPrompt({ message, routes, menuId, servicesId, handoffId, previousQuestion }) {
  return JSON.stringify(
    {
      message,
      menu_id: menuId,
      services_id: servicesId,
      handoff_id: handoffId,
      previous_question: previousQuestion || null,
      routes,
    },
    null,
    2
  );
}

function safeJsonParse(raw) {
  if (!raw || typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  const direct = tryParseJson(trimmed);
  if (direct) {
    return direct;
  }
  const withoutFence = stripCodeFence(trimmed);
  if (withoutFence !== trimmed) {
    const fenced = tryParseJson(withoutFence);
    if (fenced) {
      return fenced;
    }
  }
  const extracted = extractFirstJsonObject(trimmed);
  if (extracted) {
    return tryParseJson(extracted);
  }
  return null;
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function stripCodeFence(text) {
  if (!text.startsWith("```")) {
    return text;
  }
  return text.replace(/^```[a-zA-Z0-9]*\n?/, "").replace(/```$/, "").trim();
}

function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return text.slice(start, end + 1);
}
function containsSymptom(normalizedMessage) {
  if (!normalizedMessage) {
    return false;
  }
  return SYMPTOM_KEYWORDS.some((keyword) =>
    normalizedMessage.includes(normalizeLabel(keyword))
  );
}

function fallbackRouteByKeywords(normalizedMessage, routes) {
  if (!normalizedMessage || !routes?.length) {
    return null;
  }
  const messageTokens = new Set(normalizedMessage.split(" ").filter(Boolean));
  let best = null;
  for (const route of routes) {
    const tokens = new Set();
    route.labels?.forEach((label) => {
      normalizeLabel(label)
        .split(" ")
        .filter((t) => t.length > 2)
        .forEach((t) => tokens.add(t));
    });
    route.keywords?.forEach((kw) => {
      normalizeLabel(kw)
        .split(" ")
        .filter((t) => t.length > 2)
        .forEach((t) => tokens.add(t));
    });
    let score = 0;
    tokens.forEach((token) => {
      if (messageTokens.has(token)) {
        score += 1;
      }
    });
    if (score > 0 && (!best || score > best.score)) {
      best = { id: route.id, score };
    }
  }
  return best?.id || null;
}

async function routeWithAI({ text, flow, config, session }) {
  const aiConfig = config?.ai || {};
  const aiFlow = flow.ai || {};

  if (!aiFlow.enabled) {
    logger.info("ai.router_skipped", {
      reason: "disabled",
      flowId: flow?.id,
    });
    return null;
  }

  const provider = aiConfig.provider || aiFlow.provider || "openai";
  const rawKey =
    aiConfig.key ||
    aiConfig.api_key ||
    (provider === "gemini"
      ? process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
      : process.env.OPENAI_API_KEY);
  const apiKey = rawKey ? String(rawKey).trim() : "";
  const allowFallback = aiFlow.allow_fallback !== false;

  const maxTurns = Number(aiFlow.max_turns || 2);
  const usedTurns = Number(session?.data?.ai_turns || 0);
  if (usedTurns >= maxTurns) {
    return { action: "menu", ai_used: false };
  }

  const routes = buildRouteCandidates(flow);
  if (!routes.length) {
    return { action: "menu" };
  }

  const normalizedMessage = normalizeLabel(text);
  const pendingQuestion = session?.data?.ai_pending?.question || null;
  const allowClarify = !pendingQuestion;
  if (containsSymptom(normalizedMessage)) {
    return { action: "handoff", ai_used: false };
  }

  const ruleRoute = routeByRules(normalizedMessage, routes);
  if (ruleRoute) {
    logger.info("ai.router_rule_match", {
      route_id: ruleRoute,
      flowId: flow?.id,
    });
    return { action: "route", route_id: ruleRoute, ai_used: false, clear_pending: Boolean(pendingQuestion) };
  }

  if (!apiKey) {
    logger.warn("ai.router_skipped", {
      reason: "missing_key",
      provider,
      flowId: flow?.id,
    });
    if (allowFallback) {
      const fallbackRoute = fallbackRouteByKeywords(normalizedMessage, routes);
      if (fallbackRoute) {
        return { action: "route", route_id: fallbackRoute, ai_used: false };
      }
      return { action: "menu", ai_used: false };
    }
    return null;
  }

  const menuId = flow.start_node_id || flow.start || "MAIN_MENU";
  const servicesId = aiFlow.services_node_id || "SERVICIOS_MENU";
  const handoffId = aiFlow.handoff_node_id || "AI_HANDOFF_OFFER";

  const system = buildSystemPrompt();
  const user = buildUserPrompt({
    message: text,
    routes,
    menuId,
    servicesId,
    handoffId,
    previousQuestion: pendingQuestion,
  });

  const model = aiConfig.model || DEFAULT_MODELS[provider] || "gpt-4o-mini";
  logger.info("ai.router_request", {
    provider,
    model,
    flowId: flow?.id,
  });

  try {
    const raw = await callAiProvider(provider, {
      apiKey,
      model,
      system,
      user,
      schema: ROUTER_SCHEMA,
      temperature: 0,
      maxTokens: 200,
    });
    logger.info("ai.router_raw", {
      provider,
      model,
      length: typeof raw === "string" ? raw.length : 0,
    });
    const parsed = safeJsonParse(raw);
    if (!parsed?.action) {
      logger.warn("ai.router_invalid", {
        provider,
        model,
        preview: typeof raw === "string" ? raw.slice(0, 160) : "",
      });
      const fallbackRoute = fallbackRouteByKeywords(normalizedMessage, routes);
      if (allowFallback && fallbackRoute) {
        return { action: "route", route_id: fallbackRoute, ai_used: false };
      }
      return null;
    }

    if (parsed.action === "clarify") {
      if (!allowClarify) {
        return null;
      }
      const question = String(parsed.question || "").trim();
      if (!question) {
        return null;
      }
      logger.info("ai.router_decision", {
        provider,
        model,
        action: parsed.action,
      });
      return { action: "clarify", question: question.slice(0, 280), ai_used: true };
    }

    logger.info("ai.router_decision", {
      provider,
      model,
      action: parsed.action,
      route_id: parsed.route_id || null,
    });
    return { ...parsed, ai_used: true, clear_pending: Boolean(pendingQuestion) };
  } catch (error) {
    logger.error("ai.router_failed", {
      message: error.message,
      provider,
      model,
    });
    if (allowFallback) {
      const fallbackRoute = fallbackRouteByKeywords(normalizedMessage, routes);
      if (fallbackRoute) {
        return { action: "route", route_id: fallbackRoute, ai_used: false };
      }
    }
    return null;
  }
}

module.exports = {
  routeWithAI,
  buildRouteCandidates,
};
