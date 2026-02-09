/**
 * Rutas de conversaciones
 */
const express = require("express");
const router = express.Router();

const { requireAuth, requireRole } = require("../middleware/auth");
const { panelLimiter } = require("../middleware/rateLimit");
const prisma = require("../db");
const { getControlClient } = require("../control/controlClient");
const { getTenantContext } = require("../tenancy/tenantContext");
const { resolveChannelByPhoneNumberId } = require("../tenancy/tenantResolver");
const { sendText } = require("../whatsapp");
const {
    getConversationById,
    formatConversation,
    CONVERSATION_SELECT,
    setConversationStatus,
    assignConversation,
    addTagToConversation,
    removeTagFromConversation,
    createMessage,
    logAudit,
} = require("../services/conversations");
const audienceAutomationService = require("../services/audienceAutomationService");

// Aplicar rate limiter a todas las rutas /api
router.use(panelLimiter);

// GET /api/me
router.get("/me", requireAuth, (req, res) => {
    return res.json({ user: req.user });
});

// GET /api/tenant
router.get("/tenant", requireAuth, async (req, res) => {
    if (!req.user?.tenant_id) {
        return res.json({ tenant: null });
    }
    if (!process.env.CONTROL_DB_URL) {
        return res.json({ tenant: null });
    }
    const control = getControlClient();
    const tenant = await control.tenant.findUnique({
        where: { id: req.user.tenant_id },
        select: { id: true, name: true, slug: true, plan: true, is_active: true },
    });
    return res.json({ tenant });
});

// GET /api/branding
router.get("/branding", requireAuth, async (req, res) => {
    if (!req.user?.tenant_id) {
        return res.json({ branding: null });
    }
    if (!process.env.CONTROL_DB_URL) {
        return res.json({ branding: null });
    }
    const control = getControlClient();
    const branding = await control.branding.findUnique({
        where: { tenant_id: req.user.tenant_id },
    });
    return res.json({ branding });
});

// GET /api/channels
router.get("/channels", requireAuth, async (req, res) => {
    if (!req.user?.tenant_id) {
        return res.status(403).json({ error: "missing_tenant" });
    }
    if (!process.env.CONTROL_DB_URL) {
        return res.status(500).json({ error: "control_db_missing" });
    }
    const control = getControlClient();
    const channels = await control.channel.findMany({
        where: { tenant_id: req.user.tenant_id, provider: "whatsapp" },
        orderBy: [{ is_default: "desc" }, { created_at: "asc" }],
    });
    return res.json({
        channels: channels.map((channel) => ({
            id: channel.id,
            phone_number_id: channel.phone_number_id,
            display_name: channel.display_name || null,
            waba_id: channel.waba_id || null,
            is_active: channel.is_active,
            is_default: channel.is_default,
            created_at: channel.created_at,
        })),
    });
});

// PATCH /api/channels/:id
router.patch("/channels/:id", requireAuth, async (req, res) => {
    if (!req.user?.tenant_id) {
        return res.status(403).json({ error: "missing_tenant" });
    }
    const control = getControlClient();
    const existing = await control.channel.findUnique({
        where: { id: req.params.id },
    });
    if (!existing || existing.tenant_id !== req.user.tenant_id) {
        return res.status(404).json({ error: "not_found" });
    }
    const updates = {};
    if (req.body?.display_name !== undefined) {
        const rawName = String(req.body.display_name || "").trim();
        updates.display_name = rawName || null;
    }
    if (req.body?.is_active !== undefined) {
        updates.is_active = Boolean(req.body.is_active);
    }
    if (req.body?.is_default !== undefined) {
        updates.is_default = Boolean(req.body.is_default);
    }
    if (!Object.keys(updates).length) {
        return res.status(400).json({ error: "empty_updates" });
    }
    const { clearChannelCache } = require("../tenancy/tenantResolver");
    const channel = await control.channel.update({
        where: { id: req.params.id },
        data: updates,
    });

    if (updates.is_default === true) {
        await control.channel.updateMany({
            where: {
                tenant_id: req.user.tenant_id,
                id: { not: channel.id },
            },
            data: { is_default: false },
        });
    }

    clearChannelCache(channel.phone_number_id);
    return res.json({
        channel: {
            id: channel.id,
            phone_number_id: channel.phone_number_id,
            display_name: channel.display_name || null,
            waba_id: channel.waba_id || null,
            is_active: channel.is_active,
            is_default: channel.is_default,
            created_at: channel.created_at,
        },
    });
});

