/**
 * Rutas de administración - index
 * Centraliza todas las rutas de /api/admin/*
 */
const express = require("express");
const bcrypt = require("bcryptjs");
const axios = require("axios");
const router = express.Router();

const { requireAuth, requireRole } = require("../../middleware/auth");
const prisma = require("../../db");
const logger = require("../../lib/logger");
const { getControlClient } = require("../../control/controlClient");
const { getTenantContext } = require("../../tenancy/tenantContext");
const { resolveChannelByPhoneNumberId } = require("../../tenancy/tenantResolver");
const { logAudit, createMessage } = require("../../services/conversations");
const { getSegmentRecipients } = require("../../services/audienceService");
const { ROLE_OPTIONS } = require("../../config/roles");

// Settings cache (para sincronizar con webhook)
const settingsCache = new Map();

// ==========================================
// USERS
// ==========================================

// GET /api/admin/users
router.get("/users", requireAuth, requireRole("admin"), async (req, res) => {
    const users = await prisma.user.findMany({
        orderBy: { created_at: "desc" },
    });
    return res.json({ users });
});

// POST /api/admin/users
router.post("/users", requireAuth, requireRole("admin"), async (req, res) => {
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
    if (process.env.CONTROL_DB_URL && req.user.tenant_id) {
        try {
            const control = getControlClient();
            await control.userControl.upsert({
                where: { email },
                update: {
                    password_hash: passwordHash,
                    role,
                    is_active: true,
                },
                create: {
                    email,
                    password_hash: passwordHash,
                    role,
                    is_active: true,
                    tenant_id: req.user.tenant_id,
                },
            });
        } catch (error) {
            logger.error("control.user_sync_failed", {
                message: error.message || error,
            });
        }
    }
    await logAudit({
        userId: req.user.id,
        action: "user.created",
        data: { user_id: user.id, email },
    });
    return res.json({ user });
});

// PATCH /api/admin/users/:id
router.patch("/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
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
    if (process.env.CONTROL_DB_URL && req.user.tenant_id) {
        try {
            const control = getControlClient();
            const controlUpdates = {};
            if (updates.role) {
                controlUpdates.role = updates.role;
            }
            if (updates.is_active !== undefined) {
                controlUpdates.is_active = updates.is_active;
            }
            if (updates.password_hash) {
                controlUpdates.password_hash = updates.password_hash;
            }
            if (Object.keys(controlUpdates).length) {
                await control.userControl.upsert({
                    where: { email: user.email },
                    update: controlUpdates,
                    create: {
                        email: user.email,
                        password_hash: updates.password_hash || user.password_hash,
                        role: user.role,
                        is_active: user.is_active,
                        tenant_id: req.user.tenant_id,
                    },
                });
            }
        } catch (error) {
            logger.error("control.user_sync_failed", {
                message: error.message || error,
            });
        }
    }
    await logAudit({
        userId: req.user.id,
        action: "user.updated",
        data: { user_id: user.id, updates: Object.keys(updates) },
    });
    return res.json({ user });
});

// DELETE /api/admin/users/:id
router.delete("/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const userId = req.params.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        return res.status(404).json({ error: "user_not_found" });
    }
    await prisma.$transaction([
        prisma.auditLogTenant.updateMany({
            where: { user_id: userId },
            data: { user_id: null },
        }),
        prisma.conversation.updateMany({
            where: { assigned_user_id: userId },
            data: { assigned_user_id: null },
        }),
        prisma.campaign.updateMany({
            where: { created_by_user_id: userId },
            data: { created_by_user_id: null },
        }),
        prisma.metaTemplate.updateMany({
            where: { created_by_user_id: userId },
            data: { created_by_user_id: null },
        }),
        prisma.audienceSegment.updateMany({
            where: { created_by_user_id: userId },
            data: { created_by_user_id: null },
        }),
        prisma.user.delete({ where: { id: userId } }),
    ]);
    if (process.env.CONTROL_DB_URL && req.user.tenant_id) {
        try {
            const control = getControlClient();
            await control.userControl.deleteMany({
                where: { email: user.email },
            });
        } catch (error) {
            logger.error("control.user_sync_failed", {
                message: error.message || error,
            });
        }
    }
    await logAudit({
        userId: req.user.id,
        action: "user.disabled",
        data: { user_id: user.id, email: user.email, hard_delete: true },
    });
    return res.json({ user });
});

// ==========================================
// ROLE PERMISSIONS
// ==========================================

// PATCH /api/admin/role-permissions
router.patch("/role-permissions", requireAuth, requireRole("admin"), async (req, res) => {
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
});

