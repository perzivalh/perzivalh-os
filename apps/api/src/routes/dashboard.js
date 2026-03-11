/**
 * Dashboard routes
 * - KPI metrics
 * - Operational table (paginated)
 * - Export payload for filtered table
 */
const express = require("express");
const { Prisma } = require("@prisma/client-tenant");

const router = express.Router();

const { requireAuth, requireModulePermission } = require("../middleware/auth");
const prisma = require("../db");
const { getControlClient } = require("../control/controlClient");
const { updateConversationFlags } = require("../services/conversations");

const EXPORT_MAX_ROWS = 5000;
const TABLE_PAGE_SIZE_DEFAULT = 25;
const TABLE_PAGE_SIZE_MAX = 100;
const PERIOD_VALUES = new Set(["24h", "7d", "30d"]);
const CALL_SIGNAL_PHRASES = [
  "asesor",
  "asesora",
  "recepcion",
  "recepción",
  "humano",
  "hablar con alguien",
  "hablar con una persona",
  "llamar",
  "llamada",
];

function sanitizePeriod(period) {
  const value = String(period || "30d");
  if (PERIOD_VALUES.has(value)) {
    return value;
  }
  return "30d";
}

function getDateRange(periodRaw) {
  const period = sanitizePeriod(periodRaw);
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

  return {
    period,
    now,
    startDate,
    prevStartDate,
    prevEndDate,
  };
}

