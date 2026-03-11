/**
 * Flow Executor Dynamic
 * Ejecuta flows definidos en JSON/JS sin logica hardcodeada
 */
const { sendText, sendButtons, sendList, sendImage, sendVideo, sendLocation } = require("../whatsapp");
const logger = require("../lib/logger");
const { normalizeText } = require("../lib/normalize");
const sessionStore = require("../sessionStore");
const prisma = require("../db");
const { getTenantContext } = require("../tenancy/tenantContext");
const { setConversationStatus, addTagToConversation } = require("../services/conversations");
const { routeWithAI } = require("../services/aiRouter");
const { applyAutoTagsByWaId, applyNamedTagsByWaId } = require("../services/conversationAutoTagService");
const { normalizeTagKey, normalizeTagNames } = require("../services/tagNormalization");

const MAX_LIST_TITLE = 24;
const BUTTON_TITLE_LIMIT = 20;
const VIDEO_TEXT_FOLLOWUP_DELAY_MS = 1500;
const IMAGE_AUTO_NEXT_DELAY_MS = 900;
const VIDEO_AUTO_NEXT_DELAY_MS = 1500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCurrentLineId() {
  return getTenantContext().channel?.phone_number_id || null;
}

function getStartNodeId(flow) {
  return (
    flow.start_node_id ||
    flow.start ||
    flow.startNodeId ||
    flow.startNode ||
    null
  );
}

function buildNodeMap(flow) {
  const map = new Map();
  for (const node of flow.nodes || []) {
    if (node && node.id) {
      map.set(node.id, node);
    }
  }
  return map;
}

function truncateTitle(value) {
  const text = (value || "").toString().trim();
  if (!text) {
    return "";
  }
  if (text.length <= MAX_LIST_TITLE) {
    return text;
  }
  return `${text.slice(0, MAX_LIST_TITLE - 3)}...`;
}

function shouldUseList(buttons) {
  if (!Array.isArray(buttons)) {
    return false;
  }
  if (buttons.length > 3) {
    return true;
  }
  return buttons.some((btn) => (btn.label || "").length > BUTTON_TITLE_LIMIT);
}

function inferMediaType(node, mediaUrl) {
  if (!mediaUrl || typeof mediaUrl !== "string") {
    return null;
  }
  if (node.type === "image" || node.type === "video") {
    return node.type;
  }
  const normalizedUrl = mediaUrl.split("?")[0].toLowerCase();
  if (/\.(mp4|mov|webm)$/i.test(normalizedUrl)) {
    return "video";
  }
  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(normalizedUrl)) {
    return "image";
  }
  return null;
}

function normalizeLabel(value) {
  return normalizeText(value || "").replace(/\s+/g, " ").trim();
}

function isMenuTrigger(normalized) {
  return ["menu", "inicio", "volver", "empezar"].includes(normalized);
}

function isHandoffAction(action) {
  const normalized = normalizeLabel(action);
  return normalized.includes("handoff") || normalized.includes("atencion_personalizada");
}

function buildMapsLink(branch) {
  const explicitLink = (branch?.maps_url || "").trim();
  if (explicitLink) {
    return explicitLink;
  }
  if (
    Number.isFinite(branch?.lat) &&
    Number.isFinite(branch?.lng)
  ) {
    return `https://maps.google.com/?q=${branch.lat},${branch.lng}`;
  }
  return null;
}

function getAutoAdvanceDelayMs(node, mediaType) {
  if (!node?.next) {
    return 0;
  }
  if (Number.isFinite(node.nextDelayMs) && node.nextDelayMs > 0) {
    return node.nextDelayMs;
  }
  if (Number.isFinite(node.nextDelaySeconds) && node.nextDelaySeconds > 0) {
    return Math.round(node.nextDelaySeconds * 1000);
  }
  if (mediaType === "video") {
    return VIDEO_AUTO_NEXT_DELAY_MS;
  }
  if (mediaType === "image") {
    return IMAGE_AUTO_NEXT_DELAY_MS;
  }
  return 0;
}

