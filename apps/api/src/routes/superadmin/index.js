/**
 * Rutas de Superadmin - index
 * Centraliza todas las rutas de /api/superadmin/*
 */
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const router = express.Router();

const { requireAuth } = require("../../middleware/auth");
const logger = require("../../lib/logger");
const { signUser } = require("../../lib/auth");
const { getControlClient } = require("../../control/controlClient");
const { encryptString, decryptString } = require("../../core/crypto");
const {
    resolveTenantContextById,
    clearTenantDbCache,
    clearChannelCache,
} = require("../../tenancy/tenantResolver");
const { clearOdooConfigCache } = require("../../services/odooClient");

// Middleware para requerir rol superadmin
function requireSuperAdmin(req, res, next) {
    if (!req.user || req.user.role !== "superadmin") {
        return res.status(403).json({ error: "forbidden" });
    }
    return next();
}

// ==========================================
// TENANTS
// ==========================================

// GET /api/superadmin/tenants
router.get("/tenants", requireAuth, requireSuperAdmin, async (req, res) => {
    const control = getControlClient();
    const tenants = await control.tenant.findMany({
        include: { databases: true, branding: true, odoo_config: true },
        orderBy: { created_at: "desc" },
    });
    return res.json({
        tenants: tenants.map((tenant) => ({
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            plan: tenant.plan,
            is_active: tenant.is_active,
            created_at: tenant.created_at,
            has_database: Boolean(tenant.databases),
            has_branding: Boolean(tenant.branding),
            has_odoo: Boolean(tenant.odoo_config),
        })),
    });
});

// GET /api/superadmin/tenants/:id/details
router.get("/tenants/:id/details", requireAuth, requireSuperAdmin, async (req, res) => {
    const control = getControlClient();
    const tenant = await control.tenant.findUnique({
        where: { id: req.params.id },
        include: { databases: true, branding: true, odoo_config: true, channels: true },
    });
    if (!tenant) {
        return res.status(404).json({ error: "tenant_not_found" });
    }
    const channel =
        tenant.channels?.find((item) => item.provider === "whatsapp") ||
        tenant.channels?.[0] ||
        null;
    return res.json({
        tenant: {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            plan: tenant.plan,
            is_active: tenant.is_active,
            created_at: tenant.created_at,
        },
        database: tenant.databases
            ? { db_url: decryptString(tenant.databases.db_url_encrypted) }
            : null,
        branding: tenant.branding
            ? {
                brand_name: tenant.branding.brand_name,
                logo_url: tenant.branding.logo_url,
                colors: tenant.branding.colors,
                timezone: tenant.branding.timezone,
            }
            : null,
        odoo: tenant.odoo_config
            ? {
                base_url: tenant.odoo_config.base_url,
                db_name: tenant.odoo_config.db_name,
                username: tenant.odoo_config.username,
                password: decryptString(tenant.odoo_config.password_encrypted),
            }
            : null,
        channels: tenant.channels
            ? tenant.channels.map((ch) => ({
                id: ch.id,
                provider: ch.provider,
                phone_number_id: ch.phone_number_id,
                display_name: ch.display_name || null,
                waba_id: ch.waba_id || null,
                verify_token: ch.verify_token,
                is_active: ch.is_active,
                is_default: ch.is_default,
                wa_token: ch.wa_token_encrypted ? decryptString(ch.wa_token_encrypted) : "",
                app_secret: ch.app_secret_encrypted
                    ? decryptString(ch.app_secret_encrypted)
                    : "",
            }))
            : [],
        channel: channel
            ? {
                id: channel.id,
                provider: channel.provider,
                phone_number_id: channel.phone_number_id,
                display_name: channel.display_name || null,
                waba_id: channel.waba_id || null,
                verify_token: channel.verify_token,
                wa_token: channel.wa_token_encrypted
                    ? decryptString(channel.wa_token_encrypted)
                    : "",
                app_secret: channel.app_secret_encrypted
                    ? decryptString(channel.app_secret_encrypted)
                    : "",
                is_active: channel.is_active,
                is_default: channel.is_default,
            }
            : null,
    });
});

// POST /api/superadmin/tenants
router.post("/tenants", requireAuth, requireSuperAdmin, async (req, res) => {
    const name = (req.body?.name || "").trim();
    const slug = (req.body?.slug || "").trim();
    const plan = (req.body?.plan || "").trim() || null;
    if (!name || !slug) {
        return res.status(400).json({ error: "missing_fields" });
    }
    const control = getControlClient();
    const tenant = await control.tenant.create({
        data: {
            name,
            slug,
            plan,
            is_active: true,
        },
    });
    return res.json({ tenant });
});

