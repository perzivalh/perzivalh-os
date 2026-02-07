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
      enum: ["route", "menu", "services", "handoff", "clarify", "out_of_scope"],
    },
    route_id: { type: "string" },
    question: { type: "string" },
    reply_text: { type: "string" },
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

/**
 * Direct keyword to node mapping for fast rule-based routing
 * Keys are normalized (lowercase, no accents). Values are node IDs.
 */
const SERVICE_KEYWORDS = {
  // Uñero keywords
  unero: "UNERO_TIPO_TRAT",
  uñero: "UNERO_TIPO_TRAT",
  una: "UNERO_TIPO_TRAT",
  unas: "UNERO_TIPO_TRAT",
  uña: "UNERO_TIPO_TRAT",
  uñas: "UNERO_TIPO_TRAT",
  encarnada: "UNERO_TIPO_TRAT",
  encarnado: "UNERO_TIPO_TRAT",
  matricectomia: "TRAT_MATRICECTOMIA_INFO",
  ortesis: "TRAT_ORTESIS_INFO",

  // Hongos keywords
  hongo: "HONGOS_TIPO_TRAT",
  hongos: "HONGOS_TIPO_TRAT",
  onicomicosis: "HONGOS_TIPO_TRAT",
  laser: "TRAT_Láser_INFO",
  topico: "TRAT_Tópico_INFO",
  sistemico: "TRAT_Sistémico_INFO",

  // Pedicure keywords
  pedicure: "SVC_PEDICURE_INFO",
  pedicura: "SVC_PEDICURE_INFO",
  "pedicure clinico": "SVC_PEDICURE_INFO",
  "pedicura clinica": "SVC_PEDICURE_INFO",

  // Podopediatría
  podopediatria: "SVC_PODOPEDIATRIA_INFO",
  pediatria: "SVC_PODOPEDIATRIA_INFO",
  nino: "SVC_PODOPEDIATRIA_INFO",
  ninos: "SVC_PODOPEDIATRIA_INFO",
  niño: "SVC_PODOPEDIATRIA_INFO",
  niños: "SVC_PODOPEDIATRIA_INFO",
  bebe: "SVC_PODOPEDIATRIA_INFO",

  // Podogeriatría
  podogeriatria: "SVC_PODOGERIATRIA_INFO",
  geriatria: "SVC_PODOGERIATRIA_INFO",
  adulto: "SVC_PODOGERIATRIA_INFO",
  "adulto mayor": "SVC_PODOGERIATRIA_INFO",
  abuelo: "SVC_PODOGERIATRIA_INFO",
  abuela: "SVC_PODOGERIATRIA_INFO",
  tercera: "SVC_PODOGERIATRIA_INFO",

  // Otros servicios
  callosidad: "OTR_CALLOSIDAD_INFO",
  callo: "OTR_CALLOSIDAD_INFO",
  callos: "OTR_CALLOSIDAD_INFO",
  verruga: "OTR_VERRUGA_PLANTAR_INFO",
  verrugas: "OTR_VERRUGA_PLANTAR_INFO",
  plantar: "OTR_VERRUGA_PLANTAR_INFO",
  heloma: "OTR_HELOMA_INFO",
  helomas: "OTR_HELOMA_INFO",
  extraccion: "OTR_EXTRACCION_UNA_INFO",
  "pie de atleta": "OTR_PIE_ATLETA_INFO",
  "pie atleta": "OTR_PIE_ATLETA_INFO",
  atleta: "OTR_PIE_ATLETA_INFO",
  diabetico: "OTR_PIE_DIABETICO_INFO",
  diabética: "OTR_PIE_DIABETICO_INFO",
  diabetes: "OTR_PIE_DIABETICO_INFO",
  "pie diabetico": "OTR_PIE_DIABETICO_INFO",

  // Info general
  horario: "HORARIOS_INFO",
  horarios: "HORARIOS_INFO",
  ubicacion: "HORARIOS_INFO",
  direccion: "HORARIOS_INFO",
  donde: "HORARIOS_INFO",
  precio: "PRECIOS_INFO",
  precios: "PRECIOS_INFO",
  costo: "PRECIOS_INFO",
  costos: "PRECIOS_INFO",
  cuanto: "PRECIOS_INFO",
  tarifa: "PRECIOS_INFO",
};

/**
 * Route by direct service keyword match
 * Returns node ID if a keyword matches, null otherwise
 */