function getBranchMatchScore(branch, normalizedMessage) {
  if (!branch || !normalizedMessage) {
    return 0;
  }

  const branchCode = normalizeLabel(branch.code);
  const branchName = normalizeLabel(branch.name);
  const branchAddress = normalizeLabel(branch.address);
  const haystack = [branchCode, branchName, branchAddress].filter(Boolean).join(" ");

  if (!haystack) {
    return 0;
  }

  let score = 0;

  if (branchCode && normalizedMessage.includes(branchCode)) {
    score += 12;
  }
  if (branchName && normalizedMessage.includes(branchName)) {
    score += 10;
  }
  if (branchAddress && normalizedMessage.includes(branchAddress)) {
    score += 16;
  }

  const tokens = normalizedMessage
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += token.length >= 6 ? 3 : 2;
    }
  }

  return score;
}

function pickBestBranch(branches, normalizedMessage) {
  if (!Array.isArray(branches) || !branches.length || !normalizedMessage) {
    return null;
  }

  let bestBranch = null;
  let bestScore = 0;

  for (const branch of branches) {
    const score = getBranchMatchScore(branch, normalizedMessage);
    if (score > bestScore) {
      bestScore = score;
      bestBranch = branch;
    }
  }

  return bestScore > 0 ? bestBranch : null;
}

async function sendSingleBranchLocation(waId, branch) {
  await sendLocation(waId, branch.lat, branch.lng, branch.name, branch.address);

  const lines = [`📍 ${branch.name}`, branch.address];
  if (branch.hours_text) {
    lines.push(`Horario: ${branch.hours_text}`);
  }
  if (branch.phone) {
    lines.push(`Tel: ${branch.phone}`);
  }
  const mapsLink = buildMapsLink(branch);
  if (mapsLink) {
    lines.push(`Mapa: ${mapsLink}`);
  }

  await sendText(waId, lines.join("\n"));
  logger.info("flow.branch_route_reply", {
    mode: "single_branch",
    branchId: branch.id,
    branchCode: branch.code,
    branchName: branch.name,
  });
}

async function sendBranchDirectory(waId, branches, normalizedMessage) {
  const askedNearest =
    normalizedMessage.includes("cerca") ||
    normalizedMessage.includes("queda mas cerca") ||
    normalizedMessage.includes("me queda");

  const intro = askedNearest
    ? "No puedo medir distancia exacta desde tu zona, pero estas son nuestras sucursales activas:"
    : "Estas son nuestras sucursales activas:";

  const blocks = branches.map((branch) => {
    const lines = [`📍 ${branch.name}`, `Dirección: ${branch.address}`];
    if (branch.hours_text) {
      lines.push(`Horario: ${branch.hours_text}`);
    }
    if (branch.phone) {
      lines.push(`Tel: ${branch.phone}`);
    }
    const mapsLink = buildMapsLink(branch);
    if (mapsLink) {
      lines.push(`Mapa: ${mapsLink}`);
    }
    return lines.join("\n");
  });

  await sendText(waId, [intro, ...blocks].join("\n\n"));
  logger.info("flow.branch_route_reply", {
    mode: "branch_directory",
    branchCount: branches.length,
    nearestHint: askedNearest,
  });
}

async function trySendBranchRouteReply(waId, lineId, flowId, text) {
  try {
    const branches = await prisma.branch.findMany({
      where: { is_active: true },
      orderBy: { name: "asc" },
    });

    if (!branches.length) {
      return false;
    }

    const normalizedMessage = normalizeLabel(text);
    const matchedBranch =
      branches.length === 1 ? branches[0] : pickBestBranch(branches, normalizedMessage);

    await sessionStore.updateSession(waId, lineId, {
      state: "HORARIOS_INFO",
      data: { flow_id: flowId },
    });

    if (matchedBranch) {
      await sendSingleBranchLocation(waId, matchedBranch);
      return true;
    }

    await sendBranchDirectory(waId, branches, normalizedMessage);
    return true;
  } catch (error) {
    logger.warn("flow.branch_route_dynamic_failed", {
      error: error.message,
    });
    return false;
  }
}

