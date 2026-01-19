require("dotenv").config();

const http = require("http");
const crypto = require("crypto");
const axios = require("axios");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { Server } = require("socket.io");

const { parseInteractiveSelection, sendText, sendTemplate } = require("./src/whatsapp");
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
  logAudit,
} = require("./src/services/conversations");
const { hasOdooConfig, getSessionInfo } = require("./src/services/odooClient");

const { VERIFY_TOKEN, ADMIN_PHONE_E164, WHATSAPP_BUSINESS_ACCOUNT_ID } = process.env;
const PORT = process.env.PORT || 3000;
const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "http://localhost:5173";
function normalizeOrigin(value) {
  if (!value) {
    return "";
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

const FRONTEND_ORIGINS = FRONTEND_ORIGIN.split(",")
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || "";
const ALLOWED_STATUS = new Set(["open", "pending", "closed"]);
const CAMPAIGN_BATCH_SIZE = Number(process.env.CAMPAIGN_BATCH_SIZE || 8);
const CAMPAIGN_INTERVAL_MS = Number(process.env.CAMPAIGN_INTERVAL_MS || 1500);
const ROLE_OPTIONS = ["admin", "recepcion", "caja", "marketing", "doctor"];
const DEFAULT_ROLE_PERMISSIONS = {
  admin: {
    modules: {
      chat: { read: true, write: true },
      dashboard: { read: true, write: true },
      campaigns: { read: true, write: true },
      settings: { read: true, write: true },
    },
    settings: {
      general: { read: true, write: true },
      users: { read: true, write: true },
      bot: { read: true, write: true },
      templates: { read: true, write: true },
      audit: { read: true, write: true },
      odoo: { read: true, write: true },
    },
  },
  recepcion: {
    modules: {
      chat: { read: true, write: true },
      dashboard: { read: true, write: false },
      campaigns: { read: false, write: false },
      settings: { read: false, write: false },
    },
    settings: {
      general: { read: false, write: false },
      users: { read: false, write: false },
      bot: { read: false, write: false },
      templates: { read: false, write: false },
      audit: { read: false, write: false },
      odoo: { read: false, write: false },
    },
  },
  caja: {
    modules: {
      chat: { read: true, write: false },
      dashboard: { read: true, write: false },
      campaigns: { read: false, write: false },
      settings: { read: false, write: false },
    },
    settings: {
      general: { read: false, write: false },
      users: { read: false, write: false },
      bot: { read: false, write: false },
      templates: { read: false, write: false },
      audit: { read: false, write: false },
      odoo: { read: false, write: false },
    },
  },
  marketing: {
    modules: {
      chat: { read: false, write: false },
      dashboard: { read: true, write: false },
      campaigns: { read: true, write: true },
      settings: { read: true, write: false },
    },
    settings: {
      general: { read: true, write: false },
      users: { read: false, write: false },
      bot: { read: false, write: false },
      templates: { read: true, write: true },
      audit: { read: false, write: false },
      odoo: { read: false, write: false },
    },
  },
  doctor: {
    modules: {
      chat: { read: true, write: false },
      dashboard: { read: false, write: false },
      campaigns: { read: false, write: false },
      settings: { read: false, write: false },
    },
    settings: {
      general: { read: false, write: false },
      users: { read: false, write: false },
      bot: { read: false, write: false },
      templates: { read: false, write: false },
      audit: { read: false, write: false },
      odoo: { read: false, write: false },
    },
  },
};

function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }
  const normalized = normalizeOrigin(origin);
  if (FRONTEND_ORIGINS.includes("*")) {
    return true;
  }
  return FRONTEND_ORIGINS.includes(normalized);
}

const app = express();
app.set("trust proxy", 1);
app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("cors_not_allowed"));
    },
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
    origin: FRONTEND_ORIGINS.includes("*") ? "*" : FRONTEND_ORIGINS,
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

async function ensureRolePermissions() {
  try {
    const existing = await prisma.rolePermission.findMany();
    const byRole = new Map(existing.map((entry) => [entry.role, entry]));
    const updates = [];
    ROLE_OPTIONS.forEach((role) => {
      const current = byRole.get(role);
      const defaults = DEFAULT_ROLE_PERMISSIONS[role] || {};
      if (!current) {
        updates.push(
          prisma.rolePermission.create({
            data: { role, permissions_json: defaults },
          })
        );
        return;
      }
      if (
        !current.permissions_json ||
        Object.keys(current.permissions_json || {}).length === 0
      ) {
        updates.push(
          prisma.rolePermission.update({
            where: { role },
            data: { permissions_json: defaults },
          })
        );
      }
    });
    if (updates.length) {
      await prisma.$transaction(updates);
    }
  } catch (error) {
    logger.error("role_permissions.init_failed", {
      message: error.message || error,
    });
  }
}

