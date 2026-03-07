/**
 * Rutas de conversaciones
 */
const express = require("express");
const router = express.Router();

const {
    requireAuth,
    requireAnyPermission,
    requireModulePermission,
    requireSettingPermission,
} = require("../middleware/auth");
const { panelLimiter } = require("../middleware/rateLimit");
const prisma = require("../db");
const { getControlClient } = require("../control/controlClient");
const { getTenantContext } = require("../tenancy/tenantContext");
const { resolveChannelByPhoneNumberId } = require("../tenancy/tenantResolver");
const { sendText } = require("../whatsapp");
const {
    getConversationById,
    formatConversation,
    setConversationStatus,
    assignConversation,
    addTagToConversation,
    removeTagFromConversation,
    createMessage,
    logAudit,
} = require("../services/conversations");
const {
    getPushPublicKey,
    isPushConfigured,
    savePushSubscription,
    removePushSubscription,
} = require("../services/pushNotifications");
const audienceAutomationService = require("../services/audienceAutomationService");
const { getRolePermissions, userHasPermission } = require("../services/rolePermissions");

const CONVERSATION_LIST_SELECT = {
    id: true,
    wa_id: true,
    phone_number_id: true,
    phone_e164: true,
    display_name: true,
    status: true,
    assigned_user_id: true,
    partner_id: true,
    patient_id: true,
    verified_at: true,
    verification_method: true,
    last_message_at: true,
    last_message_text: true,
    last_message_type: true,
    last_message_direction: true,
    primary_tag_id: true,
    created_at: true,
    assigned_user: {
        select: {
            id: true,
            name: true,
            role: true,
        },
    },
    primary_tag: {
        select: {
            id: true,
            name: true,
            color: true,
        },
    },
    tags: {
        select: {
            tag: {
                select: {
                    id: true,
                    name: true,
                    color: true,
                },
            },
        },
    },
};

// Aplicar rate limiter a todas las rutas /api
router.use(panelLimiter);

// GET /api/me
router.get("/me", requireAuth, (req, res) => {
    return res.json({ user: req.user });
});

// GET /api/push/config
router.get("/push/config", requireAuth, (req, res) => {
    return res.json({
        enabled: isPushConfigured(),
        publicKey: getPushPublicKey(),
    });
});

// POST /api/push/subscription
router.post("/push/subscription", requireAuth, async (req, res) => {
    if (!isPushConfigured()) {
        return res.status(503).json({ error: "push_disabled" });
    }
    try {
        await savePushSubscription({
            userId: req.user.id,
            subscription: req.body?.subscription,
            deviceLabel: String(req.body?.device_label || "").trim() || null,
            userAgent: String(req.body?.user_agent || "").trim() || null,
        });
        return res.json({ ok: true });
    } catch (error) {
        if (error.message === "invalid_push_subscription") {
            return res.status(400).json({ error: "invalid_push_subscription" });
        }
        if (error.message === "push_disabled") {
            return res.status(503).json({ error: "push_disabled" });
        }
        return res.status(500).json({ error: "push_subscription_failed" });
    }
});

// POST /api/push/unsubscribe
router.post("/push/unsubscribe", requireAuth, async (req, res) => {
    try {
        await removePushSubscription({
            userId: req.user.id,
            endpoint: req.body?.endpoint,
        });
        return res.json({ ok: true });
    } catch (error) {
        return res.status(500).json({ error: "push_unsubscribe_failed" });
    }
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
router.get(
    "/channels",
    requireAuth,
    requireAnyPermission([
        { group: "modules", key: "chat" },
        { group: "modules", key: "dashboard" },
        { group: "modules", key: "campaigns" },
        { group: "settings", key: "general" },
    ]),
    async (req, res) => {
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
            line_number: channel.line_number || null,
            waba_id: channel.waba_id || null,
            is_active: channel.is_active,
            is_default: channel.is_default,
            created_at: channel.created_at,
        })),
    });
});

// PATCH /api/channels/:id
router.patch("/channels/:id", requireAuth, requireSettingPermission("general", "write"), async (req, res) => {
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
    if (req.body?.line_number !== undefined) {
        const rawLineNumber = String(req.body.line_number || "").trim();
        updates.line_number = rawLineNumber || null;
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
            line_number: channel.line_number || null,
            waba_id: channel.waba_id || null,
            is_active: channel.is_active,
            is_default: channel.is_default,
            created_at: channel.created_at,
        },
    });
});

