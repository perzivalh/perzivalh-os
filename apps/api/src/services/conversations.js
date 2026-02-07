const prisma = require("../db");
const { emitEvent } = require("../realtime");

const CONVERSATION_SELECT = {
  id: true,
  wa_id: true,
  phone_number_id: true,
  phone_e164: true,
  display_name: true,
  status: true,
  assigned_user_id: true,
  partner_id: true,
  patient_id: true,
  verified_at: true,
  verification_method: true,
  last_message_at: true,
  primary_tag_id: true,
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

async function upsertConversation({
  waId,
  phoneE164,
  phoneNumberId,
  displayName,
  lastMessageAt,
}) {
  if (!waId) {
    throw new Error("waId required");
  }
  if (!phoneNumberId) {
    throw new Error("phoneNumberId required");
  }
  const update = {};
  if (phoneE164) {
    update.phone_e164 = phoneE164;
  }
  if (phoneNumberId) {
    update.phone_number_id = phoneNumberId;
  }
  if (displayName !== undefined) {
    update.display_name = displayName || null;
  }
  if (lastMessageAt) {
    update.last_message_at = lastMessageAt;
  }

  const compositeKey = {
    wa_id_phone_number_id: {
      wa_id: waId,
      phone_number_id: phoneNumberId,
    },
  };
  let conversation = await prisma.conversation.findUnique({
    where: compositeKey,
    select: CONVERSATION_SELECT,
  });

  if (conversation) {
    conversation = await prisma.conversation.update({
      where: compositeKey,
      data: update,
      select: CONVERSATION_SELECT,
    });
    return formatConversation(conversation);
  }

  const legacy = await prisma.conversation.findFirst({
    where: { wa_id: waId, phone_number_id: null },
    select: { id: true },
  });

  if (legacy) {
    conversation = await prisma.conversation.update({
      where: { id: legacy.id },
      data: {
        ...update,
        phone_number_id: phoneNumberId,
      },
      select: CONVERSATION_SELECT,
    });
    return formatConversation(conversation);
  }

  conversation = await prisma.conversation.create({
    data: {
      wa_id: waId,
      phone_number_id: phoneNumberId,
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
  await prisma.auditLogTenant.create({
    data: {
      action,
      data_json: data || {},
      ...(userId ? { user: { connect: { id: userId } } } : {}),
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

  const nextData = { status };
  if (status === "open" || status === "pending") {
    nextData.assigned_user_id = null;
  }

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: nextData,
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
    select: { assigned_user_id: true, status: true },
  });
  if (!current) {
    throw new Error("conversation_not_found");
  }

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      assigned_user_id: userId,
      status: "assigned",
    },
    select: CONVERSATION_SELECT,
  });

  if (current.assigned_user_id !== userId || current.status !== "assigned") {
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

async function addTagToConversation({ conversationId, tagName, color, userId }) {
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

  await refreshPrimaryTag(conversationId);
  const updated = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: CONVERSATION_SELECT,
  });
  const formatted = formatConversation(updated);
  if (userId) {
    await logAudit({
      userId,
      action: "conversation.tag_added",
      data: { conversation_id: conversationId, tag: tagName },
    });
  }
  emitEvent("conversation:update", { conversation: formatted });
  return formatted;
}

async function removeTagFromConversation({ conversationId, tagName, userId }) {
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
  await refreshPrimaryTag(conversationId);
  const updated = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: CONVERSATION_SELECT,
  });
  const formatted = formatConversation(updated);
  if (userId) {
    await logAudit({
      userId,
      action: "conversation.tag_removed",
      data: { conversation_id: conversationId, tag: tagName },
    });
  }
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

async function updateConversationVerification({
  conversationId,
  partnerId,
  patientId,
  method,
}) {
  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      partner_id: partnerId ?? null,
      patient_id: patientId ?? null,
      verified_at: new Date(),
      verification_method: method || null,
    },
    select: CONVERSATION_SELECT,
  });
  const formatted = formatConversation(updated);
  emitEvent("conversation:update", { conversation: formatted });
  return formatted;
}

async function updateConversationByWaId(waId, phoneNumberId, data) {
  if (!waId || !phoneNumberId) {
    throw new Error("waId and phoneNumberId required");
  }
  const updated = await prisma.conversation.update({
    where: {
      wa_id_phone_number_id: {
        wa_id: waId,
        phone_number_id: phoneNumberId,
      },
    },
    data,
    select: CONVERSATION_SELECT,
  });
  const formatted = formatConversation(updated);
  emitEvent("conversation:update", { conversation: formatted });
  return formatted;
}

async function refreshPrimaryTag(conversationId) {
  const latestTag = await prisma.conversationTag.findFirst({
    where: { conversation_id: conversationId },
    orderBy: { created_at: "desc" },
    select: { tag_id: true },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { primary_tag_id: latestTag?.tag_id || null },
  });
}

module.exports = {
  upsertConversation,
  createMessage,
  setConversationStatus,
  assignConversation,
  logAudit,
  ensureTagByName,
  addTagToConversation,
  removeTagFromConversation,
  getConversationById,
  updateConversationVerification,
  updateConversationByWaId,
  refreshPrimaryTag,
  formatConversation,
  CONVERSATION_SELECT,
};