ensureSettings();
ensureRolePermissions();

let settingsCache = null;
let settingsCacheAt = 0;
const SETTINGS_CACHE_MS = 10 * 1000;

async function getSettingsCached() {
  const now = Date.now();
  if (settingsCache && now - settingsCacheAt < SETTINGS_CACHE_MS) {
    return settingsCache;
  }
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  settingsCache = settings || { bot_enabled: true, auto_reply_enabled: true };
  settingsCacheAt = now;
  return settingsCache;
}

if (!hasOdooConfig()) {
  logger.warn("odoo.config_missing", {
    message: "Set ODOO_BASE_URL/ODOO_URL, ODOO_DB, ODOO_USERNAME/ODOO_USER, ODOO_PASSWORD/ODOO_PASS",
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
  if (text === "5") {
    return true;
  }
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

        const settings = await getSettingsCached();
        if (settings && (!settings.bot_enabled || !settings.auto_reply_enabled)) {
          continue;
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

app.get("/api/role-permissions", requireAuth, async (req, res) => {
  const entries = await prisma.rolePermission.findMany();
  const permissions = entries.reduce((acc, entry) => {
    acc[entry.role] = entry.permissions_json || {};
    return acc;
  }, {});
  if (req.user.role !== "admin") {
    return res.json({
      permissions: {
        [req.user.role]: permissions[req.user.role] || null,
      },
    });
  }
  return res.json({ permissions });
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

function buildConversationFilter(filter) {
  const where = {};
  if (!filter || typeof filter !== "object") {
    return where;
  }
  if (filter.status) {
    where.status = filter.status;
  }
  if (filter.assigned_user_id) {
    if (filter.assigned_user_id === "unassigned") {
      where.assigned_user_id = null;
    } else {
      where.assigned_user_id = filter.assigned_user_id;
    }
  }
  if (filter.tag) {
    where.tags = {
      some: {
        tag: {
          name: filter.tag,
        },
      },
    };
  }
  if (Array.isArray(filter.tags) && filter.tags.length) {
    where.tags = {
      some: {
        tag: {
          name: { in: filter.tags },
        },
      },
    };
  }
  if (filter.verified_only) {
    where.verified_at = { not: null };
  }
  return where;
}

function extractTemplatePreview(template) {
  const components = template.components || [];
  const body = components.find((item) => item.type === "BODY");
  if (body?.text) {
    return body.text;
  }
  return template.name || "Template";
}

async function syncTemplatesFromWhatsApp() {
  if (!WHATSAPP_BUSINESS_ACCOUNT_ID) {
    throw new Error("missing_waba_id");
  }
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) {
    throw new Error("missing_whatsapp_token");
  }
  const url = `https://graph.facebook.com/v22.0/${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?limit=200`;
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const templates = response.data?.data || [];
  for (const template of templates) {
    await prisma.template.upsert({
      where: { name: template.name },
      update: {
        language: template.language,
        category: template.category || null,
        body_preview: extractTemplatePreview(template),
        variables_schema: template.components || null,
        is_active: template.status === "APPROVED",
      },
      create: {
        name: template.name,
        language: template.language,
        category: template.category || null,
        body_preview: extractTemplatePreview(template),
        variables_schema: template.components || null,
        is_active: template.status === "APPROVED",
      },
    });
  }
  return templates.length;
}

async function queueCampaignMessages(campaign, userId) {
  const where = buildConversationFilter(campaign.audience_filter);
  const conversations = await prisma.conversation.findMany({
    where,
    select: {
      id: true,
      wa_id: true,
      phone_e164: true,
    },
  });
  if (!conversations.length) {
    return 0;
  }

  await prisma.campaignMessage.deleteMany({
    where: { campaign_id: campaign.id },
  });

  await prisma.campaignMessage.createMany({
    data: conversations.map((conversation) => ({
      campaign_id: campaign.id,
      conversation_id: conversation.id,
      wa_id: conversation.wa_id,
      phone_e164: conversation.phone_e164,
      status: "queued",
    })),
  });

  await logAudit({
    userId,
    action: "campaign.queued",
    data: { campaign_id: campaign.id, total: conversations.length },
  });

  return conversations.length;
}

async function refreshCampaignStatus(campaignId) {
  const remaining = await prisma.campaignMessage.count({
    where: { campaign_id: campaignId, status: "queued" },
  });
  if (remaining > 0) {
    return;
  }
  const failed = await prisma.campaignMessage.count({
    where: { campaign_id: campaignId, status: "failed" },
  });
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: failed > 0 ? "failed" : "sent" },
  });
}

async function processCampaignQueue() {
  try {
    const due = await prisma.campaign.findMany({
      where: {
        status: "scheduled",
        scheduled_for: { lte: new Date() },
      },
    });
    for (const campaign of due) {
      const queued = await queueCampaignMessages(
        campaign,
        campaign.created_by_user_id
      );
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: queued > 0 ? "sending" : "failed" },
      });
    }

    const queuedMessages = await prisma.campaignMessage.findMany({
      where: {
        status: "queued",
        campaign: { status: "sending" },
      },
      include: {
        campaign: { include: { template: true } },
      },
      take: CAMPAIGN_BATCH_SIZE,
    });

    if (!queuedMessages.length) {
      return;
    }

    const processedCampaigns = new Set();
    for (const message of queuedMessages) {
      const template = message.campaign.template;
      const result = await sendTemplate(
        message.wa_id,
        template.name,
        template.language,
        []
      );
      if (result.ok) {
        await prisma.campaignMessage.update({
          where: { id: message.id },
          data: { status: "sent", sent_at: new Date(), error_json: null },
        });
      } else {
        await prisma.campaignMessage.update({
          where: { id: message.id },
          data: { status: "failed", error_json: result.error || {} },
        });
      }
      processedCampaigns.add(message.campaign_id);
    }

    for (const campaignId of processedCampaigns) {
      await refreshCampaignStatus(campaignId);
    }
  } catch (error) {
    logger.error("campaign.queue_error", {
      message: error.message || error,
      code: error.code,
    });
  }
}