// PATCH /api/superadmin/tenants/:id
router.patch("/tenants/:id", requireAuth, requireSuperAdmin, async (req, res) => {
    const updates = {};
    if (req.body?.name) {
        updates.name = req.body.name.trim();
    }
    if (req.body?.slug) {
        updates.slug = req.body.slug.trim();
    }
    if (req.body?.plan !== undefined) {
        updates.plan = req.body.plan ? String(req.body.plan).trim() : null;
    }
    if (req.body?.is_active !== undefined) {
        updates.is_active = Boolean(req.body.is_active);
    }
    const control = getControlClient();
    const tenant = await control.tenant.update({
        where: { id: req.params.id },
        data: updates,
    });
    return res.json({ tenant });
});

// POST /api/superadmin/tenants/:id/database
router.post("/tenants/:id/database", requireAuth, requireSuperAdmin, async (req, res) => {
    const dbUrl = (req.body?.db_url || "").trim();
    if (!dbUrl) {
        return res.status(400).json({ error: "missing_db_url" });
    }
    const control = getControlClient();
    const record = await control.tenantDatabase.upsert({
        where: { tenant_id: req.params.id },
        update: {
            db_url_encrypted: encryptString(dbUrl),
        },
        create: {
            tenant_id: req.params.id,
            db_url_encrypted: encryptString(dbUrl),
        },
    });
    clearTenantDbCache(req.params.id);
    return res.json({ tenant_database: { tenant_id: record.tenant_id } });
});

// POST /api/superadmin/tenants/:id/impersonate
router.post("/tenants/:id/impersonate", requireAuth, requireSuperAdmin, async (req, res) => {
    const tenantId = req.params.id;
    const tenantContext = await resolveTenantContextById(tenantId);
    if (!tenantContext) {
        return res.status(403).json({ error: "tenant_not_ready" });
    }
    const rawEmail = req.user?.email || "superadmin@perzivalh.local";
    const email = rawEmail.toLowerCase().trim();
    let tenantUser = await tenantContext.prisma.user.findUnique({
        where: { email },
    });
    if (!tenantUser) {
        const password = crypto.randomBytes(24).toString("hex");
        const passwordHash = await bcrypt.hash(password, 10);
        tenantUser = await tenantContext.prisma.user.create({
            data: {
                name: req.user?.name || "Superadmin",
                email,
                password_hash: passwordHash,
                role: "admin",
                is_active: true,
            },
        });
    } else if (!tenantUser.is_active) {
        tenantUser = await tenantContext.prisma.user.update({
            where: { id: tenantUser.id },
            data: { is_active: true },
        });
    }

    const token = signUser({
        id: tenantUser.id,
        email: tenantUser.email,
        name: tenantUser.name,
        role: tenantUser.role,
        tenant_id: tenantId,
    });
    return res.json({
        token,
        user: {
            id: tenantUser.id,
            name: tenantUser.name,
            email: tenantUser.email,
            role: tenantUser.role,
        },
        tenant_id: tenantId,
    });
});

// ==========================================
// CHANNELS
// ==========================================

// GET /api/superadmin/channels
router.get("/channels", requireAuth, requireSuperAdmin, async (req, res) => {
    const tenantId = req.query.tenant_id;
    const control = getControlClient();
    const channels = await control.channel.findMany({
        where: tenantId ? { tenant_id: tenantId } : undefined,
        orderBy: { created_at: "desc" },
    });
    return res.json({
        id: channel.id,
        tenant_id: channel.tenant_id,
        provider: channel.provider,
        phone_number_id: channel.phone_number_id,
        display_name: channel.display_name || null,
        waba_id: channel.waba_id || null,
        is_active: channel.is_active,
        is_default: channel.is_default,
        created_at: channel.created_at,
    })),
    });
});