async function setConversationToPending(waId) {
  const phoneNumberId = getCurrentLineId();
  if (!waId || !phoneNumberId) {
    return;
  }
  const conversation = await prisma.conversation.findUnique({
    where: {
      wa_id_phone_number_id: {
        wa_id: waId,
        phone_number_id: phoneNumberId,
      },
    },
    select: { id: true },
  });
  if (!conversation) {
    return;
  }
  await setConversationStatus({
    conversationId: conversation.id,
    status: "pending",
    userId: null,
  });
  await addTagToConversation({
    conversationId: conversation.id,
    tagName: "pendiente",
  });
}

function getNodeById(flow, nodeId) {
  if (!nodeId || !Array.isArray(flow?.nodes)) {
    return null;
  }
  return flow.nodes.find((node) => node?.id === nodeId) || null;
}

function hasExplicitTagConfig(node) {
  if (!node || typeof node !== "object") {
    return false;
  }

  return [
    "tag",
    "tags",
    "auto_tag",
    "auto_tags",
    "autoTag",
    "autoTags",
  ].some((key) => Object.prototype.hasOwnProperty.call(node, key));
}

function getConfiguredTagsFromNode(node) {
  if (!hasExplicitTagConfig(node)) {
    return null;
  }

  return normalizeTagNames([
    ...(Array.isArray(node.tags) ? node.tags : []),
    ...(Array.isArray(node.auto_tags) ? node.auto_tags : []),
    ...(Array.isArray(node.autoTags) ? node.autoTags : []),
    node.tag,
    node.auto_tag,
    node.autoTag,
  ]);
}

function extractTagFromReason(reason) {
  const raw = String(reason || "").trim();
  if (!raw || !raw.includes(":")) {
    return null;
  }
  const candidate = raw.split(":").pop().trim();
  if (!candidate) {
    return null;
  }
  return candidate.replace(/^hours_service_override_/, "");
}

function getLegacyIntentTagsForNode(flow, nodeId, reason) {
  if (!nodeId || !flow?.ai) {
    return [];
  }

  const deterministicIntents = Array.isArray(flow.ai.deterministic_intents)
    ? flow.ai.deterministic_intents
    : [];
  const hourIntents = Array.isArray(flow.ai.hours_qualified_service_intents)
    ? flow.ai.hours_qualified_service_intents
    : [];
  const reasonTag = normalizeTagKey(extractTagFromReason(reason));

  if (reasonTag) {
    const reasonMatchedTags = normalizeTagNames([
      ...deterministicIntents
        .filter((intent) => intent?.routeId === nodeId && normalizeTagKey(intent.intent) === reasonTag)
        .map((intent) => intent.intent),
      ...hourIntents
        .filter((intent) => intent?.routeId === nodeId)
        .map((intent) => intent.intent?.replace(/^hours_service_override_/, ""))
        .filter((intent) => normalizeTagKey(intent) === reasonTag),
    ]);
    if (reasonMatchedTags.length) {
      return reasonMatchedTags;
    }
  }

  return normalizeTagNames([
    ...deterministicIntents
      .filter((intent) => intent?.routeId === nodeId)
      .map((intent) => intent.intent),
    ...hourIntents
      .filter((intent) => intent?.routeId === nodeId)
      .map((intent) => intent.intent?.replace(/^hours_service_override_/, "")),
  ]);
}

function getTagsForNode(flow, nodeId, reason) {
  const configuredTags = getConfiguredTagsFromNode(getNodeById(flow, nodeId));
  if (configuredTags !== null) {
    return configuredTags;
  }
  return getLegacyIntentTagsForNode(flow, nodeId, reason);
}