setInterval(() => {
  void processCampaignQueue();
}, CAMPAIGN_INTERVAL_MS);

app.get(
  "/api/admin/users",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { created_at: "desc" },
    });
    return res.json({ users });
  }
);

app.post(
  "/api/admin/users",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const name = (req.body?.name || "").trim();
    const email = (req.body?.email || "").toLowerCase().trim();
    const role = req.body?.role || "recepcion";
    const password = req.body?.password || "";
    if (!name || !email || !password) {
      return res.status(400).json({ error: "missing_fields" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        role,
        password_hash: passwordHash,
        is_active: true,
      },
    });
    await logAudit({
      userId: req.user.id,
      action: "user.created",
      data: { user_id: user.id, email },
    });
    return res.json({ user });
  }
);

app.patch(
  "/api/admin/users/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const updates = {};
    if (req.body?.name) {
      updates.name = req.body.name.trim();
    }
    if (req.body?.role) {
      updates.role = req.body.role;
    }
    if (req.body?.is_active !== undefined) {
      updates.is_active = Boolean(req.body.is_active);
    }
    if (req.body?.password) {
      updates.password_hash = await bcrypt.hash(req.body.password, 10);
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updates,
    });
    await logAudit({
      userId: req.user.id,
      action: "user.updated",
      data: { user_id: user.id, updates: Object.keys(updates) },
    });
    return res.json({ user });
  }
);

app.patch(
  "/api/admin/role-permissions",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const permissions = req.body?.permissions;
    if (!permissions || typeof permissions !== "object") {
      return res.status(400).json({ error: "invalid_permissions" });
    }
    const updates = [];
    const savedRoles = [];
    for (const [role, payload] of Object.entries(permissions)) {
      if (!ROLE_OPTIONS.includes(role)) {
        continue;
      }
      updates.push(
        prisma.rolePermission.upsert({
          where: { role },
          update: { permissions_json: payload || {} },
          create: { role, permissions_json: payload || {} },
        })
      );
      savedRoles.push(role);
    }
    if (updates.length) {
      await prisma.$transaction(updates);
    }
    await logAudit({
      userId: req.user.id,
      action: "role_permissions.updated",
      data: { roles: savedRoles },
    });
    return res.json({ ok: true, roles: savedRoles });
  }
);