// POST /api/superadmin/channels
router.post("/channels", requireAuth, requireSuperAdmin, async (req, res) => {
    const tenantId = req.body?.tenant_id;
    const phoneNumberId = (req.body?.phone_number_id || "").trim();
    const displayName = (req.body?.display_name || "").trim();
    const wabaId = (req.body?.waba_id || "").trim();
    const verifyToken = (req.body?.verify_token || "").trim();
    const waToken = (req.body?.wa_token || "").trim();
    const appSecret = (req.body?.app_secret || "").trim();
    if (!tenantId || !phoneNumberId || !verifyToken || !waToken) {
        return res.status(400).json({ error: "missing_fields" });
    }
    const control = getControlClient();
    const channel = await control.channel.create({
        data: {
            tenant_id: tenantId,
            provider: "whatsapp",
            phone_number_id: phoneNumberId,
            display_name: displayName || null,
            waba_id: wabaId || null,
            verify_token: verifyToken,
            wa_token_encrypted: encryptString(waToken),
            app_secret_encrypted: appSecret ? encryptString(appSecret) : null,
            is_active: req.body.is_active !== undefined ? Boolean(req.body.is_active) : true,
            is_default: req.body.is_default !== undefined ? Boolean(req.body.is_default) : false,
        },
    });

    // If marked as default, unset others
    if (channel.is_default) {
        await control.channel.updateMany({
            where: {
                tenant_id: tenantId,
                id: { not: channel.id },
            },
            data: { is_default: false },
        });
    }

    // Audit log
    await control.auditLogControl.create({
        data: {
            tenant_id: tenantId,
            user_id: req.user?.id,
            action: "create_channel",
            data_json: {
                channel_id: channel.id,
                phone_number_id: channel.phone_number_id,
            },
        },
    });

    clearChannelCache(channel.phone_number_id);
    return res.json({
        channel: {
            id: channel.id,
            tenant_id: channel.tenant_id,
            provider: channel.provider,
            phone_number_id: channel.phone_number_id,
            display_name: channel.display_name || null,
            waba_id: channel.waba_id || null,
            is_active: channel.is_active,
            is_default: channel.is_default,
            created_at: channel.created_at,
        },
    });
});

// PATCH /api/superadmin/channels/:id
router.patch("/channels/:id", requireAuth, requireSuperAdmin, async (req, res) => {
    const updates = {};
    if (req.body?.phone_number_id) {
        updates.phone_number_id = String(req.body.phone_number_id).trim();
    }
    if (req.body?.display_name !== undefined) {
        const raw = String(req.body.display_name || "").trim();
        updates.display_name = raw || null;
    }
    if (req.body?.verify_token) {
        updates.verify_token = String(req.body.verify_token).trim();
    }
    if (req.body?.wa_token) {
        updates.wa_token_encrypted = encryptString(String(req.body.wa_token).trim());
    }
    if (req.body?.waba_id !== undefined) {
        const raw = String(req.body.waba_id || "").trim();
        updates.waba_id = raw || null;
    }
    if (req.body?.app_secret !== undefined) {
        const raw = String(req.body.app_secret || "").trim();
        updates.app_secret_encrypted = raw ? encryptString(raw) : null;
    }
    if (req.body?.is_active !== undefined) {
        updates.is_active = Boolean(req.body.is_active);
    }
    if (req.body?.is_default !== undefined) {
        updates.is_default = Boolean(req.body.is_default);
    }
    const control = getControlClient();
    const existing = await control.channel.findUnique({
        where: { id: req.params.id },
    });
    const channel = await control.channel.update({
        where: { id: req.params.id },
        data: updates,
    });

    // If marked as default, unset others
    if (updates.is_default === true) {
        await control.channel.updateMany({
            where: {
                tenant_id: channel.tenant_id,
                id: { not: channel.id },
            },
            data: { is_default: false },
        });
    }

    if (existing?.phone_number_id) {
        clearChannelCache(existing.phone_number_id);
    }
    clearChannelCache(channel.phone_number_id);

    // Audit log
    await control.auditLogControl.create({
        data: {
            tenant_id: channel.tenant_id,
            user_id: req.user?.id,
            action: "update_channel",
            data_json: {
                channel_id: channel.id,
                updates: Object.keys(updates),
            },
        },
    });

    return res.json({
        channel: {
            id: channel.id,
            tenant_id: channel.tenant_id,
            provider: channel.provider,
            phone_number_id: channel.phone_number_id,
            display_name: channel.display_name || null,
            waba_id: channel.waba_id || null,
            is_active: channel.is_active,
            is_default: channel.is_default,
            created_at: channel.created_at,
        },
    });
});

