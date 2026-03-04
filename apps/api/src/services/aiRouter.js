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
const knowledgeService = require("./knowledgeService");
const { getHistoryForAI, getConversationSummary } = require("./conversationMemory");
const { getTenantContext } = require("../tenancy/tenantContext");

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

const PODIATRY_EXTRA_DOMAIN_WORDS = [
  "matricectomia", "matricetomia", "onicocriptosis", "onicocriptosis ungueal",
];

const DETERMINISTIC_DOMAIN_INTENTS = [
  { routeId: "PRECIOS_INFO", intent: "prices", phrases: ["precio", "precios", "costo", "costos", "tarifa", "tarifas", "cuanto cuesta", "cuanto vale", "cuanto cobran"] },
  { routeId: "HORARIOS_INFO", intent: "hours", phrases: ["horario", "horarios", "hora", "horas", "rango de hora", "rango de horas", "atienden"] },
  { routeId: "HORARIOS_INFO", intent: "location", phrases: ["ubicacion", "ubicaciones", "direccion", "sucursal", "sucursales", "como llegar", "donde estan", "donde queda", "clinica"] },
  { routeId: "CONTACT_METHOD", intent: "contact", phrases: ["asesor", "asesora", "humano", "recepcion", "hablar con alguien", "hablar con una persona", "llamar"] },
  { routeId: "SERVICIOS_MENU", intent: "services_menu", phrases: ["servicios", "que servicios", "que ofrecen", "que tienen", "que hacen", "tratamientos disponibles", "ver opciones", "con que trabajan", "en que trabajan", "con que trabajan entonces", "en que trabajan entonces"] },
  { routeId: "UNERO_TIPO_TRAT", intent: "unero", phrases: ["unero", "uneros", "una encarnada", "unas encarnadas", "una clavada"] },
  { routeId: "TRAT_MATRICECTOMIA_INFO", intent: "matricectomia", phrases: ["matricectomia", "matricetomia", "cirugia de unero", "operacion unero"] },
  { routeId: "HONGOS_TIPO_TRAT", intent: "hongos", phrases: ["hongo", "hongos", "onicomicosis"] },
  { routeId: "SVC_PEDICURE_INFO", intent: "pedicure", phrases: ["pedicure", "pedicura", "pedicure clinico", "pedicura clinica", "limpieza de pies", "limpieza podal"] },
];

const HOURS_QUALIFIER_PHRASES = [
  "horario",
  "horarios",
  "hora",
  "horas",
  "atienden",
  "a que hora",
  "en que horario",
];

const HOURS_QUALIFIED_SERVICE_INTENTS = [
  {
    routeId: "SVC_PODOPEDIATRIA_INFO",
    intent: "hours_service_override_podopediatria",
    phrases: [
      "podopediatria",
      "podopediatria infantil",
      "infante",
      "infantes",
      "nino",
      "nina",
      "ninos",
      "ninas",
      "bebe",
      "bebes",
      "menor",
      "menores",
      "poca edad",
    ],
  },
  {
    routeId: "SVC_PODOGERIATRIA_INFO",
    intent: "hours_service_override_podogeriatria",
    phrases: [
      "podogeriatria",
      "adulta mayor",
      "adulto mayor",
      "adultas mayores",
      "adultos mayores",
      "persona adulta mayor",
      "personas adultas mayores",
      "tercera edad",
      "persona mayor",
      "personas mayores",
      "abuelito",
      "abuelita",
      "anciano",
      "anciana",
    ],
  },
  {
    routeId: "OTR_PIE_DIABETICO_INFO",
    intent: "hours_service_override_pie_diabetico",
    phrases: [
      "pie diabetico",
      "paciente diabetico",
      "paciente diabetica",
      "persona con diabetes",
      "personas con diabetes",
      "diabetico",
      "diabetica",
      "diabeticos",
      "diabeticas",
      "diabetes",
    ],
  },
];

const DOMAIN_META_PHRASES = [
  "precio", "precios", "costo", "costos", "tarifa", "tarifas", "cuanto cuesta", "cuanto vale",
  "horario", "horarios", "hora", "horas", "rango de hora", "rango de horas",
  "ubicacion", "ubicaciones", "sucursal", "direccion", "como llegar", "clinica",
  "que servicios", "que ofrecen", "lista de servicios", "servicios disponibles",
  "consulta", "evaluacion", "valoracion", "cita", "agendar", "agenda", "turno", "reservar",
  "asesor", "asesora", "recepcion", "humano", "contacto", "whatsapp",
];
const DOMAIN_AMBIGUOUS_HEALTH_WORDS = [
  "dolor", "duele", "sangra", "sangrado", "hinchado", "inflamado", "pus", "supura", "infeccion",
  "ardor", "picazon", "fiebre", "herida",
];
const DOMAIN_NEUTRAL_WORDS = new Set([
  "hola", "buenas", "buenos", "dias", "tardes", "noches", "buen", "dia", "hey", "ola",
  "por", "favor", "porfa", "xfa", "gracias", "ok", "oki", "bueno", "quiero", "necesito",
  "me", "mi", "mis", "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas",
  "que", "como", "donde", "cuando", "si", "y", "o", "con", "sin", "para", "ahora", "puedo", "ir",
  "informacion", "info", "ayuda", "servicio", "servicios", "tratamiento", "tratamientos",
  "entiendo", "entender", "explica", "explicame", "muestrame", "mostrar", "muestro",
]);
const DOMAIN_WEAK_SIGNAL_TERMS = new Set([
  "limpieza",
  "consulta",
  "evaluacion",
  "valoracion",
  "atencion",
  "servicio",
  "servicios",
  "tratamiento",
  "tratamientos",
]);
const DOMAIN_GENERIC_NON_TOPIC_WORDS = new Set([
  "tiene", "tienen", "saber", "se", "ser", "estar", "estas", "esta",
  "atender", "atendido", "atendida", "atienda", "atencion", "atendido",
  "ir", "voy", "puedo", "podria", "hacer", "haria", "quisiera",
  "necesito", "quiero", "busco", "donde", "como", "cuando",
]);
const KNOWLEDGE_DOMAIN_LEXICON_CACHE = new WeakMap();

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
  const personalidad = kb.personalidad || {};
  const clinica = kb.clinica || {};
  const servicios = kb.servicios || {};
  const ubicaciones = kb.ubicaciones || {};
  const nombre = personalidad.nombre || "PODITO";
  const clinicaNombre = clinica.nombre || "PODOPIE";
  const ciudad = clinica.ciudad || "Santa Cruz, Bolivia";

  const serviciosList = Object.values(servicios)
    .map((svc) => {
      const serviceName = String(svc?.nombre || "").trim();
      if (!serviceName) return null;

      const parts = [serviceName];
      const servicePrice = String(svc?.precio || "").trim();
      const serviceKeywords = String(svc?.keywords || "").trim();
      const serviceDesc = String(svc?.descripcion || "").replace(/\s+/g, " ").trim();

      if (servicePrice) {
        parts.push(`Precio: ${servicePrice}`);
      }
      if (serviceKeywords) {
        parts.push(`Keywords: ${serviceKeywords}`);
      }
      if (serviceDesc) {
        parts.push(`Descripcion: ${serviceDesc.slice(0, 220)}`);
      }

      return `- ${parts.join(" | ")}`;
    })
    .filter(Boolean)
    .join("\n");

  const ubicacionesList = Object.values(ubicaciones)
    .map((loc) => {
      const locName = String(loc?.nombre || "").trim();
      if (!locName) return null;

      const parts = [locName];
      const locAddress = String(loc?.direccion || "").replace(/\s+/g, " ").trim();
      const locHours = String(loc?.horario || "").replace(/\s+/g, " ").trim();
      const locPhone = String(loc?.telefono || "").trim();
      const locMaps = String(loc?.maps_url || "").trim();

      if (locAddress) {
        parts.push(`Direccion: ${locAddress.slice(0, 220)}`);
      }
      if (locHours) {
        parts.push(`Horario: ${locHours.slice(0, 140)}`);
      }
      if (locPhone) {
        parts.push(`Telefono: ${locPhone}`);
      }
      if (locMaps) {
        parts.push(`Mapa: ${locMaps}`);
      }

      return `- ${parts.join(" | ")}`;
    })
    .filter(Boolean)
    .join("\n");

  const nodeCatalog = flow ? buildRoutingNodeCatalog(flow) : `MAIN_MENU, SERVICIOS_MENU, HORARIOS_INFO, PRECIOS_INFO, CONTACT_METHOD, UNERO_TIPO_TRAT, HONGOS_TIPO_TRAT, SVC_PEDICURE_INFO, SVC_PODOPEDIATRIA_INFO, SVC_PODOGERIATRIA_INFO, OTR_PIE_DIABETICO_INFO, OTR_CALLOSIDAD_INFO, OTR_HELOMA_INFO, OTR_VERRUGA_PLANTAR_INFO, OTR_EXTRACCION_UNA_INFO, OTR_PIE_ATLETA_INFO, OTROS_MENU`;

  return `# ${nombre} - Asistente Virtual de ${clinicaNombre}

## Tu Identidad
Eres ${nombre} ${personalidad.emoji || "??"}, el asistente virtual de ${clinicaNombre}, una clinica de podologia en ${ciudad}.

## Tu Personalidad
- Tono: ${personalidad.tono || "amable, calido, profesional"}
- Idioma: ${personalidad.idioma || "espanol boliviano casual"}
- Emojis moderados: ${(personalidad.emojis_frecuentes || ["??", "?"]).slice(0, 4).join(" ")}
- Maximo ${personalidad.maximo_oraciones || 2} oraciones por respuesta conversacional
- Se conversacional, NO robotico

## Importante
- ${clinica.especialidad || "SOLO trabajamos con pies"}
- NO hacemos: ${(clinica.no_hacemos || ["manos", "manicure"]).join(", ")}

## Servicios Disponibles (resumen)
${serviciosList || "- Consultar en menu"}

## Ubicaciones y Horarios (resumen)
${ubicacionesList || "- Consultar disponibilidad"}

## Como Responder (JSON)
{
  "action": "respond|route|handoff|clarify|show_services|menu|out_of_scope",
  "text": "Respuesta conversacional",
  "route_id": "NODO_ID (solo si action=route)",
  "question": "Pregunta (solo si action=clarify)",
  "reason": "Por que tomaste esta decision"
}

## Acciones
- route: usar cuando hay nodo claro (route_id exacto)
- respond: respuesta conversacional (saludos o fuera de rubro)
- handoff: urgencias o sintomas graves
- clarify: falta dato clave (max 1 vez)
- show_services: usuario no sabe que necesita
- out_of_scope: permitido, pero si lo usas incluye text personalizado

## Reglas de Decision (prioridad)
1. Si existe un nodo claro para el tema podologico -> route con route_id exacto.
2. Si saluda -> respond con saludo corto y pregunta como ayudar.
3. Si hay dolor intenso/urgencia/sangrado/pus/infeccion/ulcera -> handoff.
4. Si pide precios/costos/tarifas -> route PRECIOS_INFO.
5. Si pide horarios/ubicacion/sucursal/direccion -> route HORARIOS_INFO.
6. Si pide contacto/asesor/humano -> route CONTACT_METHOD (o handoff si hay urgencia).
7. Si no sabe que servicio necesita -> show_services.
8. Si el tema NO es de pies/podologia (ej: peluqueria, reposteria, barberia, maquillaje, manos) -> respond con text personalizado mencionando lo que pidio y aclarando que solo atienden pies. No repitas el mismo mensaje generico.
9. Usa clarify solo si falta dato clave y como maximo una vez.
10. NUNCA repitas la misma pregunta de clarificacion.

## Rutas Directas (prioridad alta)
- precio/costo/cuanto/tarifa -> PRECIOS_INFO
- servicio/tratamiento/que ofrecen/que tienen -> SERVICIOS_MENU (solo si sigue siendo podologia)
- horario/ubicacion/donde/sucursal/direccion/como llegar -> HORARIOS_INFO
- asesor/humano/llamar/contacto/atencion personal -> CONTACT_METHOD
- unero/una encarnada -> UNERO_TIPO_TRAT
- hongo/onicomicosis -> HONGOS_TIPO_TRAT
- pedicure/pedicura -> SVC_PEDICURE_INFO
- pie de atleta -> OTR_PIE_ATLETA_INFO
- callo/callosidad -> OTR_CALLOSIDAD_INFO
- verruga -> OTR_VERRUGA_PLANTAR_INFO
- diabetes/pie diabetico -> OTR_PIE_DIABETICO_INFO

## Nodos Disponibles para Routing
${nodeCatalog}

## Importante Final
- Cuando action sea respond/clarify/out_of_scope, incluye text o question util y personalizado.
- Cuando route a precio/horario/servicios, no inventes datos: usa el nodo del flujo.`;
}

