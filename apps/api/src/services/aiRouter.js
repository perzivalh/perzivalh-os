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
};

// Schema para respuestas de la IA
const ROUTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["respond", "route", "handoff", "clarify", "show_services"],
    },
    text: { type: "string" },           // Respuesta conversacional
    route_id: { type: "string" },       // Nodo destino si action=route
    question: { type: "string" },       // Pregunta si action=clarify
    reason: { type: "string" },         // Razón interna (debug)
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

    // Info
    "horario": "HORARIOS_INFO",
    "ubicacion": "HORARIOS_INFO",
    "donde": "HORARIOS_INFO",
    "direccion": "HORARIOS_INFO",
    "precio": "PRECIOS_INFO",
    "cuanto": "PRECIOS_INFO",
    "costo": "PRECIOS_INFO",

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
  const provider = aiConfig.provider || aiFlow.provider || "gemini";
  const rawKey = aiConfig.key || aiConfig.api_key ||
    (provider === "gemini"
      ? process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
      : process.env.OPENAI_API_KEY);
  const apiKey = rawKey ? String(rawKey).trim() : "";

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

  const model = aiConfig.model || DEFAULT_MODELS[provider];
  logger.info("ai.router_request", { provider, model, flowId, historyLength: summary.messageCount });

  try {
    // Call AI
    const raw = await callAiProvider(provider, {
      apiKey,
      model,
      system,
      user,
      schema: ROUTER_SCHEMA,
      temperature: 0.3,
      maxTokens: 300,
    });

    logger.info("ai.router_raw", { provider, model, length: raw?.length || 0 });

    let parsed = safeJsonParse(raw);

    // Retry if parse failed
    if (!parsed?.action) {
      logger.warn("ai.router_parse_failed", { preview: raw?.slice(0, 100) });

      const retryRaw = await callAiProvider(provider, {
        apiKey,
        model,
        system: system + "\n\nIMPORTANTE: Responde SOLO con JSON válido, sin texto adicional.",
        user,
        schema: ROUTER_SCHEMA,
        temperature: 0,
        maxTokens: 300,
      });

      parsed = safeJsonParse(retryRaw);
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
