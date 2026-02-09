/**
 * Rutas de dashboard y métricas - Dashboard Funcional
 */
const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/auth");
const prisma = require("../db");

/**
 * Get date range based on period
 */
function getDateRange(period) {
  const now = new Date();
  let startDate;
  let prevStartDate;
  let prevEndDate;

  switch (period) {
    case "24h":
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      prevEndDate = startDate;
      prevStartDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      prevEndDate = startDate;
      prevStartDate = new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      prevEndDate = startDate;
      prevStartDate = new Date(startDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }

  return { now, startDate, prevStartDate, prevEndDate };
}

/**
 * Calculate percentage change
 */
function calcChange(current, previous) {
  if (previous === 0 || previous === null) {
    return current > 0 ? 100 : 0;
  }
  return Number(((current - previous) / previous * 100).toFixed(1));
}

// GET /api/dashboard/metrics
router.get("/dashboard/metrics", requireAuth, async (req, res) => {
  try {
    const period = req.query.period || "30d";
    const channel = req.query.channel || null;
    const { now, startDate, prevStartDate, prevEndDate } = getDateRange(period);

    // Base where clause for channel filtering
    const channelWhere = channel ? { phone_number_id: channel } : {};

    // ========== ACTIVE CONVERSATIONS ==========
    const activeConversations = await prisma.conversation.count({
      where: {
        ...channelWhere,
        status: { in: ["open", "pending"] },
      },
    });

    const prevActiveConversations = await prisma.conversation.count({
      where: {
        ...channelWhere,
        status: { in: ["open", "pending"] },
        created_at: { lt: prevEndDate },
      },
    });

    // ========== UNIQUE CONTACTS (new conversations in period) ==========
    const uniqueContactsCurrent = await prisma.conversation.count({
      where: {
        ...channelWhere,
        created_at: { gte: startDate },
      },
    });

    const uniqueContactsPrev = await prisma.conversation.count({
      where: {
        ...channelWhere,
        created_at: { gte: prevStartDate, lt: prevEndDate },
      },
    });

    // ========== AVERAGE RESPONSE TIME ==========
    // Simplified: get average time between first in and first out message per conversation
    let avgResponseMinutes = null;
    let avgResponseMinutesPrev = null;

    try {
      const avgResponseRaw = await prisma.$queryRaw`
                WITH first_messages AS (
                    SELECT 
                        conversation_id,
                        MIN(CASE WHEN direction = 'in' THEN created_at END) as first_in,
                        MIN(CASE WHEN direction = 'out' THEN created_at END) as first_out
                    FROM "Message"
                    WHERE created_at >= ${startDate}
                    GROUP BY conversation_id
                    HAVING MIN(CASE WHEN direction = 'out' THEN created_at END) IS NOT NULL
                       AND MIN(CASE WHEN direction = 'in' THEN created_at END) IS NOT NULL
                )
                SELECT AVG(EXTRACT(EPOCH FROM (first_out - first_in)) / 60) as avg_minutes
                FROM first_messages
                WHERE first_out > first_in
            `;
      avgResponseMinutes = avgResponseRaw?.[0]?.avg_minutes
        ? Number(Number(avgResponseRaw[0].avg_minutes).toFixed(1))
        : null;
    } catch (e) {
      console.error("[dashboard] avg_response query error:", e.message);
    }

    try {
      const avgResponsePrevRaw = await prisma.$queryRaw`
                WITH first_messages AS (
                    SELECT 
                        conversation_id,
                        MIN(CASE WHEN direction = 'in' THEN created_at END) as first_in,
                        MIN(CASE WHEN direction = 'out' THEN created_at END) as first_out
                    FROM "Message"
                    WHERE created_at >= ${prevStartDate} AND created_at < ${prevEndDate}
                    GROUP BY conversation_id
                    HAVING MIN(CASE WHEN direction = 'out' THEN created_at END) IS NOT NULL
                       AND MIN(CASE WHEN direction = 'in' THEN created_at END) IS NOT NULL
                )
                SELECT AVG(EXTRACT(EPOCH FROM (first_out - first_in)) / 60) as avg_minutes
                FROM first_messages
                WHERE first_out > first_in
            `;
      avgResponseMinutesPrev = avgResponsePrevRaw?.[0]?.avg_minutes
        ? Number(Number(avgResponsePrevRaw[0].avg_minutes).toFixed(1))
        : null;
    } catch (e) {
      console.error("[dashboard] avg_response_prev query error:", e.message);
    }

    // ========== MESSAGE VOLUME BY DAY ==========
    let messageVolume = [];
    try {
      const messageVolumeRaw = await prisma.$queryRaw`
                SELECT 
                    DATE(created_at) as day,
                    COUNT(*) FILTER (WHERE direction = 'in') as in_count,
                    COUNT(*) FILTER (WHERE direction = 'out') as out_count
                FROM "Message"
                WHERE created_at >= ${startDate}
                GROUP BY DATE(created_at)
                ORDER BY day ASC
            `;
      messageVolume = (messageVolumeRaw || []).map((row) => ({
        day: row.day ? row.day.toISOString().split("T")[0] : null,
        in_count: Number(row.in_count || 0),
        out_count: Number(row.out_count || 0),
      }));
    } catch (e) {
      console.error("[dashboard] message_volume query error:", e.message);
    }

    // ========== OPERATOR RANKINGS ==========
    // Get operators with their assigned conversation counts
    let operators = [];
    try {
      const operatorStatsRaw = await prisma.$queryRaw`
                SELECT 
                    u.id,
                    u.name,
                    u.role,
                    COUNT(DISTINCT CASE WHEN c.status = 'closed' THEN c.id END) as resolved,
                    COUNT(DISTINCT CASE WHEN c.status IN ('open', 'pending') THEN c.id END) as pending
                FROM "User" u
                LEFT JOIN "Conversation" c ON c.assigned_user_id = u.id
                WHERE u.is_active = true
                  AND u.role != 'admin'
                GROUP BY u.id, u.name, u.role
                ORDER BY resolved DESC
                LIMIT 10
            `;
      operators = (operatorStatsRaw || []).map((row) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        resolved: Number(row.resolved || 0),
        pending: Number(row.pending || 0),
      }));
    } catch (e) {
      console.error("[dashboard] operators query error:", e.message);
    }

    // ========== TEAM EFFICIENCY ==========
    const totalClosed = await prisma.conversation.count({
      where: {
        ...channelWhere,
        status: "closed",
      },
    });

    const totalPending = await prisma.conversation.count({
      where: {
        ...channelWhere,
        status: "pending",
      },
    });

    const totalOpen = await prisma.conversation.count({
      where: {
        ...channelWhere,
        status: "open",
      },
    });

    const totalAll = totalClosed + totalPending + totalOpen;
    const efficiency = totalAll > 0
      ? Math.round((totalClosed / totalAll) * 100)
      : 0;

    // ========== CONVERSION RATE ==========
    const totalConversationsInPeriod = await prisma.conversation.count({
      where: {
        ...channelWhere,
        last_message_at: { gte: startDate },
      },
    });

    const closedInPeriod = await prisma.conversation.count({
      where: {
        ...channelWhere,
        status: "closed",
        last_message_at: { gte: startDate },
      },
    });

    const conversionRate = totalConversationsInPeriod > 0
      ? Number(((closedInPeriod / totalConversationsInPeriod) * 100).toFixed(1))
      : 0;

    // Previous period conversion
    const totalConversationsInPrevPeriod = await prisma.conversation.count({
      where: {
        ...channelWhere,
        last_message_at: { gte: prevStartDate, lt: prevEndDate },
      },
    });

    const closedInPrevPeriod = await prisma.conversation.count({
      where: {
        ...channelWhere,
        status: "closed",
        last_message_at: { gte: prevStartDate, lt: prevEndDate },
      },
    });

    const conversionRatePrev = totalConversationsInPrevPeriod > 0
      ? Number(((closedInPrevPeriod / totalConversationsInPrevPeriod) * 100).toFixed(1))
      : 0;

    // ========== BUILD RESPONSE ==========
    return res.json({
      period,
      active_conversations: {
        value: activeConversations,
        change: calcChange(activeConversations, prevActiveConversations),
      },
      avg_response_time: {
        value: avgResponseMinutes,
        change: avgResponseMinutes && avgResponseMinutesPrev
          ? Number((avgResponseMinutes - avgResponseMinutesPrev).toFixed(1))
          : null,
        unit: "min",
      },
      unique_contacts: {
        value: uniqueContactsCurrent,
        change: calcChange(uniqueContactsCurrent, uniqueContactsPrev),
      },
      conversion_rate: {
        value: conversionRate,
        change: Number((conversionRate - conversionRatePrev).toFixed(1)),
      },
      message_volume: messageVolume,
      operators,
      team_efficiency: efficiency,
      daily_goal: 500,
      resolved_today: totalClosed,
    });
  } catch (error) {
    console.error("[dashboard.metrics] Error:", error.message, error.stack);
    return res.status(500).json({ error: "metrics_failed", details: error.message });
  }
});

