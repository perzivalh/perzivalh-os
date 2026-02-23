/**
 * AI Router - AI-First Architecture
 * 
 * La IA es el CEREBRO PRINCIPAL del bot.
 * Procesa TODOS los mensajes con contexto completo.
 * Keywords solo como fallback si la IA falla.
 */
const logger = require("../lib/logger");
const { normalizeText } = require("../lib/normalize");
const { callAiProvider } = require("./aiProviders");
const { getHistoryForAI, getConversationSummary } = require("./conversationMemory");

const DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  gemini: "gemini-2.5-flash",
  cloudflare: "@cf/meta/llama-3-8b-instruct",
  groq: "llama-3.1-8b-instant",
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

// Palabras de urgencia que requieren handoff inmediato
const URGENCY_WORDS = [
  "dolor intenso", "dolor fuerte", "mucho dolor", "me duele mucho",
  "sangrado", "sangra", "sangrando",
  "pus", "supura", "infectado", "infección",
  "fiebre", "calentura",
  "hinchado", "muy inflamado",
  "no puedo caminar", "urgente", "emergencia",
  "úlcera", "ulcera", "herida abierta",
];

const PODIATRY_CONTEXT_WORDS = [
  "pie", "pies", "dedo del pie", "dedos del pie", "talon", "talón", "planta",
  "uña", "uñas", "uñero", "unero", "encarnada", "juanete", "callo", "callos",
  "heloma", "hongo", "hongos", "onicomicosis", "pedicure", "podologia", "podología",
  "podopediatria", "podopediatría", "podogeriatria", "podogeriatría", "tobillo",
];

/**
 * Load knowledge base for a flow
 */
function loadKnowledgeBase(flowId) {
  try {
    // Try to load flow-specific knowledge
    const knowledgePath = `../../flows/knowledge/${flowId.replace("botpodito", "podopie")}.knowledge.js`;
    return require(knowledgePath);
  } catch {
    // Fallback to default PODOPIE knowledge
    try {
      return require("../../flows/knowledge/podopie.knowledge.js");
    } catch {
      return null;
    }
  }
}

/**
 * Check for urgency keywords
 */
function detectUrgency(text) {
  const normalized = normalizeText(text || "").toLowerCase();
  const hasPodiatryContext = PODIATRY_CONTEXT_WORDS.some((word) => normalized.includes(word));
  const hasExplicitDiabeticFootContext =
    normalized.includes("diabet") ||
    normalized.includes("ulcera") ||
    normalized.includes("úlcera") ||
    normalized.includes("herida");

  // Prevent false handoff for non-podiatry complaints like "me duele la oreja/panza"
  if (!hasPodiatryContext && !hasExplicitDiabeticFootContext) {
    return false;
  }

  for (const word of URGENCY_WORDS) {
    if (normalized.includes(word)) {
      return true;
    }
  }
  return false;
}

/**
 * Build comprehensive system prompt with full context
 */
function buildSystemPrompt(knowledge, session, flow) {
  const kb = knowledge || {};
  const nombre = kb.personalidad?.nombre || "PODITO";
  const clinica = kb.clinica?.nombre || "PODOPIE";
  const ciudad = kb.clinica?.ciudad || "Santa Cruz, Bolivia";

  const nodeCatalog = flow ? buildRoutingNodeCatalog(flow) : `MAIN_MENU, SERVICIOS_MENU, HORARIOS_INFO, PRECIOS_INFO, CONTACT_METHOD, UNERO_TIPO_TRAT, HONGOS_TIPO_TRAT, SVC_PEDICURE_INFO, SVC_PODOPEDIATRIA_INFO, SVC_PODOGERIATRIA_INFO, OTR_PIE_DIABETICO_INFO, OTR_CALLOSIDAD_INFO, OTR_HELOMA_INFO, OTR_VERRUGA_PLANTAR_INFO, OTR_EXTRACCION_UNA_INFO, OTR_PIE_ATLETA_INFO, OTROS_MENU`;

  return `Eres ${nombre}, router de ${clinica} (podología, ${ciudad}). SOLO pies.
Responde SOLO JSON: {"action":"...","route_id":"...","question":"","reason":""}

REGLA PRINCIPAL: Si existe un nodo para el tema → SIEMPRE usa action="route". NUNCA uses "respond" cuando hay un nodo disponible.

ACCIONES:
route → USAR cuando hay nodo disponible (requiere route_id exacto del catálogo)
respond → SOLO saludos puros sin solicitud ("hola", "buenos días")
handoff → dolor intenso, urgencia, sangrado, pus, infección, úlcera
show_services → no sabe qué quiere
out_of_scope → tema no es podología de pies
clarify → falta dato clave (solo 1 vez)

RUTAS DIRECTAS (prioridad alta):
precio/costo/cuánto/tarifa → PRECIOS_INFO
servicio/tratamiento/qué ofrecen/qué tienen → SERVICIOS_MENU
horario/ubicación/dónde/sucursal/dirección/cómo llegar → HORARIOS_INFO
asesor/humano/llamar/contacto/atención personal → CONTACT_METHOD
uñero/uña encarnada → UNERO_TIPO_TRAT
hongo/onicomicosis → HONGOS_TIPO_TRAT
pedicure/pedicura → SVC_PEDICURE_INFO
pie de atleta → OTR_PIE_ATLETA_INFO
callo/callosidad → OTR_CALLOSIDAD_INFO
verruga → OTR_VERRUGA_PLANTAR_INFO
diabetes/pie diabético → OTR_PIE_DIABETICO_INFO

NODOS DISPONIBLES:
${nodeCatalog}`;
}

