require("dotenv").config();

const express = require("express");
const { parseInteractiveSelection } = require("./src/whatsapp");
const { handleIncomingText, handleInteractive } = require("./src/flows");
const sessionStore = require("./src/sessionStore");
const { hasOdooConfig, getSessionInfo } = require("./src/odoo");

const { VERIFY_TOKEN } = process.env;
const PORT = process.env.PORT || 3000;

const app = express();
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);

let lastWebhook = null;

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 30 * 1000;
const rateLimits = new Map();

function digitsOnly(value) {
  return (value || "").toString().replace(/\D+/g, "");
}

function isEchoMessage(message, value) {
  const display = value?.metadata?.display_phone_number;
  if (!display) {
    return false;
  }
  const fromDigits = digitsOnly(message?.from);
  const displayDigits = digitsOnly(display);
  return fromDigits && displayDigits && fromDigits === displayDigits;
}

function checkRateLimit(waId) {
  if (!waId) {
    return false;
  }
  const now = Date.now();
  const entry = rateLimits.get(waId) || {
    count: 0,
    resetAt: now + RATE_LIMIT_WINDOW_MS,
  };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  entry.count += 1;
  rateLimits.set(waId, entry);
  return entry.count > RATE_LIMIT_MAX;
}

function logIncoming(message, payload) {
  const timestamp = message.timestamp
    ? new Date(Number(message.timestamp) * 1000).toISOString()
    : new Date().toISOString();
  console.log(
    `[WA] ${timestamp} wa_id=${message.from} type=${message.type} payload="${payload}"`
  );
}

if (!hasOdooConfig()) {
  console.warn("Odoo config missing. Set ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASS.");
} else {
  const sessionInfo = getSessionInfo();
  if (sessionInfo?.uid) {
    console.log("Odoo session ready", sessionInfo);
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
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(JSON.stringify(req.body, null, 2));
  }

  lastWebhook = {
    receivedAt: timestamp,
    body: req.body,
  };

  res.status(200).send("EVENT_RECEIVED");

  const value = req.body?.entry?.[0]?.changes?.[0]?.value;
  const messages = value?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return;
  }

  setImmediate(() => {
    for (const message of messages) {
      if (!message) {
        continue;
      }
      if (message.type !== "text" && message.type !== "interactive") {
        continue;
      }
      if (isEchoMessage(message, value)) {
        console.log(`[WA] echo ignored wa_id=${message.from}`);
        continue;
      }

      const waId = message.from;
      if (checkRateLimit(waId)) {
        console.warn(`[RATE] limit hit wa_id=${waId}`);
        continue;
      }

      if (message.type === "text") {
        const text = message.text?.body || "";
        logIncoming(message, text);
        void handleIncomingText(waId, text);
        continue;
      }

      const selection = parseInteractiveSelection(message);
      logIncoming(
        message,
        selection?.id ? `${selection.id} | ${selection.title || ""}` : "interactive"
      );
      void handleInteractive(waId, selection?.id);
    }
  });
});

app.get("/debug/last-webhook", (req, res) => {
  return res.json(lastWebhook || { receivedAt: null, body: null });
});

app.get("/debug/session/:wa", async (req, res) => {
  const waId = req.params.wa;
  const session = await sessionStore.getSession(waId);
  return res.json({ wa_id: waId, session });
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
