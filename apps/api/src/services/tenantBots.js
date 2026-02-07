/**
 * Service: Tenant Bot Management
 * Consulta y gestiona los bots asignados a un tenant desde el control plane
 */
const { getControlClient } = require("../control/controlClient");
const { getFlow } = require("../../flows");
const { decryptString } = require("../core/crypto");

function normalizeConfigForRuntime(config) {
    if (!config || typeof config !== "object") {
        return config;
    }
    const next = { ...config };
    if (next.ai && next.ai.key_encrypted) {
        try {
            next.ai = {
                ...next.ai,
                key: decryptString(next.ai.key_encrypted),
            };
        } catch (error) {
            next.ai = { ...next.ai };
        }
    }
    return next;
}

function sanitizeConfigForUi(config) {
    if (!config || typeof config !== "object") {
        return config;
    }
    const next = { ...config };
    if (next.ai) {
        const { key_encrypted, key, ...rest } = next.ai;
        next.ai = {
            ...rest,
            key_present: Boolean(key_encrypted || key),
        };
    }
    return next;
}

/**
 * Obtiene el flow activo para un tenant
 * @param {string} tenantId - ID del tenant
 * @returns {Object|null} - Flow activo o null si no hay ninguno activo
 */
async function getActiveTenantFlow(tenantId) {
    if (!tenantId) {
        return null;
    }

    const control = getControlClient();

    // Buscar el primer bot activo del tenant
    const tenantBot = await control.tenantBot.findFirst({
        where: {
            tenant_id: tenantId,
            is_active: true,
        },
        orderBy: {
            updated_at: "desc", // El mas recientemente activado primero
        },
    });

    if (!tenantBot) {
        return null;
    }

    // Cargar el flow desde la carpeta flows/
    const flow = getFlow(tenantBot.flow_id);
    if (!flow) {
        console.warn(`Flow ${tenantBot.flow_id} not found for tenant ${tenantId}`);
        return null;
    }

    return {
        tenantBotId: tenantBot.id,
        flowId: tenantBot.flow_id,
        config: normalizeConfigForRuntime(tenantBot.config),
        flow,
    };
}

/**
 * Obtiene todos los bots de un tenant con sus flows
 * @param {string} tenantId - ID del tenant
 * @returns {Array} - Lista de bots con metadata de flow
 */
async function getTenantBots(tenantId) {
    if (!tenantId) {
        return [];
    }

    const control = getControlClient();

    const tenantBots = await control.tenantBot.findMany({
        where: { tenant_id: tenantId },
        orderBy: { created_at: "asc" },
    });

    return tenantBots.map((tb) => {
        const flow = getFlow(tb.flow_id);
        return {
            id: tb.id,
            flow_id: tb.flow_id,
            is_active: tb.is_active,
            config: sanitizeConfigForUi(tb.config),
            created_at: tb.created_at,
            updated_at: tb.updated_at,
            flow_name: flow?.name || tb.flow_id,
            flow_description: flow?.description || "",
            flow_icon: flow?.icon || "🤖",
        };
    });
}

/**
 * Actualiza el estado de un bot para un tenant
 * @param {string} tenantBotId - ID del TenantBot
 * @param {boolean} isActive - Nuevo estado
 */
async function updateTenantBotStatus(tenantBotId, isActive) {
    const control = getControlClient();

    if (!isActive) {
        return control.tenantBot.update({
            where: { id: tenantBotId },
            data: { is_active: false },
        });
    }

    const current = await control.tenantBot.findUnique({
        where: { id: tenantBotId },
        select: { id: true, tenant_id: true },
    });

    if (!current) {
        return null;
    }

    await control.tenantBot.updateMany({
        where: {
            tenant_id: current.tenant_id,
            is_active: true,
            id: { not: current.id },
        },
        data: { is_active: false },
    });

    return control.tenantBot.update({
        where: { id: tenantBotId },
        data: { is_active: true },
    });
}

module.exports = {
    getActiveTenantFlow,
    getTenantBots,
    updateTenantBotStatus,
};
