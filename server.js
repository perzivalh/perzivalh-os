require("dotenv").config();

const http = require("http");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { Server } = require("socket.io");

const { parseInteractiveSelection, sendText } = require("./src/whatsapp");
const { handleIncomingText, handleInteractive } = require("./src/flows");
const sessionStore = require("./src/sessionStore");
const prisma = require("./src/db");
const logger = require("./src/lib/logger");
const { redactObject } = require("./src/lib/sanitize");
const { normalizeText, digitsOnly, toPhoneE164 } = require("./src/lib/normalize");
const { signUser, verifyToken } = require("./src/lib/auth");
const { requireAuth, requireRole } = require("./src/middleware/auth");
const { panelLimiter, authLimiter } = require("./src/middleware/rateLimit");
const { setSocketServer } = require("./src/realtime");
const {
  upsertConversation,
  createMessage,
  setConversationStatus,
  assignConversation,
  addTagToConversation,
  removeTagFromConversation,
  ensureTagByName,
  getConversationById,
  formatConversation,
  CONVERSATION_SELECT,
} = require("./src/services/conversations");
const { hasOdooConfig, getSessionInfo } = require("./src/odoo");

const { VERIFY_TOKEN, ADMIN_PHONE_E164 } = process.env;
const PORT = process.env.PORT || 3000;
const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || "";
const ALLOWED_STATUS = new Set(["open", "pending", "closed"]);

const app = express();
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  })
);
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    credentials: true,
  },
});

io.use((socket, next) => {
  const token =
    socket.handshake.auth?.token ||
    (socket.handshake.headers.authorization || "").split(" ")[1];
  if (!token) {
    return next(new Error("unauthorized"));
  }
  try {
    const payload = verifyToken(token);
    socket.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
    return next();
  } catch (error) {
    return next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  logger.info("socket.connected", { userId: socket.user.id });
});

setSocketServer(io);

async function ensureSettings() {
  try {
    await prisma.settings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });
  } catch (error) {
    logger.error("settings.init_failed", { message: error.message || error });
  }
}

ensureSettings();

if (!hasOdooConfig()) {
  logger.warn("odoo.config_missing", {
    message: "Set ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASS",
  });
} else {
  const sessionInfo = getSessionInfo();
  if (sessionInfo?.uid) {
    logger.info("odoo.session_ready", sessionInfo);
  }
}

let lastWebhook = null;

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 30 * 1000;
const rateLimits = new Map();

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
  logger.info("wa.message_in", {
    wa_id: message.from,
    type: message.type,
    payload,
    timestamp,
  });
}

