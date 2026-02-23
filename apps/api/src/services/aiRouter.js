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
  "diabético", "diabetes", "diabetica",
  "úlcera", "ulcera", "herida abierta",
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
function buildSystemPrompt(knowledge, session) {
  const kb = knowledge || {};
  const personalidad = kb.personalidad || {};
  const clinica = kb.clinica || {};
  const servicios = kb.servicios || {};
  const ubicaciones = kb.ubicaciones || {};

  // Build services summary
  const serviciosList = Object.entries(servicios)
    .map(([key, svc]) => `- ${svc.nombre}: ${svc.descripcion}`)
    .join("\n");

  // Build locations summary  
  const ubicacionesList = Object.entries(ubicaciones)
    .map(([key, loc]) => `- ${loc.nombre}: ${loc.horario}`)
    .join("\n");

  return `# ${personalidad.nombre || "PODITO"} - Asistente Virtual de ${clinica.nombre || "PODOPIE"}

## Tu Identidad
Eres ${personalidad.nombre || "PODITO"} ${personalidad.emoji || "🤖"}, el asistente virtual de ${clinica.nombre || "PODOPIE"}, una clínica de podología en ${clinica.ciudad || "Santa Cruz, Bolivia"}.

## Tu Personalidad
- Tono: ${personalidad.tono || "amable, cálido, profesional"}
- Idioma: ${personalidad.idioma || "español boliviano casual"}
- Usas emojis moderadamente: ${(personalidad.emojis_frecuentes || ["🦶", "✨"]).join(" ")}
- Máximo ${personalidad.maximo_oraciones || 2} oraciones por respuesta
- Sé conversacional, NO robótico

## Importante
- ${clinica.especialidad || "SOLO trabajamos con PIES"}
- NO hacemos: ${(clinica.no_hacemos || ["manos", "manicure"]).join(", ")}

## Servicios Disponibles
${serviciosList || "Consultar en menú"}

## Ubicaciones y Horarios
${ubicacionesList || "Consultar disponibilidad"}

## Cómo Responder (JSON)
{
  "action": "respond|route|handoff|clarify|show_services",
  "text": "Tu respuesta conversacional",
  "route_id": "NODO_ID (solo si action=route)",
  "question": "Pregunta (solo si action=clarify)",
  "reason": "Por qué tomaste esta decisión"
}

## Acciones:
- **respond**: Solo responder sin cambiar de pantalla
- **route**: Ir a un nodo específico (incluye route_id)
- **handoff**: Derivar a humano (urgencia/dolor/síntomas graves)
- **clarify**: Necesitas más información (incluye question)
- **show_services**: Mostrar menú de servicios

## Nodos Disponibles para Routing:
- MAIN_MENU: Menú principal
- SERVICIOS_MENU: Lista de servicios
- HORARIOS_INFO: Ubicaciones y horarios
- PRECIOS_INFO: Lista de precios
- CONTACT_METHOD: Opciones de contacto
- UNERO_TIPO_TRAT: Tratamientos de uñeros
- HONGOS_TIPO_TRAT: Tratamientos de hongos
- SVC_PEDICURE_INFO: Info de pedicure clínico
- SVC_PODOPEDIATRIA_INFO: Info de podopediatría
- SVC_PODOGERIATRIA_INFO: Info de podogeriatría
- OTR_PIE_DIABETICO_INFO: Info de pie diabético

## Reglas de Decisión:
1. Si saluda → respond con saludo + pregunta cómo ayudar
2. Si pregunta por servicio específico → respond con info breve + route al nodo
3. Si tiene síntomas/dolor/urgencia → handoff con empatía
4. Si pide ubicación/horarios → route a HORARIOS_INFO
5. Si pide precios → route a PRECIOS_INFO  
6. Si está confundido/no sabe → show_services amablemente
7. Si tema fuera de podología → respond explicando que solo hacemos pies
8. Si necesitas clarificar → clarify (máximo 1 vez)
9. NUNCA repitas la misma pregunta dos veces
10. El "text" siempre debe ser conversacional y cálido`;
}

/**
 * Build user prompt with message and context
 */