async function applyFlowAutoTags({
  waId,
  text,
  routeId,
  reason,
  flow,
} = {}) {
  const phoneNumberId = getCurrentLineId();
  if (!waId || !phoneNumberId) {
    return;
  }

  // Primary: derive tags from flow node metadata, with legacy intent mapping fallback.
  if (flow && routeId) {
    const tags = getTagsForNode(flow, routeId, reason);
    if (tags.length) {
      await applyNodeTags(waId, tags);
      return;
    }
  }

  // Fallback: DB service keyword matching
  try {
    await applyAutoTagsByWaId({
      waId,
      phoneNumberId,
      text,
      routeId,
      reason,
    });
  } catch (error) {
    logger.warn("flow.autotag_failed", {
      waId,
      phoneNumberId,
      routeId: routeId || null,
      error: error.message || String(error),
    });
  }
}

async function applyNodeTags(waId, tagNames) {
  const phoneNumberId = getCurrentLineId();
  const tags = normalizeTagNames(tagNames);
  if (!waId || !phoneNumberId || !tags.length) return;
  try {
    await applyNamedTagsByWaId({
      waId,
      phoneNumberId,
      tags,
    });
  } catch (error) {
    logger.warn("flow.node_tag_failed", {
      waId,
      tags,
      error: error.message || String(error),
    });
  }
}

async function sendNode(waId, flow, node, visited) {
  if (!node) {
    return;
  }

  // Apply node-specific tags if defined (fire-and-forget).
  const nodeTags = getConfiguredTagsFromNode(node);
  if (nodeTags?.length) {
    void applyNodeTags(waId, nodeTags);
  }

  const delayMs =
    Number.isFinite(node.delayMs) && node.delayMs > 0
      ? node.delayMs
      : Number.isFinite(node.delaySeconds) && node.delaySeconds > 0
        ? Math.round(node.delaySeconds * 1000)
        : 0;
  if (delayMs > 0) {
    await sleep(delayMs);
  }

  const lineId = getCurrentLineId();
  const inactivityCfg = flow?.ai?.inactivity;
  await sessionStore.updateSession(waId, lineId, {
    state: node.id,
    data: { flow_id: flow.id },
    ...(inactivityCfg
      ? {
        inactivity_notice_at: null,
        next_due_at: new Date(Date.now() + inactivityCfg.first_notice_ms),
      }
      : {}),
  });

  if (node.type === "action") {
    if (isHandoffAction(node.action)) {
      await setConversationToPending(waId);
      await sendText(
        waId,
        node.text || "Te conecto con un asesor. En breve te responderemos."
      );
    } else if (node.text) {
      await sendText(waId, node.text);
    }
    if (node.terminal) {
      await sessionStore.clearSession(waId, lineId);
    }
    return;
  }

  const nodeText =
    typeof node.text === "string"
      ? node.text
      : typeof node.title === "string"
        ? node.title
        : "";
  const bodyText = nodeText || "Selecciona una opcion:";

  const buttons = Array.isArray(node.buttons) ? node.buttons : [];
  const mediaUrl = node.url || node.media || node.video || node.image;
  const mediaType = inferMediaType(node, mediaUrl);
  let sendResult = null;
  if (mediaType === "image") {
    sendResult = await sendImage(waId, mediaUrl, nodeText || null);
  } else if (mediaType === "video") {
    // Some WhatsApp mobile clients render multiline video captions with broken layout.
    sendResult = await sendVideo(waId, mediaUrl, null);
    if (nodeText.trim().length > 0) {
      await sleep(VIDEO_TEXT_FOLLOWUP_DELAY_MS);
      const followupResult = await sendText(waId, nodeText);
      if (!followupResult?.ok) {
        logger.warn("flow.video_followup_send_failed", {
          flowId: flow.id,
          nodeId: node.id,
          next: node.next || null,
        });
        return;
      }
    }
  } else if (buttons.length > 0) {
    if (shouldUseList(buttons)) {
      const rows = buttons.map((btn) => ({
        id: btn.next,
        title: truncateTitle(btn.label),
        description: (btn.label || "").length > MAX_LIST_TITLE ? btn.label : "",
      }));
      sendResult = await sendList(
        waId,
        null,
        bodyText,
        null,
        node.buttonLabel || "Ver opciones",
        [
          {
            title: node.sectionTitle || "Opciones",
            rows,
          },
        ]
      );
    } else {
      sendResult = await sendButtons(
        waId,
        bodyText,
        buttons.map((btn) => ({
          id: btn.next,
          title: btn.label,
        }))
      );
    }
  } else {
    sendResult = await sendText(waId, bodyText);
  }

  if (sendResult && !sendResult.ok) {
    logger.warn("flow.node_send_failed", {
      flowId: flow.id,
      nodeId: node.id,
      nodeType: node.type,
      mediaType,
      next: node.next || null,
    });
    return;
  }

  if (node.terminal) {
    await sessionStore.clearSession(waId, lineId);
    return;
  }

  if (!buttons.length && node.next) {
    if (!visited.has(node.next)) {
      visited.add(node.next);
      const nodeMap = buildNodeMap(flow);
      const nextNode = nodeMap.get(node.next);
      if (!nextNode) {
        logger.warn("flow.next_missing", { flowId: flow.id, next: node.next });
        return;
      }
      const autoAdvanceDelayMs = getAutoAdvanceDelayMs(node, mediaType);
      if (autoAdvanceDelayMs > 0) {
        await sleep(autoAdvanceDelayMs);
      }
      await sendNode(waId, flow, nextNode, visited);
    }
  }
}