/**
 * Build user prompt with message and context
 */
function buildUserPrompt({ message, history, summary, previousQuestion }) {
  const contextParts = [];

  if (history && history !== "(Primera interacción)") {
    contextParts.push(`[historial]\n${history}`);
  }

  if (previousQuestion) {
    contextParts.push(`[pregunta anterior, no repetir]: ${previousQuestion}`);
  }

  if (summary?.clarificationsAsked > 0) {
    contextParts.push(`[ya se pidió clarificación ${summary.clarificationsAsked} vez/veces, no pedir más]`);
  }

  contextParts.push(`[mensaje]: ${message}`);

  return contextParts.join("\n");
}

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

function isCloudflareProvider(provider) {
  const normalized = String(provider || "").toLowerCase();
  return normalized === "cloudflare" || normalized === "cloudflare-workers-ai" || normalized === "workers-ai";
}

function normalizeRouterAction(action) {
  const normalized = String(action || "").toLowerCase().trim();
  if (!normalized) return null;
  if (normalized === "services") return "show_services";
  return normalized;
}

function buildRoutingNodeCatalog(flow) {
  const nodes = flow?.nodes || [];

  // Only include nodes that are valid routing targets (reachable via button clicks)
  const buttonTargets = new Set();
  for (const node of nodes) {
    if (Array.isArray(node.buttons)) {
      for (const btn of node.buttons) {
        if (btn?.next) buttonTargets.add(btn.next);
      }
    }
  }

  // Also include special AI config nodes and the start node
  const ai = flow?.ai || {};
  [ai.handoff_node_id, ai.services_node_id, ai.out_of_scope_node_id, flow?.start_node_id]
    .filter(Boolean)
    .forEach((id) => buttonTargets.add(id));

  const nodeMap = new Map();
  for (const node of nodes) {
    if (!node?.id || !buttonTargets.has(node.id)) continue;
    nodeMap.set(node.id, {
      id: node.id,
      title: (node.title || node.text || "").toString().replace(/\s+/g, " ").trim().slice(0, 50),
    });
  }

  return [...nodeMap.values()]
    .map((n) => `- ${n.id}${n.title ? ` :: ${n.title}` : ""}`)
    .join("\n");
}

function buildCloudflareRouteSystemPrompt({ knowledge, flow, previousQuestion, summary }) {
  const clinica = knowledge?.clinica || {};
  const personalidad = knowledge?.personalidad || {};
  const nodeCatalog = buildRoutingNodeCatalog(flow);
  const clarifyCount = Number(summary?.clarificationsAsked || 0);

  return `Eres un router de flujo de WhatsApp para ${clinica.nombre || "PODOPIE"} (podologia).

TU TAREA ES SOLO DECIDIR LA ACCION Y EL NODO. NO EXPLIQUES SERVICIOS, NO INVENTES HORARIOS, NO INVENTES DIRECCIONES.
Responde SOLO JSON valido.

Reglas clave:
- Si el usuario pide informacion de un servicio/tema podologico => action="route" con route_id correcto.
- Si pide horarios, ubicacion, sucursal, direccion => route a nodo de horarios/ubicaciones.
- Si pide precios/costos => route a nodo de precios.
- Si pide asesor/humano/recepcion/denuncia/reclamo => handoff o route a contacto/atencion personalizada.
- Si el tema NO es de pies/podologia => respond (mensaje corto aclarando que solo atienden pies).
- Si hay dolor intenso / urgencia => handoff.
- Usa clarify SOLO si realmente falta dato y como maximo una vez.
- Si no sabes a que nodo ir pero sigue siendo del negocio => show_services.

Acciones permitidas: respond, route, handoff, clarify, show_services, menu, out_of_scope.
${previousQuestion ? "IMPORTANTE: ya se hizo una pregunta de clarificacion antes, evita otra salvo que sea imprescindible." : ""}
${clarifyCount >= 1 ? "IMPORTANTE: ya hubo clarificaciones previas; prioriza route/show_services/handoff." : ""}

NODOS DISPONIBLES:
${nodeCatalog || "- MAIN_MENU"}

Esquema JSON:
{"action":"route","route_id":"NODE_ID","reason":"breve"}
Campos opcionales: route_id, question, reason.
Si action=clarify incluye question.`;
}