// DELETE /api/superadmin/channels/:id
router.delete("/channels/:id", requireAuth, requireSuperAdmin, async (req, res) => {
    const control = getControlClient();
    const existing = await control.channel.findUnique({
        where: { id: req.params.id },
    });
    if (!existing) {
        return res.status(404).json({ error: "channel_not_found" });
    }

    await control.channel.delete({
        where: { id: req.params.id },
    });

    if (existing.phone_number_id) {
        clearChannelCache(existing.phone_number_id);
    }

    // Audit log
    await control.auditLogControl.create({
        data: {
            tenant_id: existing.tenant_id,
            user_id: req.user?.id,
            action: "delete_channel",
            data_json: {
                channel_id: existing.id,
                phone_number_id: existing.phone_number_id,
            },
        },
    });

    return res.json({ success: true });
});

// ==========================================
// BRANDING
// ==========================================

// GET /api/superadmin/branding
router.get("/branding", requireAuth, requireSuperAdmin, async (req, res) => {
    const tenantId = req.query.tenant_id;
    if (!tenantId) {
        return res.status(400).json({ error: "missing_tenant" });
    }
    const control = getControlClient();
    const branding = await control.branding.findUnique({
        where: { tenant_id: tenantId },
    });
    return res.json({ branding });
});

// PATCH /api/superadmin/branding
router.patch("/branding", requireAuth, requireSuperAdmin, async (req, res) => {
    const tenantId = req.body?.tenant_id;
    const brandName = (req.body?.brand_name || "").trim();
    if (!tenantId || !brandName) {
        return res.status(400).json({ error: "missing_fields" });
    }
    const control = getControlClient();
    const branding = await control.branding.upsert({
        where: { tenant_id: tenantId },
        update: {
            brand_name: brandName,
            logo_url: req.body?.logo_url || null,
            colors: req.body?.colors || null,
            timezone: req.body?.timezone || null,
        },
        create: {
            tenant_id: tenantId,
            brand_name: brandName,
            logo_url: req.body?.logo_url || null,
            colors: req.body?.colors || null,
            timezone: req.body?.timezone || null,
        },
    });
    return res.json({ branding });
});

// ==========================================
// ODOO CONFIG
// ==========================================

// GET /api/superadmin/odoo
router.get("/odoo", requireAuth, requireSuperAdmin, async (req, res) => {
    const tenantId = req.query.tenant_id;
    if (!tenantId) {
        return res.status(400).json({ error: "missing_tenant" });
    }
    const control = getControlClient();
    const record = await control.odooConfig.findUnique({
        where: { tenant_id: tenantId },
    });
    if (!record) {
        return res.json({ odoo: null });
    }
    return res.json({
        odoo: {
            tenant_id: record.tenant_id,
            base_url: record.base_url,
            db_name: record.db_name,
            username: record.username,
            created_at: record.created_at,
        },
    });
});

// PATCH /api/superadmin/odoo
router.patch("/odoo", requireAuth, requireSuperAdmin, async (req, res) => {
    const tenantId = req.body?.tenant_id;
    const baseUrl = (req.body?.base_url || "").trim();
    const dbName = (req.body?.db_name || "").trim();
    const username = (req.body?.username || "").trim();
    const password = (req.body?.password || "").trim();
    if (!tenantId) {
        return res.status(400).json({ error: "missing_tenant" });
    }
    const control = getControlClient();
    const existing = await control.odooConfig.findUnique({
        where: { tenant_id: tenantId },
    });
    if (!existing) {
        if (!baseUrl || !dbName || !username || !password) {
            return res.status(400).json({ error: "missing_fields" });
        }
        const created = await control.odooConfig.create({
            data: {
                tenant_id: tenantId,
                base_url: baseUrl,
                db_name: dbName,
                username,
                password_encrypted: encryptString(password),
            },
        });
        clearOdooConfigCache(tenantId);
        return res.json({
            odoo: {
                tenant_id: created.tenant_id,
                base_url: created.base_url,
                db_name: created.db_name,
                username: created.username,
                created_at: created.created_at,
            },
        });
    }
    const updates = {};
    if (baseUrl) {
        updates.base_url = baseUrl;
    }
    if (dbName) {
        updates.db_name = dbName;
    }
    if (username) {
        updates.username = username;
    }
    if (password) {
        updates.password_encrypted = encryptString(password);
    }
    const updated = await control.odooConfig.update({
        where: { tenant_id: tenantId },
        data: updates,
    });
    clearOdooConfigCache(tenantId);
    return res.json({
        odoo: {
            tenant_id: updated.tenant_id,
            base_url: updated.base_url,
            db_name: updated.db_name,
            username: updated.username,
            created_at: updated.created_at,
        },
    });
});

