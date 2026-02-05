const logger = require("../lib/logger");
const prisma = require("../db");
const sessionStore = require("../sessionStore");
const { sendText, sendImage, sendVideo } = require("../whatsapp");
const { resolveTenantContextByPhoneNumberId } = require("../tenancy/tenantResolver");
const { getFlow } = require("../../flows");
const {
  BOT_FLOW_ID,
  FIRST_NOTICE_MS,
  FINAL_AFTER_NOTICE_MS,
  REMINDER_TEXT,
} = require("../config/flowInactivity");

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

async function handleSession(session, now, flow, closingText, closingSequence) {
  if (!session?.wa_id || !session.phone_number_id) {
    return;
  }
  const updatedAt = Date.parse(session.updatedAt || "") || 0;
  const lastUserAt =
    Date.parse(session.data?.last_user_at || "") || updatedAt || 0;
  if (!lastUserAt) {
    return;
  }

  const noticeAt = session.inactivity_notice_at
    ? Date.parse(session.inactivity_notice_at)
    : 0;

  if (noticeAt && lastUserAt > noticeAt) {
    await sessionStore.updateSession(session.wa_id, session.phone_number_id, {
      inactivity_notice_at: null,
      next_due_at: new Date(now + FIRST_NOTICE_MS),
    });
    return;
  }

  if (noticeAt) {
    if (now - noticeAt >= FINAL_AFTER_NOTICE_MS) {
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

  if (now - lastUserAt >= FIRST_NOTICE_MS) {
    await sendWithTenantContext(session, () => sendText(session.wa_id, REMINDER_TEXT));
    await sessionStore.updateSession(session.wa_id, session.phone_number_id, {
      inactivity_notice_at: new Date(now).toISOString(),
      next_due_at: new Date(now + FINAL_AFTER_NOTICE_MS),
    });
  }
}

let lastMetricsAt = 0;

async function processBotpoditoV2Inactivity() {
  const flow = getFlow(BOT_FLOW_ID);
  if (!flow) {
    logger.warn("flow_inactivity.flow_missing", { flowId: BOT_FLOW_ID });
    return;
  }
  const closingText =
    findNodeText(flow, "CIERRE_HORARIO_UBICACION") ||
    "Gracias por escribirnos. Si necesitas algo mas, responde MENU.";
  const closingSequence = buildLinearSequence(flow, "CIERRE_HORARIO_UBICACION");

  const now = Date.now();
  let sessions = [];
  try {
    sessions = await sessionStore.listSessionsDue({
      flowId: BOT_FLOW_ID,
      dueBefore: new Date(now),
      limit: 200,
    });
  } catch (error) {
    if (error?.code === "P2021") {
      logger.warn("flow_inactivity.session_table_missing", {
        flowId: BOT_FLOW_ID,
        message: "Session table missing. Run tenant migrations.",
      });
      return;
    }
    throw error;
  }

  if (!sessions.length) {
    if (now - lastMetricsAt > 5 * 60 * 1000) {
      lastMetricsAt = now;
      const active = await prisma.session.count({
        where: { flow_id: BOT_FLOW_ID },
      });
      logger.info("flow_inactivity.active_sessions", {
        flowId: BOT_FLOW_ID,
        count: active,
      });
    }
    return;
  }

  for (const session of sessions) {
    try {
      await handleSession(session, now, flow, closingText, closingSequence);
    } catch (error) {
      logger.error("flow_inactivity.session_failed", {
        message: error.message || error,
        wa_id: session.wa_id,
      });
    }
  }

  if (now - lastMetricsAt > 5 * 60 * 1000) {
    lastMetricsAt = now;
    const active = await prisma.session.count({
      where: { flow_id: BOT_FLOW_ID },
    });
    logger.info("flow_inactivity.active_sessions", {
      flowId: BOT_FLOW_ID,
      count: active,
    });
  }
}

module.exports = {
  processBotpoditoV2Inactivity,
};