// GET /api/role-permissions
router.get("/role-permissions", requireAuth, async (req, res) => {
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

// GET /api/users
router.get("/users", requireAuth, async (req, res) => {
    const users = await prisma.user.findMany({
        where: { is_active: true },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: "asc" },
    });
    return res.json({ users });
});

// GET /api/tags
router.get("/tags", requireAuth, async (req, res) => {
    const tags = await prisma.tag.findMany({
        select: { id: true, name: true, color: true },
        orderBy: { name: "asc" },
    });
    return res.json({ tags });
});

// POST /api/tags
router.post("/tags", requireAuth, requireRole(["admin", "marketing"]), async (req, res) => {
    const name = (req.body?.name || "").trim();
    const color = (req.body?.color || "").trim() || null;
    if (!name) {
        return res.status(400).json({ error: "missing_name" });
    }
    try {
        const tag = await prisma.tag.create({
            data: { name, color },
        });
        return res.json({ tag });
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(400).json({ error: "tag_exists" });
        }
        return res.status(500).json({ error: "tag_create_failed" });
    }
});

// PATCH /api/tags/:id
router.patch("/tags/:id", requireAuth, requireRole(["admin", "marketing"]), async (req, res) => {
    const updates = {};
    if (req.body?.name !== undefined) {
        const name = String(req.body.name || "").trim();
        if (!name) {
            return res.status(400).json({ error: "missing_name" });
        }
        updates.name = name;
    }
    if (req.body?.color !== undefined) {
        const color = String(req.body.color || "").trim();
        updates.color = color || null;
    }
    try {
        const tag = await prisma.tag.update({
            where: { id: req.params.id },
            data: updates,
        });
        return res.json({ tag });
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(400).json({ error: "tag_exists" });
        }
        return res.status(404).json({ error: "tag_not_found" });
    }
});

// DELETE /api/tags/:id
router.delete("/tags/:id", requireAuth, requireRole(["admin", "marketing"]), async (req, res) => {
    const tagId = req.params.id;
    try {
        await prisma.conversationTag.deleteMany({
            where: { tag_id: tagId },
        });
        await prisma.tag.delete({
            where: { id: tagId },
        });
        return res.json({ success: true });
    } catch (error) {
        return res.status(404).json({ error: "tag_not_found" });
    }
});