function buildCloudflareCopyPrompt({ knowledge, action, userText }) {
  const personalidad = knowledge?.personalidad || {};
  const clinica = knowledge?.clinica || {};
  const tone = personalidad.tono || "amable, calido y profesional";
  const emoji = Array.isArray(personalidad.emojis_frecuentes) && personalidad.emojis_frecuentes.length
    ? personalidad.emojis_frecuentes.slice(0, 2).join(" ")
    : "🦶";
  const onlyFeet = clinica.especialidad || "solo atendemos temas de pies/podologia";

  if (action === "clarify") {
    return {
      system: `Eres un asistente de ${clinica.nombre || "PODOPIE"}. Responde SOLO con una pregunta corta (1 frase) para aclarar la necesidad del usuario. Tono ${tone}. No inventes horarios/precios. Usa español.`,
      user: `Mensaje del usuario: "${userText}"\nDevuelve solo la pregunta, sin JSON.`,
    };
  }

  return {
    system: `Eres un asistente de ${clinica.nombre || "PODOPIE"}. Tono ${tone}. Maximo 2 oraciones. No inventes horarios, direcciones ni precios. Si el tema no es podologia, aclara que ${onlyFeet}. Puedes usar ${emoji}.`,
    user: `Responde al usuario de forma breve y util.\nMensaje del usuario: "${userText}"\nDevuelve solo el texto final, sin JSON ni markdown.`,
  };
}

async function callRouteDecisionWithRetry({
  provider,
  apiKey,
  model,
  accountId,
  system,
  user,
  flowId,
}) {
  const tryParse = (raw, stage) => {
    const parsed = parseRouterResponse(raw);
    const jsonParsed = Boolean(safeJsonParse(raw));
    logger.info("ai.router_parse_result", {
      provider,
      model,
      stage,
      jsonParsed,
      parsedAction: normalizeRouterAction(parsed?.action) || null,
      parsedRouteId: parsed?.route_id || null,
      rawPreview: String(raw || "").slice(0, 180),
    });
    if (!jsonParsed && parsed?.action) {
      logger.info("ai.router_parse_loose_success", {
        provider,
        model,
        stage,
        action: normalizeRouterAction(parsed.action),
      });
    }
    if (parsed?.action) {
      parsed.action = normalizeRouterAction(parsed.action);
    }
    return parsed;
  };

  const raw = await callAiProvider(provider, {
    apiKey,
    model,
    accountId,
    system,
    user,
    schema: ROUTER_DECISION_SCHEMA,
    temperature: 0,
    maxTokens: 180,
  });
  logger.info("ai.router_raw", { provider, model, length: raw?.length || 0 });
  let parsed = tryParse(raw, "route_primary");
  if (parsed?.action) return parsed;

  logger.warn("ai.router_parse_failed", { preview: raw?.slice(0, 100) || "" });

  const retryRaw = await callAiProvider(provider, {
    apiKey,
    model,
    accountId,
    system: `${system}\n\nRESPUESTA OBLIGATORIA: devuelve SOLO JSON valido. NO texto conversacional. NO markdown.`,
    user: `${user}\n\nDevuelve SOLO JSON.`,
    schema: ROUTER_DECISION_SCHEMA,
    temperature: 0,
    maxTokens: 180,
  });
  parsed = tryParse(retryRaw, "route_retry");
  if (parsed?.action) return parsed;

  // Repair pass: if model keeps chatting, ask ONLY for action/route without explanations.
  const repairRaw = await callAiProvider(provider, {
    apiKey,
    model,
    accountId,
    system: `${system}\n\nMODO REPARACION: decide accion y route_id. Si el usuario pide servicio/horario/precio/contacto, NO uses respond; usa route/show_services/handoff.`,
    user: `Usuario: ${user}\nResponde SOLO JSON con action y route_id si aplica.`,
    schema: ROUTER_DECISION_SCHEMA,
    temperature: 0,
    maxTokens: 140,
  });
  parsed = tryParse(repairRaw, "route_repair");
  if (parsed?.action) return parsed;

  logger.warn("ai.router_fallback", { flowId });
  return null;
}

