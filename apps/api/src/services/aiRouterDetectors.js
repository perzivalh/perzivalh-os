/**
 * aiRouterDetectors.js — Deterministic routing decisions
 */
const { normalizeText } = require("../lib/normalize");
const {
  includesWholePhrase,
  stripLeadingSoftConnector,
  getConfiguredPhrases,
  findBestPhraseMatch,
  isSpecificServiceRouteId,
  DEFAULT_PRICE_QUALIFIER_PHRASES,
  DEFAULT_WALK_IN_ATTENTION_PHRASES,
} = require("./aiRouterUtils");
const { evaluateDomainGate } = require("./aiRouterDomainGate");

function detectSpecificServiceRoute(text, flowAi) {
  const normalized = normalizeText(text || "").toLowerCase().trim();
  if (!normalized) return null;

  const deterministicIntents = flowAi?.deterministic_intents ?? [];
  const keywordRoutes = flowAi?.keyword_routes ?? {};
  let best = null;

  for (const intent of deterministicIntents) {
    if (!isSpecificServiceRouteId(intent?.routeId)) continue;
    const phrases = Array.isArray(intent?.phrases) ? intent.phrases : [];
    for (const phrase of phrases) {
      if (!includesWholePhrase(normalized, phrase)) continue;
      const normalizedPhrase = normalizeText(phrase).toLowerCase().trim();
      const score = (normalizedPhrase.length * 10) + 90;
      if (!best || score > best.score) {
        best = {
          routeId: intent.routeId,
          intent: intent.intent || null,
          matchedPhrase: normalizedPhrase,
          score,
          source: "deterministic_intent",
        };
      }
    }
  }

  for (const [keyword, nodeId] of Object.entries(keywordRoutes)) {
    if (!isSpecificServiceRouteId(nodeId)) continue;
    if (!includesWholePhrase(normalized, keyword)) continue;
    const normalizedKeyword = normalizeText(keyword).toLowerCase().trim();
    const routePriority = String(nodeId).endsWith("_MENU") ? 30 : 50;
    const score = (normalizedKeyword.length * 10) + routePriority;
    if (!best || score > best.score) {
      best = {
        routeId: nodeId,
        intent: null,
        matchedPhrase: normalizedKeyword,
        score,
        source: "keyword_route",
      };
    }
  }

  return best;
}

function detectPriceQualifiedServiceRoute(text, flowAi) {
  const normalized = normalizeText(text || "").toLowerCase().trim();
  if (!normalized) return null;

  const priceQualifier = findBestPhraseMatch(
    normalized,
    getConfiguredPhrases(flowAi, "price_qualifier_phrases", DEFAULT_PRICE_QUALIFIER_PHRASES)
  );
  if (!priceQualifier) return null;

  const serviceRoute = detectSpecificServiceRoute(text, flowAi);
  if (!serviceRoute) return null;

  return {
    ...serviceRoute,
    qualifierPhrase: priceQualifier.phrase,
  };
}

function detectWalkInAttentionRequest(text, flowAi) {
  const normalized = normalizeText(text || "").toLowerCase().trim();
  if (!normalized) return null;

  return findBestPhraseMatch(
    normalized,
    getConfiguredPhrases(flowAi, "walk_in_attention_phrases", DEFAULT_WALK_IN_ATTENTION_PHRASES)
  );
}

function buildWalkInAttentionResponse({ knowledge, flowAi }) {
  const configured = String(flowAi?.walk_in_attention_response || "").trim();
  if (configured) {
    return configured;
  }
  const clinicName = knowledge?.clinica?.nombre || "PODOPIE";
  return `En ${clinicName} atendemos por orden de llegada, no necesitas sacar ficha ni agendar cita previa. Si quieres, te comparto horarios y ubicación para que vengas.`;
}

