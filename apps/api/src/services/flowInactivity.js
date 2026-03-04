const logger = require("../lib/logger");
const prisma = require("../db");
const sessionStore = require("../sessionStore");
const { sendText, sendImage, sendVideo } = require("../whatsapp");
const { resolveTenantContextByPhoneNumberId } = require("../tenancy/tenantResolver");
const { loadAllFlows } = require("../../flows");

function findNodeText(flow, nodeId) {
  if (!flow || !Array.isArray(flow.nodes)) {
    return null;
  }
  const node = flow.nodes.find((entry) => entry.id === nodeId);
  return node?.text || null;
}

function buildNodeMap(flow) {
  const map = new Map();
  for (const node of flow?.nodes || []) {
    if (node?.id) {
      map.set(node.id, node);
    }
  }
  return map;
}

function buildLinearSequence(flow, startId, limit = 12) {
  if (!startId) {
    return [];
  }
  const map = buildNodeMap(flow);
  const sequence = [];
  const visited = new Set();
  let currentId = startId;

  while (currentId && !visited.has(currentId) && sequence.length < limit) {
    const node = map.get(currentId);
    if (!node) {
      break;
    }
    sequence.push(node);
    visited.add(currentId);
    if (node.terminal) {
      break;
    }
    const hasButtons = Array.isArray(node.buttons) && node.buttons.length > 0;
    if (hasButtons) {
      break;
    }
    currentId = node.next || null;
  }

  return sequence;
}

async function sendWithTenantContext(session, sendFn) {
  const context = await resolveTenantContextByPhoneNumberId(session.phone_number_id);
  if (!context) {
    return;
  }
  await prisma.runWithPrisma(
    context.prisma,
    () => sendFn(),
    { tenantId: context.tenantId, channel: context.channel }
  );
}

async function sendNodeWithTenantContext(session, node) {
  if (!node) {
    return;
  }
  const bodyText = node.text || node.title || "";
  if (node.type === "image") {
    const url = node.url || node.media || node.image;
    if (!url) {
      return;
    }
    await sendWithTenantContext(session, () =>
      sendImage(session.wa_id, url, bodyText || null)
    );
    return;
  }
  if (node.type === "video") {
    const url = node.url || node.media || node.video;
    if (!url) {
      return;
    }
    await sendWithTenantContext(session, () =>
      sendVideo(session.wa_id, url, bodyText || null)
    );
    return;
  }
  if (!bodyText) {
    return;
  }
  await sendWithTenantContext(session, () => sendText(session.wa_id, bodyText));
}

async function handleSession(session, now, flow, closingText, closingSequence, inactivityCfg) {
  if (!session?.wa_id || !session.phone_number_id) {
    return;
  }
  const updatedAt = Date.parse(session.updatedAt || "") || 0;
  const lastUserAt =
    Date.parse(session.data?.last_user_at || "") || updatedAt || 0;
  if (!lastUserAt) {
    return;
  }

  const firstNoticeMs = inactivityCfg.first_notice_ms;
  const finalAfterNoticeMs = inactivityCfg.final_after_notice_ms;
  const reminderText = inactivityCfg.reminder_text;

  const noticeAt = session.inactivity_notice_at
    ? Date.parse(session.inactivity_notice_at)
    : 0;

  if (noticeAt && lastUserAt > noticeAt) {
    await sessionStore.updateSession(session.wa_id, session.phone_number_id, {
      inactivity_notice_at: null,
      next_due_at: new Date(now + firstNoticeMs),
    });
    return;
  }

  if (noticeAt) {
    if (now - noticeAt >= finalAfterNoticeMs) {
      if (Array.isArray(closingSequence) && closingSequence.length > 0) {
        for (const node of closingSequence) {
          await sendNodeWithTenantContext(session, node);
        }
      } else {
        await sendWithTenantContext(session, () =>
          sendText(
            session.wa_id,
            closingText || "Gracias por escribirnos. Si necesitas algo mas, responde MENU."
          )
        );
      }
      await sessionStore.clearSession(session.wa_id, session.phone_number_id);
    }
    return;
  }

  if (now - lastUserAt >= firstNoticeMs) {
    await sendWithTenantContext(session, () => sendText(session.wa_id, reminderText));
    await sessionStore.updateSession(session.wa_id, session.phone_number_id, {
      inactivity_notice_at: new Date(now).toISOString(),
      next_due_at: new Date(now + finalAfterNoticeMs),
    });
  }
}

// Per-flow metrics timestamps (avoids a single shared variable)
const lastMetricsAtByFlow = new Map();

async function processFlowInactivity(flow, inactivityCfg) {
  const flowId = flow.id;
  const closingNodeId = inactivityCfg.closing_node_id || null;
  const closingText = closingNodeId
    ? findNodeText(flow, closingNodeId) || "Gracias por escribirnos. Si necesitas algo mas, responde MENU."
    : "Gracias por escribirnos. Si necesitas algo mas, responde MENU.";
  const closingSequence = closingNodeId ? buildLinearSequence(flow, closingNodeId) : [];

  const now = Date.now();
  let sessions = [];
  try {
    sessions = await sessionStore.listSessionsDue({
      flowId,
      dueBefore: new Date(now),
      limit: 200,
    });
  } catch (error) {
    if (error?.code === "P2021") {
      logger.warn("flow_inactivity.session_table_missing", {
        flowId,
        message: "Session table missing. Run tenant migrations.",
      });
      return;
    }
    throw error;
  }

  const lastMetricsAt = lastMetricsAtByFlow.get(flowId) || 0;

  if (!sessions.length) {
    if (now - lastMetricsAt > 5 * 60 * 1000) {
      lastMetricsAtByFlow.set(flowId, now);
      const active = await prisma.session.count({
        where: { flow_id: flowId },
      });
      logger.info("flow_inactivity.active_sessions", { flowId, count: active });
    }
    return;
  }

  for (const session of sessions) {
    try {
      await handleSession(session, now, flow, closingText, closingSequence, inactivityCfg);
    } catch (error) {
      logger.error("flow_inactivity.session_failed", {
        message: error.message || error,
        wa_id: session.wa_id,
        flowId,
      });
    }
  }

  if (now - lastMetricsAt > 5 * 60 * 1000) {
    lastMetricsAtByFlow.set(flowId, now);
    const active = await prisma.session.count({
      where: { flow_id: flowId },
    });
    logger.info("flow_inactivity.active_sessions", { flowId, count: active });
  }
}

async function processAllFlowsInactivity() {
  const flows = loadAllFlows();
  for (const flow of Object.values(flows)) {
    const inactivityCfg = flow?.ai?.inactivity;
    if (!inactivityCfg) continue;
    try {
      await processFlowInactivity(flow, inactivityCfg);
    } catch (error) {
      logger.error("flow_inactivity.flow_failed", {
        flowId: flow.id,
        message: error.message || error,
      });
    }
  }
}

// Alias para backward compat con server.js
const processBotpoditoV2Inactivity = processAllFlowsInactivity;

module.exports = {
  processAllFlowsInactivity,
  processBotpoditoV2Inactivity,
};