// GET /api/dashboard/report - Generate report
router.get("/dashboard/report", requireAuth, async (req, res) => {
  try {
    const period = req.query.period || "30d";
    const channel = req.query.channel || null;
    const { startDate } = getDateRange(period);

    // Get metrics data
    const channelWhere = channel ? { phone_number_id: channel } : {};

    const activeConversations = await prisma.conversation.count({
      where: { ...channelWhere, status: { in: ["open", "pending"] } },
    });

    const uniqueContacts = await prisma.conversation.count({
      where: { ...channelWhere, created_at: { gte: startDate } },
    });

    const totalMessages = await prisma.message.count({
      where: { created_at: { gte: startDate } },
    });

    let operators = [];
    try {
      const operatorStatsRaw = await prisma.$queryRaw`
                SELECT 
                    u.id,
                    u.name,
                    u.role,
                    COUNT(DISTINCT CASE WHEN c.status = 'closed' THEN c.id END) as resolved,
                    COUNT(DISTINCT CASE WHEN c.status IN ('open', 'pending') THEN c.id END) as pending
                FROM "User" u
                LEFT JOIN "Conversation" c ON c.assigned_user_id = u.id
                WHERE u.is_active = true
                  AND u.role != 'admin'
                GROUP BY u.id, u.name, u.role
                ORDER BY resolved DESC
                LIMIT 10
            `;
      operators = (operatorStatsRaw || []).map((row) => ({
        name: row.name,
        role: row.role,
        resolved: Number(row.resolved || 0),
        pending: Number(row.pending || 0),
      }));
    } catch (e) {
      console.error("[dashboard.report] operators query error:", e.message);
    }

    // Generate simple text-based report
    const periodLabels = {
      "24h": "Últimas 24 horas",
      "7d": "Última semana",
      "30d": "Último mes",
    };

    const reportDate = new Date().toISOString().split("T")[0];
    const reportContent = [
      `REPORTE DE DASHBOARD - ${reportDate}`,
      `Periodo: ${periodLabels[period] || period}`,
      ``,
      `=== METRICAS GENERALES ===`,
      `Conversaciones Activas: ${activeConversations}`,
      `Contactos Únicos: ${uniqueContacts}`,
      `Total de Mensajes: ${totalMessages}`,
      ``,
      `=== RANKING DE OPERADORES ===`,
      `Nombre,Rol,Resueltos,Pendientes`,
      ...operators.map((op) => `${op.name},${op.role},${op.resolved},${op.pending}`),
      ``,
      `Generado el: ${new Date().toLocaleString("es-BO")}`,
    ].join("\n");

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="reporte-dashboard-${reportDate}.txt"`);
    return res.send(reportContent);
  } catch (error) {
    console.error("[dashboard.report] Error:", error.message);
    return res.status(500).json({ error: "report_generation_failed" });
  }
});

module.exports = router;