/**
 * Build user prompt with message and context
 */
function buildUserPrompt({ message, history, summary, previousQuestion }) {
  const contextParts = [];
  const historyMaxChars = Number(process.env.AI_ROUTER_FULL_FALLBACK_HISTORY_CHARS || 420);

  if (history && !String(history).startsWith("(Primera interacci")) {
    const historyStr = String(history);
    const trimmedHistory = historyStr.length > historyMaxChars
      ? "..." + historyStr.slice(-historyMaxChars)
      : historyStr;
    contextParts.push("[historial_reciente]\n" + trimmedHistory);
  }

  if (summary?.currentNode) {
    contextParts.push("[nodo_actual]: " + summary.currentNode);
  }

  if (summary?.lastRouteId) {
    contextParts.push("[ultima_ruta]: " + summary.lastRouteId);
  }

  if (Array.isArray(summary?.servicesDiscussed) && summary.servicesDiscussed.length) {
    contextParts.push("[servicios_mencionados]: " + summary.servicesDiscussed.slice(-3).join(", "));
  }

  if (previousQuestion) {
    contextParts.push("[pregunta_anterior_no_repetir]: " + previousQuestion);
  }

  if (summary?.clarificationsAsked > 0) {
    contextParts.push("[clarificaciones_previas]: " + summary.clarificationsAsked);
  }

  contextParts.push("[mensaje]: " + message);

  return contextParts.join("\n");
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
    .map((n) => `- ${n.id}`)
    .join("\n");
}

function buildCloudflareRouteSystemPrompt({ knowledge, flow, previousQuestion, summary }) {
  const clinica = knowledge?.clinica || {};
  const serviciosCompact = Object.values(knowledge?.servicios || {})
    .map((svc) => {
      const name = String(svc?.nombre || "").trim();
      if (!name) return null;
      const keywords = String(svc?.keywords || "").trim();
      const compactKeywords = keywords
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(", ");
      return compactKeywords ? `- ${name}: ${compactKeywords}` : `- ${name}`;
    })
    .filter(Boolean)
    .slice(0, 12)
    .join("\n");
  const nodeCatalog = buildRoutingNodeCatalog(flow);
  const clarifyCount = Number(summary?.clarificationsAsked || 0);

  return `Eres un router de WhatsApp para ${clinica.nombre || "PODOPIE"}.
Devuelve SOLO JSON valido.
Tu trabajo es decidir accion y route_id. No expliques nada, no redactes horarios, no des direcciones.

Reglas:
- route: si pide servicios, tratamiento, horarios, ubicacion, direccion, sucursal, precios o contacto del negocio.
- handoff: si pide humano/asesor o hay urgencia.
- respond: solo si es fuera de podologia.
- clarify: solo si falta contexto real y maximo una vez.
- show_services: si es del negocio pero no identificas nodo exacto.

Atajos:
- ubicacion, direccion, sucursal, como llegar -> HORARIOS_INFO
- precio, costo, cuanto cuesta -> PRECIOS_INFO
- asesor, humano, recepcion -> CONTACT_METHOD

Servicios detectables:
${serviciosCompact || "- servicios"}

Acciones permitidas: respond, route, handoff, clarify, show_services, menu.
${previousQuestion ? "IMPORTANTE: ya se hizo una pregunta de clarificacion antes, evita otra salvo que sea imprescindible." : ""}
${clarifyCount >= 1 ? "IMPORTANTE: ya hubo clarificaciones previas; prioriza route/show_services/handoff." : ""}

NODOS DISPONIBLES:
${nodeCatalog || "- MAIN_MENU"}

Esquema JSON:
{"action":"route","route_id":"NODE_ID","reason":"breve"}
Campos opcionales: route_id, question, reason.
Si action=clarify incluye question.`;
}

function buildCloudflareCopyPrompt({ knowledge, action, userText, kbSnippet = "" }) {
  const personalidad = knowledge?.personalidad || {};
  const clinica = knowledge?.clinica || {};
  const tone = personalidad.tono || "amable, calido y profesional";
  const emoji = Array.isArray(personalidad.emojis_frecuentes) && personalidad.emojis_frecuentes.length
    ? personalidad.emojis_frecuentes.slice(0, 2).join(" ")
    : "🦶";
  const onlyFeet = clinica.especialidad || "solo atendemos temas de pies/podologia";
  const snippetSuffix = kbSnippet ? `\nContexto relevante:\n${kbSnippet}` : "";

  if (action === "clarify") {
    return {
      system: `Eres un asistente de ${clinica.nombre || "PODOPIE"}. Responde SOLO con una pregunta corta (1 frase) para aclarar la necesidad del usuario. Tono ${tone}. No inventes horarios/precios. Usa español.`,
      user: `Mensaje del usuario: "${userText}"\nDevuelve solo la pregunta, sin JSON.`,
    };
  }

  return {
    system: `Eres un asistente de ${clinica.nombre || "PODOPIE"}. Tono ${tone}. Maximo 2 oraciones. No inventes horarios, direcciones ni precios. Si el tema no es podologia, aclara que ${onlyFeet} y menciona brevemente el rubro/servicio pedido por el usuario para personalizar la respuesta. Puedes usar ${emoji}.${snippetSuffix}`,
    user: `Responde al usuario de forma breve y util.\nMensaje del usuario: "${userText}"\nDevuelve solo el texto final, sin JSON ni markdown.`,
  };
}