function buildUserPrompt({ message, history, summary, previousQuestion }) {
  const contextParts = [];

  if (history && history !== "(Primera interacción)") {
    contextParts.push(`## Historial de Conversación:\n${history}`);
  }

  if (previousQuestion) {
    contextParts.push(`## Pregunta Anterior (NO repitas):\n${previousQuestion}`);
  }

  if (summary?.clarificationsAsked > 0) {
    contextParts.push(`## Nota: Ya pediste ${summary.clarificationsAsked} clarificación(es). No pidas más.`);
  }

  contextParts.push(`## Mensaje Actual del Usuario:\n${message}`);

  return contextParts.join("\n\n");
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
  const nodeMap = new Map();
  for (const node of flow?.nodes || []) {
    if (!node?.id) continue;
    if (!nodeMap.has(node.id)) {
      nodeMap.set(node.id, {
        id: node.id,
        type: node.type || "",
        title: (node.title || node.text || "").toString().replace(/\s+/g, " ").trim().slice(0, 90),
        buttonLabels: [],
      });
    }
    const row = nodeMap.get(node.id);
    if (Array.isArray(node.buttons)) {
      for (const btn of node.buttons) {
        if (btn?.label) row.buttonLabels.push(String(btn.label).trim());
      }
    }
  }

  return [...nodeMap.values()]
    .map((n) => {
      const labels = n.buttonLabels.slice(0, 4).join(" | ");
      return `- ${n.id}${n.type ? ` [${n.type}]` : ""}${n.title ? ` :: ${n.title}` : ""}${labels ? ` :: botones: ${labels}` : ""}`;
    })
    .slice(0, 140)
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

  const keywords = {
    // Saludos
    "hola": "MAIN_MENU",
    "buenas": "MAIN_MENU",
    "buenos dias": "MAIN_MENU",
    "buenas tardes": "MAIN_MENU",

    // Servicios
    "unero": "UNERO_TIPO_TRAT",
    "una encarnada": "UNERO_TIPO_TRAT",
    "uñero": "UNERO_TIPO_TRAT",
    "hongo": "HONGOS_TIPO_TRAT",
    "hongos": "HONGOS_TIPO_TRAT",
    "onicomicosis": "HONGOS_TIPO_TRAT",
    "pedicure": "SVC_PEDICURE_INFO",
    "pedicura": "SVC_PEDICURE_INFO",
    "asesor": "CONTACT_METHOD",
    "asesora": "CONTACT_METHOD",
    "atencion personal": "CONTACT_METHOD",
    "atencion personalizada": "CONTACT_METHOD",
    "atencion humana": "CONTACT_METHOD",
    "recepcion": "CONTACT_METHOD",
    "humano": "CONTACT_METHOD",
    "persona real": "CONTACT_METHOD",
    "callo": "OTR_CALLOSIDAD_INFO",
    "callos": "OTR_CALLOSIDAD_INFO",
    "callosidad": "OTR_CALLOSIDAD_INFO",
    "callosidades": "OTR_CALLOSIDAD_INFO",
    "heloma": "OTR_HELOMA_INFO",
    "talon": "OTROS_MENU",
    "talón": "OTROS_MENU",
    "talones": "OTROS_MENU",
    "espolon": "OTROS_MENU",
    "espolón": "OTROS_MENU",

    // Info
    "horario": "HORARIOS_INFO",
    "horarios": "HORARIOS_INFO",
    "ubicacion": "HORARIOS_INFO",
    "ubicaciones": "HORARIOS_INFO",
    "ubcacion": "HORARIOS_INFO",
    "ubcaciones": "HORARIOS_INFO",
    "sucursal": "HORARIOS_INFO",
    "sucursales": "HORARIOS_INFO",
    "donde": "HORARIOS_INFO",
    "direccion": "HORARIOS_INFO",
    "precio": "PRECIOS_INFO",
    "cuanto": "PRECIOS_INFO",
    "costo": "PRECIOS_INFO",

    // Dolores / sintomas generales en pies -> menú de patologías "Otros"
    "talon": "OTROS_MENU",
    "talones": "OTROS_MENU",
    "dedo": "OTROS_MENU",
    "pulgar": "OTROS_MENU",
    "duele": "OTROS_MENU",
    "dolor": "OTROS_MENU",

    // Menu
    "menu": "MAIN_MENU",
    "servicios": "SERVICIOS_MENU",
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
  const provider = String(aiConfig.provider || aiFlow.provider || "gemini").toLowerCase();
  const rawKey = aiConfig.key || aiConfig.api_key ||
    (provider === "gemini"
      ? process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
      : (provider === "cloudflare" || provider === "cloudflare-workers-ai" || provider === "workers-ai")
        ? process.env.CLOUDFLARE_AI_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN
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
  if (detectUrgency(text)) {
    logger.info("ai.router_urgency_detected", { flowId });
    return {
      action: "handoff",
      text: "Por lo que describes, lo mejor es que te valore un especialista. Te conecto con nuestro equipo. 🏥",
      ai_used: false,
    };
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
  const system = buildSystemPrompt(knowledge, session);
  const user = buildUserPrompt({ message: text, history, summary, previousQuestion });

  const model = aiConfig.model || DEFAULT_MODELS[provider] || DEFAULT_MODELS.openai;
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
      const fallbackRoute = fallbackKeywordRoute(text);
      if (fallbackRoute) {
        return { action: "route", route_id: fallbackRoute, ai_used: false };
      }
      return { action: "show_services", ai_used: false };
    } catch (error) {
      logger.error("ai.router_error", { message: error.message, provider, model, flowId });
      const fallbackRoute = fallbackKeywordRoute(text);
      if (fallbackRoute) {
        return { action: "route", route_id: fallbackRoute, ai_used: false };
      }
      return { action: "show_services", ai_used: false };
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

    // If the model answered conversationally but skipped routing, recover route deterministically from keywords.
    // This is especially useful for providers that are weaker at strict JSON/tool-style outputs.
    if (!parsed.route_id && (parsed.action === "respond" || parsed.action === "clarify")) {
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
