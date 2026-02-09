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

    // Previous period active (approximation based on created_at)
    const prevActiveConversations = await prisma.conversation.count({
      where: {
        ...channelWhere,
        status: { in: ["open", "pending"] },
        created_at: { lt: prevEndDate },
      },
    });

    // ========== UNIQUE CONTACTS ==========
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
    const avgFirstReplyRaw = await prisma.$queryRaw`
            WITH pending AS (
                SELECT (data_json->>'conversation_id') AS conversation_id,
                       MIN(created_at) AS pending_at
                FROM "AuditLog"
                WHERE action = 'conversation.status_changed'
                  AND data_json->>'status' = 'pending'
                  AND created_at >= ${startDate}
                GROUP BY data_json->>'conversation_id'
            ),
            first_reply AS (
                SELECT m.conversation_id,
                       MIN(m.created_at) AS reply_at
                FROM "Message" m
                WHERE m.direction = 'out'
                  AND m.created_at >= ${startDate}
                GROUP BY m.conversation_id
            )
            SELECT AVG(EXTRACT(EPOCH FROM (fr.reply_at - p.pending_at))) AS avg_seconds
            FROM pending p
            JOIN first_reply fr ON fr.conversation_id = p.conversation_id
            WHERE fr.reply_at > p.pending_at
        `;

    const avgFirstReplyPrevRaw = await prisma.$queryRaw`
            WITH pending AS (
                SELECT (data_json->>'conversation_id') AS conversation_id,
                       MIN(created_at) AS pending_at
                FROM "AuditLog"
                WHERE action = 'conversation.status_changed'
                  AND data_json->>'status' = 'pending'
                  AND created_at >= ${prevStartDate}
                  AND created_at < ${prevEndDate}
                GROUP BY data_json->>'conversation_id'
            ),
            first_reply AS (
                SELECT m.conversation_id,
                       MIN(m.created_at) AS reply_at
                FROM "Message" m
                WHERE m.direction = 'out'
                  AND m.created_at >= ${prevStartDate}
                  AND m.created_at < ${prevEndDate}
                GROUP BY m.conversation_id
            )
            SELECT AVG(EXTRACT(EPOCH FROM (fr.reply_at - p.pending_at))) AS avg_seconds
            FROM pending p
            JOIN first_reply fr ON fr.conversation_id = p.conversation_id
            WHERE fr.reply_at > p.pending_at
        `;

    const avgResponseSeconds = avgFirstReplyRaw?.[0]?.avg_seconds
      ? Number(avgFirstReplyRaw[0].avg_seconds)
      : null;
    const avgResponseSecondsPrev = avgFirstReplyPrevRaw?.[0]?.avg_seconds
      ? Number(avgFirstReplyPrevRaw[0].avg_seconds)
      : null;
    const avgResponseMinutes = avgResponseSeconds ? avgResponseSeconds / 60 : null;
    const avgResponseMinutesPrev = avgResponseSecondsPrev ? avgResponseSecondsPrev / 60 : null;

    // ========== MESSAGE VOLUME BY DAY ==========
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

    const messageVolume = (messageVolumeRaw || []).map((row) => ({
      day: row.day ? row.day.toISOString().split("T")[0] : null,
      in_count: Number(row.in_count || 0),
      out_count: Number(row.out_count || 0),
    }));

    // ========== OPERATOR RANKINGS ==========
    // Get operators who resolved conversations (changed status to closed or took pending)
    const operatorStatsRaw = await prisma.$queryRaw`
            SELECT 
                u.id,
                u.name,
                u.role,
                COUNT(DISTINCT CASE 
                    WHEN al.action = 'conversation.assigned' 
                    AND al.created_at >= ${startDate}
                    THEN al.data_json->>'conversation_id' 
                END) as resolved,
                (
                    SELECT COUNT(*) 
                    FROM "Conversation" c 
                    WHERE c.assigned_user_id = u.id 
                    AND c.status IN ('open', 'pending')
                ) as pending
            FROM "User" u
            LEFT JOIN "AuditLog" al ON al.user_id = u.id
            WHERE u.is_active = true
            AND u.role != 'admin'
            GROUP BY u.id, u.name, u.role
            ORDER BY resolved DESC
            LIMIT 10
        `;

    const operators = (operatorStatsRaw || []).map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      resolved: Number(row.resolved || 0),
      pending: Number(row.pending || 0),
    }));

    // ========== TEAM EFFICIENCY ==========
    const totalResolved = await prisma.auditLog.count({
      where: {
        action: "conversation.assigned",
        created_at: { gte: startDate },
      },
    });

    const totalPending = await prisma.conversation.count({
      where: {
        ...channelWhere,
        status: "pending",
      },
    });

    const dailyGoal = 500;
    const efficiency = totalResolved > 0
      ? Math.min(100, Math.round((totalResolved / (totalResolved + totalPending)) * 100))
      : 0;

    // ========== CONVERSION RATE (messages that led to resolution) ==========
    const totalConversationsClosed = await prisma.conversation.count({
      where: {
        ...channelWhere,
        status: "closed",
        last_message_at: { gte: startDate },
      },
    });

    const totalConversationsAll = await prisma.conversation.count({
      where: {
        ...channelWhere,
        last_message_at: { gte: startDate },
      },
    });

    const conversionRate = totalConversationsAll > 0
      ? Number(((totalConversationsClosed / totalConversationsAll) * 100).toFixed(1))
      : 0;

    // Previous period conversion
    const totalConversationsClosedPrev = await prisma.conversation.count({
      where: {
        ...channelWhere,
        status: "closed",
        last_message_at: { gte: prevStartDate, lt: prevEndDate },
      },
    });

    const totalConversationsAllPrev = await prisma.conversation.count({
      where: {
        ...channelWhere,
        last_message_at: { gte: prevStartDate, lt: prevEndDate },
      },
    });

    const conversionRatePrev = totalConversationsAllPrev > 0
      ? Number(((totalConversationsClosedPrev / totalConversationsAllPrev) * 100).toFixed(1))
      : 0;

    // ========== BUILD RESPONSE ==========
    return res.json({
      period,
      active_conversations: {
        value: activeConversations,
        change: calcChange(activeConversations, prevActiveConversations),
      },
      avg_response_time: {
        value: avgResponseMinutes ? Number(avgResponseMinutes.toFixed(1)) : null,
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
      daily_goal: dailyGoal,
      resolved_today: totalResolved,
    });
  } catch (error) {
    console.error("[dashboard.metrics] Error:", error);
    return res.status(500).json({ error: "metrics_failed" });
  }
});

// GET /api/dashboard/report - Generate PDF report
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

    const operatorStatsRaw = await prisma.$queryRaw`
            SELECT 
                u.id,
                u.name,
                u.role,
                COUNT(DISTINCT CASE 
                    WHEN al.action = 'conversation.assigned' 
                    AND al.created_at >= ${startDate}
                    THEN al.data_json->>'conversation_id' 
                END) as resolved,
                (
                    SELECT COUNT(*) 
                    FROM "Conversation" c 
                    WHERE c.assigned_user_id = u.id 
                    AND c.status IN ('open', 'pending')
                ) as pending
            FROM "User" u
            LEFT JOIN "AuditLog" al ON al.user_id = u.id
            WHERE u.is_active = true
            AND u.role != 'admin'
            GROUP BY u.id, u.name, u.role
            ORDER BY resolved DESC
            LIMIT 10
        `;

    const operators = (operatorStatsRaw || []).map((row) => ({
      name: row.name,
      role: row.role,
      resolved: Number(row.resolved || 0),
      pending: Number(row.pending || 0),
    }));

    // Generate simple text-based report (CSV format for easy download)
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
    console.error("[dashboard.report] Error:", error);
    return res.status(500).json({ error: "report_generation_failed" });
  }
});

module.exports = router;