function buildRouteBridgeFallback(routeId, action) {
  const normalizedRoute = String(routeId || "").trim();
  if (normalizedRoute === "HORARIOS_INFO") {
    return "Claro, te comparto la ubicacion y como llegar.";
  }
  if (normalizedRoute === "PRECIOS_INFO") {
    return "Claro, te comparto los precios.";
  }
  if (normalizedRoute === "CONTACT_METHOD" || action === "handoff") {
    return "Claro, te ayudo con eso.";
  }
  if (normalizedRoute === "SERVICIOS_MENU" || action === "show_services" || action === "services") {
    return "Claro, te muestro las opciones.";
  }
  if (action === "menu") {
    return "Claro, volvamos al menu principal.";
  }
  return "Claro, te ayudo con eso.";
}

function buildRouteBridgePrompt({ knowledge, routeId, action, userText }) {
  const personalidad = knowledge?.personalidad || {};
  const clinica = knowledge?.clinica || {};
  const tone = personalidad.tono || "amable, calido y profesional";
  const objective =
    routeId === "HORARIOS_INFO"
      ? "Confirma que vas a compartir ubicacion, sucursal u horarios."
      : routeId === "PRECIOS_INFO"
        ? "Confirma que vas a compartir precios."
        : routeId === "CONTACT_METHOD" || action === "handoff"
          ? "Confirma que vas a ayudar con contacto o atencion."
          : routeId === "SERVICIOS_MENU" || action === "show_services" || action === "services"
            ? "Confirma que vas a mostrar servicios u opciones."
            : action === "menu"
              ? "Confirma que vas a volver al menu."
              : "Confirma que vas a ayudar con lo pedido.";

  return {
    system: `Eres ${personalidad.nombre || "PODITO"}, asistente de ${clinica.nombre || "PODOPIE"}. Tono ${tone}. Escribe UNA sola frase natural, breve y humana. ${objective} NO inventes datos concretos, NO des direcciones, horarios, precios ni detalles medicos. Solo una frase puente antes de la informacion real.`,
    user: `Mensaje del usuario: "${userText}"\nDevuelve solo la frase final, sin JSON ni markdown.`,
  };
}

