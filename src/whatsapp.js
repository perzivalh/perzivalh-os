const axios = require("axios");

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
    console.error("WhatsApp config missing");
    return;
  }

  try {
    await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    const status = error.response?.status;
    const data = error.response?.data;
    if (status || data) {
      console.error("WhatsApp API error", status, data);
      return;
    }
    console.error("WhatsApp API error", error.message || error);
  }
}

async function sendText(to, text) {
  return sendWhatsAppMessage({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  });
}

async function sendButtons(to, text, buttons) {
  return sendWhatsAppMessage({
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
  });
}

async function sendList(to, header, body, footer, buttonText, sections) {
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

  return sendWhatsAppMessage({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive,
  });
}

async function sendLocation(to, latitude, longitude, name, address) {
  if (
    latitude === undefined ||
    longitude === undefined ||
    latitude === null ||
    longitude === null
  ) {
    return sendText(to, "Ubicacion no disponible por ahora.");
  }

  return sendWhatsAppMessage({
    messaging_product: "whatsapp",
    to,
    type: "location",
    location: {
      latitude: Number(latitude),
      longitude: Number(longitude),
      name,
      address,
    },
  });
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
  parseInteractiveSelection,
};