app.get(
  "/api/admin/settings",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    return res.json({ settings });
  }
);

app.patch(
  "/api/admin/settings",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const settings = await prisma.settings.update({
      where: { id: 1 },
      data: {
        bot_enabled: req.body?.bot_enabled,
        auto_reply_enabled: req.body?.auto_reply_enabled,
      },
    });
    settingsCache = settings;
    settingsCacheAt = Date.now();
    await logAudit({
      userId: req.user.id,
      action: "settings.updated",
      data: {
        bot_enabled: settings.bot_enabled,
        auto_reply_enabled: settings.auto_reply_enabled,
      },
    });
    return res.json({ settings });
  }
);

app.get(
  "/api/admin/branches",
  requireAuth,
  requireRole(["admin", "marketing"]),
  async (req, res) => {
    const branches = await prisma.branch.findMany({
      orderBy: { name: "asc" },
    });
    return res.json({ branches });
  }
);

app.post(
  "/api/admin/branches",
  requireAuth,
  requireRole(["admin", "marketing"]),
  async (req, res) => {
    const data = {
      code: (req.body?.code || "").trim(),
      name: (req.body?.name || "").trim(),
      address: (req.body?.address || "").trim(),
      lat: Number(req.body?.lat || 0),
      lng: Number(req.body?.lng || 0),
      hours_text: (req.body?.hours_text || "").trim(),
      phone: req.body?.phone || null,
      is_active: req.body?.is_active !== false,
    };
    if (!data.code || !data.name || !data.address) {
      return res.status(400).json({ error: "missing_fields" });
    }
    const branch = await prisma.branch.create({ data });
    await logAudit({
      userId: req.user.id,
      action: "branch.created",
      data: { branch_id: branch.id },
    });
    return res.json({ branch });
  }
);

app.patch(
  "/api/admin/branches/:id",
  requireAuth,
  requireRole(["admin", "marketing"]),
  async (req, res) => {
    const branch = await prisma.branch.update({
      where: { id: req.params.id },
      data: {
        code: req.body?.code,
        name: req.body?.name,
        address: req.body?.address,
        lat: req.body?.lat !== undefined ? Number(req.body.lat) : undefined,
        lng: req.body?.lng !== undefined ? Number(req.body.lng) : undefined,
        hours_text: req.body?.hours_text,
        phone: req.body?.phone,
        is_active: req.body?.is_active,
      },
    });
    await logAudit({
      userId: req.user.id,
      action: "branch.updated",
      data: { branch_id: branch.id },
    });
    return res.json({ branch });
  }
);

app.delete(
  "/api/admin/branches/:id",
  requireAuth,
  requireRole(["admin", "marketing"]),
  async (req, res) => {
    const branch = await prisma.branch.update({
      where: { id: req.params.id },
      data: { is_active: false },
    });
    await logAudit({
      userId: req.user.id,
      action: "branch.disabled",
      data: { branch_id: branch.id },
    });
    return res.json({ branch });
  }
);