function findButtonMatch(node, normalized) {
  if (!node || !Array.isArray(node.buttons)) {
    return null;
  }
  if (!normalized) {
    return null;
  }
  for (const btn of node.buttons) {
    const label = normalizeLabel(btn.label);
    if (label === normalized) {
      return btn;
    }
  }
  return null;
}

/**
 * Procesa un mensaje de texto entrante para un flow dinamico
 */
async function executeDynamicFlow(waId, text, flowData, context = {}) {
  const normalized = normalizeLabel(text);
  const flow = flowData.flow;

  if (!flow) {
    return;
  }

  const lineId = getCurrentLineId();
  await sessionStore.updateSession(waId, lineId, {
    data: {
      flow_id: flow.id,
      last_user_at: new Date().toISOString(),
      ai_pending: null,
    },
    flow_id: flow.id,
  });

  if (Array.isArray(flow.nodes)) {
    const nodeMap = buildNodeMap(flow);
    const startNodeId = getStartNodeId(flow);
    if (!startNodeId || !nodeMap.has(startNodeId)) {
      logger.warn("flow.missing_start_node", { flowId: flow.id });
      return;
    }

    if (isMenuTrigger(normalized)) {
      await sessionStore.updateSession(waId, lineId, {
        data: { ai_pending: null },
      });
      await sendNode(waId, flow, nodeMap.get(startNodeId), new Set([startNodeId]));
      return;
    }

    const session = await sessionStore.getSession(waId, lineId);
    const sessionFlowId = session.data?.flow_id;
    const currentNodeId =
      sessionFlowId === flow.id && nodeMap.has(session.state)
        ? session.state
        : startNodeId;
    const currentNode = nodeMap.get(currentNodeId);
    const match = findButtonMatch(currentNode, normalized);
    if (match && match.next && nodeMap.has(match.next)) {
      await applyFlowAutoTags({
        waId,
        text,
        routeId: match.next,
        flow,
      });
      await sendNode(waId, flow, nodeMap.get(match.next), new Set([match.next]));
      return;
    }

    const aiDecision = await routeWithAI({
      text,
      flow,
      config: flowData.config,
      session,
      waId,
    });
    if (aiDecision?.action) {
      logger.info("flow.ai_decision_applied", {
        flowId: flow.id,
        action: aiDecision.action,
        routeId: aiDecision.route_id || null,
        aiUsed: Boolean(aiDecision.ai_used),
        reason: aiDecision.reason || null,
      });
      const menuId = getStartNodeId(flow);
      const servicesId = flow.ai?.services_node_id || "SERVICIOS_MENU";
      const handoffId = flow.ai?.handoff_node_id || "AI_HANDOFF_OFFER";
      const outOfScopeId = flow.ai?.out_of_scope_node_id || "OUT_OF_SCOPE";

      if (aiDecision.ai_used) {
        const aiTurns = Number(session.data?.ai_turns || 0);
        await sessionStore.updateSession(waId, lineId, {
          data: { ai_turns: aiTurns + 1 },
        });
      }

      // Reset AI turns when routing to a new node (fresh context)
      if (aiDecision.reset_turns) {
        await sessionStore.updateSession(waId, lineId, {
          data: { ai_turns: 0 },
        });
      }

      // Anti-repetition: Check if we'd be sending the same message
      const lastSentText = session.data?.last_sent_text || "";
      const aiText = aiDecision.text?.trim() || aiDecision.reply_text?.trim() || "";

      // Helper to send reply text if not repeated
      async function sendReplyIfNotRepeated(text) {
        if (text && text !== lastSentText) {
          await sendText(waId, text);
          await sessionStore.updateSession(waId, lineId, {
            data: { last_sent_text: text },
          });
          return true;
        }
        return false;
      }

      if (aiDecision.action === "clarify" && aiDecision.question) {
        // Anti-repetition: Don't send same clarification twice
        if (aiDecision.question === lastSentText) {
          // Already asked this, go to services instead
          if (nodeMap.has(servicesId)) {
            await sendNode(waId, flow, nodeMap.get(servicesId), new Set([servicesId]));
            return;
          }
        }
        await sendReplyIfNotRepeated(aiDecision.question);
        await sessionStore.updateSession(waId, lineId, {
          data: {
            ai_pending: {
              question: aiDecision.question,
              asked_at: new Date().toISOString(),
            },
            last_sent_text: aiDecision.question,
          },
        });
        return;
      }

      if (session.data?.ai_pending) {
        await sessionStore.updateSession(waId, lineId, {
          data: { ai_pending: null },
        });
      }

      // NEW: Handle 'respond' action - pure conversational response
      if (aiDecision.action === "respond" && aiText) {
        if (aiText !== lastSentText) {
          await sendText(waId, aiText);
          await sessionStore.updateSession(waId, lineId, {
            data: { last_sent_text: aiText },
          });
        }
        return;
      }

      const shouldPreferNodeContent =
        (aiDecision.action === "route" && aiDecision.route_id) ||
        aiDecision.action === "show_services" ||
        aiDecision.action === "services" ||
        aiDecision.action === "handoff" ||
        aiDecision.action === "menu";

      if (shouldPreferNodeContent) {
        if (aiText) {
          logger.info("flow.ai_route_skip_free_text", {
            action: aiDecision.action,
            route_id: aiDecision.route_id || null,
            textPreview: aiText.slice(0, 140),
          });
        }
      } else if (aiText && aiText !== lastSentText) {
        logger.info("flow.ai_preface_sent", {
          action: aiDecision.action,
          route_id: aiDecision.route_id || null,
          textPreview: aiText.slice(0, 140),
        });

        await sendText(waId, aiText);
        await sessionStore.updateSession(waId, lineId, {
          data: { last_sent_text: aiText },
        });
        await sleep(800);
      }

      if (aiDecision.action === "route" && aiDecision.route_id) {
        const target = nodeMap.get(aiDecision.route_id);
        if (target) {
          await applyFlowAutoTags({
            waId,
            text,
            routeId: aiDecision.route_id,
            reason: aiDecision.reason || null,
            flow,
          });
          logger.info("flow.route_node_sent", {
            flowId: flow.id,
            routeId: aiDecision.route_id,
          });
          await sendNode(waId, flow, target, new Set([aiDecision.route_id]));
          return;
        }
      }

      if (aiDecision.action === "out_of_scope" && nodeMap.has(outOfScopeId)) {
        await sendNode(waId, flow, nodeMap.get(outOfScopeId), new Set([outOfScopeId]));
        return;
      }

      if ((aiDecision.action === "services" || aiDecision.action === "show_services") && nodeMap.has(servicesId)) {
        await sendNode(waId, flow, nodeMap.get(servicesId), new Set([servicesId]));
        return;
      }

      if (aiDecision.action === "handoff" && nodeMap.has(handoffId)) {
        await sendNode(waId, flow, nodeMap.get(handoffId), new Set([handoffId]));
        return;
      }

      if (aiDecision.action === "menu" && menuId && nodeMap.has(menuId)) {
        await sendNode(waId, flow, nodeMap.get(menuId), new Set([menuId]));
        return;
      }
    }

    // Fallback: if currentNode is WELCOME or has no buttons, go to SERVICIOS_MENU instead
    // This prevents the loop of re-sending welcome/menu on every unmatched message
    const isWelcomeNode = currentNodeId === "WELCOME" || currentNodeId === startNodeId;
    const hasNoButtons = !currentNode.buttons || currentNode.buttons.length === 0;
    const servicesId = flow.ai?.services_node_id || "SERVICIOS_MENU";

    if ((isWelcomeNode || hasNoButtons) && nodeMap.has(servicesId)) {
      await sendNode(waId, flow, nodeMap.get(servicesId), new Set([servicesId]));
      return;
    }

    // Only resend current node if it has buttons (interactive context)
    await sendNode(waId, flow, currentNode, new Set([currentNodeId]));
    return;
  }

  // Flow simple con mainMenu
  const isGreeting = ["hola", "inicio", "empezar", "menu", "bot"].includes(normalized);
  if (isGreeting) {
    return sendMainMenu(waId, flow);
  }
  return sendMainMenu(waId, flow);
}

