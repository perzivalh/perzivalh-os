const prisma = require("../db");
const { emitEvent } = require("../realtime");

const CONVERSATION_SELECT = {
  id: true,
  wa_id: true,
  phone_e164: true,
  display_name: true,
  status: true,
  assigned_user_id: true,
  last_message_at: true,
  created_at: true,
  assigned_user: {
    select: {
      id: true,
      name: true,
      role: true,
    },
  },
  tags: {
    select: {
      tag: {
        select: {
          id: true,
          name: true,
          color: true,
        },
      },
    },
  },
};

function formatConversation(record) {
  if (!record) {
    return null;
  }
  return {
    ...record,
    tags: (record.tags || []).map((entry) => entry.tag),
  };
}

async function upsertConversation({ waId, phoneE164, displayName, lastMessageAt }) {
  if (!waId) {
    throw new Error("waId required");
  }
  const update = {};
  if (phoneE164) {
    update.phone_e164 = phoneE164;
  }
  if (displayName !== undefined) {
    update.display_name = displayName || null;
  }
  if (lastMessageAt) {
    update.last_message_at = lastMessageAt;
  }

  const conversation = await prisma.conversation.upsert({
    where: { wa_id: waId },
    update,
    create: {
      wa_id: waId,
      phone_e164: phoneE164 || waId,
      display_name: displayName || null,
      last_message_at: lastMessageAt || null,
    },
    select: CONVERSATION_SELECT,
  });

  return formatConversation(conversation);
}

async function createMessage({
  conversationId,
  direction,
  type,
  text,
  rawJson,
}) {
  const message = await prisma.message.create({
    data: {
      conversation_id: conversationId,
      direction,
      type,
      text: text || null,
      raw_json: rawJson || {},
    },
  });

  const conversation = await prisma.conversation.update({
    where: { id: conversationId },
    data: { last_message_at: message.created_at },
    select: CONVERSATION_SELECT,
  });

  const formatted = formatConversation(conversation);
  emitEvent("message:new", { conversation: formatted, message });
  emitEvent("conversation:update", { conversation: formatted });
  return { message, conversation: formatted };
}

async function logAudit({ userId, action, data }) {
  await prisma.auditLog.create({
    data: {
      user_id: userId || null,
      action,
      data_json: data || {},
    },
  });
}

async function setConversationStatus({ conversationId, status, userId }) {
  const current = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { status: true },
  });
  if (!current) {
    throw new Error("conversation_not_found");
  }
  if (current.status === status) {
    return prisma.conversation.findUnique({
      where: { id: conversationId },
      select: CONVERSATION_SELECT,
    });
  }

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { status },
    select: CONVERSATION_SELECT,
  });
  await logAudit({
    userId,
    action: "conversation.status_changed",
    data: {
      conversation_id: conversationId,
      from: current.status,
      to: status,
      by_user_id: userId || null,
    },
  });
  const formatted = formatConversation(updated);
  emitEvent("conversation:update", { conversation: formatted });
  return formatted;
}

async function assignConversation({ conversationId, userId }) {
  const current = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { assigned_user_id: true },
  });
  if (!current) {
    throw new Error("conversation_not_found");
  }

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { assigned_user_id: userId },
    select: CONVERSATION_SELECT,
  });

  if (current.assigned_user_id !== userId) {
    await logAudit({
      userId,
      action: "conversation.assigned",
      data: {
        conversation_id: conversationId,
        from: current.assigned_user_id,
        to: userId,
        by_user_id: userId,
      },
    });
  }

  const formatted = formatConversation(updated);
  emitEvent("conversation:update", { conversation: formatted });
  return formatted;
}

async function ensureTagByName(name, color) {
  if (!name) {
    throw new Error("tag_name_required");
  }
  const tag = await prisma.tag.upsert({
    where: { name },
    update: {
      color: color || undefined,
    },
    create: {
      name,
      color: color || null,
    },
  });
  return tag;
}

async function addTagToConversation({ conversationId, tagName, color }) {
  const tag = await ensureTagByName(tagName, color);
  await prisma.conversationTag.upsert({
    where: {
      conversation_id_tag_id: {
        conversation_id: conversationId,
        tag_id: tag.id,
      },
    },
    update: {},
    create: {
      conversation_id: conversationId,
      tag_id: tag.id,
    },
  });

  const updated = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: CONVERSATION_SELECT,
  });
  const formatted = formatConversation(updated);
  emitEvent("conversation:update", { conversation: formatted });
  return formatted;
}

async function removeTagFromConversation({ conversationId, tagName }) {
  const tag = await prisma.tag.findUnique({ where: { name: tagName } });
  if (!tag) {
    return prisma.conversation.findUnique({
      where: { id: conversationId },
      select: CONVERSATION_SELECT,
    });
  }
  await prisma.conversationTag.deleteMany({
    where: {
      conversation_id: conversationId,
      tag_id: tag.id,
    },
  });
  const updated = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: CONVERSATION_SELECT,
  });
  const formatted = formatConversation(updated);
  emitEvent("conversation:update", { conversation: formatted });
  return formatted;
}

async function getConversationById(conversationId) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: CONVERSATION_SELECT,
  });
  return formatConversation(conversation);
}

module.exports = {
  upsertConversation,
  createMessage,
  setConversationStatus,
  assignConversation,
  ensureTagByName,
  addTagToConversation,
  removeTagFromConversation,
  getConversationById,
  formatConversation,
  CONVERSATION_SELECT,
};
