/**
 * Service: Bot Metrics
 * Calculates performance metrics for tenant bots
 */
const { getTenantContext } = require("../tenancy/tenantContext");
const prisma = require("../db");

async function getBotMetrics(tenantId) {
    // Definir rangos de tiempo
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfDay);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    // Obtener contexto del tenant para consultas directas si es necesario,
    // o usar el prisma global pasando el tenantId si las tablas son compartidas.
    // Asumimos tablas compartidas con tenant_id O queries en shard especifico.
    // El sistema actual usa shards? tenantContext.prisma.

    // Vamos a usar tenantContext.prisma para consultar Conversations del shard
    // PERO tenantBots están en control plane. Las métricas (conversaciones) están en tenant DB.

    // Necesitamos el prisma del tenant actual
    const tenantContext = getTenantContext();
    if (!tenantContext || !tenantContext.prisma) {
        throw new Error("Tenant context not available for metrics");
    }

    const db = tenantContext.prisma;

    // 1. Interacciones (Sesiones iniciadas)
    const sessionsToday = await db.conversation.count({
        where: {
            created_at: { gte: startOfDay },
        }
    });

    const sessionsYesterday = await db.conversation.count({
        where: {
            created_at: { gte: startOfYesterday, lt: startOfDay },
        }
    });

    // Calcular cambio porcentual
    let interactionsChange = 0;
    if (sessionsYesterday > 0) {
        interactionsChange = Math.round(((sessionsToday - sessionsYesterday) / sessionsYesterday) * 100);
    } else if (sessionsToday > 0) {
        interactionsChange = 100;
    }

    // 2. Errores (Log de errores o conversaciones fallidas)
    // Por ahora simulado o basado en tags 'error' si existen
    const errorsToday = 0; // Placeholder until error logging is in db

    // 3. Resolución (Conversaciones abiertas vs pendientes/asignadas)
    const openToday = await db.conversation.count({
        where: {
            created_at: { gte: startOfDay },
            status: "open"
        }
    });

    let resolutionRate = 0;
    if (sessionsToday > 0) {
        resolutionRate = Math.round((openToday / sessionsToday) * 100);
    }

    return {
        interactions: {
            value: sessionsToday,
            change: interactionsChange,
            label: "vs ayer"
        },
        resolution: {
            value: resolutionRate,
            target: 85
        },
        uptime: {
            value: "100%", // Always ON logic for now
            status: "SLA NORMAL"
        },
        errors: {
            value: errorsToday,
            critical: 0,
            status: errorsToday > 5 ? "Revisar" : "Estable"
        }
    };
}

module.exports = {
    getBotMetrics
};