// DELETE /api/admin/role-permissions/:role
router.delete("/role-permissions/:role", requireAuth, requireRole("admin"), async (req, res) => {
    const role = String(req.params.role || "").trim();
    if (!ROLE_OPTIONS.includes(role)) {
        return res.status(400).json({ error: "invalid_role" });
    }
    await prisma.rolePermission.deleteMany({ where: { role } });
    await logAudit({
        userId: req.user.id,
        action: "role_permissions.deleted",
        data: { role },
    });
    return res.json({ ok: true });
});

// ==========================================
// SETTINGS
// ==========================================

// GET /api/admin/settings
router.get("/settings", requireAuth, requireRole("admin"), async (req, res) => {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    return res.json({ settings });
});

// PATCH /api/admin/settings
router.patch("/settings", requireAuth, requireRole("admin"), async (req, res) => {
    const settings = await prisma.settings.upsert({
        where: { id: 1 },
        update: {
            bot_enabled: req.body?.bot_enabled,
            auto_reply_enabled: req.body?.auto_reply_enabled,
        },
        create: {
            id: 1,
            bot_enabled: req.body?.bot_enabled,
            auto_reply_enabled: req.body?.auto_reply_enabled,
        },
    });
    const tenantId = getTenantContext().tenantId;
    if (tenantId) {
        settingsCache.set(tenantId, { value: settings, at: Date.now() });
    }
    await logAudit({
        userId: req.user.id,
        action: "settings.updated",
        data: {
            bot_enabled: settings.bot_enabled,
            auto_reply_enabled: settings.auto_reply_enabled,
        },
    });
    return res.json({ settings });
});

// ==========================================
// BRANCHES
// ==========================================

// GET /api/admin/branches
router.get("/branches", requireAuth, requireRole(["admin", "marketing"]), async (req, res) => {
    const branches = await prisma.branch.findMany({
        orderBy: { name: "asc" },
    });
    return res.json({ branches });
});

// POST /api/admin/branches
router.post("/branches", requireAuth, requireRole(["admin", "marketing"]), async (req, res) => {
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
});

// PATCH /api/admin/branches/:id
router.patch("/branches/:id", requireAuth, requireRole(["admin", "marketing"]), async (req, res) => {
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
});

// DELETE /api/admin/branches/:id
router.delete("/branches/:id", requireAuth, requireRole(["admin", "marketing"]), async (req, res) => {
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
});

// ==========================================
// SERVICES
// ==========================================

// GET /api/admin/services
router.get("/services", requireAuth, requireRole(["admin", "marketing"]), async (req, res) => {
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
});

// POST /api/admin/services
router.post("/services", requireAuth, requireRole(["admin", "marketing"]), async (req, res) => {
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
});

// PATCH /api/admin/services/:id
router.patch("/services/:id", requireAuth, requireRole(["admin", "marketing"]), async (req, res) => {
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
});

// DELETE /api/admin/services/:id
router.delete("/services/:id", requireAuth, requireRole(["admin", "marketing"]), async (req, res) => {
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
});

// POST /api/admin/services/:id/branches
router.post("/services/:id/branches", requireAuth, requireRole(["admin", "marketing"]), async (req, res) => {
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
});

// ==========================================
// TEMPLATES
// ==========================================

function extractTemplatePreview(template) {
    const components = template.components || [];
    const body = components.find((item) => item.type === "BODY");
    if (body?.text) {
        return body.text;
    }
    return template.name || "Template";
}