async function generateRouteBridgeText({
  provider,
  apiKey,
  model,
  accountId,
  knowledge,
  routeId,
  action,
  userText,
  flowId,
  chatBudget,
}) {
  const fallbackText = buildRouteBridgeFallback(routeId, action);
  const prompt = buildRouteBridgePrompt({
    knowledge,
    routeId,
    action,
    userText,
  });

  try {
    const raw = await callAiProvider(provider, withChatBudget({
      apiKey,
      model,
      accountId,
      system: prompt.system,
      user: prompt.user,
      temperature: 0.2,
      maxTokens: 60,
      trace: {
        feature: "ai_router",
        operation: "copy",
        stage: "route_bridge",
        flowId,
      },
    }, chatBudget));

    const cleaned = String(raw || "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/^\s*#+\s*/gm, "")
      .trim();

    return cleaned || fallbackText;
  } catch (error) {
    logger.warn("ai.router_route_bridge_error", {
      provider,
      model,
      routeId: routeId || null,
      action,
      message: error.message,
    });
    return fallbackText;
  }
}

async function generateOutOfDomainReplyText({
  provider,
  apiKey,
  model,
  accountId,
  knowledge,
  userText,
  flowId,
  chatBudget,
}) {
  const fallbackText = buildOutOfDomainResponseText({ text: userText, knowledge });
  const prompt = buildCloudflareCopyPrompt({
    knowledge,
    action: "respond",
    userText,
  });

  try {
    const raw = await callAiProvider(provider, withChatBudget({
      apiKey,
      model,
      accountId,
      system: prompt.system,
      user: prompt.user,
      temperature: 0.2,
      maxTokens: 90,
      trace: {
        feature: "ai_router",
        operation: "copy",
        stage: "out_of_domain_copy",
        flowId,
      },
    }, chatBudget));

    const cleaned = String(raw || "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/^\s*#+\s*/gm, "")
      .trim();

    return cleaned || fallbackText;
  } catch (error) {
    logger.warn("ai.router_out_of_domain_copy_error", {
      provider,
      model,
      message: error.message,
    });
    return fallbackText;
  }
}

async function callRouteDecisionWithRetry({
  provider,
  apiKey,
  model,
  accountId,
  system,
  user,
  flowId,
  chatBudget,
}) {
  const isBlankRaw = (value) => !String(value || "").trim();
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
  const traceBase = {
    feature: "ai_router",
    operation: "route_decision",
    flowId,
  };

  const raw = await callAiProvider(provider, withChatBudget({
    apiKey,
    model,
    accountId,
    system,
    user,
    schema: ROUTER_DECISION_SCHEMA,
    temperature: 0,
    maxTokens: 180,
    trace: { ...traceBase, stage: "route_decision_primary", attempt: 1 },
  }, chatBudget));
  logger.info("ai.router_raw", { provider, model, length: raw?.length || 0 });
  let parsed = tryParse(raw, "route_primary");
  if (parsed?.action) return parsed;
  if (isBlankRaw(raw)) {
    logger.warn("ai.router_empty_primary", { provider, model, flowId });
  }

  logger.warn("ai.router_parse_failed", { preview: raw?.slice(0, 100) || "" });

  const retryRaw = await callAiProvider(provider, withChatBudget({
    apiKey,
    model,
    accountId,
    system: `${system}\n\nRESPUESTA OBLIGATORIA: devuelve SOLO JSON valido. NO texto conversacional. NO markdown.`,
    user: `${user}\n\nDevuelve SOLO JSON.`,
    schema: ROUTER_DECISION_SCHEMA,
    temperature: 0,
    maxTokens: 180,
    trace: { ...traceBase, stage: "route_decision_retry", attempt: 2 },
  }, chatBudget));
  parsed = tryParse(retryRaw, "route_retry");
  if (parsed?.action) return parsed;
  if (isBlankRaw(retryRaw)) {
    logger.warn("ai.router_empty_retry_skip_repair", { provider, model, flowId });
    logger.warn("ai.router_fallback", { flowId, reason: "empty_retry_response" });
    return null;
  }

  // Repair pass: if model keeps chatting, ask ONLY for action/route without explanations.
  const repairRaw = await callAiProvider(provider, withChatBudget({
    apiKey,
    model,
    accountId,
    system: `${system}\n\nMODO REPARACION: decide accion y route_id. Si el usuario pide servicio/horario/precio/contacto, NO uses respond; usa route/show_services/handoff.`,
    user: `Usuario: ${user}\nResponde SOLO JSON con action y route_id si aplica.`,
    schema: ROUTER_DECISION_SCHEMA,
    temperature: 0,
    maxTokens: 140,
    trace: { ...traceBase, stage: "route_decision_repair", attempt: 3 },
  }, chatBudget));
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
  chatBudget,
}) {
  logger.info("ai.router_mode", { provider, model, mode: "route_first", flowId });

  const routeSystem = buildCloudflareRouteSystemPrompt({
    knowledge,
    flow,
    previousQuestion,
    summary,
  });
  const routeUser = buildCompactRouteUserPrompt({
    message: text,
    summary,
    previousQuestion,
    session,
  });

  let parsed = await callRouteDecisionWithRetry({
    provider,
    apiKey,
    model,
    accountId: cloudflareAccountId,
    system: routeSystem,
    user: routeUser,
    flowId,
    chatBudget,
  });

  if (!parsed?.action) {
    return null;
  }

  parsed.action = normalizeRouterAction(parsed.action);
  parsed = normalizeOutOfScopeDecision({
    parsed,
    flow,
    text,
    knowledge,
    provider,
    model,
    source: "cloudflare_route_first",
  });

  // If the model returned respond but also supplied route_id, prefer route.
  if (parsed.action === "respond" && parsed.route_id) {
    parsed.action = "route";
  }

  // If clarify was already used, downgrade to show_services.
  if (parsed.action === "clarify" && (previousQuestion || summary?.clarificationsAsked >= 1)) {
    parsed = { action: "show_services", reason: "clarify_limit" };
  }

  // Prefer conversational copy for out-of-scope so the answer can be personalized.
  if (parsed.action === "out_of_scope") {
    parsed = { ...parsed, action: "respond" };
  }

  // If model returned respond/show_services without a specific route, augment with keyword routing.
  if (
    !parsed.route_id &&
    shouldForceKeywordRoute(text) &&
    (parsed.action === "respond" || parsed.action === "show_services" || parsed.action === "clarify")
  ) {
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
    const normalizedAction = normalizeRouterAction(parsed.action);
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
      action: normalizedAction,
      text: normalizedAction === "out_of_scope" ? String(parsed.text || "").trim() : "",
      ai_used: true,
      clear_pending: Boolean(previousQuestion),
      reset_turns: parsed.action === "route" || parsed.action === "show_services" || parsed.action === "menu",
    };
  }

  // Generate text ONLY when the final action is conversational.
  const kbSnippet = buildKnowledgeSnippetForCopy({
    knowledge,
    text,
    routeId: parsed.route_id,
  });
  const copyPrompt = buildCloudflareCopyPrompt({
    knowledge,
    action: parsed.action,
    userText: text,
    kbSnippet,
  });

  let copyRaw = "";
  try {
    copyRaw = await callAiProvider(provider, withChatBudget({
      apiKey,
      model,
      accountId: cloudflareAccountId,
      system: copyPrompt.system,
      user: copyPrompt.user,
      temperature: 0.2,
      maxTokens: parsed.action === "clarify" ? 80 : 180,
      trace: {
        feature: "ai_router",
        operation: "copy",
        stage: parsed.action === "clarify" ? "copy_clarify" : "copy_respond",
        mode: "cloudflare_route_first",
        flowId,
      },
    }, chatBudget));
  } catch (error) {
    if (error?.code === "AI_CHAT_DAILY_BUDGET_EXCEEDED") {
      throw error;
    }
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

  const textReply =
    cleanedCopy ||
    String(parsed.text || "").trim() ||
    (evaluateDomainGate({ text, knowledge }).classification === "out_of_domain"
      ? buildOutOfDomainResponseText({ text, knowledge })
      : "Entiendo tu consulta. Te ayudo con eso.");
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
    "con que trabajan": "SERVICIOS_MENU",
    "en que trabajan": "SERVICIOS_MENU",
    "con que trabajan entonces": "SERVICIOS_MENU",
    "en que trabajan entonces": "SERVICIOS_MENU",
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

  let best = null;
  for (const [keyword, nodeId] of Object.entries(keywords)) {
    if (!normalized.includes(keyword)) continue;
    const routePriority =
      nodeId === "MAIN_MENU" ? 0 :
      nodeId === "SERVICIOS_MENU" ? 20 :
      nodeId === "PRECIOS_INFO" || nodeId === "HORARIOS_INFO" || nodeId === "CONTACT_METHOD" ? 30 :
      40;
    const score = (keyword.length * 10) + routePriority;
    if (!best || score > best.score) {
      best = { nodeId, keyword, score };
    }
  }

  return best?.nodeId || null;
}

async function routeWithStandardProviderRouteFirst({
  text,
  flow,
  session,
  knowledge,
  provider,
  model,
  apiKey,
  accountId,
  flowId,
  summary,
  previousQuestion,
  chatBudget,
}) {
  logger.info("ai.router_mode", { provider, model, mode: "route_first_compact", flowId });

  const routeSystem = buildCloudflareRouteSystemPrompt({
    knowledge,
    flow,
    previousQuestion,
    summary,
  });
  const routeUser = buildCompactRouteUserPrompt({
    message: text,
    summary,
    previousQuestion,
    session,
  });

  logger.info("ai.router_prompt_profile", {
    provider,
    model,
    flowId,
    strategy: "route_first_compact",
    routeSystemChars: routeSystem.length,
    routeUserChars: routeUser.length,
  });

  let parsed = await callRouteDecisionWithRetry({
    provider,
    apiKey,
    model,
    accountId,
    system: routeSystem,
    user: routeUser,
    flowId,
    chatBudget,
  });

  if (!parsed?.action) return null;

  parsed.action = normalizeRouterAction(parsed.action);
  parsed = normalizeOutOfScopeDecision({
    parsed,
    flow,
    text,
    knowledge,
    provider,
    model,
    source: "route_first_compact",
  });

  if (parsed.action === "respond" && parsed.route_id) {
    parsed.action = "route";
  }

  if (parsed.action === "clarify" && (previousQuestion || summary?.clarificationsAsked >= 1)) {
    parsed = { action: "show_services", reason: "clarify_limit" };
  }

  if (parsed.action === "out_of_scope") {
    parsed = { ...parsed, action: "respond" };
  }

  if (
    !parsed.route_id &&
    shouldForceKeywordRoute(text) &&
    (parsed.action === "respond" || parsed.action === "show_services" || parsed.action === "clarify")
  ) {
    const inferredRoute = fallbackKeywordRoute(text);
    if (inferredRoute) {
      logger.info("ai.router_keyword_augmented", {
        provider,
        model,
        originalAction: parsed.action,
        inferredRoute,
        stage: "route_first_compact",
      });
      parsed = { action: "route", route_id: inferredRoute, reason: "keyword_augmented" };
    }
  }

  if (["route", "show_services", "handoff", "menu", "services"].includes(parsed.action)) {
    const normalizedAction = normalizeRouterAction(parsed.action);
    logger.info("ai.router_decision", {
      provider,
      model,
      action: parsed.action,
      route_id: parsed.route_id || null,
      reason: parsed.reason || null,
      source: "route_first_compact_model",
    });
    return {
      ...parsed,
      action: normalizedAction,
      text: "",
      ai_used: true,
      clear_pending: Boolean(previousQuestion),
      reset_turns: parsed.action === "route" || parsed.action === "show_services" || parsed.action === "menu",
    };
  }

  const kbSnippet = buildKnowledgeSnippetForCopy({
    knowledge,
    text,
    routeId: parsed.route_id,
  });
  const copyPrompt = buildCloudflareCopyPrompt({
    knowledge,
    action: parsed.action,
    userText: text,
    kbSnippet,
  });

  logger.info("ai.router_prompt_profile", {
    provider,
    model,
    flowId,
    strategy: "copy_rich",
    copySystemChars: copyPrompt.system.length,
    copyUserChars: copyPrompt.user.length,
    kbSnippetChars: kbSnippet.length,
  });

  let copyRaw = "";
  try {
    copyRaw = await callAiProvider(provider, withChatBudget({
      apiKey,
      model,
      accountId,
      system: copyPrompt.system,
      user: copyPrompt.user,
      temperature: 0.2,
      maxTokens: parsed.action === "clarify" ? 80 : 180,
      trace: {
        feature: "ai_router",
        operation: "copy",
        stage: parsed.action === "clarify" ? "copy_clarify" : "copy_respond",
        mode: "route_first_compact",
        flowId,
      },
    }, chatBudget));
  } catch (error) {
    if (error?.code === "AI_CHAT_DAILY_BUDGET_EXCEEDED") {
      throw error;
    }
    logger.warn("ai.router_copy_error", { provider, model, message: error.message, source: "route_first_compact" });
  }

  const cleanedCopy = String(copyRaw || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^\s*#+\s*/gm, "")
    .trim();

  if (parsed.action === "clarify") {
    const question = parsed.question || cleanedCopy || "¿Podrías contarme un poco más para ayudarte mejor?";
    return {
      action: "clarify",
      question,
      reason: parsed.reason || null,
      ai_used: true,
      clear_pending: Boolean(previousQuestion),
      reset_turns: false,
    };
  }

  const fallbackText = evaluateDomainGate({ text, knowledge }).classification === "out_of_domain"
    ? buildOutOfDomainResponseText({ text, knowledge })
    : "Entiendo tu consulta. Te ayudo con eso.";

  return {
    action: "respond",
    text: cleanedCopy || String(parsed.text || "").trim() || fallbackText,
    reason: parsed.reason || null,
    ai_used: true,
    clear_pending: Boolean(previousQuestion),
    reset_turns: false,
  };
}

/**
 * Main AI routing function - AI-First Architecture
 */
async function routeWithAI({ text, flow, config, session, waId }) {
  const aiConfig = config?.ai || {};
  const aiFlow = flow.ai || {};
  const flowId = flow?.id || "unknown";
  const { tenantId } = getTenantContext();
  const chatBudget = waId
    ? {
        tenantId: tenantId || "legacy",
        waId,
      }
    : null;

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
          : provider === "cerebras"
            ? process.env.CEREBRAS_API_KEY
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

  // Load knowledge base (DB-driven con fallback al archivo JS)
  let knowledge;
  try {
    knowledge = await knowledgeService.getKnowledge(flowId);
  } catch (err) {
    logger.warn("ai.knowledge_service_error", { message: err.message });
    knowledge = loadKnowledgeBase(flowId);
  }

  // Get conversation context
  const history = getHistoryForAI(session?.data);
  const summary = getConversationSummary(session?.data);
  const previousQuestion = session?.data?.ai_pending?.question || null;
  const domainGate = evaluateDomainGate({ text, knowledge });

  logger.info("ai.domain_gate", {
    flowId,
    classification: domainGate.classification,
    confidence: Number(domainGate.confidence || 0).toFixed(2),
    reason: domainGate.reason || null,
    phraseHits: Array.isArray(domainGate.phraseHits) ? domainGate.phraseHits.slice(0, 4) : [],
    tokenHits: Array.isArray(domainGate.tokenHits) ? domainGate.tokenHits.slice(0, 4) : [],
    unknownTokens: Array.isArray(domainGate.unknownTokens) ? domainGate.unknownTokens.slice(0, 4) : [],
  });

  const deterministicDecision = buildDeterministicDecision({
    text,
    previousQuestion,
    summary,
    knowledge,
  });
  if (deterministicDecision?.action) {
    logger.info("ai.router_deterministic", {
      flowId,
      action: deterministicDecision.action,
      route_id: deterministicDecision.route_id || null,
      reason: deterministicDecision.reason || null,
    });
    return deterministicDecision;
  }

  // If no API key, use fallback
  if (!apiKey) {
    logger.warn("ai.router_no_key", { provider, flowId });
    const fallbackRoute = fallbackKeywordRoute(text);
    if (fallbackRoute) {
      return { action: "route", route_id: fallbackRoute, ai_used: false };
    }
    return { action: "show_services", ai_used: false };
  }

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

  const cacheKey = buildRouterCacheKey({
    flowId,
    provider,
    model,
    text,
    summary,
    previousQuestion,
    session,
  });
  const cachedDecision = getRouterDecisionFromCache(cacheKey);
  if (cachedDecision?.action) {
    return cachedDecision;
  }

  const cacheAndReturn = (decision) => {
    if (decision?.action) {
      setRouterDecisionCache(cacheKey, decision);
    }
    return decision;
  };

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
        chatBudget,
      });
      if (cloudflareDecision?.action) {
        return cacheAndReturn(cloudflareDecision);
      }
      logger.warn("ai.router_cloudflare_no_decision", { flowId, model });
      return cacheAndReturn({
        action: "respond",
        text: "Puedo ayudarte con temas de pies y podología. Si quieres, dime si buscas información de un servicio, horarios, precios o atención con un asesor.",
        ai_used: false,
      });
    } catch (error) {
      if (error?.code === "AI_CHAT_DAILY_BUDGET_EXCEEDED" || error?.code === "AI_BUDGET_EXCEEDED") {
        logger.warn("ai.router_cloudflare_budget_fallback", { flowId, provider, model, message: error.message });
        return cacheAndReturn(
          buildLowCostRecoveryDecision({
            text,
            previousQuestion,
            summary,
            knowledge,
            domainGate,
            reason: "low_cost_recovery:cloudflare_budget_guard",
          })
        );
      }
      logger.error("ai.router_error", { message: error.message, provider, model, flowId });
      return cacheAndReturn({
        action: "respond",
        text: "Tuve un problema procesando tu mensaje, pero puedo ayudarte con temas de pies. Si quieres, dime el servicio que buscas o si prefieres hablar con un asesor.",
        ai_used: false,
      });
    }
  }

  let compactProviderModelBlocked = false;
  let compactErrorInfo = null;
  let compactResultState = "unknown";
  try {
    const compactDecision = await routeWithStandardProviderRouteFirst({
      text,
      flow,
      session,
      knowledge,
      provider,
      model,
      apiKey,
      accountId: cloudflareAccountId,
      flowId,
      summary,
      previousQuestion,
      chatBudget,
    });
    if (compactDecision?.action) {
      return cacheAndReturn(compactDecision);
    }
    compactResultState = "no_decision";
    logger.warn("ai.router_compact_no_decision", { flowId, provider, model });
  } catch (error) {
    compactErrorInfo = classifyCompactRouterError(error);
    compactProviderModelBlocked = Boolean(compactErrorInfo.modelBlocked);
    compactResultState = "error";
    logger.warn("ai.router_compact_error", { flowId, provider, model, message: error.message });
  }

  if (compactProviderModelBlocked) {
    logger.warn("ai.router_model_blocked_skip_full_fallback", { flowId, provider, model });
    const fallbackRoute = fallbackKeywordRoute(text);
    if (fallbackRoute) {
      return cacheAndReturn({ action: "route", route_id: fallbackRoute, ai_used: false });
    }
    return cacheAndReturn({ action: "show_services", ai_used: false });
  }

  if (domainGate.classification === "out_of_domain") {
    const recoveredRoute = fallbackKeywordRoute(text);
    if (recoveredRoute) {
      logger.info("ai.router_out_of_domain_route_recovered", {
        flowId,
        provider,
        model,
        recoveredRoute,
        compactResultState,
      });
      return cacheAndReturn({
        action: "route",
        route_id: recoveredRoute,
        ai_used: false,
        clear_pending: Boolean(previousQuestion),
        reset_turns: true,
        reason: "low_cost_recovery:out_of_domain_route_recovered",
      });
    }

    logger.info("ai.router_skip_full_fallback", {
      flowId,
      provider,
      model,
      reason: "out_of_domain_cheap_copy",
      compactResultState,
    });
    const outOfDomainText = await generateOutOfDomainReplyText({
      provider,
      apiKey,
      model,
      accountId: cloudflareAccountId,
      knowledge,
      userText: text,
      flowId,
      chatBudget,
    });
    return cacheAndReturn({
      action: "respond",
      text: outOfDomainText,
      ai_used: true,
      clear_pending: Boolean(previousQuestion),
      reset_turns: false,
      reason: "out_of_domain_cheap_copy",
    });
  }

  if (domainGate.classification === "in_domain") {
    logger.info("ai.router_skip_full_fallback", {
      flowId,
      provider,
      model,
      reason: "route_priority_low_cost_recovery",
      compactResultState,
    });
    return cacheAndReturn(
      buildLowCostRecoveryDecision({
        text,
        previousQuestion,
        summary,
        knowledge,
        domainGate,
        reason: "low_cost_recovery:route_priority_compact_no_decision",
      })
    );
  }

  // Full prompt fallback (kept for hard/edge cases)
  const system = buildSystemPrompt(knowledge, session, flow);
  const user = buildUserPrompt({ message: text, history, summary, previousQuestion });
  const fullFallbackInputTokensEst = estimateTokensApproxFromText(system) + estimateTokensApproxFromText(user);
  const fullFallbackPolicy = shouldAttemptFullFallback({
    text,
    previousQuestion,
    summary,
    domainGate,
    compactResultState,
    compactErrorInfo,
    fullFallbackInputTokensEst,
  });

  if (!fullFallbackPolicy.allow) {
    logger.warn("ai.router_full_fallback_governor_skip", {
      flowId,
      provider,
      model,
      reason: fullFallbackPolicy.reason,
      compactResultState,
      compactError: compactErrorInfo?.message || null,
      fullFallbackInputTokensEst,
      domainClassification: domainGate.classification,
      domainConfidence: domainGate.confidence,
    });
    return cacheAndReturn(
      buildLowCostRecoveryDecision({
        text,
        previousQuestion,
        summary,
        knowledge,
        domainGate,
        reason: `low_cost_recovery:${fullFallbackPolicy.reason}`,
      })
    );
  }

  logger.info("ai.router_prompt_profile", {
    provider,
    model,
    flowId,
    strategy: "full_fallback",
    systemChars: system.length,
    userChars: user.length,
    inputTokensEst: fullFallbackInputTokensEst,
  });

  try {
    // Call AI
    const raw = await callAiProvider(provider, withChatBudget({
      apiKey,
      model,
      accountId: cloudflareAccountId,
      system,
      user,
      schema: ROUTER_SCHEMA,
      temperature: 0.3,
      maxTokens: 300,
      trace: {
        feature: "ai_router",
        operation: "full_fallback",
        stage: "full_fallback_primary",
        flowId,
      },
    }, chatBudget));

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

      const retryRaw = await callAiProvider(provider, withChatBudget({
        apiKey,
        model,
        accountId: cloudflareAccountId,
        system: system + "\n\nIMPORTANTE: Responde SOLO con JSON válido, sin texto adicional.",
        user,
        schema: ROUTER_SCHEMA,
        temperature: 0,
        maxTokens: 300,
        trace: {
          feature: "ai_router",
          operation: "full_fallback",
          stage: "full_fallback_retry",
          attempt: 2,
          flowId,
        },
      }, chatBudget));

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
        return cacheAndReturn({ action: "route", route_id: fallbackRoute, ai_used: false });
      }
      return cacheAndReturn({ action: "show_services", ai_used: false });
    }

    parsed = normalizeOutOfScopeDecision({
      parsed,
      flow,
      text,
      knowledge,
      provider,
      model,
      source: "full_fallback",
    });

    // Handle clarify limit
    if (parsed.action === "clarify" && (previousQuestion || summary.clarificationsAsked >= 1)) {
      logger.info("ai.router_clarify_blocked", { flowId });
      return cacheAndReturn({ action: "show_services", text: "Te muestro nuestras opciones:", ai_used: true });
    }

    // Avoid generic repeated out-of-scope node copy; answer conversationally instead.
    if (parsed.action === "out_of_scope") {
      parsed = {
        ...parsed,
        action: "respond",
        text: String(parsed.text || "").trim() || buildOutOfDomainResponseText({ text, knowledge }),
      };
    }

    // If the model answered conversationally but skipped routing (or routed to a generic node),
    // recover route deterministically from keywords.
    // Note: check even when route_id is present — model sometimes puts MAIN_MENU as fallback route_id
    // while using action="respond" for queries that clearly have a specific node.
    if (parsed.action === "respond" || parsed.action === "clarify") {
      const inferredRoute = fallbackKeywordRoute(text);
      const canPromoteToMainMenu = inferredRoute !== "MAIN_MENU" || shouldForceKeywordRoute(text);
      logger.info("ai.router_route_augmentation_check", {
        provider,
        model,
        action: parsed.action,
        inferredRoute: inferredRoute || null,
        canPromoteToMainMenu,
        userTextPreview: String(text || "").slice(0, 140),
      });
      if (inferredRoute && canPromoteToMainMenu) {
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
          text: "",
        };
      } else if (inferredRoute) {
        logger.info("ai.router_route_augmentation_skipped", {
          provider,
          model,
          originalAction: parsed.action,
          inferredRoute,
          reason: "main_menu_requires_simple_prompt",
        });
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
    return cacheAndReturn({
      ...parsed,
      ai_used: true,
      clear_pending: Boolean(previousQuestion),
      reset_turns: shouldResetTurns,
    });

  } catch (error) {
    logger.error("ai.router_error", { message: error.message, provider, model, flowId });

    const fullFallbackErrorInfo = classifyCompactRouterError(error);
    if (fullFallbackErrorInfo.budgetOrRateLimited || fullFallbackErrorInfo.timeoutOrTransient) {
      logger.warn("ai.router_full_fallback_low_cost_recovery", {
        flowId,
        provider,
        model,
        reason: fullFallbackErrorInfo.budgetOrRateLimited ? "budget_or_rate_limit" : "timeout_or_transient",
        message: fullFallbackErrorInfo.message,
      });
      return cacheAndReturn(
        buildLowCostRecoveryDecision({
          text,
          previousQuestion,
          summary,
          knowledge,
          domainGate,
          reason: fullFallbackErrorInfo.budgetOrRateLimited
            ? "low_cost_recovery:full_fallback_rate_limit"
            : "low_cost_recovery:full_fallback_transient_error",
        })
      );
    }

    // Fallback on error
    const fallbackRoute = fallbackKeywordRoute(text);
    if (fallbackRoute) {
      return cacheAndReturn({ action: "route", route_id: fallbackRoute, ai_used: false });
    }
    return cacheAndReturn({ action: "show_services", ai_used: false });
  }
}

