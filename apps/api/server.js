/**
 * Server.js - Entry Point Refactorizado
 * 
 * Este archivo es ahora el punto de entrada mínimo que:
 * 1. Configura Express y middleware
 * 2. Configura Socket.IO
 * 3. Monta las rutas modulares
 * 4. Inicia el servidor
 * 
 * Toda la lógica de rutas está en src/routes/
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");

// Configuración
const { PORT, FRONTEND_ORIGINS, isAllowedOrigin } = require("./src/config");
const { ROLE_OPTIONS, DEFAULT_ROLE_PERMISSIONS } = require("./src/config/roles");

// Servicios y utilidades
const prisma = require("./src/db");
const logger = require("./src/lib/logger");
const { verifyToken } = require("./src/lib/auth");
const { setSocketServer } = require("./src/realtime");
const {
    getControlClient,
    disconnectControlClient,
} = require("./src/control/controlClient");
const { disconnectAllTenantClients } = require("./src/tenancy/tenantPrismaManager");
const { hasOdooConfig, getSessionInfo } = require("./src/services/odooClient");
const { resolveTenantContextById } = require("./src/tenancy/tenantResolver");
const { sendTemplate } = require("./src/whatsapp");

// Rutas modulares
const { setupRoutes } = require("./src/routes");

// Servicios de campañas (para el interval)
const { queueCampaignMessages, buildConversationFilter } = require("./src/routes/admin");
const { CAMPAIGN_BATCH_SIZE, CAMPAIGN_INTERVAL_MS } = require("./src/config");

// ==========================================
// CONFIGURACIÓN DE EXPRESS
// ==========================================

const app = express();
app.set("trust proxy", 1);

// CORS
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

// JSON parser con rawBody para webhook signature
app.use(
    express.json({
        verify: (req, res, buf) => {
            req.rawBody = buf.toString("utf8");
        },
    })
);

// ==========================================
// SERVIDOR HTTP Y SOCKET.IO
// ==========================================

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: FRONTEND_ORIGINS.includes("*") ? "*" : FRONTEND_ORIGINS,
        credentials: true,
    },
});

// Autenticación de Socket.IO
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
            tenant_id: payload.tenant_id || null,
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

// ==========================================
// INICIALIZACIÓN
// ==========================================

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

// Verificar conexión Odoo al inicio
void (async () => {
    try {
        if (await hasOdooConfig()) {
            const sessionInfo = await getSessionInfo();
            if (sessionInfo?.uid) {
                logger.info("odoo.session_ready", sessionInfo);
            }
        }
    } catch (error) {
        logger.warn("odoo.session_check_failed", {
            message: error.message || error,
        });
    }
})();

// ==========================================
// MONTAR RUTAS
// ==========================================

setupRoutes(app);

// ==========================================
// PROCESAMIENTO DE CAMPAÑAS
// ==========================================

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

async function processCampaignQueue(tenantId) {
    const { resolveChannelByPhoneNumberId } = require("./src/tenancy/tenantResolver");

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
            if (!message.phone_number_id) {
                await prisma.campaignMessage.update({
                    where: { id: message.id },
                    data: {
                        status: "failed",
                        error_json: { error: "missing_phone_number_id" },
                    },
                });
                processedCampaigns.add(message.campaign_id);
                continue;
            }
            const channelConfig = await resolveChannelByPhoneNumberId(
                message.phone_number_id
            );
            if (!channelConfig || channelConfig.tenantId !== tenantId) {
                await prisma.campaignMessage.update({
                    where: { id: message.id },
                    data: {
                        status: "failed",
                        error_json: { error: "missing_channel" },
                    },
                });
                processedCampaigns.add(message.campaign_id);
                continue;
            }
            const result = await sendTemplate(
                message.wa_id,
                template.name,
                template.language,
                [],
                { channel: channelConfig }
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

async function processCampaignQueueForAllTenants() {
    if (!process.env.CONTROL_DB_URL) {
        return;
    }
    try {
        const control = getControlClient();
        const tenants = await control.tenant.findMany({
            where: { is_active: true },
            select: { id: true },
        });
        for (const tenant of tenants) {
            const context = await resolveTenantContextById(tenant.id);
            if (!context) {
                continue;
            }
            await prisma.runWithPrisma(context.prisma, () =>
                processCampaignQueue(context.tenantId)
            );
        }
    } catch (error) {
        logger.error("campaign.tenant_scan_failed", {
            message: error.message || error,
        });
    }
}

setInterval(() => {
    void processCampaignQueueForAllTenants();
}, CAMPAIGN_INTERVAL_MS);

// ==========================================
// ERROR HANDLER
// ==========================================

// Log CORS config on startup
logger.info("cors.config", { FRONTEND_ORIGINS, allowAll: FRONTEND_ORIGINS.includes("*") });

app.use((err, req, res, next) => {
    // Always set CORS headers on errors
    const origin = req.headers.origin;
    if (origin && (FRONTEND_ORIGINS.includes("*") || isAllowedOrigin(origin))) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    if (err instanceof SyntaxError && err.type === "entity.parse.failed") {
        const timestamp = new Date().toISOString();
        logger.error("webhook.parse_error", {
            timestamp,
            message: err.message,
            raw: req.rawBody || "",
        });
        return res.status(400).send("INVALID_JSON");
    }

    // Log all unhandled errors
    logger.error("unhandled_error", {
        message: err.message,
        stack: err.stack,
        path: req.path,
    });

    return res.status(500).json({ error: "internal_error", message: err.message });
});

// ==========================================
// SHUTDOWN GRACEFUL
// ==========================================

let shutdownRegistered = false;

function registerShutdown() {
    if (shutdownRegistered) {
        return;
    }
    shutdownRegistered = true;
    const handler = async (signal) => {
        logger.info("server.shutdown", { signal });
        try {
            await disconnectAllTenantClients();
            await disconnectControlClient();
        } catch (error) {
            logger.error("server.shutdown_error", { message: error.message || error });
        }
        server.close(() => {
            process.exit(0);
        });
    };
    process.on("SIGINT", handler);
    process.on("SIGTERM", handler);
}

// ==========================================
// START
// ==========================================

function start(port = PORT) {
    registerShutdown();
    server.listen(port, () => {
        logger.info("server.listen", { port });
    });
    return server;
}

if (require.main === module) {
    start();
}

module.exports = {
    app,
    server,
    start,
};
