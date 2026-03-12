const prisma = require("../db");
const audienceService = require("./audienceService");
const { ensureTagByName } = require("./conversations");

const DEFAULT_AUDIENCE_DESCRIPTION = "Contactos sin etiqueta especifica";
const TAG_AUDIENCE_DESCRIPTION = "Audiencia dinamica por etiqueta";

function buildDefaultAudienceRules({ phoneNumberId } = {}) {
  const rules = [
    { type: "source", operator: "is", value: "conversation" },
    { type: "primary_tag", operator: "is", value: null },
  ];
  if (phoneNumberId) {
    rules.push({ type: "phone_number_id", operator: "is", value: phoneNumberId });
  }
  return rules;
}

function buildTagAudienceRules({ tagId, tagName, phoneNumberId } = {}) {
  const rules = [
    { type: "source", operator: "is", value: "conversation" },
    { type: "primary_tag", operator: "is", value: tagId },
    { type: "tag", operator: "has", value: tagName },
  ];
  if (phoneNumberId) {
    rules.push({ type: "phone_number_id", operator: "is", value: phoneNumberId });
  }
  return rules;
}

function hasSourceRule(rules = []) {
  return Array.isArray(rules) && rules.some((rule) => (rule?.type || rule?.field) === "source");
}

function ensureConversationSourceRule(rules = []) {
  const baseRules = Array.isArray(rules)
    ? rules.filter((rule) => (rule?.type || rule?.field) !== "source")
    : [];
  return [{ type: "source", operator: "is", value: "conversation" }, ...baseRules];
}

function rulesEqual(left, right) {
  return JSON.stringify(left || []) === JSON.stringify(right || []);
}

function buildDefaultAudienceName({ phoneNumberId, lineName } = {}) {
  const normalizedLineName = typeof lineName === "string" ? lineName.trim() : "";
  const suffix = normalizedLineName
    ? ` - ${normalizedLineName}`
    : phoneNumberId
      ? ` (${phoneNumberId})`
      : "";
  return `DEFAULT${suffix}`;
}

function normalizeDynamicSegmentRules({
  isDefault = false,
  tagId = null,
  tagName = null,
  phoneNumberId = null,
  currentRules = [],
} = {}) {
  if (isDefault) {
    return buildDefaultAudienceRules({ phoneNumberId });
  }
  if (tagId && tagName) {
    return buildTagAudienceRules({ tagId, tagName, phoneNumberId });
  }
  return hasSourceRule(currentRules)
    ? currentRules
    : ensureConversationSourceRule(currentRules);
}

async function reconcileDynamicMapping(mapping, { phoneNumberId, lineName, refreshCount = false } = {}) {
  if (!mapping?.segment) {
    return null;
  }

  const nextRules = normalizeDynamicSegmentRules({
    isDefault: Boolean(mapping.is_default),
    tagId: mapping.tag?.id || null,
    tagName: mapping.tag?.name || null,
    phoneNumberId: phoneNumberId || mapping.phone_number_id || null,
    currentRules: mapping.segment.rules_json,
  });

  const nextName = mapping.is_default
    ? buildDefaultAudienceName({
        phoneNumberId: phoneNumberId || mapping.phone_number_id || null,
        lineName,
      })
    : mapping.tag?.name || mapping.segment.name;
  const nextDescription = mapping.is_default
    ? DEFAULT_AUDIENCE_DESCRIPTION
    : TAG_AUDIENCE_DESCRIPTION;

  const updateData = {};
  if (!rulesEqual(mapping.segment.rules_json, nextRules)) {
    updateData.rules_json = nextRules;
  }
  if (nextName && mapping.segment.name !== nextName) {
    updateData.name = nextName;
  }
  if (mapping.segment.description !== nextDescription) {
    updateData.description = nextDescription;
  }

  const needsSegmentUpdate = Object.keys(updateData).length > 0;
  if (needsSegmentUpdate) {
    await prisma.audienceSegment.update({
      where: { id: mapping.segment.id },
      data: updateData,
    });
  }

  if (!needsSegmentUpdate && !refreshCount) {
    return mapping.segment;
  }

  const count = await audienceService.estimateRecipientCount(mapping.segment.id);
  const now = new Date();
  const segment = await prisma.audienceSegment.update({
    where: { id: mapping.segment.id },
    data: { estimated_count: count, last_synced_at: now },
  });

  await prisma.audienceTag.update({
    where: { id: mapping.id },
    data: { last_synced_at: now },
  });

  return segment;
}