// In-memory cache to avoid repeating expensive router/copy calls for the same message context.
const ROUTER_DECISION_CACHE = new Map();
const ROUTER_CACHE_TTL_MS = Number(process.env.AI_ROUTER_CACHE_TTL_MS || 10 * 60 * 1000);
const ROUTER_CACHE_MAX_ENTRIES = Number(process.env.AI_ROUTER_CACHE_MAX_ENTRIES || 500);

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

function addTermsToDomainLexicon(targetSet, sourceText) {
  const normalized = normalizeText(sourceText || "").toLowerCase().trim();
  if (!normalized) return;
  targetSet.add(normalized);
  for (const token of tokenizeDomainText(normalized)) {
    if (token.length < 3) continue;
    if (DOMAIN_NEUTRAL_WORDS.has(token)) continue;
    targetSet.add(token);
  }
}

function getKnowledgeDomainLexicon(knowledge) {
  if (!knowledge || typeof knowledge !== "object") {
    return { terms: new Set(), serviceNames: [] };
  }
  if (KNOWLEDGE_DOMAIN_LEXICON_CACHE.has(knowledge)) {
    return KNOWLEDGE_DOMAIN_LEXICON_CACHE.get(knowledge);
  }

  const terms = new Set();
  const serviceNames = [];

  for (const term of PODIATRY_CONTEXT_WORDS) addTermsToDomainLexicon(terms, term);
  for (const term of PODIATRY_EXTRA_DOMAIN_WORDS) addTermsToDomainLexicon(terms, term);
  for (const term of DOMAIN_META_PHRASES) addTermsToDomainLexicon(terms, term);

  addTermsToDomainLexicon(terms, knowledge?.clinica?.nombre);
  addTermsToDomainLexicon(terms, knowledge?.clinica?.especialidad);

  for (const svc of Object.values(knowledge?.servicios || {})) {
    if (!svc) continue;
    const name = String(svc.nombre || "").trim();
    const desc = String(svc.descripcion || "").trim();
    if (name) {
      serviceNames.push(normalizeText(name).toLowerCase());
      addTermsToDomainLexicon(terms, name);
    }
    if (desc) addTermsToDomainLexicon(terms, desc);
  }

  const result = { terms, serviceNames };
  KNOWLEDGE_DOMAIN_LEXICON_CACHE.set(knowledge, result);
  return result;
}

