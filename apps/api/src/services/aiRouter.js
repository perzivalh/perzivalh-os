/**
 * AI Router - AI-First Architecture
 *
 * La IA es el CEREBRO PRINCIPAL del bot.
 * Procesa TODOS los mensajes con contexto completo.
 * Keywords solo como fallback si la IA falla.
 */
const logger = require("../lib/logger");
const { callAiProvider } = require("./aiProviders");
const knowledgeService = require("./knowledgeService");
const { getHistoryForAI, getConversationSummary } = require("./conversationMemory");
const { getTenantContext } = require("../tenancy/tenantContext");

const {
  DEFAULT_MODELS,
  ROUTER_SCHEMA,
  normalizeRouterAction,
  isCloudflareProvider,
  withChatBudget,
  safeJsonParse,
  parseRouterResponse,
  buildRouterCacheKey,
  getRouterDecisionFromCache,
  setRouterDecisionCache,
  estimateTokensApproxFromText,
  buildCompactRouteUserPrompt,
} = require("./aiRouterUtils");

const { evaluateDomainGate } = require("./aiRouterDomainGate");

const {
  detectUrgency,
  fallbackKeywordRoute,
  shouldForceKeywordRoute,
  buildDeterministicDecision,
} = require("./aiRouterDetectors");

const {
  loadKnowledgeBase,
  buildSystemPrompt,
  buildUserPrompt,
  buildCloudflareRouteSystemPrompt,
  buildCloudflareCopyPrompt,
  generateOutOfDomainReplyText,
  callRouteDecisionWithRetry,
  buildOutOfDomainResponseText,
  normalizeOutOfScopeDecision,
  buildKnowledgeSnippetForCopy,
  buildLowCostRecoveryDecision,
  shouldAttemptFullFallback,
  classifyCompactRouterError,
} = require("./aiRouterPrompts");

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
    const inferredRoute = fallbackKeywordRoute(text, flow?.ai);
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
    (evaluateDomainGate({ text, knowledge, flowAi: flow?.ai }).classification === "out_of_domain"
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
    const inferredRoute = fallbackKeywordRoute(text, flow?.ai);
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

  const fallbackText = evaluateDomainGate({ text, knowledge, flowAi: flow?.ai }).classification === "out_of_domain"
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

  // URGENCY CHECK FIRST - bypass AI for urgent cases
  const urgencyDetected = detectUrgency(text, aiFlow);
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
  const domainGate = evaluateDomainGate({ text, knowledge, flowAi: aiFlow });

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
    flowAi: aiFlow,
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

  // If turns exceeded, try keyword routing before giving up
  if (turnsExceeded) {
    logger.info("ai.router_max_turns", { flowId, usedTurns, maxTurns });
    const fallbackRoute = fallbackKeywordRoute(text, aiFlow);
    if (fallbackRoute) {
      return { action: "route", route_id: fallbackRoute, text: "", ai_used: false, reset_turns: true };
    }
    // No keyword match either - show services as last resort
    return { action: "show_services", text: "Te muestro nuestros servicios:", ai_used: false };
  }

  // If no API key, use fallback
  if (!apiKey) {
    logger.warn("ai.router_no_key", { provider, flowId });
    const fallbackRoute = fallbackKeywordRoute(text, aiFlow);
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
      const businessScope = knowledge?.clinica?.especialidad || "el negocio";
      return cacheAndReturn({
        action: "respond",
        text: `Puedo ayudarte con consultas relacionadas con ${businessScope}. Si quieres, dime si buscas información de un servicio, horarios, precios o atención con un asesor.`,
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
            flowAi: aiFlow,
          })
        );
      }
      logger.error("ai.router_error", { message: error.message, provider, model, flowId });
      const businessScope = knowledge?.clinica?.especialidad || "el negocio";
      return cacheAndReturn({
        action: "respond",
        text: `Tuve un problema procesando tu mensaje, pero puedo ayudarte con consultas relacionadas con ${businessScope}. Si quieres, dime el servicio que buscas o si prefieres hablar con un asesor.`,
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
    const fallbackRoute = fallbackKeywordRoute(text, aiFlow);
    if (fallbackRoute) {
      return cacheAndReturn({ action: "route", route_id: fallbackRoute, ai_used: false });
    }
    return cacheAndReturn({ action: "show_services", ai_used: false });
  }

  if (domainGate.classification === "out_of_domain") {
    const recoveredRoute = fallbackKeywordRoute(text, aiFlow);
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
        flowAi: aiFlow,
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
        flowAi: aiFlow,
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
      const fallbackRoute = fallbackKeywordRoute(text, aiFlow);
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
      const inferredRoute = fallbackKeywordRoute(text, aiFlow);
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
          flowAi: aiFlow,
        })
      );
    }

    // Fallback on error
    const fallbackRoute = fallbackKeywordRoute(text, aiFlow);
    if (fallbackRoute) {
      return cacheAndReturn({ action: "route", route_id: fallbackRoute, ai_used: false });
    }
    return cacheAndReturn({ action: "show_services", ai_used: false });
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