/**
 * Procesa una respuesta interactiva (boton/lista)
 */
async function executeDynamicInteractive(waId, selectionId, flowData, context = {}) {
  const flow = flowData.flow;
  if (!flow || !selectionId) {
    return;
  }

  const lineId = getCurrentLineId();
  await sessionStore.updateSession(waId, lineId, {
    data: {
      flow_id: flow.id,
      last_user_at: new Date().toISOString(),
      ai_pending: null,
      ai_turns: 0,  // Reset AI turns on interactive button press
    },
    flow_id: flow.id,
  });

  if (Array.isArray(flow.nodes)) {
    const nodeMap = buildNodeMap(flow);
    const session = await sessionStore.getSession(waId, lineId);
    const sessionFlowId = session.data?.flow_id;
    const currentNode =
      sessionFlowId === flow.id ? nodeMap.get(session.state) : null;
    let nextId = selectionId;
    if (currentNode && Array.isArray(currentNode.buttons)) {
      const found = currentNode.buttons.find((btn) => btn.next === selectionId);
      if (found && found.next) {
        nextId = found.next;
      }
    }

    const target = nodeMap.get(nextId);
    if (target) {
      await applyFlowAutoTags({
        waId,
        text: selectionId,
        routeId: nextId,
        flow,
      });
      await sendNode(waId, flow, target, new Set([nextId]));
      return;
    }

    const startNodeId = getStartNodeId(flow);
    if (startNodeId && nodeMap.has(startNodeId)) {
      await sendNode(waId, flow, nodeMap.get(startNodeId), new Set([startNodeId]));
    }
    return;
  }

  // Flow simple con mainMenu
  if (selectionId === "HANDOFF") {
    await sendText(waId, "Te estamos conectando con un asesor. Por favor espera un momento...");
    return;
  }
  return sendMainMenu(waId, flow);
}

/**
 * Envia el menu principal definido en el flow
 */
async function sendMainMenu(waId, flow) {
  if (!flow.mainMenu) {
    logger.warn("flow.missing_main_menu", { flowId: flow.id });
    return sendText(waId, "Hola! (Menu no configurado)");
  }

  const { body, button, sections } = flow.mainMenu;
  const processedBody = (body || "").replace(
    "{{brand_name}}",
    "nuestro negocio"
  );

  if (sections && sections.length > 0) {
    try {
      await sendList(waId, null, processedBody, null, button || "Ver menu", sections);
    } catch (err) {
      logger.error("flow.send_menu_failed", { error: err.message });
      await sendText(waId, processedBody);
    }
  } else {
    await sendText(waId, processedBody || "Hola!");
  }
}

module.exports = {
  executeDynamicFlow,
  executeDynamicInteractive,
};
