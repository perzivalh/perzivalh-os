const axios = require("axios");
const { upsertConversation, createMessage } = require("./services/conversations");
const { toPhoneE164 } = require("./lib/normalize");
const logger = require("./lib/logger");

const { WHATSAPP_TOKEN, PHONE_NUMBER_ID } = process.env;

function getWhatsAppUrl() {
  if (!PHONE_NUMBER_ID) {
    return null;
  }
  return `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;
}

async function sendWhatsAppMessage(payload) {
  const url = getWhatsAppUrl();
  if (!WHATSAPP_TOKEN || !url) {
    logger.error("WhatsApp config missing");
    return {
      ok: false,
      error: { message: "config_missing" },
    };
  }

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
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

async function recordOutgoingMessage(to, type, text, raw) {
  try {
    const conversation = await upsertConversation({
      waId: to,
      phoneE164: toPhoneE164(to),
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
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  };
  const result = await sendWhatsAppMessage(payload);
  await recordOutgoingMessage(to, "text", text, {
    payload,
    response: result.response,
    error: result.error,
    meta: options.meta,
  });
  return result;
}

async function sendButtons(to, text, buttons, options = {}) {
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
  const result = await sendWhatsAppMessage(payload);
  await recordOutgoingMessage(to, "interactive", text, {
    payload,
    response: result.response,
    error: result.error,
    meta: options.meta,
  });
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
  const result = await sendWhatsAppMessage(payload);
  await recordOutgoingMessage(to, "interactive", body, {
    payload,
    response: result.response,
    error: result.error,
    meta: options.meta,
  });
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
  const result = await sendWhatsAppMessage(payload);
  await recordOutgoingMessage(to, "location", null, {
    payload,
    response: result.response,
    error: result.error,
    meta: options.meta,
  });
  return result;
}

async function sendImage(to, imageUrl, caption = null, options = {}) {
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
  const result = await sendWhatsAppMessage(payload);
  await recordOutgoingMessage(to, "image", caption || null, {
    payload,
    response: result.response,
    error: result.error,
    meta: options.meta,
  });
  return result;
}

async function sendTemplate(to, name, language, components = [], options = {}) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: language },
      components,
    },
  };
  const result = await sendWhatsAppMessage(payload);
  await recordOutgoingMessage(to, "template", name, {
    payload,
    response: result.response,
    error: result.error,
    meta: options.meta,
  });
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
  sendTemplate,
  parseInteractiveSelection,
  sendInteractiveList: sendList,
};
