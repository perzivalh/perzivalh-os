const axios = require("axios");
const { upsertConversation, createMessage } = require("./services/conversations");
const { toPhoneE164 } = require("./lib/normalize");
const logger = require("./lib/logger");
const { getTenantContext } = require("./tenancy/tenantContext");
const prisma = require("./db");

const MAX_VIDEO_BYTES = 16 * 1024 * 1024;

async function getRemoteContentLength(url) {
  try {
    const response = await axios.head(url, { timeout: 5000 });
    const length = Number(response.headers?.["content-length"]);
    return Number.isFinite(length) ? length : null;
  } catch (error) {
    logger.warn("media.head_failed", { url, message: error.message || error });
    return null;
  }
}

function getTemplateParamCount(text) {
  if (!text) return 0;
  let maxIndex = 0;
  const regex = /\{\{(\d+)\}\}/g;
  let match = null;
  while ((match = regex.exec(text)) !== null) {
    const index = Number(match[1]);
    if (!Number.isNaN(index)) {
      maxIndex = Math.max(maxIndex, index);
    }
  }
  return maxIndex;
}

function resolveTemplateVariables(mappings) {
  const values = {};
  if (!Array.isArray(mappings)) {
    return values;
  }
  for (const mapping of mappings) {
    let value = mapping?.default_value || "";
    if (mapping?.source_type === "static") {
      value = mapping?.source_path || mapping?.default_value || "";
    }
    values[mapping?.var_index] = value || mapping?.default_value || "Cliente";
  }
  return values;
}

async function ensureTemplateComponents(name, language, components) {
  if (Array.isArray(components) && components.length) {
    return components;
  }
  try {
    const metaTemplate = await prisma.metaTemplate.findFirst({
      where: { name, language, is_deleted: false },
      include: { variable_mappings: true },
    });
    const bodyText = metaTemplate?.body_text || "";
    const headerText =
      metaTemplate?.header_type === "text" ? metaTemplate?.header_content || "" : "";
    let bodyCount = getTemplateParamCount(bodyText);
    if (bodyCount === 0 && Array.isArray(metaTemplate?.variable_mappings)) {
      const maxIndex = metaTemplate.variable_mappings.reduce((acc, mapping) => {
        const index = Number(mapping?.var_index || 0);
        return Number.isNaN(index) ? acc : Math.max(acc, index);
      }, 0);
      bodyCount = Math.max(bodyCount, maxIndex);
    }
    const headerCount = getTemplateParamCount(headerText);
    if (bodyCount === 0 && headerCount === 0) {
      return components || [];
    }
    const variableValues = resolveTemplateVariables(metaTemplate?.variable_mappings);
    const resolved = [];
    if (bodyCount > 0) {
      const parameters = [];
      for (let i = 1; i <= bodyCount; i += 1) {
        parameters.push({ type: "text", text: variableValues[i] || "Cliente" });
      }
      resolved.push({ type: "body", parameters });
    }
    if (headerCount > 0) {
      const parameters = [];
      for (let i = 1; i <= headerCount; i += 1) {
        parameters.push({ type: "text", text: variableValues[i] || "Cliente" });
      }
      resolved.push({ type: "header", parameters });
    }
    return resolved;
  } catch (error) {
    logger.warn("template.auto_fill_failed", { name, message: error.message || error });
    return components || [];
  }
}

function getWhatsAppConfig(options = {}) {
  const context = getTenantContext();
  const channel = options.channel || context.channel || {};
  return {
    token: channel.wa_token || "",
    phoneNumberId: channel.phone_number_id || "",
  };
}

