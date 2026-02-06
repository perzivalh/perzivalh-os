/**
 * Rutas del webhook de WhatsApp
 */
const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const { VERIFY_TOKEN, ADMIN_PHONE_E164, WHATSAPP_APP_SECRET } = require("../config");
const prisma = require("../db");
const logger = require("../lib/logger");
const { redactObject } = require("../lib/sanitize");
const { normalizeText, digitsOnly, toPhoneE164 } = require("../lib/normalize");
const { parseInteractiveSelection, sendText } = require("../whatsapp");
const { handleIncomingText, handleInteractive } = require("../flows");
const { executeDynamicFlow, executeDynamicInteractive } = require("../flows/flowExecutor");
const sessionStore = require("../sessionStore");
const { getTenantContext } = require("../tenancy/tenantContext");
const {
    resolveTenantContextByPhoneNumberId,
    resolveChannelByPhoneNumberId,
} = require("../tenancy/tenantResolver");
const {
    upsertConversation,
    createMessage,
    setConversationStatus,
    addTagToConversation,
    removeTagFromConversation,
} = require("../services/conversations");
const { getActiveTenantFlow } = require("../services/tenantBots");
const { setLastWebhook } = require("./debug");

// Template and Campaign webhook handlers
let templateService = null;
let campaignJobQueue = null;
try {
    templateService = require("../services/templateService");
    campaignJobQueue = require("../services/campaignJobQueue");
} catch (e) {
    logger.warn("Template/Campaign services not loaded", { error: e.message });
}

// Rate limiting
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 30 * 1000;
const rateLimits = new Map();

// Settings cache
const settingsCache = new Map();
const SETTINGS_CACHE_MS = 10 * 1000;

async function getSettingsCached() {
    const tenantId = getTenantContext().tenantId;
    if (!tenantId) {
        throw new Error("tenant_context_missing");
    }
    const key = tenantId;
    const now = Date.now();
    const cached = settingsCache.get(key);
    if (cached && now - cached.at < SETTINGS_CACHE_MS) {
        return cached.value;
    }
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const value = settings || { bot_enabled: true, auto_reply_enabled: true };
    settingsCache.set(key, { value, at: now });
    return value;
}

function isEchoMessage(message, value) {
    const display = value?.metadata?.display_phone_number;
    if (!display) return false;
    const fromDigits = digitsOnly(message?.from);
    const displayDigits = digitsOnly(display);
    return fromDigits && displayDigits && fromDigits === displayDigits;
}

function checkRateLimit(waId) {
    if (!waId) return false;
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

function verifyWebhookSignature(req, appSecret) {
    const secret = appSecret || WHATSAPP_APP_SECRET;
    if (!secret) return true;
    const signature = req.headers["x-hub-signature-256"];
    if (!signature || !req.rawBody) return false;
    const expected =
        "sha256=" +
        crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
    if (signature.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
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
  if (message.type === "button") {
    return message.button?.text || message.button?.payload || "";
  }
  if (message.type === "interactive") {
    const selection = parseInteractiveSelection(message);
    if (!selection) return "";
    return [selection.id, selection.title].filter(Boolean).join(" | ");
  }
  return "";
}

function mapMessageType(type) {
    if (type === "button") {
        return "interactive";
    }
    const allowed = new Set([
        "text",
        "interactive",
        "image",
        "location",
        "template",
        "video",
    ]);
    return allowed.has(type) ? type : "unknown";
}

function isHandoffRequest(normalized, rawText) {
    if (!normalized && !rawText) return false;
    const text = normalized || normalizeText(rawText);
    if (text === "5") return true;
    return text.includes("asesor") || text.includes("recepcion") || text.includes("humano");
}

function isMenuRequest(normalized) {
    return normalized === "menu" || normalized === "0";
}

function isAdminPhone(waId) {
    if (!ADMIN_PHONE_E164) return false;
    return digitsOnly(waId) === digitsOnly(ADMIN_PHONE_E164);
}

// GET /webhook - Verificación de WhatsApp
router.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
});

