const prisma = require("../db");
const audienceService = require("./audienceService");
const { ensureTagByName } = require("./conversations");

async function getAutomationSettings({ phoneNumberId } = {}) {
  const setting = await prisma.audienceAutomationSetting.findFirst({
    where: phoneNumberId ? { phone_number_id: phoneNumberId } : { phone_number_id: null },
    orderBy: { updated_at: "desc" },
  });
  return setting || { enabled: false, phone_number_id: phoneNumberId || null };
}

async function setAutomationSettings({ phoneNumberId, enabled, userId }) {
  const data = {
    phone_number_id: phoneNumberId || null,
    enabled: Boolean(enabled),
  };
  const existing = await prisma.audienceAutomationSetting.findFirst({
    where: phoneNumberId ? { phone_number_id: phoneNumberId } : { phone_number_id: null },
  });
  const setting = existing
    ? await prisma.audienceAutomationSetting.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.audienceAutomationSetting.create({ data });

  if (userId) {
    await prisma.auditLogTenant.create({
      data: {
        action: "audience.automation.updated",
        data_json: {
          phone_number_id: phoneNumberId || null,
          enabled: Boolean(enabled),
        },
        user: { connect: { id: userId } },
      },
    });
  }

  return setting;
}

async function ensureDefaultAudience({ phoneNumberId, userId } = {}) {
  const existing = await prisma.audienceTag.findFirst({
    where: { is_default: true, phone_number_id: phoneNumberId || null },
    include: { segment: true },
  });
  if (existing) {
    return existing.segment;
  }

  const rules = [
    { type: "source", operator: "is", value: "conversation" },
    { type: "primary_tag", operator: "is", value: null },
  ];
  if (phoneNumberId) {
    rules.push({ type: "phone_number_id", operator: "is", value: phoneNumberId });
  }

  const segment = await prisma.audienceSegment.create({
    data: {
      name: phoneNumberId ? `DEFAULT (${phoneNumberId})` : "DEFAULT",
      description: "Contactos sin etiqueta específica",
      rules_json: rules,
      estimated_count: 0,
      created_by_user_id: userId || null,
    },
  });

  await prisma.audienceTag.create({
    data: {
      tag_id: null,
      segment_id: segment.id,
      phone_number_id: phoneNumberId || null,
      is_default: true,
      last_synced_at: new Date(),
    },
  });

  const count = await audienceService.estimateRecipientCount(segment.id);
  await prisma.audienceSegment.update({
    where: { id: segment.id },
    data: { estimated_count: count, last_synced_at: new Date() },
  });

  return segment;
}

async function ensureAudienceForTag({ tagId, tagName, phoneNumberId, userId }) {
  const existing = await prisma.audienceTag.findFirst({
    where: {
      tag_id: tagId,
      phone_number_id: phoneNumberId || null,
    },
    include: { segment: true },
  });
  if (existing) {
    return existing.segment;
  }

  const rules = [
    { type: "primary_tag", operator: "is", value: tagId },
    { type: "tag", operator: "has", value: tagName },
  ];
  if (phoneNumberId) {
    rules.push({ type: "phone_number_id", operator: "is", value: phoneNumberId });
  }
  if (phoneNumberId) {
    rules.push({ type: "phone_number_id", operator: "is", value: phoneNumberId });
  }

  const segment = await prisma.audienceSegment.create({
    data: {
      name: tagName,
      description: "Audiencia dinámica por etiqueta",
      rules_json: rules,
      estimated_count: 0,
      created_by_user_id: userId || null,
    },
  });

  await prisma.audienceTag.create({
    data: {
      tag_id: tagId,
      segment_id: segment.id,
      phone_number_id: phoneNumberId || null,
      is_default: false,
      last_synced_at: new Date(),
    },
  });

  const count = await audienceService.estimateRecipientCount(segment.id);
  await prisma.audienceSegment.update({
    where: { id: segment.id },
    data: { estimated_count: count, last_synced_at: new Date() },
  });

  return segment;
}

async function listDynamicAudiences({ phoneNumberId } = {}) {
  await ensureDefaultAudience({ phoneNumberId });
  const mappings = await prisma.audienceTag.findMany({
    where: { phone_number_id: phoneNumberId || null },
    include: { tag: true, segment: true },
    orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
  });
  return mappings.map((mapping) => ({
    id: mapping.id,
    is_default: mapping.is_default,
    phone_number_id: mapping.phone_number_id,
    last_synced_at: mapping.last_synced_at,
    tag: mapping.tag,
    segment: mapping.segment,
  }));
}

async function syncHistorical({ phoneNumberId, userId } = {}) {
  const where = phoneNumberId ? { phone_number_id: phoneNumberId } : {};
  const conversations = await prisma.conversation.findMany({
    where,
    select: { id: true },
  });

  let updated = 0;
  for (const conversation of conversations) {
    const latestTag = await prisma.conversationTag.findFirst({
      where: { conversation_id: conversation.id },
      orderBy: { created_at: "desc" },
      select: { tag_id: true },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { primary_tag_id: latestTag?.tag_id || null },
    });
    updated++;
  }

  const tags = await prisma.tag.findMany({
    select: { id: true, name: true },
  });
  for (const tag of tags) {
    await ensureAudienceForTag({
      tagId: tag.id,
      tagName: tag.name,
      phoneNumberId,
      userId,
    });
  }

  await ensureDefaultAudience({ phoneNumberId, userId });

  const mappings = await prisma.audienceTag.findMany({
    where: { phone_number_id: phoneNumberId || null },
    select: { id: true, segment_id: true },
  });

  for (const mapping of mappings) {
    const count = await audienceService.estimateRecipientCount(mapping.segment_id);
    await prisma.audienceSegment.update({
      where: { id: mapping.segment_id },
      data: { estimated_count: count, last_synced_at: new Date() },
    });
    await prisma.audienceTag.update({
      where: { id: mapping.id },
      data: { last_synced_at: new Date() },
    });
  }

  if (userId) {
    await prisma.auditLogTenant.create({
      data: {
        action: "audience.automation.sync",
        data_json: { phone_number_id: phoneNumberId || null, updated },
        user: { connect: { id: userId } },
      },
    });
  }

  return { updated, tags: tags.length };
}

async function createTagWithAudience({ name, color, phoneNumberId, userId }) {
  const tag = await ensureTagByName(name, color);
  const segment = await ensureAudienceForTag({
    tagId: tag.id,
    tagName: tag.name,
    phoneNumberId,
    userId,
  });
  return { tag, segment };
}

module.exports = {
  getAutomationSettings,
  setAutomationSettings,
  ensureDefaultAudience,
  ensureAudienceForTag,
  listDynamicAudiences,
  syncHistorical,
  createTagWithAudience,
};