async function getAutomationSettings({ phoneNumberId } = {}) {
  const setting = await prisma.audienceAutomationSetting.findFirst({
    where: phoneNumberId ? { phone_number_id: phoneNumberId } : { phone_number_id: null },
    orderBy: { updated_at: "desc" },
  });
  return setting || { enabled: false, phone_number_id: phoneNumberId || null };
}

async function setAutomationSettings({ phoneNumberId, enabled, userId, lineName }) {
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

  if (enabled) {
    await ensureDefaultAudience({ phoneNumberId, userId, lineName });
  }

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

async function ensureDefaultAudience({ phoneNumberId, userId, lineName } = {}) {
  const existing = await prisma.audienceTag.findFirst({
    where: { is_default: true, phone_number_id: phoneNumberId || null },
    include: { segment: true },
  });
  if (existing) {
    return (
      await reconcileDynamicMapping(existing, {
        phoneNumberId,
        lineName,
      })
    ) || existing.segment;
  }

  const segment = await prisma.audienceSegment.create({
    data: {
      name: buildDefaultAudienceName({ phoneNumberId, lineName }),
      description: DEFAULT_AUDIENCE_DESCRIPTION,
      rules_json: buildDefaultAudienceRules({ phoneNumberId }),
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
    include: { segment: true, tag: true },
  });
  if (existing) {
    return (
      await reconcileDynamicMapping(existing, {
        phoneNumberId,
      })
    ) || existing.segment;
  }

  const segment = await prisma.audienceSegment.create({
    data: {
      name: tagName,
      description: TAG_AUDIENCE_DESCRIPTION,
      rules_json: buildTagAudienceRules({ tagId, tagName, phoneNumberId }),
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

async function listDynamicAudiences({ phoneNumberId, lineName } = {}) {
  await ensureDefaultAudience({ phoneNumberId, lineName });
  const mappings = await prisma.audienceTag.findMany({
    where: { phone_number_id: phoneNumberId || null },
    include: { tag: true, segment: true },
    orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
  });
  const hasPendingAttention = mappings.some((mapping) => mapping.tag?.name === "pendiente_atencion");
  const filteredMappings = hasPendingAttention
    ? mappings.filter((mapping) => mapping.tag?.name !== "pendiente")
    : mappings;

  const hydratedMappings = [];
  for (const mapping of filteredMappings) {
    const repairedSegment = await reconcileDynamicMapping(mapping, {
      phoneNumberId,
      lineName,
      refreshCount: true,
    });
    hydratedMappings.push({
      ...mapping,
      segment: repairedSegment || mapping.segment,
    });
  }

  return hydratedMappings.map((mapping) => ({
    id: mapping.id,
    is_default: mapping.is_default,
    phone_number_id: mapping.phone_number_id,
    last_synced_at: mapping.last_synced_at,
    tag: mapping.tag,
    segment: mapping.segment,
  }));
}

async function syncHistorical({ phoneNumberId, userId, lineName } = {}) {
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
    updated += 1;
  }

  const tags = await prisma.tag.findMany({
    select: { id: true, name: true },
  });
  const tagNames = new Set(tags.map((tag) => tag.name));
  const skipNames = new Set();
  if (tagNames.has("pendiente_atencion")) {
    skipNames.add("pendiente");
  }
  for (const tag of tags) {
    if (skipNames.has(tag.name)) {
      continue;
    }
    await ensureAudienceForTag({
      tagId: tag.id,
      tagName: tag.name,
      phoneNumberId,
      userId,
    });
  }

  await ensureDefaultAudience({ phoneNumberId, userId, lineName });

  const mappings = await prisma.audienceTag.findMany({
    where: { phone_number_id: phoneNumberId || null },
    include: { tag: true, segment: true },
  });

  for (const mapping of mappings) {
    await reconcileDynamicMapping(mapping, {
      phoneNumberId,
      lineName,
      refreshCount: true,
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
