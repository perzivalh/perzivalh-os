const prisma = require("../db");
const { normalizeText } = require("../lib/normalize");
const { addTagToConversation } = require("./conversations");
const audienceAutomationService = require("./audienceAutomationService");

const PIE_ATLETA_TAG = "pie de atleta";
const HONGOS_TAG = "hongos";

const PIE_ATLETA_PHRASES = [
  "pie de atleta",
  "pie atleta",
  "hongo entre los dedos",
  "hongos entre los dedos",
  "picazon entre los dedos",
  "picazón entre los dedos",
  "picazon en los pies",
  "picazón en los pies",
  "tinea pedis",
  "tiña pedis",
];

const HONGOS_PHRASES = [
  "onicomicosis",
  "hongo en la una",
  "hongo en la uña",
  "hongo en unas",
  "hongo en uñas",
  "hongos en las unas",
  "hongos en las uñas",
  "unas con hongo",
  "uñas con hongo",
  "hongo",
  "hongos",
];

const HONGOS_ROUTE_IDS = new Set([
  "HONGOS_TIPO_TRAT",
  "TRAT_TOPICO_INFO",
  "TRAT_LASER_INFO",
  "TRAT_SISTEMICO_INFO",
]);

function normalizeValue(value) {
  return normalizeText(value || "").toLowerCase().trim();
}

function includesAny(text, phrases) {
  if (!text) return false;
  return phrases.some((phrase) => text.includes(phrase));
}

function deriveServiceTags({ text, routeId, reason } = {}) {
  const normalizedText = normalizeValue(text);
  const normalizedRouteId = String(routeId || "").trim();
  const normalizedReason = String(reason || "").toLowerCase();

  const tags = [];

  if (
    normalizedRouteId === "OTR_PIE_ATLETA_INFO" ||
    includesAny(normalizedText, PIE_ATLETA_PHRASES)
  ) {
    tags.push(PIE_ATLETA_TAG);
  }

  if (
    normalizedRouteId === "HONGOS_TIPO_TRAT" ||
    HONGOS_ROUTE_IDS.has(normalizedRouteId) ||
    normalizedReason.includes("deterministic_domain_intent:hongos") ||
    includesAny(normalizedText, HONGOS_PHRASES)
  ) {
    if (!tags.includes(HONGOS_TAG)) {
      tags.push(HONGOS_TAG);
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

  const tags = deriveServiceTags({ text, routeId, reason });
  if (!tags.length) {
    return { tags: [] };
  }

  for (const tagName of tags) {
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

  return { tags };
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
  applyAutoTagsToConversation,
  applyAutoTagsByWaId,
};