// GET /api/role-permissions
router.get("/role-permissions", requireAuth, async (req, res) => {
    if (!userHasPermission(req.user, "settings", "users", "read")) {
        return res.json({
            permissions: {
                [req.user.role]: await getRolePermissions(prisma, req.user.role),
            },
        });
    }
    const [entries, users] = await Promise.all([
        prisma.rolePermission.findMany({
            select: { role: true, permissions_json: true },
        }),
        prisma.user.findMany({
            distinct: ["role"],
            select: { role: true },
        }),
    ]);
    const roleSet = new Set([
        req.user.role,
        ...entries.map((entry) => entry.role),
        ...users.map((entry) => entry.role),
    ]);
    const permissions = {};
    for (const role of roleSet) {
        permissions[role] = await getRolePermissions(prisma, role);
    }
    return res.json({ permissions });
});

// GET /api/users
router.get(
    "/users",
    requireAuth,
    requireAnyPermission([
        { group: "modules", key: "chat" },
        { group: "modules", key: "campaigns" },
        { group: "settings", key: "users" },
    ]),
    async (req, res) => {
    const users = await prisma.user.findMany({
        where: { is_active: true },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: "asc" },
    });
    return res.json({ users });
});

// GET /api/tags
router.get(
    "/tags",
    requireAuth,
    requireAnyPermission([
        { group: "modules", key: "chat" },
        { group: "modules", key: "campaigns" },
    ]),
    async (req, res) => {
    const tags = await prisma.tag.findMany({
        select: { id: true, name: true, color: true },
        orderBy: { name: "asc" },
    });
    return res.json({ tags });
});

// POST /api/tags
router.post(
    "/tags",
    requireAuth,
    requireAnyPermission([
        { group: "modules", key: "chat", action: "write" },
        { group: "modules", key: "campaigns", action: "write" },
    ]),
    async (req, res) => {
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
router.patch(
    "/tags/:id",
    requireAuth,
    requireAnyPermission([
        { group: "modules", key: "chat", action: "write" },
        { group: "modules", key: "campaigns", action: "write" },
    ]),
    async (req, res) => {
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
router.delete(
    "/tags/:id",
    requireAuth,
    requireAnyPermission([
        { group: "modules", key: "chat", action: "write" },
        { group: "modules", key: "campaigns", action: "write" },
    ]),
    async (req, res) => {
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
router.get("/conversations", requireAuth, requireModulePermission("chat", "read"), async (req, res) => {
    const status = req.query.status;
    const assignedUser = req.query.assigned_user_id;
    const tag = req.query.tag;
    const phoneNumberId = req.query.phone_number_id;
    const search = (req.query.search || "").trim();
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const parsedOffset = Number.parseInt(req.query.offset, 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 200)
        : 50;
    const offset = Number.isFinite(parsedOffset) && parsedOffset > 0
        ? parsedOffset
        : 0;

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
        const normalizedSearch = String(search).trim();
        const digitsOnly = normalizedSearch.replace(/[^\d+]/g, "");
        const isNumericSearch = Boolean(digitsOnly) && /^[+\d]+$/.test(normalizedSearch);

        if (isNumericSearch) {
            where.OR = [
                { phone_e164: { startsWith: normalizedSearch } },
                { wa_id: { startsWith: normalizedSearch } },
            ];
        } else {
            where.OR = [
                { display_name: { contains: normalizedSearch, mode: "insensitive" } },
                { phone_e164: { startsWith: normalizedSearch } },
                { wa_id: { startsWith: normalizedSearch } },
            ];
        }
    }

    const pagedConversations = await prisma.conversation.findMany({
        where,
        select: CONVERSATION_LIST_SELECT,
        orderBy: [{ last_message_at: "desc" }, { created_at: "desc" }, { id: "desc" }],
        skip: offset,
        take: limit + 1,
    });
    const hasMore = pagedConversations.length > limit;
    const conversations = hasMore
        ? pagedConversations.slice(0, limit)
        : pagedConversations;

    return res.json({
        conversations: conversations.map((entry) => {
            const formatted = formatConversation(entry);
            if ((!formatted.tags || !formatted.tags.length) && entry.primary_tag) {
                formatted.tags = [entry.primary_tag];
            }
            return formatted;
        }),
        has_more: hasMore,
        next_offset: hasMore ? offset + conversations.length : null,
    });
});

// GET /api/conversations/:id
router.get("/conversations/:id", requireAuth, requireModulePermission("chat", "read"), async (req, res) => {
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
router.patch("/conversations/:id/status", requireAuth, requireModulePermission("chat", "write"), async (req, res) => {
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
router.patch("/conversations/:id/assign", requireAuth, requireModulePermission("chat", "write"), async (req, res) => {
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
            !userHasPermission(req.user, "settings", "users", "write")
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
router.post("/conversations/:id/tags", requireAuth, requireModulePermission("chat", "write"), async (req, res) => {
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
router.post("/conversations/:id/messages", requireAuth, requireModulePermission("chat", "write"), async (req, res) => {
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