async function routeWithCloudflareRouteFirst({
  text,
  flow,
  session,
  knowledge,
  provider,
  model,
  apiKey,
  cloudflareAccountId,
  flowId,
  summary,
  previousQuestion,
}) {
  logger.info("ai.router_mode", { provider, model, mode: "route_first", flowId });

  const routeSystem = buildCloudflareRouteSystemPrompt({
    knowledge,
    flow,
    previousQuestion,
    summary,
  });
  const routeUser = buildUserPrompt({
    message: text,
    history: getHistoryForAI(session?.data),
    summary,
    previousQuestion,
  });

  let parsed = await callRouteDecisionWithRetry({
    provider,
    apiKey,
    model,
    accountId: cloudflareAccountId,
    system: routeSystem,
    user: routeUser,
    flowId,
  });

  if (!parsed?.action) {
    return null;
  }

  parsed.action = normalizeRouterAction(parsed.action);

  // If the model returned respond but also supplied route_id, prefer route.
  if (parsed.action === "respond" && parsed.route_id) {
    parsed.action = "route";
  }

  // If clarify was already used, downgrade to show_services.
  if (parsed.action === "clarify" && (previousQuestion || summary?.clarificationsAsked >= 1)) {
    parsed = { action: "show_services", reason: "clarify_limit" };
  }

  // If model returned respond/show_services without a specific route, augment with keyword routing.
  if (!parsed.route_id && (parsed.action === "respond" || parsed.action === "show_services" || parsed.action === "clarify")) {
    const inferredRoute = fallbackKeywordRoute(text);
    if (inferredRoute) {
      logger.info("ai.router_cf_keyword_augmented", {
        provider,
        model,
        originalAction: parsed.action,
        inferredRoute,
      });
      parsed = { action: "route", route_id: inferredRoute, reason: "keyword_augmented" };
    }
  }

  // Route-like actions should not send AI free text to avoid hallucinating business facts.
  if (["route", "show_services", "handoff", "menu", "services", "out_of_scope"].includes(parsed.action)) {
    logger.info("ai.router_decision", {
      provider,
      model,
      action: parsed.action,
      route_id: parsed.route_id || null,
      reason: parsed.reason || null,
      source: "cloudflare_route_model",
    });
    return {
      ...parsed,
      action: normalizeRouterAction(parsed.action),
      text: "",
      ai_used: true,
      clear_pending: Boolean(previousQuestion),
      reset_turns: parsed.action === "route" || parsed.action === "show_services" || parsed.action === "menu",
    };
  }

  // Generate text ONLY when the final action is conversational.
  const copyPrompt = buildCloudflareCopyPrompt({
    knowledge,
    action: parsed.action,
    userText: text,
  });

  let copyRaw = "";
  try {
    copyRaw = await callAiProvider(provider, {
      apiKey,
      model,
      accountId: cloudflareAccountId,
      system: copyPrompt.system,
      user: copyPrompt.user,
      temperature: 0.2,
      maxTokens: parsed.action === "clarify" ? 80 : 180,
    });
  } catch (error) {
    logger.warn("ai.router_copy_error", { provider, model, message: error.message });
  }

  const cleanedCopy = String(copyRaw || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^\s*#+\s*/gm, "")
    .trim();

  if (parsed.action === "clarify") {
    const question = parsed.question || cleanedCopy || "¿Podrías contarme un poco más para ayudarte mejor?";
    logger.info("ai.router_decision", {
      provider,
      model,
      action: "clarify",
      route_id: null,
      reason: parsed.reason || null,
      source: "cloudflare_route_model+copy_model",
    });
    return {
      action: "clarify",
      question,
      reason: parsed.reason || null,
      ai_used: true,
      clear_pending: Boolean(previousQuestion),
      reset_turns: false,
    };
  }

  const textReply = cleanedCopy || "Entiendo tu consulta. Te ayudo con eso.";
  logger.info("ai.router_decision", {
    provider,
    model,
    action: "respond",
    route_id: null,
    reason: parsed.reason || null,
    source: "cloudflare_route_model+copy_model",
  });
  return {
    action: "respond",
    text: textReply,
    reason: parsed.reason || null,
    ai_used: true,
    clear_pending: Boolean(previousQuestion),
    reset_turns: false,
  };
}

/**
 * Fallback keyword routing (used only if AI fails)
 */
function fallbackKeywordRoute(text) {
  const normalized = normalizeText(text || "").toLowerCase();

  // IMPORTANT: all keys must be accent-free (normalizeText strips accents from input
  // but does NOT normalize the key strings, so accented keys never match).
  const keywords = {
    // === SALUDOS → MAIN_MENU ===
    "hola": "MAIN_MENU",
    "buenas": "MAIN_MENU",
    "buenos dias": "MAIN_MENU",
    "buenas tardes": "MAIN_MENU",
    "buenas noches": "MAIN_MENU",
    "buen dia": "MAIN_MENU",
    "inicio": "MAIN_MENU",
    "menu": "MAIN_MENU",
    "volver": "MAIN_MENU",

    // === SERVICIOS (listado) → SERVICIOS_MENU ===
    "servicios": "SERVICIOS_MENU",
    "que servicios": "SERVICIOS_MENU",
    "que ofrecen": "SERVICIOS_MENU",
    "que tienen": "SERVICIOS_MENU",
    "que hacen": "SERVICIOS_MENU",
    "tratamientos disponibles": "SERVICIOS_MENU",

    // === UNERO (entrada principal) → UNERO_TIPO_TRAT ===
    "unero": "UNERO_TIPO_TRAT",
    "uneros": "UNERO_TIPO_TRAT",
    "una encarnada": "UNERO_TIPO_TRAT",
    "unas encarnadas": "UNERO_TIPO_TRAT",
    "una clavada": "UNERO_TIPO_TRAT",
    "una que se encarna": "UNERO_TIPO_TRAT",

    // === TRATAMIENTOS DE UNERO (especificos) ===
    "matricectomia": "TRAT_MATRICECTOMIA_INFO",
    "matricetomia": "TRAT_MATRICECTOMIA_INFO",
    "cirugia de unero": "TRAT_MATRICECTOMIA_INFO",
    "cirugia unero": "TRAT_MATRICECTOMIA_INFO",
    "operacion unero": "TRAT_MATRICECTOMIA_INFO",
    "ortesis": "TRAT_ORTESIS_INFO",
    "ortesis ungueal": "TRAT_ORTESIS_INFO",
    "corrector de una": "TRAT_ORTESIS_INFO",

    // === HONGOS (entrada principal) → HONGOS_TIPO_TRAT ===
    "hongo": "HONGOS_TIPO_TRAT",
    "hongos": "HONGOS_TIPO_TRAT",
    "onicomicosis": "HONGOS_TIPO_TRAT",
    "hongo en la una": "HONGOS_TIPO_TRAT",
    "hongos en las unas": "HONGOS_TIPO_TRAT",
    "unas con hongo": "HONGOS_TIPO_TRAT",
    "unas amarillas": "HONGOS_TIPO_TRAT",
    "unas negras": "HONGOS_TIPO_TRAT",
    "unas manchadas": "HONGOS_TIPO_TRAT",

    // === TRATAMIENTOS DE HONGOS (especificos) ===
    "topico": "TRAT_TOPICO_INFO",
    "tratamiento topico": "TRAT_TOPICO_INFO",
    "laca antifungica": "TRAT_TOPICO_INFO",
    "laca antimicotica": "TRAT_TOPICO_INFO",
    "laser": "TRAT_LASER_INFO",
    "laser hongos": "TRAT_LASER_INFO",
    "tratamiento laser": "TRAT_LASER_INFO",
    "laser para hongos": "TRAT_LASER_INFO",
    "sistemico": "TRAT_SISTEMICO_INFO",
    "tratamiento sistemico": "TRAT_SISTEMICO_INFO",
    "pastillas para hongos": "TRAT_SISTEMICO_INFO",

    // === PEDICURE CLINICO ===
    "pedicure": "SVC_PEDICURE_INFO",
    "pedicura": "SVC_PEDICURE_INFO",
    "pedicure clinico": "SVC_PEDICURE_INFO",
    "pedicura clinica": "SVC_PEDICURE_INFO",
    "limpieza de pies": "SVC_PEDICURE_INFO",
    "limpieza podal": "SVC_PEDICURE_INFO",
    "corte de unas": "SVC_PEDICURE_INFO",

    // === PODOPEDIATRIA ===
    "podopediatria": "SVC_PODOPEDIATRIA_INFO",
    "pies de nino": "SVC_PODOPEDIATRIA_INFO",
    "pies de mi hijo": "SVC_PODOPEDIATRIA_INFO",
    "pies de bebe": "SVC_PODOPEDIATRIA_INFO",
    "pies infantiles": "SVC_PODOPEDIATRIA_INFO",
    "unero de nino": "SVC_PODOPEDIATRIA_INFO",
    "unero en nino": "SVC_PODOPEDIATRIA_INFO",
    "podopediatrik": "SVC_PODOPEDIATRIA_INFO",

    // === PODOGERIATRIA ===
    "podogeriatria": "SVC_PODOGERIATRIA_INFO",
    "adulto mayor": "SVC_PODOGERIATRIA_INFO",
    "tercera edad": "SVC_PODOGERIATRIA_INFO",
    "personas mayores": "SVC_PODOGERIATRIA_INFO",
    "abuelo": "SVC_PODOGERIATRIA_INFO",
    "abuela": "SVC_PODOGERIATRIA_INFO",
    "podogeriatrik": "SVC_PODOGERIATRIA_INFO",

    // === CALLOSIDAD ===
    "callo": "OTR_CALLOSIDAD_INFO",
    "callos": "OTR_CALLOSIDAD_INFO",
    "callosidad": "OTR_CALLOSIDAD_INFO",
    "callosidades": "OTR_CALLOSIDAD_INFO",
    "dureza en el pie": "OTR_CALLOSIDAD_INFO",
    "piel dura en el pie": "OTR_CALLOSIDAD_INFO",
    "piel engrosada": "OTR_CALLOSIDAD_INFO",
    "podocallos": "OTR_CALLOSIDAD_INFO",

    // === HELOMA ===
    "heloma": "OTR_HELOMA_INFO",
    "helomas": "OTR_HELOMA_INFO",

    // === VERRUGA PLANTAR ===
    "verruga": "OTR_VERRUGA_PLANTAR_INFO",
    "verrugas": "OTR_VERRUGA_PLANTAR_INFO",
    "verruga plantar": "OTR_VERRUGA_PLANTAR_INFO",
    "verrugas plantares": "OTR_VERRUGA_PLANTAR_INFO",
    "vph": "OTR_VERRUGA_PLANTAR_INFO",
    "virus del papiloma": "OTR_VERRUGA_PLANTAR_INFO",

    // === EXTRACCION DE UNA ===
    "extraccion de una": "OTR_EXTRACCION_UNA_INFO",
    "extraccion una": "OTR_EXTRACCION_UNA_INFO",
    "sacar la una": "OTR_EXTRACCION_UNA_INFO",
    "quitar la una": "OTR_EXTRACCION_UNA_INFO",
    "una golpeada": "OTR_EXTRACCION_UNA_INFO",
    "una negra": "OTR_EXTRACCION_UNA_INFO",
    "una suelta": "OTR_EXTRACCION_UNA_INFO",

    // === PIE DE ATLETA ===
    "pie de atleta": "OTR_PIE_ATLETA_INFO",
    "hongo entre los dedos": "OTR_PIE_ATLETA_INFO",
    "picazon entre los dedos": "OTR_PIE_ATLETA_INFO",
    "picazon en los pies": "OTR_PIE_ATLETA_INFO",
    "hongos entre los dedos": "OTR_PIE_ATLETA_INFO",

    // === PIE DIABETICO ===
    "pie diabetico": "OTR_PIE_DIABETICO_INFO",
    "diabetico": "OTR_PIE_DIABETICO_INFO",
    "diabetes": "OTR_PIE_DIABETICO_INFO",
    "paciente diabetico": "OTR_PIE_DIABETICO_INFO",
    "tengo diabetes": "OTR_PIE_DIABETICO_INFO",
    "pododiabetik": "OTR_PIE_DIABETICO_INFO",

    // === CONTACTO / ATENCION HUMANA ===
    "asesor": "CONTACT_METHOD",
    "asesora": "CONTACT_METHOD",
    "atencion personal": "CONTACT_METHOD",
    "atencion personalizada": "CONTACT_METHOD",
    "atencion humana": "CONTACT_METHOD",
    "recepcion": "CONTACT_METHOD",
    "hablar con alguien": "CONTACT_METHOD",
    "hablar con una persona": "CONTACT_METHOD",
    "quiero llamar": "CONTACT_METHOD",
    "humano": "CONTACT_METHOD",
    "persona real": "CONTACT_METHOD",

    // === HORARIOS Y UBICACION ===
    "horario": "HORARIOS_INFO",
    "horarios": "HORARIOS_INFO",
    "ubicacion": "HORARIOS_INFO",
    "ubicaciones": "HORARIOS_INFO",
    "sucursal": "HORARIOS_INFO",
    "sucursales": "HORARIOS_INFO",
    "donde estan": "HORARIOS_INFO",
    "como llegar": "HORARIOS_INFO",
    "direccion": "HORARIOS_INFO",
    "donde queda": "HORARIOS_INFO",

    // === PRECIOS ===
    "precio": "PRECIOS_INFO",
    "precios": "PRECIOS_INFO",
    "cuanto cuesta": "PRECIOS_INFO",
    "cuanto vale": "PRECIOS_INFO",
    "cuanto cobran": "PRECIOS_INFO",
    "costo": "PRECIOS_INFO",
    "costos": "PRECIOS_INFO",
    "tarifa": "PRECIOS_INFO",
    "tarifas": "PRECIOS_INFO",
    "cuanto": "PRECIOS_INFO",

    // === SINTOMAS GENERALES → OTROS_MENU ===
    "talon": "OTROS_MENU",
    "talones": "OTROS_MENU",
    "espolon": "OTROS_MENU",
    "dedo del pie": "OTROS_MENU",
    "dedos del pie": "OTROS_MENU",
    "dolor en el pie": "OTROS_MENU",
    "me duele el pie": "OTROS_MENU",
    "problema en el pie": "OTROS_MENU",
  };

  for (const [keyword, nodeId] of Object.entries(keywords)) {
    if (normalized.includes(keyword)) {
      return nodeId;
    }
  }

  return null;
}

/**
 * Main AI routing function - AI-First Architecture
 */
async function routeWithAI({ text, flow, config, session }) {
  const aiConfig = config?.ai || {};
  const aiFlow = flow.ai || {};
  const flowId = flow?.id || "unknown";

  // Check if AI is enabled
  if (!aiFlow.enabled) {
    logger.info("ai.router_skipped", { reason: "disabled", flowId });
    return null;
  }

  // Get API configuration
  const provider = String(aiConfig.provider || aiFlow.provider || process.env.AI_PROVIDER || "gemini").toLowerCase();
  const rawKey = aiConfig.key || aiConfig.api_key ||
    (provider === "gemini"
      ? process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
      : (provider === "cloudflare" || provider === "cloudflare-workers-ai" || provider === "workers-ai")
        ? process.env.CLOUDFLARE_AI_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN
        : provider === "groq"
          ? process.env.GROQ_API_KEY
          : process.env.OPENAI_API_KEY);
  const apiKey = rawKey ? String(rawKey).trim() : "";
  const cloudflareAccountId = aiConfig.account_id || aiConfig.accountId ||
    aiConfig.cloudflare_account_id || aiConfig.cloudflareAccountId ||
    process.env.CLOUDFLARE_ACCOUNT_ID || "";

  // Check max turns - but ALWAYS allow keyword fallback first
  const maxTurns = Number(aiFlow.max_turns || 20);
  const usedTurns = Number(session?.data?.ai_turns || 0);
  const turnsExceeded = usedTurns >= maxTurns;

  // If turns exceeded, try keyword routing before giving up
  if (turnsExceeded) {
    logger.info("ai.router_max_turns", { flowId, usedTurns, maxTurns });
    const fallbackRoute = fallbackKeywordRoute(text);
    if (fallbackRoute) {
      return { action: "route", route_id: fallbackRoute, text: "", ai_used: false, reset_turns: true };
    }
    // No keyword match either - show services as last resort
    return { action: "show_services", text: "Te muestro nuestros servicios:", ai_used: false };
  }

  // URGENCY CHECK FIRST - bypass AI for urgent cases
  const urgencyDetected = detectUrgency(text);
  if (urgencyDetected) {
    logger.info("ai.router_urgency_detected", { flowId });
    return {
      action: "handoff",
      text: "Por lo que describes, lo mejor es que te valore un especialista. Te conecto con nuestro equipo. 🏥",
      ai_used: false,
    };
  }
  if (/dolor|duele|urgente|sangra|sangrado/i.test(String(text || ""))) {
    logger.info("ai.router_urgency_not_podiatry_or_not_critical", { flowId });
  }

  // Load knowledge base
  const knowledge = loadKnowledgeBase(flowId);

  // Get conversation context
  const history = getHistoryForAI(session?.data);
  const summary = getConversationSummary(session?.data);
  const previousQuestion = session?.data?.ai_pending?.question || null;

  // If no API key, use fallback
  if (!apiKey) {
    logger.warn("ai.router_no_key", { provider, flowId });
    const fallbackRoute = fallbackKeywordRoute(text);
    if (fallbackRoute) {
      return { action: "route", route_id: fallbackRoute, ai_used: false };
    }
    return { action: "show_services", ai_used: false };
  }

  // Build prompts
  const system = buildSystemPrompt(knowledge, session, flow);
  const user = buildUserPrompt({ message: text, history, summary, previousQuestion });

  // Only use saved model if it's compatible with the current provider.
  // Cloudflare models start with "@cf/" — don't use them for other providers.
  const savedModel = aiConfig.model;
  const savedModelIsCloudflare = typeof savedModel === "string" && savedModel.startsWith("@cf/");
  const modelIsCompatible = savedModel && !(savedModelIsCloudflare && !isCloudflareProvider(provider));
  const model = (modelIsCompatible ? savedModel : null) || DEFAULT_MODELS[provider] || DEFAULT_MODELS.openai;
  logger.info("ai.router_request", {
    provider,
    model,
    flowId,
    historyLength: summary.messageCount,
    cloudflareAccountConfigured:
      provider === "cloudflare" || provider === "cloudflare-workers-ai" || provider === "workers-ai"
        ? Boolean(cloudflareAccountId)
        : undefined,
  });

  if (isCloudflareProvider(provider)) {
    try {
      const cloudflareDecision = await routeWithCloudflareRouteFirst({
        text,
        flow,
        session,
        knowledge,
        provider,
        model,
        apiKey,
        cloudflareAccountId,
        flowId,
        summary,
        previousQuestion,
      });
      if (cloudflareDecision?.action) {
        return cloudflareDecision;
      }
      logger.warn("ai.router_cloudflare_no_decision", { flowId, model });
      return {
        action: "respond",
        text: "Puedo ayudarte con temas de pies y podología. Si quieres, dime si buscas información de un servicio, horarios, precios o atención con un asesor.",
        ai_used: false,
      };
    } catch (error) {
      logger.error("ai.router_error", { message: error.message, provider, model, flowId });
      return {
        action: "respond",
        text: "Tuve un problema procesando tu mensaje, pero puedo ayudarte con temas de pies. Si quieres, dime el servicio que buscas o si prefieres hablar con un asesor.",
        ai_used: false,
      };
    }
  }

  try {
    // Call AI
    const raw = await callAiProvider(provider, {
      apiKey,
      model,
      accountId: cloudflareAccountId,
      system,
      user,
      schema: ROUTER_SCHEMA,
      temperature: 0.3,
      maxTokens: 300,
    });

    logger.info("ai.router_raw", { provider, model, length: raw?.length || 0 });

    let parsed = parseRouterResponse(raw);
    logger.info("ai.router_parse_result", {
      provider,
      model,
      stage: "primary",
      jsonParsed: Boolean(safeJsonParse(raw)),
      parsedAction: parsed?.action || null,
      parsedRouteId: parsed?.route_id || null,
      rawPreview: String(raw || "").slice(0, 180),
    });
    if (!safeJsonParse(raw) && parsed?.action) {
      logger.info("ai.router_parse_loose_success", {
        provider,
        model,
        stage: "primary",
        action: parsed.action,
      });
    }

    // Retry if parse failed
    if (!parsed?.action) {
      logger.warn("ai.router_parse_failed", { preview: raw?.slice(0, 100) });

      const retryRaw = await callAiProvider(provider, {
        apiKey,
        model,
        accountId: cloudflareAccountId,
        system: system + "\n\nIMPORTANTE: Responde SOLO con JSON válido, sin texto adicional.",
        user,
        schema: ROUTER_SCHEMA,
        temperature: 0,
        maxTokens: 300,
      });

      parsed = parseRouterResponse(retryRaw);
      logger.info("ai.router_parse_result", {
        provider,
        model,
        stage: "retry",
        jsonParsed: Boolean(safeJsonParse(retryRaw)),
        parsedAction: parsed?.action || null,
        parsedRouteId: parsed?.route_id || null,
        rawPreview: String(retryRaw || "").slice(0, 180),
      });
      if (!safeJsonParse(retryRaw) && parsed?.action) {
        logger.info("ai.router_parse_loose_success", {
          provider,
          model,
          stage: "retry",
          action: parsed.action,
        });
      }
    }

    // If still no valid response, fallback
    if (!parsed?.action) {
      logger.warn("ai.router_fallback", { flowId });
      const fallbackRoute = fallbackKeywordRoute(text);
      if (fallbackRoute) {
        return { action: "route", route_id: fallbackRoute, ai_used: false };
      }
      return { action: "show_services", ai_used: false };
    }

    // Handle clarify limit
    if (parsed.action === "clarify" && (previousQuestion || summary.clarificationsAsked >= 1)) {
      logger.info("ai.router_clarify_blocked", { flowId });
      return { action: "show_services", text: "Te muestro nuestras opciones:", ai_used: true };
    }

    // If the model answered conversationally but skipped routing (or routed to a generic node),
    // recover route deterministically from keywords.
    // Note: check even when route_id is present — model sometimes puts MAIN_MENU as fallback route_id
    // while using action="respond" for queries that clearly have a specific node.
    if (parsed.action === "respond" || parsed.action === "clarify") {
      const inferredRoute = fallbackKeywordRoute(text);
      logger.info("ai.router_route_augmentation_check", {
        provider,
        model,
        action: parsed.action,
        inferredRoute: inferredRoute || null,
        userTextPreview: String(text || "").slice(0, 140),
      });
      if (inferredRoute) {
        logger.info("ai.router_route_augmented_from_keywords", {
          provider,
          model,
          originalAction: parsed.action,
          inferredRoute,
        });
        parsed = {
          ...parsed,
          action: "route",
          route_id: inferredRoute,
        };
      }
    }

    logger.info("ai.router_decision", {
      provider,
      model,
      action: parsed.action,
      route_id: parsed.route_id || null,
      reason: parsed.reason || null,
    });

    // Reset turns on successful route to prevent lockout in new context
    const shouldResetTurns = parsed.action === "route" || parsed.action === "show_services";
    return {
      ...parsed,
      ai_used: true,
      clear_pending: Boolean(previousQuestion),
      reset_turns: shouldResetTurns,
    };

  } catch (error) {
    logger.error("ai.router_error", { message: error.message, provider, model, flowId });

    // Fallback on error
    const fallbackRoute = fallbackKeywordRoute(text);
    if (fallbackRoute) {
      return { action: "route", route_id: fallbackRoute, ai_used: false };
    }
    return { action: "show_services", ai_used: false };
  }
}

/**
 * Build route candidates from flow (kept for compatibility)
 */
function buildRouteCandidates(flow) {
  const nodes = flow?.nodes || [];
  return nodes
    .filter(n => n.id && n.buttons?.length)
    .map(n => ({
      id: n.id,
      labels: n.buttons.map(b => b.label),
      summary: n.text?.slice(0, 100),
    }));
}

module.exports = {
  routeWithAI,
  buildRouteCandidates,
  loadKnowledgeBase,
  detectUrgency,
};
