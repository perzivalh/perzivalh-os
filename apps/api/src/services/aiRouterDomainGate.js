/**
 * aiRouterDomainGate.js — Domain classification
 */
const { normalizeText } = require("../lib/normalize");
const {
  tokenizeDomainText,
  includesWholePhrase,
} = require("./aiRouterUtils");

const DOMAIN_META_PHRASES = [
  "precio", "precios", "costo", "costos", "tarifa", "tarifas", "cuanto cuesta", "cuanto vale",
  "horario", "horarios", "hora", "horas", "rango de hora", "rango de horas",
  "ubicacion", "ubicaciones", "sucursal", "direccion", "como llegar", "clinica",
  "que servicios", "que ofrecen", "lista de servicios", "servicios disponibles",
  "consulta", "evaluacion", "valoracion", "cita", "agendar", "agenda", "turno", "reservar",
  "asesor", "asesora", "recepcion", "humano", "contacto", "whatsapp",
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

function getKnowledgeDomainLexicon(knowledge, flowAi) {
  if (!knowledge || typeof knowledge !== "object") {
    return { terms: new Set(), serviceNames: [] };
  }
  if (KNOWLEDGE_DOMAIN_LEXICON_CACHE.has(knowledge)) {
    return KNOWLEDGE_DOMAIN_LEXICON_CACHE.get(knowledge);
  }

  const terms = new Set();
  const serviceNames = [];

  const domainWords = flowAi?.domain_words ?? [];
  const extraDomainWords = flowAi?.extra_domain_words ?? [];
  for (const term of domainWords) addTermsToDomainLexicon(terms, term);
  for (const term of extraDomainWords) addTermsToDomainLexicon(terms, term);
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

function evaluateDomainGate({ text, knowledge, flowAi }) {
  const raw = String(text || "").trim();
  if (!raw) {
    return { classification: "ambiguous", confidence: 0, normalized: "", reason: "empty" };
  }

  const normalized = normalizeText(raw).toLowerCase().replace(/\s+/g, " ").trim();
  const tokens = [...new Set(tokenizeDomainText(normalized))];
  const contentTokens = tokens.filter((token) => token.length >= 3 && !DOMAIN_NEUTRAL_WORDS.has(token));
  const greetingOnly = contentTokens.length === 0;

  const { terms: domainTerms, serviceNames } = getKnowledgeDomainLexicon(knowledge, flowAi);

  const domainWords = flowAi?.domain_words ?? [];
  const ambiguousHealthWords = flowAi?.ambiguous_health_words ?? [];

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
  for (const phrase of domainWords) {
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
  const hasAmbiguousHealthSignal = ambiguousHealthWords.length > 0 && ambiguousHealthWords.some((w) =>
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

module.exports = {
  DOMAIN_META_PHRASES,
  DOMAIN_NEUTRAL_WORDS,
  DOMAIN_WEAK_SIGNAL_TERMS,
  DOMAIN_GENERIC_NON_TOPIC_WORDS,
  KNOWLEDGE_DOMAIN_LEXICON_CACHE,
  addTermsToDomainLexicon,
  getKnowledgeDomainLexicon,
  evaluateDomainGate,
};