function evaluateDomainGate({ text, knowledge }) {
  const raw = String(text || "").trim();
  if (!raw) {
    return { classification: "ambiguous", confidence: 0, normalized: "", reason: "empty" };
  }

  const normalized = normalizeText(raw).toLowerCase().replace(/\s+/g, " ").trim();
  const tokens = [...new Set(tokenizeDomainText(normalized))];
  const contentTokens = tokens.filter((token) => token.length >= 3 && !DOMAIN_NEUTRAL_WORDS.has(token));
  const greetingOnly = contentTokens.length === 0;

  const { terms: domainTerms, serviceNames } = getKnowledgeDomainLexicon(knowledge);

  const phraseHits = [];
  const metaPhraseHits = [];
  const podiatryPhraseHits = [];
  const servicePhraseHits = [];
  for (const phrase of DOMAIN_META_PHRASES) {
    const p = normalizeText(phrase).toLowerCase();
    if (p && includesWholePhrase(normalized, p)) {
      phraseHits.push(p);
      metaPhraseHits.push(p);
    }
  }
  for (const phrase of PODIATRY_CONTEXT_WORDS) {
    const p = normalizeText(phrase).toLowerCase();
    if (p && includesWholePhrase(normalized, p)) {
      phraseHits.push(p);
      podiatryPhraseHits.push(p);
    }
  }
  for (const serviceName of serviceNames) {
    if (serviceName && includesWholePhrase(normalized, serviceName)) {
      phraseHits.push(serviceName);
      servicePhraseHits.push(serviceName);
    }
  }

  const uniquePhraseHits = [...new Set(phraseHits)];
  const tokenHits = contentTokens.filter((token) => domainTerms.has(token));
  const strongTokenHits = tokenHits.filter((token) => !DOMAIN_WEAK_SIGNAL_TERMS.has(token));
  const unknownTokens = contentTokens.filter((token) => !domainTerms.has(token));
  const hasAmbiguousHealthSignal = DOMAIN_AMBIGUOUS_HEALTH_WORDS.some((w) =>
    normalized.includes(normalizeText(w).toLowerCase())
  );

  if (greetingOnly) {
    return {
      classification: "ambiguous",
      confidence: 0.15,
      normalized,
      phraseHits: uniquePhraseHits.slice(0, 5),
      tokenHits: [],
      unknownTokens: [],
      reason: "neutral_greeting_or_smalltalk",
    };
  }

  const strongPhraseSignalCount =
    new Set([...metaPhraseHits, ...podiatryPhraseHits, ...servicePhraseHits]).size;
  const weakOnlySignal =
    strongPhraseSignalCount === 0 &&
    strongTokenHits.length === 0 &&
    tokenHits.length > 0;

  if ((strongPhraseSignalCount > 0) || strongTokenHits.length > 0 || (tokenHits.length >= 2 && !weakOnlySignal)) {
    const signalScore = (strongPhraseSignalCount * 2) + strongTokenHits.length + Math.min(1, tokenHits.length);
    const confidence = Math.min(0.99, 0.55 + (signalScore * 0.1));
    return {
      classification: "in_domain",
      confidence,
      normalized,
      phraseHits: uniquePhraseHits.slice(0, 8),
      tokenHits: [...new Set(tokenHits)].slice(0, 8),
      unknownTokens: [...new Set(unknownTokens)].slice(0, 8),
      reason: "allowlist_domain_match",
    };
  }

  if (hasAmbiguousHealthSignal) {
    return {
      classification: "ambiguous",
      confidence: 0.45,
      normalized,
      phraseHits: [],
      tokenHits: [],
      unknownTokens: [...new Set(unknownTokens)].slice(0, 8),
      reason: "generic_health_signal_without_foot_context",
    };
  }

  const genericUnknownTokens = unknownTokens.filter((t) => DOMAIN_GENERIC_NON_TOPIC_WORDS.has(t));
  const unknownLooksMostlyGeneric =
    unknownTokens.length > 0 &&
    genericUnknownTokens.length === unknownTokens.length;
  const genericQuestionPattern = /\b(como|donde|cuando|puedo|quiero|necesito|saber|ayuda|atendid[oa]|atender)\b/.test(normalized);

  if (unknownLooksMostlyGeneric && genericQuestionPattern) {
    return {
      classification: "ambiguous",
      confidence: 0.42,
      normalized,
      phraseHits: [],
      tokenHits: [],
      unknownTokens: [...new Set(unknownTokens)].slice(0, 8),
      reason: "generic_request_without_clear_topic",
    };
  }

  const requestPattern = /\b(quiero|busco|necesito|hacen|ofrecen|servicio|servicios|tratamiento|tratamientos)\b/.test(normalized);
  const hasRequestWithUnknownObject = requestPattern && unknownTokens.length >= 1;
  const confidence =
    hasRequestWithUnknownObject ? 0.92 :
    contentTokens.length >= 4 ? 0.95 :
    contentTokens.length === 3 ? 0.9 :
    contentTokens.length === 2 ? (requestPattern ? 0.86 : 0.78) :
    0.6;

  if (contentTokens.length >= 2 || hasRequestWithUnknownObject) {
    return {
      classification: "out_of_domain",
      confidence,
      normalized,
      phraseHits: [],
      tokenHits: [],
      unknownTokens: [...new Set(unknownTokens.length ? unknownTokens : contentTokens)].slice(0, 8),
      reason: "no_allowlist_domain_signal",
    };
  }

  return {
    classification: "ambiguous",
    confidence: 0.35,
    normalized,
    phraseHits: [],
    tokenHits: [],
    unknownTokens: [...new Set(contentTokens)].slice(0, 8),
    reason: "low_information",
  };
}

