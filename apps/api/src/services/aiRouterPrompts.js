/**
 * aiRouterPrompts.js — Prompt builders + AI call helpers
 */
const logger = require("../lib/logger");
const { normalizeText } = require("../lib/normalize");
const { callAiProvider } = require("./aiProviders");
const knowledgeService = require("./knowledgeService");
const {
  safeJsonParse,
  parseRouterResponse,
  normalizeRouterAction,
  isCloudflareProvider,
  withChatBudget,
  ROUTER_DECISION_SCHEMA,
} = require("./aiRouterUtils");
const { evaluateDomainGate } = require("./aiRouterDomainGate");

/**
 * Load knowledge base for a flow
 */
function loadKnowledgeBase(flowId) {
  return knowledgeService.loadKnowledgeFromFile(flowId);
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
  [
    ai.handoff_node_id,
    ai.services_node_id,
    ai.out_of_scope_node_id,
    flow?.start_node_id,
    ...(ai.deterministic_intents || []).map((intent) => intent?.routeId),
    ...(ai.hours_qualified_service_intents || []).map((intent) => intent?.routeId),
    ...Object.values(ai.keyword_routes || {}),
  ]
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

function buildDeterministicRouteHints(flow) {
  const deterministicIntents = Array.isArray(flow?.ai?.deterministic_intents)
    ? flow.ai.deterministic_intents
    : [];
  const routes = new Map();

  for (const intent of deterministicIntents) {
    const routeId = String(intent?.routeId || "").trim();
    if (!routeId) {
      continue;
    }
    const phrases = Array.isArray(intent?.phrases)
      ? intent.phrases.map((phrase) => String(phrase || "").trim()).filter(Boolean)
      : [];
    if (!phrases.length) {
      continue;
    }
    if (!routes.has(routeId)) {
      routes.set(routeId, []);
    }
    const current = routes.get(routeId);
    for (const phrase of phrases) {
      if (!current.includes(phrase)) {
        current.push(phrase);
      }
      if (current.length >= 5) {
        break;
      }
    }
  }

  return [...routes.entries()]
    .map(([routeId, phrases]) => `- ${phrases.join(", ")} -> ${routeId}`)
    .join("\n");
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
  const nombre = personalidad.nombre || "Asistente";
  const clinicaNombre = clinica.nombre || "Mi Empresa";
  const ciudad = clinica.ciudad || "tu ciudad";
  const businessScope = clinica.especialidad || "el rubro del negocio";

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

  const nodeCatalog = flow ? buildRoutingNodeCatalog(flow) : "- MAIN_MENU";
  const directRoutes = flow ? buildDeterministicRouteHints(flow) : "";

  return `# ${nombre} - Asistente Virtual de ${clinicaNombre}

## Tu Identidad
Eres ${nombre} ${personalidad.emoji || "??"}, el asistente virtual de ${clinicaNombre}, un negocio enfocado en ${businessScope} en ${ciudad}.

## Tu Personalidad
- Tono: ${personalidad.tono || "amable, calido, profesional"}
- Idioma: ${personalidad.idioma || "espanol boliviano casual"}
- Emojis moderados: ${(personalidad.emojis_frecuentes || ["??", "?"]).slice(0, 4).join(" ")}
- Maximo ${personalidad.maximo_oraciones || 2} oraciones por respuesta conversacional
- Se conversacional, NO robotico

## Importante
- ${businessScope}
- NO hacemos: ${(clinica.no_hacemos || ["fuera del alcance del negocio"]).join(", ")}

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
1. Si existe un nodo claro para el tema del negocio -> route con route_id exacto.
2. Si saluda -> respond con saludo corto y pregunta como ayudar.
3. Si hay dolor intenso/urgencia/sangrado/pus/infeccion/ulcera -> handoff.
4. Si pregunta por ficha, cita, turno, reserva o agendamiento -> respond que la atencion es por orden de llegada y no necesita cita previa.
5. Si pregunta el precio de un tratamiento especifico -> route al nodo de ese tratamiento, no al de precios generales.
6. Si pide precios/costos/tarifas generales -> route al nodo de precios generales.
7. Si pide horarios/ubicacion/sucursal/direccion -> route al nodo general de horarios o ubicacion.
8. Si pide contacto/asesor/humano/operador/operadora/agente/persona real -> route al nodo configurado de atencion humana (o handoff si hay urgencia).
9. Si no sabe que servicio necesita -> show_services.
10. Si el usuario se despide, agradece o hace un comentario social (ej: "gracias", "mañana iré", "ok perfecto", "hasta luego", "chau", "voy mañana") -> respond con texto breve y amable de despedida. NUNCA uses out_of_scope para mensajes sociales o de cierre.
11. Si el usuario expresa queja, reclamo o malestar (ej: "pésimo servicio", "qué mal", "encima responden automático", "sugerencia") -> respond con texto empatico y ofrece escribir "asesor" para hablar con el equipo. No uses out_of_scope.
12. Si pregunta por disponibilidad de especialistas, doctor, doctora, dr, dra, medico, medica, por quien atiende o por un nombre propio del equipo clinico -> route al nodo configurado para ese caso. Nunca uses out_of_scope ni clarify para esto.
13. Si el tema claramente NO corresponde al rubro del negocio -> respond con texto breve aclarando el alcance real del negocio. Nunca menciones literalmente lo que dijo el usuario en el mensaje de rechazo.
14. Usa clarify solo si falta dato clave y como maximo una vez.
15. NUNCA repitas la misma pregunta de clarificacion.

## Rutas Directas (prioridad alta)
- precio/costo/cuanto/tarifa general -> nodo de precios generales
- si precio/costo aparece junto con un servicio especifico -> route al nodo del servicio especifico
- ficha/cita/agendar/turno/reservar -> respond explicando que la atencion es por orden de llegada
${directRoutes || "- Usa los intents determinísticos configurados en el flow"}

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

function buildCloudflareRouteSystemPrompt({ knowledge, flow, previousQuestion, summary }) {
  const clinica = knowledge?.clinica || {};
  const directRoutes = buildDeterministicRouteHints(flow);
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

  return `Eres un router de WhatsApp para ${clinica.nombre || "Mi Empresa"}.
Devuelve SOLO JSON valido.
Tu trabajo es decidir accion y route_id. No expliques nada, no redactes horarios, no des direcciones.

Reglas:
- route: si pide servicios, tratamiento, horarios, ubicacion, direccion, sucursal, precios o contacto del negocio.
- handoff: si hay urgencia medica o el flow define que el caso debe pasar a una derivacion humana.
- respond: si es fuera del rubro del negocio, saludo, despedida, agradecimiento, queja/reclamo, o ficha/cita/agendar.
- clarify: solo si falta contexto real y maximo una vez.
- show_services: si es del negocio pero no identificas nodo exacto.
IMPORTANTE: Si el usuario se despide o agradece ("gracias", "mañana iré", "hasta luego") -> respond amable. NUNCA out_of_scope para mensajes sociales.
IMPORTANTE: Si el usuario se queja ("pésimo", "mal servicio", "sugerencia") -> respond empatico, NO out_of_scope.

Atajos:
- si precio/costo aparece junto con un servicio especifico -> route al nodo del servicio especifico
- ficha, cita, turno, agendar, reservar, hacerse atender -> respond: atencion por orden de llegada, sin cita previa
${directRoutes || "- Usa los intents determinísticos configurados en el flow"}

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
  const businessScope = clinica.especialidad || "solo atendemos consultas dentro de nuestro rubro";
  const snippetSuffix = kbSnippet ? `\nContexto relevante:\n${kbSnippet}` : "";

  if (action === "clarify") {
    return {
      system: `Eres un asistente de ${clinica.nombre || "Mi Empresa"}. Responde SOLO con una pregunta corta (1 frase) para aclarar la necesidad del usuario. Tono ${tone}. No inventes horarios/precios. Usa español.`,
      user: `Mensaje del usuario: "${userText}"\nDevuelve solo la pregunta, sin JSON.`,
    };
  }

  return {
    system: `Eres un asistente de ${clinica.nombre || "Mi Empresa"}. Tono ${tone}. Maximo 2 oraciones. No inventes horarios, direcciones ni precios. Si el usuario se despide, agradece o hace comentario social -> responde breve y amable (ej: "¡Con gusto! Hasta pronto 👋"). Si el usuario se queja o reclama -> responde con empatia y ofrece escribir "asesor". Si el tema no corresponde al rubro -> aclara brevemente que ${businessScope} sin repetir lo que dijo el usuario. Puedes usar ${emoji}.${snippetSuffix}`,
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
    system: `Eres ${personalidad.nombre || "Asistente"}, asistente de ${clinica.nombre || "Mi Empresa"}. Tono ${tone}. Escribe UNA sola frase natural, breve y humana. ${objective} NO inventes datos concretos, NO des direcciones, horarios, precios ni detalles medicos. Solo una frase puente antes de la informacion real.`,
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

// Generic friendly fallback - never extracts topic to avoid "no brindamos informacion sobre mañana iré".
function buildOutOfDomainResponseText({ knowledge }) {
  const clinicName = knowledge?.clinica?.nombre || "Mi Empresa";
  const businessScope = knowledge?.clinica?.especialidad || "nuestros servicios";
  return `En ${clinicName} atendemos consultas relacionadas con ${businessScope}. Si buscas info sobre servicios, precios, horarios o atencion personal, estoy aqui para ayudarte 😊`;
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

function buildLowCostRecoveryDecision({ text, previousQuestion, summary, knowledge, domainGate, reason, flowAi }) {
  const { fallbackKeywordRoute } = require("./aiRouterDetectors");
  const fallbackRoute = fallbackKeywordRoute(text, flowAi);
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
    const businessScope = knowledge?.clinica?.especialidad || "el rubro del negocio";
    return {
      action: "clarify",
      question: `¿Buscas precios, horarios o información sobre ${businessScope}?`,
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

module.exports = {
  loadKnowledgeBase,
  buildSystemPrompt,
  buildUserPrompt,
  buildRoutingNodeCatalog,
  buildCloudflareRouteSystemPrompt,
  buildCloudflareCopyPrompt,
  buildRouteBridgeFallback,
  buildRouteBridgePrompt,
  generateRouteBridgeText,
  generateOutOfDomainReplyText,
  callRouteDecisionWithRetry,
  buildOutOfDomainResponseText,
  normalizeOutOfScopeDecision,
  buildKnowledgeSnippetForCopy,
  buildLowCostRecoveryDecision,
  shouldAttemptFullFallback,
  classifyCompactRouterError,
};
