require("dotenv").config();

const express = require("express");
const axios = require("axios");

const app = express();
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);

const { WHATSAPP_TOKEN, PHONE_NUMBER_ID, VERIFY_TOKEN } = process.env;
const PORT = process.env.PORT || 3000;

async function sendText(to, text) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.error("Missing WHATSAPP_TOKEN or PHONE_NUMBER_ID");
    return;
  }

  const url = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

  try {
    console.log("Sending to:", to);
    await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
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

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`WEBHOOK HIT ${timestamp}`);
  console.log(req.rawBody || "");
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(JSON.stringify(req.body, null, 2));
  } else {
    console.log("Parsed body: <empty>");
  }

  res.status(200).send("EVENT_RECEIVED");

  const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) {
    return;
  }

  if (message.type === "text" && message.text?.body) {
    void sendText(message.from, "✅ Bot Podopie activo");
  }
});

app.get("/health", (req, res) => {
  res.send("ok");
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.type === "entity.parse.failed") {
    const timestamp = new Date().toISOString();
    console.error(`WEBHOOK PARSE ERROR ${timestamp}`, err.message);
    console.error(req.rawBody || "");
    return res.status(400).send("INVALID_JSON");
  }

  return next(err);
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