function extractOutOfDomainTopicHint(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const normalized = normalizeText(raw).toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const stripPrefixes = [
    /^(hola|buenas|buenos dias|buenas tardes|buenas noches)\s*/i,
    /^(por favor|porfa|xfa)\s*/i,
    /^(tiene(n)?|hacen|ofrecen)\s*/i,
    /^(quiero|necesito|busco)\s*/i,
    /^(me interesa|quisiera)\s*/i,
    /^(informacion|info)\s+(sobre|de)\s*/i,
    /^(sobre)\s*/i,
  ];

  let candidate = normalized;
  for (const rx of stripPrefixes) {
    candidate = candidate.replace(rx, "");
  }

  candidate = candidate
    .replace(/\b(alg(o|una)?|mas|porfa|por favor|ahora)\b/g, " ")
    .replace(/[?!.,"':;()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const phrasePatterns = [
    /\b(servicio|servicios|tratamiento|tratamientos)\s+de\s+(.+)$/i,
    /\b(info|informacion)\s+(de|sobre)\s+(.+)$/i,
    /\bsobre\s+(.+)$/i,
  ];
  for (const rx of phrasePatterns) {
    const m = candidate.match(rx);
    if (!m) continue;
    const tail = String(m[m.length - 1] || "").trim();
    if (tail && tail.length >= 3) {
      return tail.split(/\s+/).slice(0, 5).join(" ");
    }
  }

  const tokens = candidate
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !DOMAIN_NEUTRAL_WORDS.has(t))
    .filter((t) => !DOMAIN_GENERIC_NON_TOPIC_WORDS.has(t))
    .filter((t) => !["servicio", "servicios", "tratamiento", "tratamientos", "informacion", "info", "sobre", "tiene", "tienen", "hacen", "ofrecen"].includes(t));

  return tokens.slice(0, 5).join(" ");
}

function buildOutOfDomainResponseText({ text, knowledge }) {
  const clinicName = knowledge?.clinica?.nombre || "PODOPIE";
  const topic = extractOutOfDomainTopicHint(text);

  if (topic) {
    return `Gracias por escribirnos 😊 No trabajamos ${topic}. En ${clinicName} atendemos solo salud podologica 🦶. Si quieres, te muestro servicios, horarios o precios.`;
  }

  return `Gracias por escribirnos 😊 En ${clinicName} atendemos solo salud podologica 🦶. Si quieres, te muestro servicios, horarios o precios.`;
}

// Override the legacy copy above with cleaner wording.
function buildOutOfDomainResponseText({ text, knowledge }) {
  const clinicName = knowledge?.clinica?.nombre || "PODOPIE";
  const topic = extractOutOfDomainTopicHint(text);

  if (topic) {
    return `Gracias por escribirnos. En ${clinicName} no brindamos informacion sobre ${topic}. Atendemos solo salud podologica. Si quieres, te muestro servicios, horarios o precios.`;
  }

  return `Gracias por escribirnos. En ${clinicName} atendemos solo salud podologica. Si quieres, te muestro servicios, horarios o precios.`;
}

function isAiConversationRequest(text) {
  const normalized = normalizeText(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  const directPhrases = [
    "hablar con la ia",
    "hablar con ia",
    "quiero hablar con la ia",
    "quiero hablar con ia",
    "hablar contigo",
    "quiero que me responda la ia",
    "responde vos",
    "responde tu",
  ];

  return directPhrases.some((phrase) => normalized.includes(phrase));
}

function buildAiConversationReplyText({ knowledge }) {
  const botName = knowledge?.personalidad?.nombre || "PODITO";
  return `${botName} te responde directamente por aqui. Dime que necesitas saber y te ayudo con sucursales, precios, horarios o tratamientos de podologia.`;
}

function normalizeOutOfScopeDecision({ parsed, flow, text, knowledge, provider, model, source }) {
  if (!parsed || typeof parsed !== "object") {
    return parsed;
  }

  const outOfScopeNodeId = flow?.ai?.out_of_scope_node_id || "OUT_OF_SCOPE";
  const routeId = String(parsed.route_id || "").trim();
  const shouldNormalize =
    parsed.action === "out_of_scope" ||
    (routeId && routeId === outOfScopeNodeId);

  if (!shouldNormalize) {
    return parsed;
  }

  logger.info("ai.router_out_of_scope_normalized", {
    provider,
    model,
    source,
    originalAction: parsed.action || null,
    originalRouteId: routeId || null,
  });

  return {
    ...parsed,
    action: "respond",
    route_id: null,
    text: String(parsed.text || "").trim() || buildOutOfDomainResponseText({ text, knowledge }),
  };
}

function detectDeterministicDomainIntentRoute(text) {
  const normalized = normalizeText(text || "").toLowerCase().trim();
  if (!normalized) return null;

  const asksForHours = HOURS_QUALIFIER_PHRASES.some((phrase) =>
    includesWholePhrase(normalized, phrase)
  );
  if (asksForHours) {
    let prioritizedService = null;
    for (const intent of HOURS_QUALIFIED_SERVICE_INTENTS) {
      const phrases = Array.isArray(intent?.phrases) ? intent.phrases : [];
      for (const phrase of phrases) {
        if (!includesWholePhrase(normalized, phrase)) continue;
        const p = normalizeText(phrase).toLowerCase().trim();
        const score = (p.length * 10) + 100;
        if (!prioritizedService || score > prioritizedService.score) {
          prioritizedService = {
            routeId: intent.routeId,
            intent: intent.intent || null,
            matchedPhrase: p,
            score,
          };
        }
      }
    }
    if (prioritizedService) {
      return prioritizedService;
    }
  }

  let best = null;
  for (const intent of DETERMINISTIC_DOMAIN_INTENTS) {
    const phrases = Array.isArray(intent?.phrases) ? intent.phrases : [];
    for (const phrase of phrases) {
      if (!includesWholePhrase(normalized, phrase)) continue;
      const p = normalizeText(phrase).toLowerCase().trim();
      const routePriority =
        intent.routeId === "PRECIOS_INFO" || intent.routeId === "HORARIOS_INFO" || intent.routeId === "CONTACT_METHOD"
          ? 40
          : intent.routeId === "SERVICIOS_MENU"
            ? 30
            : 20;
      const score = (p.length * 10) + routePriority;
      if (!best || score > best.score) {
        best = {
          routeId: intent.routeId,
          intent: intent.intent || null,
          matchedPhrase: p,
          score,
        };
      }
    }
  }
  return best;
}

function shouldForceKeywordRoute(text) {
  const normalized = normalizeText(text || "").toLowerCase().trim();
  if (!normalized) {
    return false;
  }

  const softened = stripLeadingSoftConnector(normalized);
  const tokenCount = softened.split(/\s+/).filter(Boolean).length;

  if (tokenCount <= 3) {
    return true;
  }

  const exactUtilityPrompts = new Set([
    "precio",
    "precios",
    "horario",
    "horarios",
    "ubicacion",
    "ubicaciones",
    "direccion",
    "sucursal",
    "sucursales",
    "servicios",
    "con que trabajan",
    "en que trabajan",
    "menu",
    "asesor",
    "humano",
    "recepcion",
  ]);

  return exactUtilityPrompts.has(softened);
}

function buildDeterministicDecision({ text, previousQuestion, summary, knowledge }) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const normalized = normalizeText(raw).toLowerCase().trim();
  if (!normalized) return null;
  const softenedNormalized = stripLeadingSoftConnector(normalized);

  if (isAiConversationRequest(raw)) {
    return {
      action: "respond",
      text: buildAiConversationReplyText({ knowledge }),
      reason: "ai_conversation_request",
      ai_used: false,
      clear_pending: Boolean(previousQuestion),
      reset_turns: false,
    };
  }

  const domainGate = evaluateDomainGate({ text: raw, knowledge });
  const deterministicIntent = detectDeterministicDomainIntentRoute(raw);
  const inferredRoute = deterministicIntent?.routeId || fallbackKeywordRoute(raw);

  const tokenCount = softenedNormalized.split(/\s+/).filter(Boolean).length;
  const looksMultiIntent = /\b(y|ademas|tambien|pero)\b/.test(softenedNormalized);
  const inClarifyFlow = Boolean(previousQuestion) || Number(summary?.clarificationsAsked || 0) > 0;
  const shouldForceRoute = shouldForceKeywordRoute(raw);
  const isPrioritizedHoursServiceRoute = deterministicIntent?.intent?.startsWith("hours_service_override_");

  if (isPrioritizedHoursServiceRoute && !looksMultiIntent && !inClarifyFlow) {
    return {
      action: "route",
      route_id: deterministicIntent.routeId,
      text: "",
      reason: `deterministic_domain_intent:${deterministicIntent.intent}`,
      ai_used: false,
      clear_pending: Boolean(previousQuestion),
      reset_turns: true,
    };
  }

  if (inferredRoute && shouldForceRoute && !looksMultiIntent && !inClarifyFlow) {
    return {
      action: "route",
      route_id: inferredRoute,
      text: "",
      reason: deterministicIntent
        ? `deterministic_domain_intent:${deterministicIntent.intent || deterministicIntent.matchedPhrase || "match"}`
        : "deterministic_keyword_route",
      ai_used: false,
      clear_pending: Boolean(previousQuestion),
      reset_turns: true,
    };
  }

  return null;
}