// GET /api/conversations
router.get("/conversations", requireAuth, async (req, res) => {
    const status = req.query.status;
    const assignedUser = req.query.assigned_user_id;
    const tag = req.query.tag;
    const phoneNumberId = req.query.phone_number_id;
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
    if (phoneNumberId) {
        where.phone_number_id = phoneNumberId;
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

    const ids = conversations.map((entry) => entry.id);
    let lastMessages = [];
    if (ids.length) {
        lastMessages = await prisma.message.findMany({
            where: { conversation_id: { in: ids } },
            select: {
                conversation_id: true,
                text: true,
                type: true,
                direction: true,
                created_at: true,
            },
            orderBy: { created_at: "desc" },
            distinct: ["conversation_id"],
        });
    }
    const lastMessageMap = new Map(
        lastMessages.map((message) => [message.conversation_id, message])
    );

    return res.json({
        conversations: conversations.map((entry) => {
            const formatted = formatConversation(entry);
            const lastMessage = lastMessageMap.get(entry.id);
            if (!lastMessage) {
                return formatted;
            }
            return {
                ...formatted,
                last_message_text: lastMessage.text,
                last_message_type: lastMessage.type,
                last_message_direction: lastMessage.direction,
                last_message_at: lastMessage.created_at || formatted.last_message_at,
            };
        }),
    });
});

// GET /api/conversations/:id
router.get("/conversations/:id", requireAuth, async (req, res) => {
    const conversationId = req.params.id;
    const conversation = await getConversationById(conversationId);
    if (!conversation) {
        return res.status(404).json({ error: "not_found" });
    }

    const limit = Math.min(Number(req.query.limit) || 0, 200);
    const before = req.query.before ? new Date(req.query.before) : null;
    const windowHoursRaw = Number(req.query.window_hours || req.query.hours || 0);
    const windowHours = Number.isFinite(windowHoursRaw) && windowHoursRaw > 0
        ? Math.min(windowHoursRaw, 168)
        : 48;
    const usePaged = limit > 0 || before;

    const messageSelect = {
        id: true,
        text: true,
        type: true,
        direction: true,
        created_at: true,
    };

    if (usePaged) {
        const take = limit > 0 ? limit : 80;
        const now = Date.now();
        const windowStart = new Date(now - windowHours * 60 * 60 * 1000);
        const baseWhere = { conversation_id: conversationId };
        let where = baseWhere;

        if (before && !Number.isNaN(before.getTime())) {
            where = {
                ...baseWhere,
                created_at: { lt: before },
            };
        } else {
            where = {
                ...baseWhere,
                created_at: { gte: windowStart },
            };
        }

        let rows = await prisma.message.findMany({
            where,
            orderBy: { created_at: "desc" },
            take: take + 1,
            select: messageSelect,
        });

        let hasMore = rows.length > take;
        if (hasMore) {
            rows = rows.slice(0, take);
        }

        if (!before && rows.length < take) {
            const oldest = rows[rows.length - 1]?.created_at || windowStart;
            const remaining = take - rows.length;
            const extra = await prisma.message.findMany({
                where: {
                    ...baseWhere,
                    created_at: { lt: oldest },
                },
                orderBy: { created_at: "desc" },
                take: remaining + 1,
                select: messageSelect,
            });
            const extraHasMore = extra.length > remaining;
            const extraRows = extraHasMore ? extra.slice(0, remaining) : extra;
            rows = rows.concat(extraRows);
            hasMore = hasMore || extraHasMore;
        }

        const messages = rows.slice().reverse();
        const nextCursor = messages.length
            ? messages[0].created_at.toISOString()
            : null;
        return res.json({
            conversation,
            messages,
            has_more: hasMore,
            next_cursor: nextCursor,
        });
    }

    const messages = await prisma.message.findMany({
        where: { conversation_id: conversationId },
        orderBy: { created_at: "asc" },
        take: 500,
        select: messageSelect,
    });

    return res.json({ conversation, messages });
});

// PATCH /api/conversations/:id/status
router.patch("/conversations/:id/status", requireAuth, async (req, res) => {
    const status = req.body?.status;
    const ALLOWED_STATUS = new Set(["open", "pending", "assigned"]);
    if (!status || !ALLOWED_STATUS.has(status)) {
        return res.status(400).json({ error: "invalid_status" });
    }
    try {
        const conversation = await setConversationStatus({
            conversationId: req.params.id,
            status,
            userId: req.user.id,
        });
        if (status === "pending") {
            await addTagToConversation({
                conversationId: req.params.id,
                tagName: "pendiente_atencion",
                userId: req.user.id,
            });
        }
        if (status === "open") {
            await removeTagFromConversation({
                conversationId: req.params.id,
                tagName: "pendiente_atencion",
                userId: req.user.id,
            });
        }
        return res.json({ conversation });
    } catch (error) {
        return res.status(404).json({ error: "not_found" });
    }
});

// PATCH /api/conversations/:id/assign
router.patch("/conversations/:id/assign", requireAuth, async (req, res) => {
    const userId = req.body?.user_id || null;
    try {
        const existing = await prisma.conversation.findUnique({
            where: { id: req.params.id },
            select: { assigned_user_id: true, status: true },
        });
        if (!existing) {
            return res.status(404).json({ error: "not_found" });
        }
        if (
            existing.assigned_user_id &&
            existing.assigned_user_id !== req.user.id &&
            req.user.role !== "admin"
        ) {
            return res.status(409).json({ error: "already_assigned" });
        }

        const conversation = await assignConversation({
            conversationId: req.params.id,
            userId: userId || req.user.id,
        });

        let nextConversation = conversation;
        nextConversation = await removeTagFromConversation({
            conversationId: req.params.id,
            tagName: "pendiente_atencion",
            userId: req.user.id,
        });
        // Backward compatibility: some tenants still use "pendiente".
        nextConversation = await removeTagFromConversation({
            conversationId: req.params.id,
            tagName: "pendiente",
            userId: req.user.id,
        });

        return res.json({ conversation: formatConversation(nextConversation) });
    } catch (error) {
        return res.status(404).json({ error: "not_found" });
    }
});

// POST /api/conversations/:id/tags
router.post("/conversations/:id/tags", requireAuth, async (req, res) => {
    const adds = Array.isArray(req.body?.add) ? req.body.add : [];
    const removes = Array.isArray(req.body?.remove) ? req.body.remove : [];
    const normalizedAdds = adds.map((name) => String(name || "").trim()).filter(Boolean);
    const normalizedRemoves = removes.map((name) => String(name || "").trim()).filter(Boolean);
    let conversation = null;

    if (!normalizedAdds.length && !normalizedRemoves.length) {
        const current = await getConversationById(req.params.id);
        if (!current) {
            return res.status(404).json({ error: "not_found" });
        }
        return res.json({ conversation: current });
    }

    try {
        for (const name of normalizedAdds) {
            conversation = await addTagToConversation({
                conversationId: req.params.id,
                tagName: name,
                userId: req.user.id,
            });
        }
        for (const name of normalizedRemoves) {
            conversation = await removeTagFromConversation({
                conversationId: req.params.id,
                tagName: name,
                userId: req.user.id,
            });
        }
        if (normalizedAdds.length && conversation?.phone_number_id) {
            try {
                const settings = await audienceAutomationService.getAutomationSettings({
                    phoneNumberId: conversation.phone_number_id,
                });
                if (settings?.enabled) {
                    await audienceAutomationService.ensureDefaultAudience({
                        phoneNumberId: conversation.phone_number_id,
                        userId: req.user.id,
                    });
                    for (const name of normalizedAdds) {
                        await audienceAutomationService.createTagWithAudience({
                            name,
                            phoneNumberId: conversation.phone_number_id,
                            userId: req.user.id,
                        });
                    }
                }
            } catch (error) {
                console.error("audience.automation.tag_failed", error.message || error);
            }
        }
    } catch (error) {
        return res.status(400).json({ error: "tag_update_failed" });
    }

    return res.json({ conversation });
});

// POST /api/conversations/:id/messages
router.post("/conversations/:id/messages", requireAuth, async (req, res) => {
    const text = (req.body?.text || "").trim();
    const type = req.body?.type || "text";
    if (!text) {
        return res.status(400).json({ error: "missing_text" });
    }

    const conversation = await getConversationById(req.params.id);
    if (!conversation) {
        return res.status(404).json({ error: "not_found" });
    }

    if (
        conversation.assigned_user_id &&
        conversation.assigned_user_id !== req.user.id
    ) {
        return res.status(403).json({ error: "not_assigned" });
    }
    if (conversation.status === "pending" && !conversation.assigned_user_id) {
        return res.status(403).json({ error: "pending_unassigned" });
    }

    if (type === "note") {
        const result = await createMessage({
            conversationId: conversation.id,
            direction: "out",
            type: "note",
            text,
            rawJson: { source: "panel", by_user_id: req.user.id },
        });
        return res.json({ conversation: result.conversation, message: result.message });
    }

    let phoneNumberId = conversation.phone_number_id;

    // If phone_number_id is missing, try to get it from tenant's channels
    if (!phoneNumberId) {
        const tenantId = req.user?.tenant_id;
        if (tenantId && process.env.CONTROL_DB_URL) {
            const control = getControlClient();
            const channels = await control.channel.findMany({
                where: { tenant_id: tenantId },
                orderBy: { created_at: "asc" },
                take: 1,
            });

            if (channels.length > 0) {
                phoneNumberId = channels[0].phone_number_id;

                // Update the conversation with the correct phone_number_id
                await prisma.conversation.update({
                    where: { id: conversation.id },
                    data: { phone_number_id: phoneNumberId },
                });

                console.log(`[FIX] Updated conversation ${conversation.id} with phone_number_id ${phoneNumberId}`);
            }
        }
    }

    if (!phoneNumberId) {
        return res.status(400).json({ error: "missing_phone_number_id" });
    }

    const channelConfig = await resolveChannelByPhoneNumberId(phoneNumberId);
    const tenantId = getTenantContext().tenantId;
    if (!channelConfig || channelConfig.tenantId !== tenantId) {
        return res.status(400).json({ error: "missing_channel" });
    }

    await sendText(conversation.wa_id, text, {
        channel: channelConfig,
        meta: { source: "panel", by_user_id: req.user.id },
    });
    return res.json({ ok: true });
});

module.exports = router;