function calcChange(current, previous) {
  if (previous === 0 || previous === null) {
    return current > 0 ? 100 : 0;
  }
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function toNumber(value) {
  if (value === null || value === undefined) {
    return 0;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function parseBooleanFilter(raw) {
  const normalized = String(raw || "").toLowerCase();
  if (["yes", "si", "sí", "true", "1"].includes(normalized)) {
    return true;
  }
  if (["no", "false", "0"].includes(normalized)) {
    return false;
  }
  return null;
}

function buildWindowWhere({ start, end, channel, dateField = "last_message_at" }) {
  const base = channel ? { phone_number_id: channel } : {};
  const range = end ? { gte: start, lt: end } : { gte: start };

  if (dateField === "created_at") {
    return {
      ...base,
      created_at: range,
    };
  }

  return {
    ...base,
    OR: [
      { [dateField]: range },
      {
        [dateField]: null,
        created_at: range,
      },
    ],
  };
}

function buildCallSignalCondition() {
  return {
    direction: "in",
    OR: CALL_SIGNAL_PHRASES.map((phrase) => ({
      text: { contains: phrase, mode: "insensitive" },
    })),
  };
}

function buildLineLabel(line) {
  if (!line) {
    return null;
  }
  return line.line_number || line.display_name || line.phone_number_id || null;
}

function buildPatientDisplayName(name) {
  const raw = String(name || "").normalize("NFC");
  const cleaned = raw
    .replace(/[^\p{L}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "[sin nombre]";
}

async function getLineMetadataMap(user) {
  const map = new Map();
  if (!process.env.CONTROL_DB_URL || !user?.tenant_id) {
    return map;
  }

  try {
    const control = getControlClient();
    const channels = await control.channel.findMany({
      where: {
        tenant_id: user.tenant_id,
        provider: "whatsapp",
      },
      select: {
        phone_number_id: true,
        display_name: true,
        line_number: true,
      },
    });

    for (const channel of channels) {
      if (!channel?.phone_number_id) {
        continue;
      }
      map.set(channel.phone_number_id, {
        phone_number_id: channel.phone_number_id,
        display_name: channel.display_name || null,
        line_number: channel.line_number || null,
        label: buildLineLabel(channel),
      });
    }
  } catch (error) {
    // If control DB is unavailable for a tenant, table still works with phone_number_id.
  }

  return map;
}

async function findConversationIdsHandledByOperator(operatorId) {
  const normalizedOperatorId = String(operatorId || "").trim();
  if (!normalizedOperatorId) {
    return [];
  }

  const [messageRows, auditRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT DISTINCT m.conversation_id
      FROM "Message" m
      WHERE m.direction = 'out'
        AND COALESCE(
          NULLIF(m.raw_json->>'source', ''),
          NULLIF(m.raw_json->'meta'->>'source', '')
        ) = 'panel'
        AND COALESCE(
          NULLIF(m.raw_json->>'by_user_id', ''),
          NULLIF(m.raw_json->'meta'->>'by_user_id', '')
        ) = ${normalizedOperatorId}
    `,
    prisma.$queryRaw`
      SELECT DISTINCT (a.data_json->>'conversation_id') AS conversation_id
      FROM "AuditLog" a
      WHERE a.action = 'conversation.assigned'
        AND COALESCE(
          NULLIF(a.data_json->>'to', ''),
          NULLIF(a.data_json->>'by_user_id', ''),
          a.user_id
        ) = ${normalizedOperatorId}
        AND COALESCE(a.data_json->>'conversation_id', '') <> ''
    `,
  ]);

  return [...new Set(
    [...(messageRows || []), ...(auditRows || [])]
      .map((row) => row?.conversation_id)
      .filter(Boolean)
  )];
}

async function getConversationOperatorHistoryMap(conversationIds) {
  if (!Array.isArray(conversationIds) || !conversationIds.length) {
    return new Map();
  }

  const historyRows = await prisma.$queryRaw`
    SELECT
      event.conversation_id,
      event.user_id,
      event.created_at
    FROM (
      SELECT
        m.conversation_id,
        COALESCE(
          NULLIF(m.raw_json->>'by_user_id', ''),
          NULLIF(m.raw_json->'meta'->>'by_user_id', '')
        ) AS user_id,
        m.created_at
      FROM "Message" m
      WHERE m.conversation_id = ANY(${conversationIds})
        AND m.direction = 'out'
        AND COALESCE(
          NULLIF(m.raw_json->>'source', ''),
          NULLIF(m.raw_json->'meta'->>'source', '')
        ) = 'panel'

      UNION ALL

      SELECT
        (a.data_json->>'conversation_id') AS conversation_id,
        COALESCE(
          NULLIF(a.data_json->>'to', ''),
          NULLIF(a.data_json->>'by_user_id', ''),
          a.user_id
        ) AS user_id,
        a.created_at
      FROM "AuditLog" a
      WHERE a.action = 'conversation.assigned'
        AND (a.data_json->>'conversation_id') = ANY(${conversationIds})
    ) AS event
    WHERE COALESCE(event.user_id, '') <> ''
    ORDER BY event.conversation_id ASC, event.created_at ASC
  `;

  const userIds = [...new Set((historyRows || []).map((row) => row?.user_id).filter(Boolean))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const userNameById = new Map(users.map((user) => [user.id, user.name]));
  const historyByConversation = new Map();

  for (const row of historyRows || []) {
    const conversationId = row?.conversation_id;
    const userId = row?.user_id || null;
    if (!conversationId || !userId) {
      continue;
    }
    const current = historyByConversation.get(conversationId) || [];
    if (current.some((entry) => entry.id === userId)) {
      continue;
    }
    current.push({
      id: userId,
      name: userNameById.get(userId) || null,
      created_at: row.created_at || null,
    });
    historyByConversation.set(conversationId, current);
  }

  return historyByConversation;
}

function buildConversationOrderBy(sortByRaw, sortOrderRaw) {
  const sortBy = String(sortByRaw || "date").toLowerCase();
  const sortOrder = String(sortOrderRaw || "desc").toLowerCase() === "asc" ? "asc" : "desc";

  switch (sortBy) {
    case "patient":
      return [{ display_name: sortOrder }, { created_at: "desc" }];
    case "number":
      return [{ phone_e164: sortOrder }, { created_at: "desc" }];
    case "operator":
      return [{ assigned_user_id: sortOrder }, { created_at: "desc" }];
    case "line":
      return [{ phone_number_id: sortOrder }, { created_at: "desc" }];
    case "tag":
      return [{ primary_tag_id: sortOrder }, { created_at: "desc" }];
    case "date":
    default:
      return [{ created_at: sortOrder }];
  }
}

function parsePageSize(raw, fallback = TABLE_PAGE_SIZE_DEFAULT) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), TABLE_PAGE_SIZE_MAX);
}

function parsePage(raw) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }
  return Math.floor(parsed);
}

async function queryAverageResponseMinutes({ from, to, channel }) {
  const toFilter = to ? Prisma.sql`AND m.created_at < ${to}` : Prisma.empty;
  const channelFilter = channel ? Prisma.sql`AND c.phone_number_id = ${channel}` : Prisma.empty;

  const rows = await prisma.$queryRaw`
    WITH first_messages AS (
      SELECT
        m.conversation_id,
        MIN(CASE WHEN m.direction = 'in' THEN m.created_at END) AS first_in,
        MIN(CASE WHEN m.direction = 'out' THEN m.created_at END) AS first_out
      FROM "Message" m
      JOIN "Conversation" c ON c.id = m.conversation_id
      WHERE m.created_at >= ${from}
      ${toFilter}
      ${channelFilter}
      GROUP BY m.conversation_id
      HAVING
        MIN(CASE WHEN m.direction = 'in' THEN m.created_at END) IS NOT NULL
        AND MIN(CASE WHEN m.direction = 'out' THEN m.created_at END) IS NOT NULL
    )
    SELECT AVG(EXTRACT(EPOCH FROM (first_out - first_in)) / 60) AS avg_minutes
    FROM first_messages
    WHERE first_out > first_in
  `;

  const value = rows?.[0]?.avg_minutes;
  if (value === null || value === undefined) {
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return null;
  }
  return Number(num.toFixed(1));
}

async function queryMessageVolume({ from, to, channel }) {
  const channelFilter = channel ? Prisma.sql`AND c.phone_number_id = ${channel}` : Prisma.empty;
  const rows = await prisma.$queryRaw`
    SELECT
      DATE(m.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz') AS day,
      COUNT(*) FILTER (WHERE m.direction = 'in') AS in_count,
      COUNT(*) FILTER (WHERE m.direction = 'out') AS out_count
    FROM "Message" m
    JOIN "Conversation" c ON c.id = m.conversation_id
    WHERE m.created_at >= ${from}
      AND m.created_at < ${to}
      ${channelFilter}
    GROUP BY DATE(m.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz')
    ORDER BY day ASC
  `;

  return (rows || []).map((row) => ({
    day: row.day ? row.day.toISOString().split("T")[0] : null,
    in_count: toNumber(row.in_count),
    out_count: toNumber(row.out_count),
  }));
}

async function queryOperatorRanking({ from, to, channel }) {
  const channelFilter = channel ? Prisma.sql`AND c.phone_number_id = ${channel}` : Prisma.empty;
  const rows = await prisma.$queryRaw`
    SELECT
      u.id,
      u.name,
      u.role,
      COUNT(DISTINCT CASE WHEN c.status = 'closed' THEN c.id END) AS resolved,
      COUNT(DISTINCT CASE WHEN c.status IN ('open', 'pending', 'assigned') THEN c.id END) AS pending
    FROM "User" u
    LEFT JOIN "Conversation" c
      ON c.assigned_user_id = u.id
      AND c.last_message_at >= ${from}
      AND c.last_message_at < ${to}
      ${channelFilter}
    WHERE u.is_active = true
      AND u.role != 'admin'
    GROUP BY u.id, u.name, u.role
    ORDER BY resolved DESC, pending DESC, u.name ASC
    LIMIT 10
  `;

  return (rows || []).map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    resolved: toNumber(row.resolved),
    pending: toNumber(row.pending),
  }));
}

async function buildDashboardMetrics({ period, channel }) {
  const {
    period: normalizedPeriod,
    now,
    startDate,
    prevStartDate,
    prevEndDate,
  } = getDateRange(period);

  const currentWindowWhere = buildWindowWhere({
    start: startDate,
    end: now,
    channel,
    dateField: "last_message_at",
  });
  const prevWindowWhere = buildWindowWhere({
    start: prevStartDate,
    end: prevEndDate,
    channel,
    dateField: "last_message_at",
  });
  const createdCurrentWhere = buildWindowWhere({
    start: startDate,
    end: now,
    channel,
    dateField: "created_at",
  });
  const createdPrevWhere = buildWindowWhere({
    start: prevStartDate,
    end: prevEndDate,
    channel,
    dateField: "created_at",
  });

  const [
    activeConversations,
    prevActiveConversations,
    uniqueContactsCurrent,
    uniqueContactsPrev,
    avgResponseMinutes,
    avgResponseMinutesPrev,
    messageVolume,
    operators,
    closedInPeriod,
    pendingInPeriod,
    openInPeriod,
    totalConversationsInPeriod,
    totalConversationsInPrevPeriod,
    closedInPrevPeriod,
    statusCounts,
  ] = await Promise.all([
    prisma.conversation.count({
      where: {
        ...currentWindowWhere,
        status: { in: ["open", "pending", "assigned"] },
      },
    }),
    prisma.conversation.count({
      where: {
        ...prevWindowWhere,
        status: { in: ["open", "pending", "assigned"] },
      },
    }),
    prisma.conversation.count({
      where: createdCurrentWhere,
    }),
    prisma.conversation.count({
      where: createdPrevWhere,
    }),
    queryAverageResponseMinutes({
      from: startDate,
      to: now,
      channel,
    }),
    queryAverageResponseMinutes({
      from: prevStartDate,
      to: prevEndDate,
      channel,
    }),
    queryMessageVolume({
      from: startDate,
      to: now,
      channel,
    }),
    queryOperatorRanking({
      from: startDate,
      to: now,
      channel,
    }),
    prisma.conversation.count({
      where: {
        ...currentWindowWhere,
        status: "closed",
      },
    }),
    prisma.conversation.count({
      where: {
        ...currentWindowWhere,
        status: "pending",
      },
    }),
    prisma.conversation.count({
      where: {
        ...currentWindowWhere,
        status: { in: ["open", "assigned"] },
      },
    }),
    prisma.conversation.count({
      where: currentWindowWhere,
    }),
    prisma.conversation.count({
      where: prevWindowWhere,
    }),
    prisma.conversation.count({
      where: {
        ...prevWindowWhere,
        status: "closed",
      },
    }),
    prisma.conversation.groupBy({
      by: ["status"],
      where: currentWindowWhere,
      _count: { status: true },
    }),
  ]);

  const totalEffWindow = closedInPeriod + pendingInPeriod + openInPeriod;
  const efficiency = totalEffWindow > 0
    ? Math.round((closedInPeriod / totalEffWindow) * 100)
    : 0;

  const conversionRate = totalConversationsInPeriod > 0
    ? Number(((closedInPeriod / totalConversationsInPeriod) * 100).toFixed(1))
    : 0;
  const conversionRatePrev = totalConversationsInPrevPeriod > 0
    ? Number(((closedInPrevPeriod / totalConversationsInPrevPeriod) * 100).toFixed(1))
    : 0;

  return {
    period: normalizedPeriod,
    active_conversations: {
      value: activeConversations,
      change: calcChange(activeConversations, prevActiveConversations),
    },
    avg_response_time: {
      value: avgResponseMinutes,
      change: avgResponseMinutes !== null && avgResponseMinutesPrev !== null
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
    resolved_today: closedInPeriod,
    status_counts: statusCounts || [],
  };
}

async function buildDashboardTablePayload({
  user,
  query,
  exportMode = false,
}) {
  const dateRange = getDateRange(query.period);
  const period = dateRange.period;
  const startDate = dateRange.startDate;
  const endDate = dateRange.now;
  const channel = query.channel ? String(query.channel).trim() : "";
  const search = String(query.search || "").trim();
  const tag = String(query.tag || "").trim();
  const operatorId = String(query.operator_id || "").trim();
  const messageFilter = parseBooleanFilter(query.message);
  const callFilter = parseBooleanFilter(query.call);
  const orderBy = buildConversationOrderBy(query.sort_by, query.sort_order);

  const page = exportMode ? 1 : parsePage(query.page);
  const pageSize = exportMode
    ? EXPORT_MAX_ROWS
    : parsePageSize(query.page_size, TABLE_PAGE_SIZE_DEFAULT);

  const lineMetadataMap = await getLineMetadataMap(user);
  const where = {
    created_at: {
      gte: startDate,
      lt: endDate,
    },
    ...(channel ? { phone_number_id: channel } : {}),
  };
  const andConditions = [];

  if (tag) {
    andConditions.push({
      tags: {
        some: {
          tag: {
            name: { equals: tag, mode: "insensitive" },
          },
        },
      },
    });
  }

  if (operatorId) {
    if (operatorId === "unassigned") {
      andConditions.push({ assigned_user_id: null });
    } else {
      const historicalConversationIds = await findConversationIdsHandledByOperator(operatorId);
      andConditions.push({
        OR: [
          { assigned_user_id: operatorId },
          ...(historicalConversationIds.length ? [{ id: { in: historicalConversationIds } }] : []),
        ],
      });
    }
  }

  if (messageFilter === true) {
    andConditions.push({
      messages: {
        some: { direction: "out" },
      },
    });
  } else if (messageFilter === false) {
    andConditions.push({
      messages: {
        none: { direction: "out" },
      },
    });
  }

  const callSignalCondition = buildCallSignalCondition();
  if (callFilter === true) {
    andConditions.push({
      messages: {
        some: callSignalCondition,
      },
    });
  } else if (callFilter === false) {
    andConditions.push({
      messages: {
        none: callSignalCondition,
      },
    });
  }

  if (search) {
    const matchedLineIds = [];
    const searchLc = search.toLowerCase();
    for (const [lineId, lineMeta] of lineMetadataMap.entries()) {
      const haystack = [
        lineMeta?.label || "",
        lineMeta?.display_name || "",
        lineMeta?.line_number || "",
        lineId || "",
      ]
        .join(" ")
        .toLowerCase();
      if (haystack.includes(searchLc)) {
        matchedLineIds.push(lineId);
      }
    }

    where.OR = [
      { display_name: { contains: search, mode: "insensitive" } },
      { phone_e164: { contains: search } },
      { wa_id: { contains: search } },
      {
        tags: {
          some: {
            tag: { name: { contains: search, mode: "insensitive" } },
          },
        },
      },
      {
        assigned_user: {
          is: {
            name: { contains: search, mode: "insensitive" },
          },
        },
      },
      { phone_number_id: { contains: search } },
      ...(matchedLineIds.length ? [{ phone_number_id: { in: matchedLineIds } }] : []),
    ];
  }

  if (andConditions.length) {
    where.AND = andConditions;
  }

  const [total, conversations] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        display_name: true,
        wa_id: true,
        phone_e164: true,
        created_at: true,
        phone_number_id: true,
        assigned_user: {
          select: { id: true, name: true },
        },
        primary_tag: {
          select: { name: true },
        },
        tags: {
          orderBy: { created_at: "desc" },
          select: {
            tag: {
              select: { name: true },
            },
          },
        },
        remarketing: true,
        asistio: true,
      },
    }),
  ]);

  const conversationIds = conversations.map((conversation) => conversation.id);
  const [outboundRows, callRows, operatorHistoryMap] = await Promise.all([
    conversationIds.length
      ? prisma.message.findMany({
        where: {
          conversation_id: { in: conversationIds },
          direction: "out",
        },
        select: { conversation_id: true },
        distinct: ["conversation_id"],
      })
      : [],
    conversationIds.length
      ? prisma.message.findMany({
        where: {
          conversation_id: { in: conversationIds },
          ...callSignalCondition,
        },
        select: { conversation_id: true },
        distinct: ["conversation_id"],
      })
      : [],
    getConversationOperatorHistoryMap(conversationIds),
  ]);

  const outboundSet = new Set(outboundRows.map((row) => row.conversation_id));
  const callSet = new Set(callRows.map((row) => row.conversation_id));

  const rows = conversations.map((conversation) => {
    const allTagNames = (conversation.tags || [])
      .map((t) => t.tag?.name)
      .filter(Boolean);
    const lineId = conversation.phone_number_id || null;
    const lineMeta = lineId ? (lineMetadataMap.get(lineId) || null) : null;
    const phone = conversation.phone_e164 || conversation.wa_id || "-";
    const historicalOperators = operatorHistoryMap.get(conversation.id) || [];
    const mergedOperators = [...historicalOperators];
    if (
      conversation.assigned_user?.id &&
      !mergedOperators.some((entry) => entry.id === conversation.assigned_user.id)
    ) {
      mergedOperators.push({
        id: conversation.assigned_user.id,
        name: conversation.assigned_user.name || null,
        created_at: null,
      });
    }
    const latestOperator = mergedOperators[mergedOperators.length - 1] || null;
    const operatorDisplay = mergedOperators
      .map((operator) => operator?.name)
      .filter(Boolean)
      .join(", ") || null;

    return {
      id: conversation.id,
      patient: conversation.display_name || phone,
      patient_display: buildPatientDisplayName(conversation.display_name),
      number: phone,
      date: conversation.created_at,
      call: callSet.has(conversation.id),
      message: outboundSet.has(conversation.id),
      tags: allTagNames,
      tag: allTagNames[0] || null,
      operator: latestOperator?.name || conversation.assigned_user?.name || null,
      operator_id: latestOperator?.id || conversation.assigned_user?.id || null,
      operators: mergedOperators.map((operator) => ({
        id: operator.id,
        name: operator.name || null,
      })),
      operator_display: operatorDisplay,
      line: lineMeta?.label || lineId || null,
      line_id: lineId,
      remarketing: conversation.remarketing ?? false,
      asistio: conversation.asistio ?? false,
    };
  });

  const hasMore = !exportMode && page * pageSize < total;
  const truncated = exportMode && total > rows.length;

  return {
    period,
    total,
    page,
    page_size: pageSize,
    has_more: hasMore,
    rows,
    truncated,
    limit: exportMode ? pageSize : null,
    filters_applied: {
      channel: channel || null,
      search: search || null,
      tag: tag || null,
      operator_id: operatorId || null,
      message: messageFilter,
      call: callFilter,
      sort_by: String(query.sort_by || "date"),
      sort_order: String(query.sort_order || "desc"),
    },
  };
}

// GET /api/dashboard/metrics
router.get("/dashboard/metrics", requireAuth, requireModulePermission("dashboard", "read"), async (req, res) => {
  try {
    const period = req.query.period || "30d";
    const channel = req.query.channel ? String(req.query.channel).trim() : "";
    const payload = await buildDashboardMetrics({
      period,
      channel: channel || null,
    });
    return res.json(payload);
  } catch (error) {
    console.error("[dashboard.metrics] Error:", error.message, error.stack);
    return res.status(500).json({ error: "metrics_failed", details: error.message });
  }
});

// GET /api/dashboard/table
router.get("/dashboard/table", requireAuth, requireModulePermission("dashboard", "read"), async (req, res) => {
  try {
    const payload = await buildDashboardTablePayload({
      user: req.user,
      query: req.query || {},
      exportMode: false,
    });
    return res.json(payload);
  } catch (error) {
    console.error("[dashboard.table] Error:", error.message, error.stack);
    return res.status(500).json({ error: "dashboard_table_failed", details: error.message });
  }
});

// GET /api/dashboard/table/export
router.get("/dashboard/table/export", requireAuth, requireModulePermission("dashboard", "read"), async (req, res) => {
  try {
    const payload = await buildDashboardTablePayload({
      user: req.user,
      query: req.query || {},
      exportMode: true,
    });
    return res.json(payload);
  } catch (error) {
    console.error("[dashboard.table.export] Error:", error.message, error.stack);
    return res.status(500).json({ error: "dashboard_export_failed", details: error.message });
  }
});

// GET /api/dashboard/report - text report download
router.get("/dashboard/report", requireAuth, requireModulePermission("dashboard", "read"), async (req, res) => {
  try {
    const period = req.query.period || "30d";
    const channel = req.query.channel ? String(req.query.channel).trim() : "";
    const metrics = await buildDashboardMetrics({
      period,
      channel: channel || null,
    });

    const periodLabels = {
      "24h": "Últimas 24 horas",
      "7d": "Última semana",
      "30d": "Último mes",
    };
    const reportDate = new Date().toISOString().split("T")[0];
    const reportContent = [
      `REPORTE DE DASHBOARD - ${reportDate}`,
      `Periodo: ${periodLabels[metrics.period] || metrics.period}`,
      `Línea: ${channel || "Todas"}`,
      "",
      "=== METRICAS GENERALES ===",
      `Conversaciones Activas: ${metrics.active_conversations.value}`,
      `Contactos Únicos: ${metrics.unique_contacts.value}`,
      `Tiempo de respuesta promedio: ${metrics.avg_response_time.value ?? "-"} min`,
      `Tasa de conversión: ${metrics.conversion_rate.value}%`,
      "",
      "=== RANKING DE OPERADORES ===",
      "Nombre,Rol,Resueltos,Pendientes",
      ...(metrics.operators || []).map(
        (operator) => `${operator.name},${operator.role},${operator.resolved},${operator.pending}`
      ),
      "",
      `Generado el: ${new Date().toLocaleString("es-BO")}`,
    ].join("\n");

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="reporte-dashboard-${reportDate}.txt"`);
    return res.send(reportContent);
  } catch (error) {
    console.error("[dashboard.report] Error:", error.message, error.stack);
    return res.status(500).json({ error: "report_generation_failed", details: error.message });
  }
});

// PATCH /api/dashboard/table/row/:id — actualizar remarketing
router.patch("/dashboard/table/row/:id", requireAuth, requireModulePermission("dashboard", "read"), async (req, res) => {
  const { id } = req.params;
  const remarketing = req.body?.remarketing;
  const asistio = req.body?.asistio;
  if (typeof remarketing !== "boolean" && typeof asistio !== "boolean") {
    return res.status(400).json({ error: "invalid_flags" });
  }
  try {
    await updateConversationFlags({
      conversationId: id,
      remarketing,
      asistio,
      userId: req.user.id,
    });
    return res.json({ ok: true });
  } catch (error) {
    console.error("[dashboard.table.row.patch] Error:", error.message);
    return res.status(500).json({ error: "update_failed" });
  }
});

module.exports = router;