function routeByServiceKeywords(normalizedMessage) {
  if (!normalizedMessage) {
    return null;
  }

  // Check multi-word phrases first (longer matches take priority)
  const phrases = Object.keys(SERVICE_KEYWORDS).filter(k => k.includes(" "));
  for (const phrase of phrases) {
    if (normalizedMessage.includes(phrase)) {
      return SERVICE_KEYWORDS[phrase];
    }
  }

  // Check single words
  const words = normalizedMessage.split(/\s+/).filter(Boolean);
  for (const word of words) {
    if (SERVICE_KEYWORDS[word]) {
      return SERVICE_KEYWORDS[word];
    }
  }

  return null;
}



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
  return `Eres PODITO 🤖, el asistente virtual de PODOPIE, una clínica podológica en Santa Cruz, Bolivia.

PERSONALIDAD:
- Amable, cálido y profesional
- Usas emojis moderadamente 🦶✨
- Respuestas cortas y directas (máximo 2 oraciones)
- Hablas español boliviano casual pero respetuoso

SERVICIOS QUE OFRECEMOS:
- Uñeros (extracción, matricectomía, ortesis)
- Hongos/Onicomicosis (tópico, láser, sistémico)
- Pedicure clínico
- Podopediatría (niños)
- Podogeriatría (adultos mayores)
- Pie diabético
- Pie de atleta
- Callosidades, helomas, verrugas plantares
- Extracción de uñas

IMPORTANTE: Solo trabajamos con PIES. No hacemos manos, uñas de manos, ni servicios estéticos.

RESPONDE EN JSON CON:
{
  "action": "route|services|handoff|clarify|out_of_scope",
  "route_id": "ID_DEL_NODO (solo si action=route)",
  "reply_text": "Tu respuesta conversacional SIEMPRE (obligatorio)",
  "question": "Pregunta de clarificación (solo si action=clarify)"
}

REGLAS:
1. SIEMPRE incluye reply_text con una respuesta natural y cálida
2. Si identificas el servicio claramente → action=route + route_id + reply_text amigable
3. Si el usuario tiene síntomas/dolor/urgencia → action=handoff + reply_text empático
4. Si necesitas clarificar (máximo 1 vez) → action=clarify + question específica
5. Si el tema está FUERA de podología (manos, belleza, otros) → action=out_of_scope + reply_text explicando amablemente que solo hacemos pies
6. Si no identificas servicio pero es de pies → action=services + reply_text invitando a ver opciones
7. NUNCA repitas la misma pregunta que ya hiciste antes (previous_question)`;
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

  // First try direct service keyword match (fastest path)
  const keywordRoute = routeByServiceKeywords(normalizedMessage);
  if (keywordRoute) {
    logger.info("ai.router_keyword_match", {
      route_id: keywordRoute,
      flowId: flow?.id,
    });
    return { action: "route", route_id: keywordRoute, ai_used: false, clear_pending: Boolean(pendingQuestion) };
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
    let parsed = safeJsonParse(raw);
    if (!parsed?.action) {
      logger.warn("ai.router_invalid", {
        provider,
        model,
        preview: typeof raw === "string" ? raw.slice(0, 160) : "",
      });

      // One retry with stricter instruction to return pure JSON.
      const retrySystem = `${system}\n\nDevuelve SOLO un objeto JSON válido. No escribas texto adicional.`;
      try {
        const retryRaw = await callAiProvider(provider, {
          apiKey,
          model,
          system: retrySystem,
          user,
          schema: ROUTER_SCHEMA,
          temperature: 0,
          maxTokens: 200,
        });
        logger.info("ai.router_retry_raw", {
          provider,
          model,
          length: typeof retryRaw === "string" ? retryRaw.length : 0,
        });
        parsed = safeJsonParse(retryRaw);
      } catch (retryError) {
        logger.warn("ai.router_retry_failed", {
          provider,
          model,
          message: retryError.message,
        });
      }
    }

    if (!parsed?.action) {
      if (allowFallback) {
        const fallbackRoute = fallbackRouteByKeywords(normalizedMessage, routes);
        if (fallbackRoute) {
          return { action: "route", route_id: fallbackRoute, ai_used: false };
        }
        return { action: "menu", ai_used: false };
      }
      // As a last resort, ask a short clarification once.
      if (allowClarify) {
        return {
          action: "clarify",
          question:
            "¿Qué servicio te interesa? Puedo ayudarte con uñeros, hongos, pedicure, horarios o precios.",
          ai_used: false,
        };
      }
      return { action: "services", ai_used: false };
    }

    if (parsed.action === "clarify") {
      if (!allowClarify) {
        // Already asked a clarification, go to services menu instead
        return { action: "services", ai_used: false };
      }
      const question = String(parsed.question || "").trim();
      if (!question) {
        return { action: "services", ai_used: false };
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
    // Always return something - go to services menu as last resort
    return { action: "services", ai_used: false };
  }
}

module.exports = {
  routeWithAI,
  buildRouteCandidates,
};