// POST /webhook - Mensajes entrantes
router.post("/webhook", async (req, res) => {
    const timestamp = new Date().toISOString();
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const messages = value?.messages;
    const phoneNumberId = value?.metadata?.phone_number_id;
    const channelConfig = await resolveChannelByPhoneNumberId(phoneNumberId);

    if (!verifyWebhookSignature(req, channelConfig?.app_secret || null)) {
        logger.warn("webhook.signature_invalid", { timestamp });
        return res.sendStatus(403);
    }

    logger.info("webhook.hit", { timestamp });
    if (req.body && Object.keys(req.body).length > 0) {
        logger.info("webhook.payload", redactObject(req.body));
    }

    setLastWebhook({
        receivedAt: timestamp,
        body: req.body,
    });

    res.status(200).send("EVENT_RECEIVED");

    // Handle template status updates (webhooks from Meta about template approval/rejection)
    const field = req.body?.entry?.[0]?.changes?.[0]?.field;
    if (field === "message_template_status_update" && templateService) {
        const templateEvent = value;
        setImmediate(async () => {
            try {
                await templateService.handleTemplateStatusUpdate(templateEvent);
                logger.info("Template status webhook processed", { event: templateEvent.event });
            } catch (error) {
                logger.error("Template status webhook error", { error: error.message });
            }
        });
        return;
    }

    // Handle template quality updates
    if (field === "message_template_quality_update" && templateService) {
        const qualityEvent = value;
        setImmediate(async () => {
            try {
                await templateService.handleTemplateQualityUpdate(qualityEvent);
                logger.info("Template quality webhook processed");
            } catch (error) {
                logger.error("Template quality webhook error", { error: error.message });
            }
        });
        return;
    }

    // Handle message status updates (sent, delivered, read, failed)
    const statuses = value?.statuses;
    if (Array.isArray(statuses) && statuses.length > 0 && campaignJobQueue) {
        setImmediate(async () => {
            const statusTenantContext = await resolveTenantContextByPhoneNumberId(phoneNumberId);
            if (!statusTenantContext) {
                logger.warn("tenant.not_resolved", { phone_number_id: phoneNumberId });
                return;
            }

            prisma.runWithPrisma(
                statusTenantContext.prisma,
                () => {
                    void (async () => {
                        for (const statusUpdate of statuses) {
                            try {
                                await campaignJobQueue.handleMessageStatusUpdate(
                                    statusUpdate.id,
                                    statusUpdate.status,
                                    statusUpdate.timestamp
                                );
                            } catch (error) {
                                logger.error("Message status update error", {
                                    wamid: statusUpdate.id,
                                    error: error.message,
                                });
                            }
                        }
                    })();
                },
                { tenantId: statusTenantContext.tenantId, channel: statusTenantContext.channel }
            );
        });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
        return;
    }

    const tenantContext = await resolveTenantContextByPhoneNumberId(phoneNumberId);
    if (!tenantContext) {
        logger.warn("tenant.not_resolved", { phone_number_id: phoneNumberId });
        return;
    }

    prisma.runWithPrisma(
        tenantContext.prisma,
        () => {
            setImmediate(() => {
                void (async () => {
                    const contactName = extractContactName(value);
                    for (const message of messages) {
                        if (!message) continue;
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
                                phoneNumberId: phoneNumberId,
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

                        if (conversation.status === "closed") {
                            await setConversationStatus({
                                conversationId: conversation.id,
                                status: "open",
                                userId: null,
                            });
                        }

                        const settings = await getSettingsCached();
                        if (settings && (!settings.bot_enabled || !settings.auto_reply_enabled)) {
                            continue;
                        }

                        if (conversation.status === "pending" || conversation.status === "assigned") {
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

                                const activeFlow = await getActiveTenantFlow(tenantContext.tenantId);
                                if (!activeFlow) {
                                    logger.info("bot.no_active_flow", { tenant_id: tenantContext.tenantId });
                                    continue;
                                }

                                if (activeFlow.flow.useLegacyHandler) {
                                    void handleIncomingText(waId, "menu");
                                } else {
                                    void executeDynamicFlow(waId, "menu", activeFlow);
                                }
                                continue;
                            }
                            if (isMenuRequest(normalized)) {
                                await sendText(
                                    waId,
                                    "🧑‍💼 Estás en atención con recepción. Si quieres volver al bot, escribe: BOT"
                                );
                                continue;
                            }
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
                            // Check if tenant has an active flow
                            const activeFlow = await getActiveTenantFlow(tenantContext.tenantId);
                            if (!activeFlow) {
                                logger.info("bot.no_active_flow", { tenant_id: tenantContext.tenantId });
                                continue; // No flow active, don't respond
                            }

                            // If flow uses legacy handler (flows.js), use the old logic
                            if (activeFlow.flow.useLegacyHandler) {
                                void handleIncomingText(waId, incomingText);
                            } else {
                                // Ejecutar flow dinámico
                                void executeDynamicFlow(waId, incomingText, activeFlow);
                            }
                            continue;
                        }

                        if (message.type === "interactive" || message.type === "button") {
                            const selection = parseInteractiveSelection(message);
                            const selectionText = normalizeText(selection?.title || selection?.id || "");
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

                            // Check if tenant has an active flow for interactive
                            const activeFlow = await getActiveTenantFlow(tenantContext.tenantId);
                            if (!activeFlow) {
                                logger.info("bot.no_active_flow", { tenant_id: tenantContext.tenantId });
                                continue;
                            }


                            if (activeFlow.flow.useLegacyHandler) {
                                void handleInteractive(waId, selection?.id);
                            } else {
                                void executeDynamicInteractive(waId, selection?.id, activeFlow);
                            }
                        }
                    }
                })();
            });
        },
        { tenantId: tenantContext.tenantId, channel: tenantContext.channel }
    );
});

module.exports = router;