// ==========================================
// BOTS / FLOWS
// ==========================================

// GET /api/superadmin/flows
// Lista todos los flows disponibles desde la carpeta flows/
router.get("/flows", requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const { getFlowsList } = require("../../../flows");
        const flows = getFlowsList();
        return res.json({ flows });
    } catch (error) {
        logger.error("Error loading flows", { message: error.message });
        return res.status(500).json({ error: "flows_load_error" });
    }
});

// GET /api/superadmin/tenant-bots
// Lista bots asignados a un tenant
router.get("/tenant-bots", requireAuth, requireSuperAdmin, async (req, res) => {
    const tenantId = req.query.tenant_id;
    if (!tenantId) {
        return res.status(400).json({ error: "missing_tenant_id" });
    }
    const control = getControlClient();
    const tenantBots = await control.tenantBot.findMany({
        where: { tenant_id: tenantId },
        orderBy: { created_at: "desc" },
    });

    // Enriquecer con metadata de flows
    const { getFlow } = require("../../../flows");
    const enriched = tenantBots.map((tb) => {
        const flow = getFlow(tb.flow_id);
        return {
            id: tb.id,
            tenant_id: tb.tenant_id,
            flow_id: tb.flow_id,
            is_active: tb.is_active,
            config: tb.config,
            created_at: tb.created_at,
            updated_at: tb.updated_at,
            flow_name: flow?.name || tb.flow_id,
            flow_description: flow?.description || "",
            flow_icon: flow?.icon || "🤖",
        };
    });

    return res.json({ tenant_bots: enriched });
});

// POST /api/superadmin/tenant-bots
// Asigna un flow a un tenant
router.post("/tenant-bots", requireAuth, requireSuperAdmin, async (req, res) => {
    const tenantId = req.body?.tenant_id;
    const flowId = req.body?.flow_id;
    const config = req.body?.config || null;

    if (!tenantId || !flowId) {
        return res.status(400).json({ error: "missing_fields" });
    }

    // Verificar que el flow existe
    const { getFlow } = require("../../../flows");
    const flow = getFlow(flowId);
    if (!flow) {
        return res.status(400).json({ error: "flow_not_found" });
    }

    const control = getControlClient();
    try {
        const tenantBot = await control.tenantBot.create({
            data: {
                tenant_id: tenantId,
                flow_id: flowId,
                is_active: true,
                config,
            },
        });

        return res.json({
            tenant_bot: {
                id: tenantBot.id,
                tenant_id: tenantBot.tenant_id,
                flow_id: tenantBot.flow_id,
                is_active: tenantBot.is_active,
                config: tenantBot.config,
                created_at: tenantBot.created_at,
                flow_name: flow.name,
                flow_icon: flow.icon,
            },
        });
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(400).json({ error: "flow_already_assigned" });
        }
        throw error;
    }
});

// PATCH /api/superadmin/tenant-bots/:id
// Actualiza estado o config de un bot asignado
router.patch("/tenant-bots/:id", requireAuth, requireSuperAdmin, async (req, res) => {
    const updates = {};

    if (req.body?.is_active !== undefined) {
        updates.is_active = Boolean(req.body.is_active);
    }
    if (req.body?.config !== undefined) {
        updates.config = req.body.config;
    }

    const control = getControlClient();
    const tenantBot = await control.tenantBot.update({
        where: { id: req.params.id },
        data: updates,
    });

    const { getFlow } = require("../../../flows");
    const flow = getFlow(tenantBot.flow_id);

    return res.json({
        tenant_bot: {
            id: tenantBot.id,
            tenant_id: tenantBot.tenant_id,
            flow_id: tenantBot.flow_id,
            is_active: tenantBot.is_active,
            config: tenantBot.config,
            updated_at: tenantBot.updated_at,
            flow_name: flow?.name || tenantBot.flow_id,
            flow_icon: flow?.icon || "🤖",
        },
    });
});

// DELETE /api/superadmin/tenant-bots/:id
// Elimina un bot de un tenant
router.delete("/tenant-bots/:id", requireAuth, requireSuperAdmin, async (req, res) => {
    const control = getControlClient();
    await control.tenantBot.delete({
        where: { id: req.params.id },
    });
    return res.json({ success: true });
});

module.exports = router;
module.exports.requireSuperAdmin = requireSuperAdmin;
