const prisma = require("../db");
const { normalizeText } = require("../lib/normalize");
const { addTagToConversation } = require("./conversations");
const audienceAutomationService = require("./audienceAutomationService");

const SERVICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let servicesCache = null;
let servicesCacheAt = 0;

function normalizeValue(value) {
  return normalizeText(value || "").toLowerCase().trim();
}

function normalizeTagNames(tags) {
  const values = Array.isArray(tags) ? tags : [tags];
  return [...new Set(values.map((tag) => normalizeValue(tag)).filter(Boolean))];
}

async function loadActiveServices() {
  const now = Date.now();
  if (servicesCache && now - servicesCacheAt < SERVICE_CACHE_TTL) {
    return servicesCache;
  }
  try {
    const services = await prisma.service.findMany({
      where: { is_active: true },
      select: { name: true, keywords: true },
    });
    servicesCache = services;
    servicesCacheAt = now;
    return services;
  } catch (_) {
    return servicesCache || [];
  }
}

async function deriveServiceTags({ text, routeId } = {}) {
  const normalizedText = normalizeValue(text);
  const normalizedRouteId = String(routeId || "").trim().toLowerCase();
  const tags = [];

  const services = await loadActiveServices();
  for (const svc of services) {
    const tagName = svc.name.trim().toLowerCase();
    if (!tagName) continue;

    // Match by routeId containing part of the service name
    if (normalizedRouteId && normalizedRouteId.includes(normalizeValue(svc.name))) {
      if (!tags.includes(tagName)) tags.push(tagName);
      continue;
    }

    // Match by service name in the message text
    const nameNorm = normalizeValue(svc.name);
    if (nameNorm && normalizedText.includes(nameNorm)) {
      if (!tags.includes(tagName)) tags.push(tagName);
      continue;
    }

    // Match by keywords (comma or semicolon separated)
    if (svc.keywords) {
      const kws = svc.keywords
        .split(/[,;\n]+/)
        .map((k) => normalizeValue(k))
        .filter(Boolean);
      if (kws.some((k) => k && normalizedText.includes(k))) {
        if (!tags.includes(tagName)) tags.push(tagName);
      }
    }
  }

  return tags;
}

async function ensureDynamicAudienceIfEnabled({
  phoneNumberId,
  tagName,
} = {}) {
  if (!phoneNumberId || !tagName) {
    return;
  }

  const settings = await audienceAutomationService.getAutomationSettings({
    phoneNumberId,
  });
  if (!settings?.enabled) {
    return;
  }

  await audienceAutomationService.ensureDefaultAudience({
    phoneNumberId,
    userId: null,
  });
  await audienceAutomationService.createTagWithAudience({
    name: tagName,
    phoneNumberId,
    userId: null,
  });
}

async function applyNamedTagsToConversation({
  conversationId,
  phoneNumberId,
  tags,
} = {}) {
  if (!conversationId) {
    return { tags: [] };
  }

  const normalizedTags = normalizeTagNames(tags);
  if (!normalizedTags.length) {
    return { tags: [] };
  }

  for (const tagName of normalizedTags) {
    await addTagToConversation({
      conversationId,
      tagName,
      userId: null,
    });
    await ensureDynamicAudienceIfEnabled({
      phoneNumberId,
      tagName,
    });
  }

  return { tags: normalizedTags };
}

async function applyAutoTagsToConversation({
  conversationId,
  phoneNumberId,
  text,
  routeId,
  reason,
} = {}) {
  if (!conversationId) {
    return { tags: [] };
  }

  const tags = await deriveServiceTags({ text, routeId, reason });
  return applyNamedTagsToConversation({
    conversationId,
    phoneNumberId,
    tags,
  });
}

async function applyNamedTagsByWaId({
  waId,
  phoneNumberId,
  tags,
} = {}) {
  if (!waId || !phoneNumberId) {
    return { tags: [] };
  }

  const conversation = await prisma.conversation.findUnique({
    where: {
      wa_id_phone_number_id: {
        wa_id: waId,
        phone_number_id: phoneNumberId,
      },
    },
    select: { id: true, phone_number_id: true },
  });

  if (!conversation) {
    return { tags: [] };
  }

  return applyNamedTagsToConversation({
    conversationId: conversation.id,
    phoneNumberId: conversation.phone_number_id || phoneNumberId,
    tags,
  });
}

async function applyAutoTagsByWaId({
  waId,
  phoneNumberId,
  text,
  routeId,
  reason,
} = {}) {
  if (!waId || !phoneNumberId) {
    return { tags: [] };
  }

  const conversation = await prisma.conversation.findUnique({
    where: {
      wa_id_phone_number_id: {
        wa_id: waId,
        phone_number_id: phoneNumberId,
      },
    },
    select: { id: true, phone_number_id: true },
  });

  if (!conversation) {
    return { tags: [] };
  }

  return applyAutoTagsToConversation({
    conversationId: conversation.id,
    phoneNumberId: conversation.phone_number_id || phoneNumberId,
    text,
    routeId,
    reason,
  });
}

module.exports = {
  deriveServiceTags,
  applyNamedTagsToConversation,
  applyNamedTagsByWaId,
  applyAutoTagsToConversation,
  applyAutoTagsByWaId,
  invalidateServicesCache() { servicesCache = null; servicesCacheAt = 0; },
};
