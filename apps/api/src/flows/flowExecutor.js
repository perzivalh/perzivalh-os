/**
 * Flow Executor Dynamic
 * Ejecuta flows definidos en JSON/JS sin logica hardcodeada
 */
const { sendText, sendButtons, sendList, sendImage, sendVideo } = require("../whatsapp");
const logger = require("../lib/logger");
const { normalizeText } = require("../lib/normalize");
const sessionStore = require("../sessionStore");
const prisma = require("../db");
const { getTenantContext } = require("../tenancy/tenantContext");
const { setConversationStatus, addTagToConversation } = require("../services/conversations");
const { BOT_FLOW_ID, FIRST_NOTICE_MS } = require("../config/flowInactivity");

const MAX_LIST_TITLE = 24;
const BUTTON_TITLE_LIMIT = 20;

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

async function sendNode(waId, flow, node, visited) {
  if (!node) {
    return;
  }

  const lineId = getCurrentLineId();
  const isBotpoditoV2 = flow.id === BOT_FLOW_ID;
  await sessionStore.updateSession(waId, lineId, {
    state: node.id,
    data: { flow_id: flow.id },
    ...(isBotpoditoV2
      ? {
          inactivity_notice_at: null,
          next_due_at: new Date(Date.now() + FIRST_NOTICE_MS),
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

  const bodyText = node.text || node.title || "Selecciona una opcion:";

  const buttons = Array.isArray(node.buttons) ? node.buttons : [];
  if (node.type === "image") {
    await sendImage(waId, node.url || node.media || node.image, bodyText || null);
  } else if (node.type === "video") {
    await sendVideo(waId, node.url || node.media || node.video, bodyText || null);
  } else if (buttons.length > 0) {
    if (shouldUseList(buttons)) {
      const rows = buttons.map((btn) => ({
        id: btn.next,
        title: truncateTitle(btn.label),
        description: (btn.label || "").length > MAX_LIST_TITLE ? btn.label : "",
      }));
      await sendList(
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
      await sendButtons(
        waId,
        bodyText,
        buttons.map((btn) => ({
          id: btn.next,
          title: btn.label,
        }))
      );
    }
  } else {
    await sendText(waId, bodyText);
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
    data: { flow_id: flow.id, last_user_at: new Date().toISOString() },
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
      await sendNode(waId, flow, nodeMap.get(match.next), new Set([match.next]));
      return;
    }

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
    data: { flow_id: flow.id, last_user_at: new Date().toISOString() },
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
