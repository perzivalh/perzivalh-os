/**
 * Rutas de dashboard y métricas
 */
const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/auth");
const prisma = require("../db");

// GET /api/dashboard/metrics
router.get("/dashboard/metrics", requireAuth, async (req, res) => {
    const statusCountsRaw = await prisma.conversation.groupBy({
        by: ["status"],
        _count: { status: true },
    });

    const statusCounts = statusCountsRaw.map((item) => ({
        ...item,
        count: Number(item._count?.status || 0),
    }));

    const messageVolume = await prisma.message.count({
        where: {
            created_at: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
        },
    });

    const topTagsRaw = await prisma.$queryRaw`
    SELECT t.name, COUNT(*) as count
    FROM "ConversationTag" ct
    JOIN "Tag" t ON t.id = ct.tag_id
    GROUP BY t.name
    ORDER BY count DESC
    LIMIT 10
  `;

    const topTags = (topTagsRaw || []).map((row) => ({
        ...row,
        count: Number(row.count || 0),
    }));

    const avgFirstReplyRaw = await prisma.$queryRaw`
    WITH pending AS (
      SELECT (data_json->>'conversation_id') AS conversation_id,
             MIN(created_at) AS pending_at
      FROM "AuditLog"
      WHERE action = 'conversation.status_changed'
        AND data_json->>'status' = 'pending'
      GROUP BY data_json->>'conversation_id'
    ),
    first_reply AS (
      SELECT m.conversation_id,
             MIN(m.created_at) AS reply_at
      FROM "Message" m
      WHERE m.direction = 'out'
      GROUP BY m.conversation_id
    )
    SELECT AVG(EXTRACT(EPOCH FROM (fr.reply_at - p.pending_at))) AS avg_seconds
    FROM pending p
    JOIN first_reply fr ON fr.conversation_id = p.conversation_id
    WHERE fr.reply_at > p.pending_at
  `;

    const avgFirstReplySeconds = avgFirstReplyRaw?.[0]?.avg_seconds ?? null;

    return res.json({
        status_counts: statusCounts,
        message_volume: messageVolume,
        top_tags: topTags,
        avg_first_reply_seconds:
            avgFirstReplySeconds !== null && avgFirstReplySeconds !== undefined
                ? Number(avgFirstReplySeconds)
                : null,
    });
});

module.exports = router;