function estimateTokensApproxFromText(text) {
  const str = String(text || "");
  if (!str) return 0;
  return Math.max(1, Math.ceil(str.length / 4));
}

function classifyCompactRouterError(error) {
  const message = String(error?.message || error || "");
  const lower = message.toLowerCase();
  return {
    message,
    modelBlocked: /model_permission_blocked_org|blocked at the organization level/i.test(message),
    budgetOrRateLimited:
      error?.code === "AI_BUDGET_EXCEEDED" ||
      error?.code === "AI_CHAT_DAILY_BUDGET_EXCEEDED" ||
      /\b429\b/.test(lower) ||
      lower.includes("rate limit") ||
      lower.includes("quota") ||
      lower.includes("too many requests"),
    timeoutOrTransient:
      lower.includes("timeout") ||
      lower.includes("timed out") ||
      lower.includes("network") ||
      lower.includes("econnreset") ||
      lower.includes("socket hang up") ||
      /\b502\b|\b503\b|\b504\b/.test(lower),
  };
}

function buildLowCostRecoveryDecision({ text, previousQuestion, summary, knowledge, domainGate, reason }) {
  const fallbackRoute = fallbackKeywordRoute(text);
  if (fallbackRoute) {
    return {
      action: "route",
      route_id: fallbackRoute,
      ai_used: false,
      clear_pending: Boolean(previousQuestion),
      reset_turns: true,
      reason,
    };
  }

  if (domainGate?.classification === "out_of_domain") {
    return {
      action: "respond",
      text: buildOutOfDomainResponseText({ text, knowledge }),
      ai_used: false,
      clear_pending: Boolean(previousQuestion),
      reset_turns: false,
      reason,
    };
  }

  if (Boolean(previousQuestion) || Number(summary?.clarificationsAsked || 0) > 0) {
    return {
      action: "show_services",
      text: "Te muestro nuestras opciones para ayudarte mejor.",
      ai_used: false,
      clear_pending: Boolean(previousQuestion),
      reset_turns: true,
      reason,
    };
  }

  if (domainGate?.classification === "ambiguous") {
    return {
      action: "clarify",
      question: "¿Buscas precios, horarios o información de un tratamiento para pies?",
      ai_used: false,
      clear_pending: Boolean(previousQuestion),
      reset_turns: false,
      reason,
    };
  }

  return {
    action: "show_services",
    text: "Te muestro nuestros servicios para que elijas lo que necesitas.",
    ai_used: false,
    clear_pending: Boolean(previousQuestion),
    reset_turns: true,
    reason,
  };
}

function shouldAttemptFullFallback({
  text,
  previousQuestion,
  summary,
  domainGate,
  compactResultState,
  compactErrorInfo,
  fullFallbackInputTokensEst,
}) {
  const enabled = String(process.env.AI_ROUTER_ENABLE_FULL_FALLBACK || "true").toLowerCase();
  if (enabled === "0" || enabled === "false" || enabled === "off") {
    return { allow: false, reason: "disabled_by_env" };
  }

  if (compactErrorInfo?.modelBlocked) {
    return { allow: false, reason: "compact_model_blocked" };
  }
  if (compactErrorInfo?.budgetOrRateLimited) {
    return { allow: false, reason: "compact_rate_or_budget_limited" };
  }

  const rawMaxInputTokens = process.env.AI_ROUTER_FULL_FALLBACK_MAX_INPUT_TOKENS;
  const maxInputTokens =
    rawMaxInputTokens == null || String(rawMaxInputTokens).trim() === ""
      ? null
      : Number(rawMaxInputTokens);
  if (Number.isFinite(maxInputTokens) && maxInputTokens > 0 && fullFallbackInputTokensEst > maxInputTokens) {
    // Keep the expensive fallback for true ambiguity only.
    if (domainGate?.classification !== "ambiguous") {
      return { allow: false, reason: "full_fallback_prompt_too_large" };
    }
  }

  return { allow: true, reason: "full_fallback_allowed" };
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

function buildKnowledgeSnippetForCopy({ knowledge, text, routeId }) {
  const kb = knowledge || {};
  const normalized = normalizeText(text || "").toLowerCase();

  if (routeId && ["PRECIOS_INFO", "HORARIOS_INFO", "SERVICIOS_MENU", "CONTACT_METHOD"].includes(routeId)) {
    return "";
  }

  const snippets = [];
  const maybeServiceMatches = [
    { check: ["unero", "una encarnada"], key: "uneros" },
    { check: ["hongo", "hongos", "onicomicosis"], key: "hongos" },
    { check: ["pedicure", "pedicura"], key: "pedicure_clinico" },
    { check: ["nino", "nina", "bebe", "podopediatria"], key: "podopediatria" },
    { check: ["adulto mayor", "tercera edad", "podogeriatria"], key: "podogeriatria" },
    { check: ["diabetes", "diabetico", "pie diabetico"], key: "pie_diabetico" },
    { check: ["pie de atleta"], key: "pie_atleta" },
    { check: ["callo", "callosidad", "heloma"], key: "callosidades" },
    { check: ["verruga"], key: "verrugas_plantares" },
    { check: ["extraccion", "una negra"], key: "extraccion_una" },
  ];

  for (const candidate of maybeServiceMatches) {
    if (!candidate.check.some((term) => normalized.includes(term))) continue;
    const svc = kb?.servicios?.[candidate.key];
    if (!svc) continue;
    snippets.push(`Servicio relacionado: ${svc.nombre || candidate.key}. ${svc.descripcion || ""}`.trim());
    break;
  }

  if (/(horario|horarios|ubicacion|ubicaciones|sucursal|direccion|donde)/i.test(normalized)) {
    const locations = Object.values(kb?.ubicaciones || {})
      .slice(0, 2)
      .map((loc) => `${loc?.nombre || "Sucursal"}: ${loc?.horario || "consultar horario"}`)
      .join(" | ");
    if (locations) snippets.push(`Ubicaciones: ${locations}`);
  }

  return snippets.join("\n");
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