function verifyWebhookSignature(req) {
  if (!WHATSAPP_APP_SECRET) {
    return true;
  }
  const signature = req.headers["x-hub-signature-256"];
  if (!signature || !req.rawBody) {
    return false;
  }
  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", WHATSAPP_APP_SECRET)
      .update(req.rawBody)
      .digest("hex");
  if (signature.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

function extractContactName(value) {
  const contact = value?.contacts?.[0];
  return (
    contact?.profile?.name ||
    contact?.name?.formatted_name ||
    contact?.wa_id ||
    null
  );
}

function extractIncomingText(message) {
  if (message.type === "text") {
    return message.text?.body || "";
  }
  if (message.type === "interactive") {
    const selection = parseInteractiveSelection(message);
    if (!selection) {
      return "";
    }
    return [selection.id, selection.title].filter(Boolean).join(" | ");
  }
  return "";
}

function mapMessageType(type) {
  const allowed = new Set([
    "text",
    "interactive",
    "image",
    "location",
    "template",
  ]);
  return allowed.has(type) ? type : "unknown";
}

function isHandoffRequest(normalized, rawText) {
  if (!normalized && !rawText) {
    return false;
  }
  const text = normalized || normalizeText(rawText);
  return (
    text.includes("asesor") ||
    text.includes("recepcion") ||
    text.includes("humano")
  );
}

function isMenuRequest(normalized) {
  return normalized === "menu" || normalized === "0";
}

function isAdminPhone(waId) {
  if (!ADMIN_PHONE_E164) {
    return false;
  }
  return digitsOnly(waId) === digitsOnly(ADMIN_PHONE_E164);
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
  if (!verifyWebhookSignature(req)) {
    logger.warn("webhook.signature_invalid", { timestamp });
    return res.sendStatus(403);
  }
  logger.info("webhook.hit", { timestamp });
  if (req.body && Object.keys(req.body).length > 0) {
    logger.info("webhook.payload", redactObject(req.body));
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
    void (async () => {
      const contactName = extractContactName(value);
      for (const message of messages) {
        if (!message) {
          continue;
        }
        if (isEchoMessage(message, value)) {
          logger.info("wa.echo_ignored", { wa_id: message.from });
          continue;
        }

        const waId = message.from;
        if (checkRateLimit(waId)) {
          logger.warn("wa.rate_limit", { wa_id: waId });
          continue;
        }

        const incomingText = extractIncomingText(message);
        logIncoming(message, incomingText);

        const createdAt = message.timestamp
          ? new Date(Number(message.timestamp) * 1000)
          : new Date();

        let conversation = null;
        try {
          conversation = await upsertConversation({
            waId,
            phoneE164: toPhoneE164(waId),
            displayName: contactName,
            lastMessageAt: createdAt,
          });
        } catch (error) {
          logger.error("conversation.upsert_failed", {
            message: error.message || error,
          });
          continue;
        }

        const messageType = mapMessageType(message.type);
        await createMessage({
          conversationId: conversation.id,
          direction: "in",
          type: messageType,
          text: incomingText || null,
          rawJson: {
            message,
            metadata: value?.metadata,
            contacts: value?.contacts,
          },
        });

        const normalized = normalizeText(incomingText);

        if (isAdminPhone(waId)) {
          if (normalized === "bot") {
            await setConversationStatus({
              conversationId: conversation.id,
              status: "open",
              userId: null,
            });
            await removeTagFromConversation({
              conversationId: conversation.id,
              tagName: "pendiente_atencion",
            });
            continue;
          }
          if (normalized === "cerrar") {
            await setConversationStatus({
              conversationId: conversation.id,
              status: "closed",
              userId: null,
            });
            continue;
          }
        }

        if (conversation.status === "pending") {
          if (isMenuRequest(normalized)) {
            await sendText(
              waId,
              "🧑‍💼 Estás en atención con recepción. Si quieres volver al bot, escribe: BOT"
            );
          }
          continue;
        }

        if (conversation.status === "closed") {
          await sendText(
            waId,
            "Conversa cerrada, escriba MENU para reabrir"
          );
          continue;
        }

        if (isHandoffRequest(normalized, incomingText)) {
          await setConversationStatus({
            conversationId: conversation.id,
            status: "pending",
            userId: null,
          });
          await addTagToConversation({
            conversationId: conversation.id,
            tagName: "pendiente_atencion",
          });
          await sendText(
            waId,
            "🧑‍💼 Te conecto con recepción. En breve te responderemos."
          );
          continue;
        }

        if (message.type === "text") {
          void handleIncomingText(waId, incomingText);
          continue;
        }

        if (message.type === "interactive") {
          const selection = parseInteractiveSelection(message);
          const selectionText = normalizeText(
            selection?.title || selection?.id || ""
          );
          if (isHandoffRequest(selectionText)) {
            await setConversationStatus({
              conversationId: conversation.id,
              status: "pending",
              userId: null,
            });
            await addTagToConversation({
              conversationId: conversation.id,
              tagName: "pendiente_atencion",
            });
            await sendText(
              waId,
              "🧑‍💼 Te conecto con recepción. En breve te responderemos."
            );
            continue;
          }
          void handleInteractive(waId, selection?.id);
        }
      }
    })();
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

app.post("/api/auth/login", authLimiter, async (req, res) => {
  const email = (req.body?.email || "").toLowerCase().trim();
  const password = req.body?.password || "";

  if (!email || !password) {
    return res.status(400).json({ error: "missing_credentials" });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.is_active) {
    return res.status(401).json({ error: "invalid_credentials" });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: "invalid_credentials" });
  }

  const token = signUser(user);
  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});

app.use("/api", panelLimiter);

app.get("/api/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

app.get("/api/users", requireAuth, async (req, res) => {
  const users = await prisma.user.findMany({
    where: { is_active: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
  return res.json({ users });
});

app.get("/api/tags", requireAuth, async (req, res) => {
  const tags = await prisma.tag.findMany({
    select: { id: true, name: true, color: true },
    orderBy: { name: "asc" },
  });
  return res.json({ tags });
});

app.get("/api/conversations", requireAuth, async (req, res) => {
  const status = req.query.status;
  const assignedUser = req.query.assigned_user_id;
  const tag = req.query.tag;
  const search = (req.query.search || "").trim();
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  const where = {};
  if (status) {
    where.status = status;
  }
  if (assignedUser) {
    if (assignedUser === "unassigned") {
      where.assigned_user_id = null;
    } else {
      where.assigned_user_id = assignedUser;
    }
  }
  if (tag) {
    where.tags = {
      some: {
        tag: {
          name: tag,
        },
      },
    };
  }
  if (search) {
    where.OR = [
      { phone_e164: { contains: search } },
      { wa_id: { contains: search } },
      { display_name: { contains: search, mode: "insensitive" } },
    ];
  }

  const conversations = await prisma.conversation.findMany({
    where,
    select: CONVERSATION_SELECT,
    orderBy: [{ last_message_at: "desc" }, { created_at: "desc" }],
    take: limit,
  });

  return res.json({
    conversations: conversations.map((entry) => formatConversation(entry)),
  });
});

app.get("/api/conversations/:id", requireAuth, async (req, res) => {
  const conversationId = req.params.id;
  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    return res.status(404).json({ error: "not_found" });
  }

  const messages = await prisma.message.findMany({
    where: { conversation_id: conversationId },
    orderBy: { created_at: "asc" },
    take: 500,
  });

  return res.json({ conversation, messages });
});

app.post("/api/conversations/:id/assign", requireAuth, async (req, res) => {
  try {
    const conversation = await assignConversation({
      conversationId: req.params.id,
      userId: req.user.id,
    });
    return res.json({ conversation });
  } catch (error) {
    return res.status(404).json({ error: "not_found" });
  }
});

app.post(
  "/api/conversations/:id/status",
  requireAuth,
  requireRole(["admin", "recepcion"]),
  async (req, res) => {
    const status = req.body?.status;
    if (!status || !ALLOWED_STATUS.has(status)) {
      return res.status(400).json({ error: "invalid_status" });
    }
    try {
      const conversation = await setConversationStatus({
        conversationId: req.params.id,
        status,
        userId: req.user.id,
      });
      return res.json({ conversation });
    } catch (error) {
      return res.status(404).json({ error: "not_found" });
    }
  }
);

app.post("/api/conversations/:id/tags", requireAuth, async (req, res) => {
  const adds = Array.isArray(req.body?.add) ? req.body.add : [];
  const removes = Array.isArray(req.body?.remove) ? req.body.remove : [];
  let conversation = null;

  try {
    for (const name of adds) {
      conversation = await addTagToConversation({
        conversationId: req.params.id,
        tagName: name,
      });
    }
    for (const name of removes) {
      conversation = await removeTagFromConversation({
        conversationId: req.params.id,
        tagName: name,
      });
    }
  } catch (error) {
    return res.status(400).json({ error: "tag_update_failed" });
  }

  return res.json({ conversation });
});

app.post("/api/conversations/:id/messages", requireAuth, async (req, res) => {
  const text = (req.body?.text || "").trim();
  const type = req.body?.type || "text";
  if (!text) {
    return res.status(400).json({ error: "missing_text" });
  }

  const conversation = await getConversationById(req.params.id);
  if (!conversation) {
    return res.status(404).json({ error: "not_found" });
  }

  if (type === "note") {
    const result = await createMessage({
      conversationId: conversation.id,
      direction: "out",
      type: "note",
      text,
      rawJson: { note: true, by_user_id: req.user.id },
    });
    return res.json({ message: result.message });
  }

  await sendText(conversation.wa_id, text, {
    meta: { source: "panel", by_user_id: req.user.id },
  });
  return res.json({ ok: true });
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.type === "entity.parse.failed") {
    const timestamp = new Date().toISOString();
    logger.error("webhook.parse_error", {
      timestamp,
      message: err.message,
      raw: req.rawBody || "",
    });
    return res.status(400).send("INVALID_JSON");
  }
  return next(err);
});

server.listen(PORT, () => {
  logger.info("server.listen", { port: PORT });
});
