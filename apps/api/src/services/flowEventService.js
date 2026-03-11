const prisma = require("../db");
const logger = require("../lib/logger");

async function resolveConversationId({ conversationId, waId, phoneNumberId }) {
  if (conversationId) {
    return conversationId;
  }
  if (!waId) {
    return null;
  }

  const record = await prisma.conversation.findFirst({
    where: {
      wa_id: waId,
      phone_number_id: phoneNumberId || null,
    },
    select: { id: true },
  });
  return record?.id || null;
}

async function trackFlowEvent(input = {}) {
  try {
    const conversationId = await resolveConversationId(input);
    await prisma.flowEvent.create({
      data: {
        conversation_id: conversationId,
        wa_id: input.waId || null,
        phone_number_id: input.phoneNumberId || null,
        flow_id: input.flowId || null,
        node_id: input.nodeId || null,
        event_type: input.eventType || "unknown",
        source: input.source || null,
        actor_user_id: input.actorUserId || null,
        payload_json: input.payload || {},
      },
    });
  } catch (error) {
    logger.warn("flow_event.track_failed", {
      eventType: input.eventType || null,
      message: error.message || String(error),
    });
  }
}

module.exports = {
  trackFlowEvent,
};