app.get(
  "/api/admin/services",
  requireAuth,
  requireRole(["admin", "marketing"]),
  async (req, res) => {
    const services = await prisma.service.findMany({
      include: {
        branches: {
          include: {
            branch: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });
    return res.json({ services });
  }
);

app.post(
  "/api/admin/services",
  requireAuth,
  requireRole(["admin", "marketing"]),
  async (req, res) => {
    const data = {
      code: (req.body?.code || "").trim(),
      name: (req.body?.name || "").trim(),
      subtitle: req.body?.subtitle || null,
      description: (req.body?.description || "").trim(),
      price_bob: Number(req.body?.price_bob || 0),
      duration_min: req.body?.duration_min ? Number(req.body.duration_min) : null,
      image_url: req.body?.image_url || null,
      is_featured: Boolean(req.body?.is_featured),
      is_active: req.body?.is_active !== false,
    };
    if (!data.code || !data.name || !data.description) {
      return res.status(400).json({ error: "missing_fields" });
    }
    const service = await prisma.service.create({ data });
    await logAudit({
      userId: req.user.id,
      action: "service.created",
      data: { service_id: service.id },
    });
    return res.json({ service });
  }
);

app.patch(
  "/api/admin/services/:id",
  requireAuth,
  requireRole(["admin", "marketing"]),
  async (req, res) => {
    const service = await prisma.service.update({
      where: { id: req.params.id },
      data: {
        code: req.body?.code,
        name: req.body?.name,
        subtitle: req.body?.subtitle,
        description: req.body?.description,
        price_bob: req.body?.price_bob ? Number(req.body.price_bob) : undefined,
        duration_min:
          req.body?.duration_min !== undefined
            ? Number(req.body.duration_min)
            : undefined,
        image_url: req.body?.image_url,
        is_featured: req.body?.is_featured,
        is_active: req.body?.is_active,
      },
    });
    await logAudit({
      userId: req.user.id,
      action: "service.updated",
      data: { service_id: service.id },
    });
    return res.json({ service });
  }
);

app.delete(
  "/api/admin/services/:id",
  requireAuth,
  requireRole(["admin", "marketing"]),
  async (req, res) => {
    const service = await prisma.service.update({
      where: { id: req.params.id },
      data: { is_active: false },
    });
    await logAudit({
      userId: req.user.id,
      action: "service.disabled",
      data: { service_id: service.id },
    });
    return res.json({ service });
  }
);

app.post(
  "/api/admin/services/:id/branches",
  requireAuth,
  requireRole(["admin", "marketing"]),
  async (req, res) => {
    const branchId = req.body?.branch_id;
    const isAvailable = req.body?.is_available !== false;
    if (!branchId) {
      return res.status(400).json({ error: "missing_branch" });
    }
    const mapping = await prisma.serviceBranch.upsert({
      where: {
        service_id_branch_id: {
          service_id: req.params.id,
          branch_id: branchId,
        },
      },
      update: {
        is_available: isAvailable,
      },
      create: {
        service_id: req.params.id,
        branch_id: branchId,
        is_available: isAvailable,
      },
    });
    return res.json({ mapping });
  }
);

app.get(
  "/api/admin/templates",
  requireAuth,
  requireRole(["admin", "marketing"]),
  async (req, res) => {
    const templates = await prisma.template.findMany({
      orderBy: { name: "asc" },
    });
    return res.json({ templates });
  }
);

app.post(
  "/api/admin/templates",
  requireAuth,
  requireRole(["admin", "marketing"]),
  async (req, res) => {
    const template = await prisma.template.create({
      data: {
        name: req.body?.name,
        language: req.body?.language || "es",
        category: req.body?.category || null,
        body_preview: req.body?.body_preview || "",
        variables_schema: req.body?.variables_schema || null,
        is_active: req.body?.is_active !== false,
      },
    });
    await logAudit({
      userId: req.user.id,
      action: "template.created",
      data: { template_id: template.id },
    });
    return res.json({ template });
  }
);

app.patch(
  "/api/admin/templates/:id",
  requireAuth,
  requireRole(["admin", "marketing"]),
  async (req, res) => {
    const template = await prisma.template.update({
      where: { id: req.params.id },
      data: {
        name: req.body?.name,
        language: req.body?.language,
        category: req.body?.category,
        body_preview: req.body?.body_preview,
        variables_schema: req.body?.variables_schema,
        is_active: req.body?.is_active,
      },
    });
    await logAudit({
      userId: req.user.id,
      action: "template.updated",
      data: { template_id: template.id },
    });
    return res.json({ template });
  }
);

app.post(
  "/api/admin/templates/sync",
  requireAuth,
  requireRole(["admin", "marketing"]),
  async (req, res) => {
    try {
      const count = await syncTemplatesFromWhatsApp();
      await logAudit({
        userId: req.user.id,
        action: "template.synced",
        data: { count },
      });
      return res.json({ synced: count });
    } catch (error) {
      return res.status(400).json({ error: error.message || "sync_failed" });
    }
  }
);

app.get(
  "/api/admin/campaigns",
  requireAuth,
  requireRole(["admin", "marketing"]),
  async (req, res) => {
    const campaigns = await prisma.campaign.findMany({
      include: { template: true },
      orderBy: { created_at: "desc" },
    });
    return res.json({ campaigns });
  }
);

app.post(
  "/api/admin/campaigns",
  requireAuth,
  requireRole(["admin", "marketing"]),
  async (req, res) => {
    const name = (req.body?.name || "").trim();
    const templateId = req.body?.template_id;
    const audienceFilter = req.body?.audience_filter || {};
    const scheduledFor = req.body?.scheduled_for
      ? new Date(req.body.scheduled_for)
      : null;
    if (!name || !templateId) {
      return res.status(400).json({ error: "missing_fields" });
    }
    const campaign = await prisma.campaign.create({
      data: {
        name,
        template_id: templateId,
        audience_filter: audienceFilter,
        status: scheduledFor ? "scheduled" : "draft",
        created_by_user_id: req.user.id,
        scheduled_for: scheduledFor,
      },
    });
    await logAudit({
      userId: req.user.id,
      action: "campaign.created",
      data: { campaign_id: campaign.id },
    });
    return res.json({ campaign });
  }
);

app.post(
  "/api/admin/campaigns/:id/send",
  requireAuth,
  requireRole(["admin", "marketing"]),
  async (req, res) => {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
    });
    if (!campaign) {
      return res.status(404).json({ error: "not_found" });
    }
    const queued = await queueCampaignMessages(campaign, req.user.id);
    const status = queued > 0 ? "sending" : "failed";
    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status },
    });
    await logAudit({
      userId: req.user.id,
      action: "campaign.sending",
      data: { campaign_id: campaign.id, queued },
    });
    return res.json({ campaign: updated, queued });
  }
);