async function syncTemplatesFromWhatsApp({ wabaId, waToken }) {
    if (!wabaId) {
        throw new Error("missing_waba_id");
    }
    if (!waToken) {
        throw new Error("missing_whatsapp_token");
    }
    const url = `https://graph.facebook.com/v22.0/${wabaId}/message_templates?limit=200`;
    const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${waToken}` },
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

// GET /api/admin/templates
router.get("/templates", requireAuth, requireRole(["admin", "marketing"]), async (req, res) => {
    const templates = await prisma.template.findMany({
        orderBy: { name: "asc" },
    });
    return res.json({ templates });
});

// POST /api/admin/templates
router.post("/templates", requireAuth, requireRole(["admin", "marketing"]), async (req, res) => {
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
});

// PATCH /api/admin/templates/:id
router.patch("/templates/:id", requireAuth, requireRole(["admin", "marketing"]), async (req, res) => {
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
});

// POST /api/admin/templates/sync
router.post("/templates/sync", requireAuth, requireRole(["admin", "marketing"]), async (req, res) => {
    try {
        const requestedPhoneNumberId = (req.body?.phone_number_id || "").trim();
        const tenantId = getTenantContext().tenantId;
        let channelConfig = null;
        if (requestedPhoneNumberId) {
            channelConfig = await resolveChannelByPhoneNumberId(requestedPhoneNumberId);
            if (!channelConfig || channelConfig.tenantId !== tenantId) {
                return res.status(400).json({ error: "missing_channel" });
            }
        } else {
            channelConfig = getTenantContext().channel || null;
            if (!channelConfig) {
                return res.status(400).json({ error: "missing_channel" });
            }
        }
        const count = await syncTemplatesFromWhatsApp({
            wabaId: channelConfig.waba_id,
            waToken: channelConfig.wa_token,
        });
        await logAudit({
            userId: req.user.id,
            action: "template.synced",
            data: { count },
        });
        return res.json({ synced: count });
    } catch (error) {
        return res.status(400).json({ error: error.message || "sync_failed" });
    }
});

// ==========================================
// CAMPAIGNS
// ==========================================

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
    if (filter.phone_number_id) {
        where.phone_number_id = filter.phone_number_id;
    }
    if (filter.verified_only) {
        where.verified_at = { not: null };
    }
    return where;
}

async function queueCampaignMessages(campaign, userId) {
    const filter = campaign.audience_filter || {};
    let segmentId = filter.segment_id || null;
    if (!segmentId && filter.segment_name) {
        const byName = await prisma.audienceSegment.findFirst({
            where: { name: filter.segment_name, is_active: true },
            select: { id: true },
        });
        segmentId = byName?.id || null;
    }

    if (segmentId) {
        const defaultPhoneNumberId = getTenantContext().channel?.phone_number_id || null;
        if (!defaultPhoneNumberId) {
            logger.warn("campaign.missing_default_channel", { campaign_id: campaign.id });
            return 0;
        }
        const recipients = await getSegmentRecipients(segmentId);
        if (!recipients.length) {
            return 0;
        }

        await prisma.campaignMessage.deleteMany({
            where: { campaign_id: campaign.id },
        });

        const data = recipients.map((recipient) => ({
            campaign_id: campaign.id,
            conversation_id: recipient.conversation_id || null,
            wa_id: recipient.wa_id,
            phone_e164: recipient.phone_e164,
            phone_number_id: recipient.phone_number_id || defaultPhoneNumberId,
            status: "queued",
        }));

        await prisma.campaignMessage.createMany({ data });

        await logAudit({
            userId,
            action: "campaign.queued",
            data: { campaign_id: campaign.id, total: recipients.length, segment_id: segmentId },
        });

        return data.length;
    }

    const where = buildConversationFilter(filter);
    const conversations = await prisma.conversation.findMany({
        where,
        select: {
            id: true,
            wa_id: true,
            phone_e164: true,
            phone_number_id: true,
        },
    });
    const eligible = conversations.filter(
        (conversation) => conversation.phone_number_id
    );
    if (!eligible.length) {
        return 0;
    }

    await prisma.campaignMessage.deleteMany({
        where: { campaign_id: campaign.id },
    });

    await prisma.campaignMessage.createMany({
        data: eligible.map((conversation) => ({
            campaign_id: campaign.id,
            conversation_id: conversation.id,
            wa_id: conversation.wa_id,
            phone_e164: conversation.phone_e164,
            phone_number_id: conversation.phone_number_id,
            status: "queued",
        })),
    });

    await logAudit({
        userId,
        action: "campaign.queued",
        data: { campaign_id: campaign.id, total: conversations.length },
    });

    return eligible.length;
}

// GET /api/admin/campaigns
router.get("/campaigns", requireAuth, requireRole(["admin", "marketing"]), async (req, res) => {
    const pageSize = Math.min(Math.max(Number(req.query.page_size) || 10, 5), 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const offset = (page - 1) * pageSize;
    const query = (req.query.q || "").trim();
    const where = {};
    if (query) {
        where.OR = [
            { name: { contains: query, mode: "insensitive" } },
            { template: { name: { contains: query, mode: "insensitive" } } },
        ];
    }
    const [campaigns, total] = await Promise.all([
        prisma.campaign.findMany({
            where,
            include: { template: true },
            orderBy: { created_at: "desc" },
            skip: offset,
            take: pageSize,
        }),
        prisma.campaign.count({ where }),
    ]);
    return res.json({ campaigns, total, page, page_size: pageSize });
});

// POST /api/admin/campaigns
router.post("/campaigns", requireAuth, requireRole(["admin", "marketing"]), async (req, res) => {
    const name = (req.body?.name || "").trim();
    const templateId = req.body?.template_id;
    const audienceFilter = req.body?.audience_filter || {};
    const scheduledFor = req.body?.scheduled_for
        ? new Date(req.body.scheduled_for)
        : null;
    if (!name || !templateId) {
        return res.status(400).json({ error: "missing_fields" });
    }
    let resolvedTemplateId = templateId;
    const existingTemplate = await prisma.template.findUnique({
        where: { id: templateId },
    });
    if (!existingTemplate) {
        const metaTemplate = await prisma.metaTemplate.findUnique({
            where: { id: templateId },
        });
        if (!metaTemplate) {
            return res.status(400).json({ error: "template_not_found" });
        }
        const templateByName = await prisma.template.findUnique({
            where: { name: metaTemplate.name },
        });
        if (templateByName) {
            resolvedTemplateId = templateByName.id;
        } else {
            const createdTemplate = await prisma.template.create({
                data: {
                    name: metaTemplate.name,
                    language: metaTemplate.language || "es",
                    category: metaTemplate.category || null,
                    body_preview: metaTemplate.body_text || metaTemplate.footer_text || "",
                    is_active: metaTemplate.status === "APPROVED",
                },
            });
            resolvedTemplateId = createdTemplate.id;
        }
    }
    const campaign = await prisma.campaign.create({
        data: {
            name,
            template_id: resolvedTemplateId,
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
});

// POST /api/admin/campaigns/:id/send
router.post("/campaigns/:id/send", requireAuth, requireRole(["admin", "marketing"]), async (req, res) => {
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
});


// PUT /api/admin/campaigns/:id
router.put("/campaigns/:id", requireAuth, requireRole(["admin", "marketing"]), async (req, res) => {
    const name = (req.body?.name || "").trim();
    const templateId = req.body?.template_id || null;
    const audienceFilter = req.body?.audience_filter || null;
    const scheduledForRaw = req.body?.scheduled_for;
    const scheduledFor = scheduledForRaw ? new Date(scheduledForRaw) : null;
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) {
        return res.status(404).json({ error: "not_found" });
    }
    if (campaign.status === "sending") {
        return res.status(400).json({ error: "Sending campaigns cannot be edited" });
    }
    let resolvedTemplateId = templateId || campaign.template_id;
    if (templateId) {
        const existingTemplate = await prisma.template.findUnique({
            where: { id: templateId },
        });
        if (!existingTemplate) {
            const metaTemplate = await prisma.metaTemplate.findUnique({
                where: { id: templateId },
            });
            if (!metaTemplate) {
                return res.status(400).json({ error: "template_not_found" });
            }
            const templateByName = await prisma.template.findUnique({
                where: { name: metaTemplate.name },
            });
            if (templateByName) {
                resolvedTemplateId = templateByName.id;
            } else {
                const createdTemplate = await prisma.template.create({
                    data: {
                        name: metaTemplate.name,
                        language: metaTemplate.language || "es",
                        category: metaTemplate.category || null,
                        body_preview: metaTemplate.body_text || metaTemplate.footer_text || "",
                        is_active: metaTemplate.status === "APPROVED",
                    },
                });
                resolvedTemplateId = createdTemplate.id;
            }
        }
    }
    const updates = {};
    if (name) {
        updates.name = name;
    }
    if (resolvedTemplateId) {
        updates.template_id = resolvedTemplateId;
    }
    if (audienceFilter !== null) {
        updates.audience_filter = audienceFilter;
    }
    if (scheduledForRaw !== undefined && ["draft", "scheduled"].includes(campaign.status)) {
        updates.scheduled_for = scheduledFor;
        updates.status = scheduledFor ? "scheduled" : "draft";
    }
    const updated = await prisma.campaign.update({
        where: { id: campaign.id },
        data: updates,
    });
    await logAudit({
        userId: req.user.id,
        action: "campaign.updated",
        data: { campaign_id: updated.id },
    });
    return res.json({ campaign: updated });
});

// DELETE /api/admin/campaigns/:id
router.delete("/campaigns/:id", requireAuth, requireRole(["admin", "marketing"]), async (req, res) => {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) {
        return res.status(404).json({ error: "not_found" });
    }
    if (campaign.status === "sending") {
        return res.status(400).json({ error: "Sending campaigns cannot be deleted" });
    }
    await prisma.$transaction([
        prisma.campaignMessage.deleteMany({ where: { campaign_id: campaign.id } }),
        prisma.campaign.delete({ where: { id: campaign.id } }),
    ]);
    await logAudit({
        userId: req.user.id,
        action: "campaign.deleted",
        data: { campaign_id: campaign.id },
    });
    return res.json({ success: true });
});

// GET /api/admin/campaigns/:id/messages
router.get("/campaigns/:id/messages", requireAuth, requireRole(["admin", "marketing"]), async (req, res) => {
    const messages = await prisma.campaignMessage.findMany({
        where: { campaign_id: req.params.id },
        orderBy: { sent_at: "desc" },
        take: 500,
    });
    return res.json({ messages });
});

// ==========================================
// AUDIT
// ==========================================

// GET /api/admin/audit
router.get("/audit", requireAuth, requireRole("admin"), async (req, res) => {
    const pageSize = Math.min(Math.max(Number(req.query.page_size) || 10, 5), 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const action = req.query.action ? String(req.query.action) : "";
    const q = req.query.q ? String(req.query.q).trim() : "";
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    const where = {};
    if (action) {
        where.action = action;
    }
    if (from && !Number.isNaN(from.getTime())) {
        where.created_at = { ...(where.created_at || {}), gte: from };
    }
    if (to && !Number.isNaN(to.getTime())) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        where.created_at = { ...(where.created_at || {}), lte: end };
    }
    if (q) {
        where.OR = [
            { action: { contains: q, mode: "insensitive" } },
            { user: { name: { contains: q, mode: "insensitive" } } },
            { user: { email: { contains: q, mode: "insensitive" } } },
        ];
    }
    const [logs, total] = await Promise.all([
        prisma.auditLogTenant.findMany({
            where,
            orderBy: { created_at: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: {
                user: { select: { id: true, name: true, email: true } },
            },
        }),
        prisma.auditLogTenant.count({ where }),
    ]);
    return res.json({ logs, total, page, page_size: pageSize });
});

// ==========================================
// BOTS (Tenant Bot Management)
// ==========================================

const { getTenantBots, updateTenantBotStatus } = require("../../services/tenantBots");
const { getBotMetrics } = require("../../services/botMetrics");

// GET /api/admin/bots
// Returns bots assigned to this tenant by SuperAdmin
router.get("/bots", requireAuth, requireRole("admin"), async (req, res) => {
    const tenantId = req.user.tenant_id;
    if (!tenantId) {
        return res.status(400).json({ error: "tenant_not_found" });
    }
    try {
        const bots = await getTenantBots(tenantId);
        return res.json({ bots });
    } catch (error) {
        logger.error("bots.list_failed", { message: error.message });
        return res.status(500).json({ error: "load_failed" });
    }
});

// PATCH /api/admin/bots/:id
// Toggle bot active/inactive for this tenant
router.patch("/bots/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const tenantId = req.user.tenant_id;
    if (!tenantId) {
        return res.status(400).json({ error: "tenant_not_found" });
    }

    const isActive = req.body?.is_active;
    if (isActive === undefined) {
        return res.status(400).json({ error: "missing_is_active" });
    }

    try {
        const updated = await updateTenantBotStatus(req.params.id, Boolean(isActive));
        await logAudit({
            userId: req.user.id,
            action: "bot.toggled",
            data: { tenant_bot_id: req.params.id, is_active: isActive },
        });
        return res.json({ bot: updated });
    } catch (error) {
        logger.error("bots.toggle_failed", { message: error.message });
        return res.status(500).json({ error: "update_failed" });
    }
});

// GET /api/admin/bots/metrics
// Returns performance metrics for the tenant's bots
router.get("/bots/metrics", requireAuth, requireRole("admin"), async (req, res) => {
    const tenantId = req.user.tenant_id;
    if (!tenantId) {
        return res.status(400).json({ error: "tenant_not_found" });
    }
    try {
        const metrics = await getBotMetrics(tenantId);
        return res.json({ metrics });
    } catch (error) {
        logger.error("bots.metrics_failed", { message: error.message });
        // Return zeros on error to avoid breaking UI
        return res.json({
            metrics: {
                interactions: { value: 0, change: 0, label: "nodata" },
                resolution: { value: 0, target: 85 },
                uptime: { value: "-", status: "Unknown" },
                errors: { value: 0, critical: 0, status: "Unknown" }
            }
        });
    }
});

// Export utilities for campaign processing
module.exports = router;
module.exports.queueCampaignMessages = queueCampaignMessages;
module.exports.buildConversationFilter = buildConversationFilter;
module.exports.syncTemplatesFromWhatsApp = syncTemplatesFromWhatsApp;