function getWhatsAppUrl(phoneNumberId) {
  if (!phoneNumberId) {
    return null;
  }
  return `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;
}

async function sendWhatsAppMessage(payload, options = {}) {
  const { token, phoneNumberId } = getWhatsAppConfig(options);
  const url = getWhatsAppUrl(phoneNumberId);
  if (!token || !url) {
    logger.error("WhatsApp config missing");
    return {
      ok: false,
      error: { message: "config_missing" },
    };
  }

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    return {
      ok: true,
      response: {
        status: response.status,
        data: response.data,
      },
    };
  } catch (error) {
    const status = error.response?.status;
    const data = error.response?.data;
    if (status || data) {
      logger.error("WhatsApp API error", { status, data });
      return {
        ok: false,
        error: { status, data },
      };
    }
    logger.error("WhatsApp API error", { message: error.message || error });
    return {
      ok: false,
      error: { message: error.message || error },
    };
  }
}

async function recordOutgoingMessage(to, type, text, raw, phoneNumberId) {
  try {
    const conversation = await upsertConversation({
      waId: to,
      phoneE164: toPhoneE164(to),
      phoneNumberId,
    });
    await createMessage({
      conversationId: conversation.id,
      direction: "out",
      type,
      text,
      rawJson: raw || {},
    });
  } catch (error) {
    logger.error("Outgoing message log error", {
      message: error.message || error,
    });
  }
}

async function sendText(to, text, options = {}) {
  const config = getWhatsAppConfig(options);
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  };
  const result = await sendWhatsAppMessage(payload, options);
  await recordOutgoingMessage(
    to,
    "text",
    text,
    {
      payload,
      response: result.response,
      error: result.error,
      meta: options.meta,
    },
    config.phoneNumberId
  );
  return result;
}

async function sendButtons(to, text, buttons, options = {}) {
  const config = getWhatsAppConfig(options);
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text },
      action: {
        buttons: buttons.map((button) => ({
          type: "reply",
          reply: {
            id: button.id,
            title: button.title,
          },
        })),
      },
    },
  };
  const result = await sendWhatsAppMessage(payload, options);
  await recordOutgoingMessage(
    to,
    "interactive",
    text,
    {
      payload,
      response: result.response,
      error: result.error,
      meta: options.meta,
    },
    config.phoneNumberId
  );
  return result;
}

async function sendList(
  to,
  header,
  body,
  footer,
  buttonText,
  sections,
  options = {}
) {
  const config = getWhatsAppConfig(options);
  const interactive = {
    type: "list",
    body: { text: body },
    action: {
      button: buttonText,
      sections: sections.map((section) => ({
        title: section.title,
        rows: section.rows.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
        })),
      })),
    },
  };

  if (header) {
    interactive.header = { type: "text", text: header };
  }
  if (footer) {
    interactive.footer = { text: footer };
  }

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive,
  };
  const result = await sendWhatsAppMessage(payload, options);
  await recordOutgoingMessage(
    to,
    "interactive",
    body,
    {
      payload,
      response: result.response,
      error: result.error,
      meta: options.meta,
    },
    config.phoneNumberId
  );
  return result;
}

async function sendLocation(
  to,
  latitude,
  longitude,
  name,
  address,
  options = {}
) {
  const config = getWhatsAppConfig(options);
  if (
    latitude === undefined ||
    longitude === undefined ||
    latitude === null ||
    longitude === null
  ) {
    return sendText(to, "Ubicacion no disponible por ahora.");
  }

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "location",
    location: {
      latitude: Number(latitude),
      longitude: Number(longitude),
      name,
      address,
    },
  };
  const result = await sendWhatsAppMessage(payload, options);
  await recordOutgoingMessage(
    to,
    "location",
    null,
    {
      payload,
      response: result.response,
      error: result.error,
      meta: options.meta,
    },
    config.phoneNumberId
  );
  return result;
}

async function sendImage(to, imageUrl, caption = null, options = {}) {
  const config = getWhatsAppConfig(options);
  if (!imageUrl) {
    return sendText(to, "Imagen no disponible por ahora.");
  }
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "image",
    image: {
      link: imageUrl,
      caption: caption || undefined,
    },
  };
  const result = await sendWhatsAppMessage(payload, options);
  await recordOutgoingMessage(
    to,
    "image",
    caption || null,
    {
      payload,
      response: result.response,
      error: result.error,
      meta: options.meta,
    },
    config.phoneNumberId
  );
  return result;
}

async function sendVideo(to, videoUrl, caption = null, options = {}) {
  const config = getWhatsAppConfig(options);
  if (!videoUrl) {
    return sendText(to, "Video no disponible por ahora.");
  }
  const contentLength = await getRemoteContentLength(videoUrl);
  if (contentLength && contentLength > MAX_VIDEO_BYTES) {
    logger.warn("video.too_large", { bytes: contentLength, url: videoUrl });
    return sendText(
      to,
      "El video es demasiado pesado para enviarlo por WhatsApp. Intentaremos enviarlo en otra ocasión."
    );
  }
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "video",
    video: {
      link: videoUrl,
      caption: caption || undefined,
    },
  };
  const result = await sendWhatsAppMessage(payload, options);
  await recordOutgoingMessage(
    to,
    "video",
    caption || null,
    {
      payload,
      response: result.response,
      error: result.error,
      meta: options.meta,
    },
    config.phoneNumberId
  );
  return result;
}

async function sendTemplate(to, name, language, components = [], options = {}) {
  const config = getWhatsAppConfig(options);
  const resolvedComponents = await ensureTemplateComponents(
    name,
    language,
    components
  );
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: language },
      components: resolvedComponents,
    },
  };
  const result = await sendWhatsAppMessage(payload, options);
  await recordOutgoingMessage(
    to,
    "template",
    name,
    {
      payload,
      response: result.response,
      error: result.error,
      meta: options.meta,
    },
    config.phoneNumberId
  );
  return result;
}

function parseInteractiveSelection(message) {
  if (message.type !== "interactive") {
    return null;
  }

  const interactive = message.interactive || {};
  if (interactive.type === "button_reply") {
    return {
      id: interactive.button_reply?.id,
      title: interactive.button_reply?.title,
    };
  }
  if (interactive.type === "list_reply") {
    return {
      id: interactive.list_reply?.id,
      title: interactive.list_reply?.title,
    };
  }
  return null;
}

module.exports = {
  sendText,
  sendButtons,
  sendList,
  sendLocation,
  sendImage,
  sendVideo,
  sendTemplate,
  parseInteractiveSelection,
  sendInteractiveList: sendList,
};