function detectDeterministicDomainIntentRoute(text, flowAi) {
  const normalized = normalizeText(text || "").toLowerCase().trim();
  if (!normalized) return null;

  const hoursQualifierPhrases = flowAi?.hours_qualifier_phrases ?? [];
  const hoursQualifiedServiceIntents = flowAi?.hours_qualified_service_intents ?? [];
  const deterministicIntents = flowAi?.deterministic_intents ?? [];

  const asksForHours = hoursQualifierPhrases.some((phrase) =>
    includesWholePhrase(normalized, phrase)
  );
  if (asksForHours) {
    let prioritizedService = null;
    for (const intent of hoursQualifiedServiceIntents) {
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
  for (const intent of deterministicIntents) {
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

/**
 * Fallback keyword routing (used only if AI fails).
 * The keyword→nodeId map is defined per-flow in flow.ai.keyword_routes.
 * New bots without keyword_routes get an empty map → returns null → graceful degradation.
 */
function fallbackKeywordRoute(text, flowAi) {
  const normalized = normalizeText(text || "").toLowerCase();
  const qualifiedServiceRoute = detectPriceQualifiedServiceRoute(normalized, flowAi);
  if (qualifiedServiceRoute?.routeId) {
    return qualifiedServiceRoute.routeId;
  }

  const keywords = flowAi?.keyword_routes ?? {};

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

/**
 * Detect polite/social closing messages that should NOT trigger out-of-scope.
 * E.g.: "muchas gracias mañana iré", "ok gracias", "perfecto mañana paso", etc.
 */
function isSocialClosingMessage(text) {
  const normalized = normalizeText(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  // Must NOT contain domain questions (those should still route normally)
  const hasQuestion = /cuanto|costo|precio|donde|cuando|horario|servicio|hongo|unero|callo|pedicure|podolog/.test(normalized);
  if (hasQuestion) return false;

  // Social closing patterns
  const patterns = [
    /\bmanana\s+ire\b/,
    /\bire\s+manana\b/,
    /\bvoy\s+a\s+ir\b/,
    /\bpaso\s+manana\b/,
    /\bmanana\s+paso\b/,
    /\ben\s+rato\s+(voy|paso|ire)\b/,
    /\b(muchas?\s+)?gracias\b.*\b(manana|ire|voy|vendre|paso|pasare|luego|igual|entonces)\b/,
    /\b(ok|oki|okey|bueno|perfecto|listo|entendido|de\s+acuerdo)\s+(gracias|ok|oki)\b/,
    /\b(gracias|muchas\s+gracias)\s+(ok|oki|okey|bueno|perfecto|listo|entonces|igual)\b/,
    /^(ok|oki|okey)\s+gracias\.?$/,
    /^gracias\.?\s*(ok|oki|igual|entonces|bueno|perfecto|listo)?\.?$/,
    /^muchas\s+gracias\.?$/,
    /\bque\s+(les|te)\s+vaya\s+bien\b/,
    /\bhasta\s+(luego|pronto|manana|la\s+proxima)\b/,
    /\bchau\b|\bchao\b|\badios\b/,
  ];

  return patterns.some((p) => p.test(normalized));
}

function buildSocialClosingReplyText() {
  return "¡Con gusto! 😊 Cuando quieras, aquí estamos para ayudarte. ¡Hasta pronto! 👋";
}

/**
 * Detect complaint/reclamo messages that deserve an empathetic response + escalation offer.
 */
function isComplaintMessage(text) {
  const normalized = normalizeText(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  const patterns = [
    /\b(pesimo|pésimo|pesima|pésima|malísimo|malisimo|malísima|malisima)\b/,
    /\b(horrible|nefasto|nefasta|terrible|espantoso)\b/,
    /\bmal\s+servicio\b/,
    /\bpésimo\s+servicio\b|\bpesimo\s+servicio\b/,
    /\bmala\s+(atencion|atención)\b/,
    /\b(que\s+)?verguenza\b|\b(que\s+)?vergüenza\b/,
    /\bno\s+(sirven|sirve|atienden|atendieron|funcionan?)\b/,
    /\bencima\s+(ponen|tiene|tienen)\b/,
    /\b(reclamo|reclamos|queja|quejas)\b/,
    /\bsugerencia\b/,
    /\bdeberían?\s+(cambiar|mejorar|arreglar)\b/,
    /\bque\s+mal\b|\btotal\s+mal\b|\bmuy\s+mal\b/,
    /\bno\s+me\s+atendieron\b|\bno\s+me\s+gustó\b|\bno\s+me\s+gusto\b/,
    /\bmolest[ao]\b.*\bservicio\b|\bservicio\b.*\bmolest[ao]\b/,
  ];

  return patterns.some((p) => p.test(normalized));
}

function buildComplaintReplyText() {
  return `Lamentamos mucho esa experiencia 🙏 Tu opinión es muy importante para nosotros y queremos mejorar. Si deseas hablar con nuestro equipo, escribe *asesor*.`;
}

function buildDeterministicDecision({ text, previousQuestion, summary, knowledge, flowAi }) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const normalized = normalizeText(raw).toLowerCase().trim();
  if (!normalized) return null;
  const softenedNormalized = stripLeadingSoftConnector(normalized);
  const looksMultiIntent = /\b(y|ademas|tambien|pero)\b/.test(softenedNormalized);
  const inClarifyFlow = Boolean(previousQuestion) || Number(summary?.clarificationsAsked || 0) > 0;

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

  if (isSocialClosingMessage(raw)) {
    return {
      action: "respond",
      text: buildSocialClosingReplyText(),
      reason: "social_closing_message",
      ai_used: false,
      clear_pending: Boolean(previousQuestion),
      reset_turns: false,
    };
  }

  if (isComplaintMessage(raw)) {
    return {
      action: "respond",
      text: buildComplaintReplyText(),
      reason: "complaint_detected",
      ai_used: false,
      clear_pending: Boolean(previousQuestion),
      reset_turns: false,
    };
  }

  const walkInAttentionMatch = detectWalkInAttentionRequest(raw, flowAi);
  if (walkInAttentionMatch && !looksMultiIntent && !inClarifyFlow) {
    return {
      action: "respond",
      text: buildWalkInAttentionResponse({ knowledge, flowAi }),
      reason: `walk_in_attention:${walkInAttentionMatch.phrase}`,
      ai_used: false,
      clear_pending: Boolean(previousQuestion),
      reset_turns: false,
    };
  }

  const qualifiedServiceRoute = detectPriceQualifiedServiceRoute(raw, flowAi);
  if (qualifiedServiceRoute && !looksMultiIntent && !inClarifyFlow) {
    return {
      action: "route",
      route_id: qualifiedServiceRoute.routeId,
      text: "",
      reason: `service_qualified_price:${qualifiedServiceRoute.intent || qualifiedServiceRoute.matchedPhrase || qualifiedServiceRoute.qualifierPhrase}`,
      ai_used: false,
      clear_pending: Boolean(previousQuestion),
      reset_turns: true,
    };
  }

  const domainGate = evaluateDomainGate({ text: raw, knowledge, flowAi });
  const deterministicIntent = detectDeterministicDomainIntentRoute(raw, flowAi);
  const inferredRoute = deterministicIntent?.routeId || fallbackKeywordRoute(raw, flowAi);

  const tokenCount = softenedNormalized.split(/\s+/).filter(Boolean).length;
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

function detectUrgency(text, flowAi) {
  const urgencyWords = flowAi?.urgency_words;
  if (!Array.isArray(urgencyWords) || urgencyWords.length === 0) return false;

  const normalized = normalizeText(text || "").toLowerCase();
  const domainWords = flowAi?.domain_words ?? [];
  const hasDomainContext = domainWords.length > 0 && domainWords.some((word) => normalized.includes(word));
  const hasExplicitFootContext = domainWords.length > 0 && (
    normalized.includes("diabet") ||
    normalized.includes("ulcera") ||
    normalized.includes("úlcera") ||
    normalized.includes("herida")
  );

  // Prevent false handoff: only trigger if message has domain context
  if (!hasDomainContext && !hasExplicitFootContext) {
    return false;
  }

  for (const word of urgencyWords) {
    if (normalized.includes(word)) {
      return true;
    }
  }
  return false;
}

module.exports = {
  detectSpecificServiceRoute,
  detectPriceQualifiedServiceRoute,
  detectWalkInAttentionRequest,
  buildWalkInAttentionResponse,
  detectDeterministicDomainIntentRoute,
  shouldForceKeywordRoute,
  fallbackKeywordRoute,
  isAiConversationRequest,
  buildAiConversationReplyText,
  isSocialClosingMessage,
  buildSocialClosingReplyText,
  isComplaintMessage,
  buildComplaintReplyText,
  buildDeterministicDecision,
  detectUrgency,
};