app.get(
  "/api/admin/campaigns/:id/messages",
  requireAuth,
  requireRole(["admin", "marketing"]),
  async (req, res) => {
    const messages = await prisma.campaignMessage.findMany({
      where: { campaign_id: req.params.id },
      orderBy: { sent_at: "desc" },
      take: 500,
    });
    return res.json({ messages });
  }
);

app.get(
  "/api/admin/audit",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const action = req.query.action;
    const where = action ? { action } : undefined;
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: limit,
    });
    return res.json({ logs });
  }
);

app.get("/api/dashboard/metrics", requireAuth, async (req, res) => {
  const statusCountsRaw = await prisma.conversation.groupBy({
    by: ["status"],
    _count: { status: true },
  });

  const statusCounts = statusCountsRaw.map((item) => ({
    ...item,
    _count: { status: Number(item._count.status) },
  }));

  const messageVolumeRaw = await prisma.$queryRaw`
    SELECT DATE("created_at") AS day,
      SUM(CASE WHEN direction = 'in' THEN 1 ELSE 0 END) AS in_count,
      SUM(CASE WHEN direction = 'out' THEN 1 ELSE 0 END) AS out_count
    FROM "Message"
    GROUP BY DATE("created_at")
    ORDER BY day DESC
    LIMIT 30
  `;

  const messageVolume = (messageVolumeRaw || []).map((row) => ({
    ...row,
    in_count: Number(row.in_count || 0),
    out_count: Number(row.out_count || 0),
  }));

  const topTagsRaw = await prisma.$queryRaw`
    SELECT t.name, COUNT(*)::int AS count
    FROM "ConversationTag" ct
    JOIN "Tag" t ON t.id = ct.tag_id
    GROUP BY t.name
    ORDER BY count DESC
    LIMIT 10
  `;

  const topTags = (topTagsRaw || []).map((row) => ({
    ...row,
    count: Number(row.count || 0),
  }));

  const avgFirstReplyRaw = await prisma.$queryRaw`
    WITH pending AS (
      SELECT (data_json->>'conversation_id') AS conversation_id,
             MIN(created_at) AS pending_at
      FROM "AuditLog"
      WHERE action = 'conversation.status_changed'
        AND data_json->>'to' = 'pending'
      GROUP BY data_json->>'conversation_id'
    ),
    first_reply AS (
      SELECT m.conversation_id,
             MIN(m.created_at) AS reply_at
      FROM "Message" m
      JOIN pending p ON p.conversation_id = m.conversation_id
      WHERE m.direction = 'out'
        AND (m.raw_json->'meta'->>'source') = 'panel'
        AND m.created_at >= p.pending_at
      GROUP BY m.conversation_id
    )
    SELECT AVG(EXTRACT(EPOCH FROM (f.reply_at - p.pending_at))) AS avg_seconds
    FROM pending p
    JOIN first_reply f ON f.conversation_id = p.conversation_id
  `;

  const avgFirstReplySeconds = avgFirstReplyRaw?.[0]?.avg_seconds;

  return res.json({
    status_counts: statusCounts,
    message_volume: messageVolume,
    top_tags: topTags,
    avg_first_reply_seconds:
      avgFirstReplySeconds !== null && avgFirstReplySeconds !== undefined
        ? Number(avgFirstReplySeconds)
        : null,
  });
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
