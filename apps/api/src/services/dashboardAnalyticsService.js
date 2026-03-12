const { Prisma } = require("@prisma/client-tenant");
const prisma = require("../db");
const { getControlClient } = require("../control/controlClient");
const { getActiveTenantFlow } = require("./tenantBots");

const PERIOD_VALUES = new Set(["24h", "7d", "30d"]);

function sanitizePeriod(period) {
  const value = String(period || "30d");
  return PERIOD_VALUES.has(value) ? value : "30d";
}

function getDateRange(periodRaw) {
  const period = sanitizePeriod(periodRaw);
  const now = new Date();
  let startDate;
  switch (period) {
    case "24h":
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }
  return { period, now, startDate };
}

function toNumber(value) {
  if (value === null || value === undefined) {
    return 0;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function roundMinutes(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(1)) : null;
}

function minutesBetween(from, to) {
  if (!from || !to) {
    return null;
  }
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    return null;
  }
  return roundMinutes((toMs - fromMs) / 60000);
}

function formatDayKey(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().split("T")[0];
}

function fillDailySeries(rows, from, to) {
  const byDay = new Map(
    (rows || [])
      .filter((row) => row?.day)
      .map((row) => [row.day, row])
  );
  const cursor = new Date(from);
  const end = new Date(to);
  cursor.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const series = [];
  while (cursor <= end) {
    const day = formatDayKey(cursor);
    const row = byDay.get(day) || null;
    series.push({
      day,
      in_count: row?.in_count || 0,
      human_out_count: row?.human_out_count || 0,
      bot_out_count: row?.bot_out_count || 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return series;
}

function percentile(values, pct) {
  if (!Array.isArray(values) || !values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return roundMinutes(sorted[index]);
}

function average(values) {
  if (!Array.isArray(values) || !values.length) {
    return null;
  }
  return roundMinutes(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function extractMessageSource(rawJson) {
  if (!rawJson || typeof rawJson !== "object") {
    return null;
  }
  return rawJson.source || rawJson?.meta?.source || null;
}

function extractMessageByUserId(rawJson) {
  if (!rawJson || typeof rawJson !== "object") {
    return null;
  }
  return rawJson.by_user_id || rawJson?.meta?.by_user_id || null;
}

function isHumanPanelMessage(message) {
  return (
    message?.direction === "out" &&
    message?.type !== "note" &&
    extractMessageSource(message.raw_json) === "panel" &&
    Boolean(extractMessageByUserId(message.raw_json))
  );
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
        AND m.type <> 'note'

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

async function getConversationHumanAnchorMap(conversationIds) {
  const anchorMap = new Map();

  if (!Array.isArray(conversationIds) || !conversationIds.length) {
    return anchorMap;
  }

  const rows = await prisma.$queryRaw`
    SELECT
      anchor.conversation_id,
      MIN(anchor.created_at) AS anchor_at
    FROM (
      SELECT
        fe.conversation_id,
        fe.created_at
      FROM "FlowEvent" fe
      WHERE fe.conversation_id = ANY(${conversationIds})
        AND fe.event_type IN ('handoff_requested', 'conversation_assigned')

      UNION ALL

      SELECT
        (a.data_json->>'conversation_id') AS conversation_id,
        a.created_at
      FROM "AuditLog" a
      WHERE COALESCE(a.data_json->>'conversation_id', '') = ANY(${conversationIds})
        AND (
          (a.action = 'conversation.status_changed' AND COALESCE(a.data_json->>'to', '') IN ('pending', 'assigned'))
          OR a.action = 'conversation.assigned'
        )
    ) AS anchor
    WHERE COALESCE(anchor.conversation_id, '') <> ''
    GROUP BY anchor.conversation_id
  `;

  for (const row of rows || []) {
    if (!row?.conversation_id || !row?.anchor_at) {
      continue;
    }
    anchorMap.set(row.conversation_id, row.anchor_at);
  }

  return anchorMap;
}

async function loadConversationResponseStats(conversationIds) {
  const statsByConversation = new Map();
  const teamMap = new Map();

  if (!Array.isArray(conversationIds) || !conversationIds.length) {
    return {
      statsByConversation,
      aggregate: {
        first_human_response_avg_min: null,
        first_human_response_p50_min: null,
        first_human_response_p90_min: null,
        avg_human_response_avg_min: null,
      },
      team: [],
    };
  }

  const anchorMap = await getConversationHumanAnchorMap(conversationIds);
  const anchoredConversationIds = Array.from(anchorMap.keys());

  if (!anchoredConversationIds.length) {
    return {
      statsByConversation,
      aggregate: {
        first_human_response_avg_min: null,
        first_human_response_p50_min: null,
        first_human_response_p90_min: null,
        avg_human_response_avg_min: null,
      },
      team: [],
    };
  }

  const messages = await prisma.message.findMany({
    where: {
      conversation_id: { in: anchoredConversationIds },
    },
    orderBy: [{ conversation_id: "asc" }, { created_at: "asc" }],
    select: {
      conversation_id: true,
      direction: true,
      type: true,
      raw_json: true,
      created_at: true,
    },
  });

  const working = new Map();
  for (const conversationId of anchoredConversationIds) {
    const anchorAt = anchorMap.get(conversationId) || null;
    if (!anchorAt) {
      continue;
    }
    working.set(conversationId, {
      anchorAt,
      firstHumanResponseAt: null,
      firstResponderId: null,
      openTurnAt: anchorAt,
      turnDurations: [],
    });
  }

  const ensureTeam = (operatorId) => {
    if (!teamMap.has(operatorId)) {
      teamMap.set(operatorId, {
        operator_id: operatorId,
        human_messages_sent: 0,
        handled_conversations: new Set(),
        first_response_turns: [],
        response_turns: [],
      });
    }
    return teamMap.get(operatorId);
  };

  for (const message of messages) {
    const conversationId = message.conversation_id;
    const state = working.get(conversationId);
    if (!state) {
      continue;
    }
    if (new Date(message.created_at).getTime() < new Date(state.anchorAt).getTime()) {
      continue;
    }

    if (message.direction === "in" && message.type !== "note") {
      if (!state.openTurnAt) {
        state.openTurnAt = message.created_at;
      }
      working.set(conversationId, state);
      continue;
    }

    if (!isHumanPanelMessage(message)) {
      working.set(conversationId, state);
      continue;
    }

    const operatorId = extractMessageByUserId(message.raw_json);
    const operator = ensureTeam(operatorId);
    operator.human_messages_sent += 1;
    operator.handled_conversations.add(conversationId);

    if (!state.firstHumanResponseAt) {
      const duration = minutesBetween(state.anchorAt, message.created_at);
      if (duration !== null) {
        state.firstHumanResponseAt = message.created_at;
        state.firstResponderId = operatorId;
        operator.first_response_turns.push(duration);
      }
    }

    if (state.openTurnAt) {
      const duration = minutesBetween(state.openTurnAt, message.created_at);
      if (duration !== null) {
        state.turnDurations.push(duration);
        operator.response_turns.push(duration);
      }
      state.openTurnAt = null;
    }

    working.set(conversationId, state);
  }

  const firstDurations = [];
  const avgDurations = [];

  for (const conversationId of conversationIds) {
    const state = working.get(conversationId);
    const firstHumanResponseMin = state?.firstHumanResponseAt
      ? minutesBetween(state.anchorAt, state.firstHumanResponseAt)
      : null;
    const avgHumanResponseMin = average(state?.turnDurations || []);

    if (firstHumanResponseMin !== null) {
      firstDurations.push(firstHumanResponseMin);
    }
    if (avgHumanResponseMin !== null) {
      avgDurations.push(avgHumanResponseMin);
    }

    statsByConversation.set(conversationId, {
      first_human_response_min: firstHumanResponseMin,
      avg_human_response_min: avgHumanResponseMin,
      first_responder_id: state?.firstResponderId || null,
      handled_by_human: (state?.turnDurations?.length || 0) > 0 || Boolean(state?.firstHumanResponseAt),
    });
  }

  const team = Array.from(teamMap.values()).map((entry) => ({
    operator_id: entry.operator_id,
    human_messages_sent: entry.human_messages_sent,
    handled_conversations: entry.handled_conversations.size,
    first_response_avg_min: average(entry.first_response_turns),
    avg_response_avg_min: average(entry.response_turns),
  }));

  return {
    statsByConversation,
    aggregate: {
      first_human_response_avg_min: average(firstDurations),
      first_human_response_p50_min: percentile(firstDurations, 50),
      first_human_response_p90_min: percentile(firstDurations, 90),
      avg_human_response_avg_min: average(avgDurations),
    },
    team,
  };
}

async function buildOdooConversationMaps(conversations) {
  const map = new Map();
  if (!Array.isArray(conversations) || !conversations.length) {
    return map;
  }

  const partnerIds = [...new Set(conversations.map((row) => row.partner_id).filter(Boolean))];
  const patientIds = [...new Set(conversations.map((row) => row.patient_id).filter(Boolean))];
  const phoneCanonicals = [...new Set(conversations.map((row) => row.phone_canonical).filter(Boolean))];

  const orFilters = [
    ...(partnerIds.length ? [{ odoo_partner_id: { in: partnerIds } }] : []),
    ...(patientIds.length ? [{ odoo_patient_id: { in: patientIds } }] : []),
    ...(phoneCanonicals.length ? [{ phone_canonical: { in: phoneCanonicals } }] : []),
  ];
  if (!orFilters.length) {
    for (const conversation of conversations) {
      map.set(conversation.id, {
        status: "no_match",
        contact_id: null,
        patient_created_at: null,
      });
    }
    return map;
  }

  const contacts = await prisma.odooContact.findMany({
    where: {
      OR: orFilters,
    },
    select: {
      id: true,
      odoo_partner_id: true,
      odoo_patient_id: true,
      is_patient: true,
      phone_canonical: true,
      patient_created_at: true,
      first_seen_as_patient_at: true,
    },
  });

  const byPartner = new Map();
  const byPatient = new Map();
  const byPhone = new Map();
  for (const contact of contacts) {
    if (contact.odoo_partner_id) {
      byPartner.set(contact.odoo_partner_id, contact);
    }
    if (contact.odoo_patient_id) {
      byPatient.set(contact.odoo_patient_id, contact);
    }
    if (contact.phone_canonical) {
      byPhone.set(contact.phone_canonical, contact);
    }
  }

  for (const conversation of conversations) {
    const contact =
      byPatient.get(conversation.patient_id) ||
      byPartner.get(conversation.partner_id) ||
      byPhone.get(conversation.phone_canonical) ||
      null;

    let status = "no_match";
    if (contact?.is_patient) {
      status =
        contact.patient_created_at && contact.patient_created_at >= conversation.created_at
          ? "registered_after_chat"
          : "patient_existing";
    } else if (contact) {
      status = "contact";
    }

    map.set(conversation.id, {
      status,
      contact_id: contact?.id || null,
      patient_created_at: contact?.patient_created_at || null,
    });
  }

  return map;
}

async function queryPendingQueueState({ channel }) {
  const channelFilter = channel ? Prisma.sql`AND c.phone_number_id = ${channel}` : Prisma.empty;
  const rows = await prisma.$queryRaw`
    SELECT
      c.id,
      c.assigned_user_id,
      COALESCE(
        MAX(CASE WHEN m.direction = 'in' AND m.type <> 'note' THEN m.created_at END),
        c.last_message_at,
        c.created_at
      ) AS last_user_message_at
    FROM "Conversation" c
    LEFT JOIN "Message" m ON m.conversation_id = c.id
    WHERE c.status = 'pending'
      ${channelFilter}
    GROUP BY c.id, c.assigned_user_id, c.last_message_at, c.created_at
  `;

  return rows || [];
}

async function queryTimelineBySource({ from, to, channel }) {
  const channelFilter = channel ? Prisma.sql`AND c.phone_number_id = ${channel}` : Prisma.empty;
  const rows = await prisma.$queryRaw`
    SELECT
      DATE(m.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz') AS day,
      COUNT(*) FILTER (WHERE m.direction = 'in' AND m.type <> 'note') AS in_count,
      COUNT(*) FILTER (
        WHERE m.direction = 'out'
          AND m.type <> 'note'
          AND COALESCE(
            NULLIF(m.raw_json->>'source', ''),
            NULLIF(m.raw_json->'meta'->>'source', '')
          ) = 'panel'
      ) AS human_out_count,
      COUNT(*) FILTER (
        WHERE m.direction = 'out'
          AND m.type <> 'note'
          AND COALESCE(
            NULLIF(m.raw_json->>'source', ''),
            NULLIF(m.raw_json->'meta'->>'source', '')
          ) <> 'panel'
      ) AS bot_out_count
    FROM "Message" m
    JOIN "Conversation" c ON c.id = m.conversation_id
    WHERE m.created_at >= ${from}
      AND m.created_at < ${to}
      ${channelFilter}
    GROUP BY DATE(m.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz')
    ORDER BY day ASC
  `;

  const parsedRows = (rows || []).map((row) => ({
    day: row.day ? row.day.toISOString().split("T")[0] : null,
    in_count: toNumber(row.in_count),
    human_out_count: toNumber(row.human_out_count),
    bot_out_count: toNumber(row.bot_out_count),
  }));
  return fillDailySeries(parsedRows, from, to);
}

async function buildFlowFunnel(activeFlow, { from, to, channel }) {
  const steps = Array.isArray(activeFlow?.flow?.analytics?.funnel_steps)
    ? activeFlow.flow.analytics.funnel_steps
    : [];
  if (!steps.length) {
    return [];
  }

  const events = await prisma.flowEvent.findMany({
    where: {
      created_at: { gte: from, lt: to },
      ...(channel ? { phone_number_id: channel } : {}),
      flow_id: activeFlow.flowId,
    },
    select: {
      conversation_id: true,
      event_type: true,
      node_id: true,
      payload_json: true,
    },
  });

  return steps.map((step) => {
    const set = new Set();
    for (const event of events) {
      if (!event.conversation_id) {
        continue;
      }
      const matchesEvent = step.event_type ? event.event_type === step.event_type : true;
      const matchesNode =
        !Array.isArray(step.node_ids) || !step.node_ids.length || step.node_ids.includes(event.node_id);
      if (matchesEvent && matchesNode) {
        set.add(event.conversation_id);
      }
    }
    return {
      id: step.id,
      label: step.label,
      count: set.size,
    };
  });
}

async function buildTopTopics(activeFlow, { from, to, channel }) {
  const groups = Array.isArray(activeFlow?.flow?.analytics?.topic_groups)
    ? activeFlow.flow.analytics.topic_groups
    : [];
  if (!groups.length) {
    return [];
  }

  const events = await prisma.flowEvent.findMany({
    where: {
      created_at: { gte: from, lt: to },
      event_type: "node_sent",
      ...(channel ? { phone_number_id: channel } : {}),
      flow_id: activeFlow.flowId,
    },
    select: {
      conversation_id: true,
      node_id: true,
    },
  });

  return groups.map((group) => {
    const ids = new Set();
    for (const event of events) {
      if (!event.conversation_id || !group.node_ids?.includes(event.node_id)) {
        continue;
      }
      ids.add(event.conversation_id);
    }
    return {
      id: group.id,
      label: group.label,
      count: ids.size,
    };
  }).sort((a, b) => b.count - a.count);
}

async function buildAiSummary(activeFlow, { from, to, channel }) {
  if (!activeFlow?.flow?.ai?.enabled) {
    return null;
  }

  const events = await prisma.flowEvent.findMany({
    where: {
      created_at: { gte: from, lt: to },
      ...(channel ? { phone_number_id: channel } : {}),
      flow_id: activeFlow.flowId,
    },
    select: {
      conversation_id: true,
      event_type: true,
      node_id: true,
      payload_json: true,
      source: true,
    },
  });

  const aiRoutes = new Set();
  const deterministicRoutes = new Set();
  const handoffs = new Set();
  const outOfScope = new Set();
  const clarify = new Set();

  for (const event of events) {
    if (!event.conversation_id) {
      continue;
    }
    if (event.event_type === "ai_routed") {
      if (event.source === "ai") {
        aiRoutes.add(event.conversation_id);
      } else {
        deterministicRoutes.add(event.conversation_id);
      }
      const action = event.payload_json?.action || null;
      if (action === "clarify") {
        clarify.add(event.conversation_id);
      }
    }
    if (event.event_type === "handoff_requested") {
      handoffs.add(event.conversation_id);
    }
    if (
      event.event_type === "node_sent" &&
      event.node_id === activeFlow.flow.ai?.out_of_scope_node_id
    ) {
      outOfScope.add(event.conversation_id);
    }
  }

  return {
    ai_routed_conversations: aiRoutes.size,
    deterministic_routed_conversations: deterministicRoutes.size,
    handoff_requests: handoffs.size,
    out_of_scope_conversations: outOfScope.size,
    clarify_conversations: clarify.size,
  };
}

async function buildDashboardOverview({ tenantId, period, channel }) {
  const { period: normalizedPeriod, now, startDate } = getDateRange(period);
  const activeFlow = tenantId ? await getActiveTenantFlow(tenantId) : null;

  const [
    liveStatusCounts,
    pendingQueue,
    sessionsCount,
    currentNodes,
    conversationsInPeriod,
    timeline,
  ] = await Promise.all([
    prisma.conversation.groupBy({
      by: ["status"],
      where: {
        ...(channel ? { phone_number_id: channel } : {}),
        status: { in: ["open", "pending", "assigned"] },
      },
      _count: { status: true },
    }),
    queryPendingQueueState({ channel }),
    prisma.session.count({
      where: {
        ...(channel ? { phone_number_id: channel } : {}),
        ...(activeFlow?.flowId ? { flow_id: activeFlow.flowId } : {}),
      },
    }),
    prisma.session.groupBy({
      by: ["state"],
      where: {
        ...(channel ? { phone_number_id: channel } : {}),
        ...(activeFlow?.flowId ? { flow_id: activeFlow.flowId } : {}),
      },
      _count: { state: true },
    }),
    prisma.conversation.findMany({
      where: {
        created_at: { gte: startDate, lt: now },
        ...(channel ? { phone_number_id: channel } : {}),
      },
      select: {
        id: true,
        created_at: true,
        status: true,
        assigned_user_id: true,
        partner_id: true,
        patient_id: true,
        phone_canonical: true,
        phone_number_id: true,
        asistio: true,
        asistio_source: true,
      },
    }),
    queryTimelineBySource({ from: startDate, to: now, channel }),
  ]);

  const responseStats = await loadConversationResponseStats(conversationsInPeriod.map((row) => row.id));
  const odooMatchMap = await buildOdooConversationMaps(conversationsInPeriod);
  const operatorHistoryMap = await getConversationOperatorHistoryMap(conversationsInPeriod.map((row) => row.id));

  const statusMap = new Map((liveStatusCounts || []).map((row) => [row.status, toNumber(row._count?.status)]));
  const activeNow = toNumber(statusMap.get("open")) + toNumber(statusMap.get("pending")) + toNumber(statusMap.get("assigned"));
  const pendingUnassigned = pendingQueue.filter((conversation) => !conversation.assigned_user_id).length;
  const assignedNow = toNumber(statusMap.get("assigned"));

  const queueAgeBuckets = [
    { label: "0-5m", min: 0, max: 5, count: 0 },
    { label: "5-15m", min: 5, max: 15, count: 0 },
    { label: "15-30m", min: 15, max: 30, count: 0 },
    { label: "30-60m", min: 30, max: 60, count: 0 },
    { label: "60m+", min: 60, max: Infinity, count: 0 },
  ];
  for (const conversation of pendingQueue) {
    const lastAt = conversation.last_user_message_at
      ? new Date(conversation.last_user_message_at).getTime()
      : now.getTime();
    const ageMin = Math.max(0, (now.getTime() - lastAt) / 60000);
    const bucket = queueAgeBuckets.find((entry) => ageMin >= entry.min && ageMin < entry.max);
    if (bucket) {
      bucket.count += 1;
    }
  }

  const currentNodeList = (currentNodes || [])
    .map((row) => ({
      node_id: row.state,
      count: toNumber(row._count?.state),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const [handoffRows, humanMessageRows, attendanceRows] = await Promise.all([
    prisma.flowEvent.findMany({
      where: {
        created_at: { gte: startDate, lt: now },
        event_type: "handoff_requested",
        ...(channel ? { phone_number_id: channel } : {}),
        ...(activeFlow?.flowId ? { flow_id: activeFlow.flowId } : {}),
      },
      distinct: ["conversation_id"],
      select: { conversation_id: true },
    }),
    prisma.flowEvent.findMany({
      where: {
        created_at: { gte: startDate, lt: now },
        event_type: "human_message",
        source: { not: "panel_note" },
        ...(channel ? { phone_number_id: channel } : {}),
      },
      distinct: ["conversation_id"],
      select: { conversation_id: true },
    }),
    prisma.flowEvent.findMany({
      where: {
        created_at: { gte: startDate, lt: now },
        event_type: "attendance_confirmed",
        ...(channel ? { phone_number_id: channel } : {}),
      },
      distinct: ["conversation_id"],
      select: { conversation_id: true },
    }),
  ]);

  let attendedByHuman = humanMessageRows.length;
  let attendanceConfirmed = attendanceRows.length;
  let registeredAfterChat = 0;
  let patientExisting = 0;
  let directOdooContacts = 0;

  const attendanceByOperator = new Map();
  for (const conversation of conversationsInPeriod) {
    const response = responseStats.statsByConversation.get(conversation.id);
    if (humanMessageRows.length === 0 && response?.handled_by_human) {
      attendedByHuman += 1;
    }
    if (attendanceRows.length === 0 && conversation.asistio) {
      attendanceConfirmed += 1;
    }
    if (conversation.asistio) {
      const history = operatorHistoryMap.get(conversation.id) || [];
      const operatorId = history[history.length - 1]?.id || conversation.assigned_user_id || null;
      if (operatorId) {
        attendanceByOperator.set(operatorId, (attendanceByOperator.get(operatorId) || 0) + 1);
      }
    }
    const odooMatch = odooMatchMap.get(conversation.id);
    if (odooMatch?.status === "registered_after_chat") {
      registeredAfterChat += 1;
    } else if (odooMatch?.status === "patient_existing") {
      patientExisting += 1;
    } else if (odooMatch?.status === "contact") {
      directOdooContacts += 1;
    }
  }

  const operatorIds = [
    ...new Set([
      ...responseStats.team.map((row) => row.operator_id),
      ...Array.from(attendanceByOperator.keys()),
      ...conversationsInPeriod.map((row) => row.assigned_user_id).filter(Boolean),
    ]),
  ];
  const users = operatorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: operatorIds } },
        select: { id: true, name: true, role: true },
      })
    : [];
  const userMap = new Map(users.map((user) => [user.id, user]));
  const assignedCounts = await prisma.conversation.groupBy({
    by: ["assigned_user_id"],
    where: {
      status: "assigned",
      assigned_user_id: { not: null },
      ...(channel ? { phone_number_id: channel } : {}),
    },
    _count: { assigned_user_id: true },
  });
  const assignedMap = new Map(
    (assignedCounts || []).map((row) => [row.assigned_user_id, toNumber(row._count?.assigned_user_id)])
  );

  const team = responseStats.team
    .map((entry) => {
      const user = userMap.get(entry.operator_id) || null;
      return {
        id: entry.operator_id,
        name: user?.name || "Sin nombre",
        role: user?.role || null,
        handled_conversations: entry.handled_conversations,
        human_messages_sent: entry.human_messages_sent,
        first_response_avg_min: entry.first_response_avg_min,
        avg_response_avg_min: entry.avg_response_avg_min,
        assigned_now: assignedMap.get(entry.operator_id) || 0,
        attendances_attributed: attendanceByOperator.get(entry.operator_id) || 0,
      };
    })
    .sort((a, b) => {
      if (b.handled_conversations !== a.handled_conversations) {
        return b.handled_conversations - a.handled_conversations;
      }
      return (a.first_response_avg_min || Number.MAX_SAFE_INTEGER) - (b.first_response_avg_min || Number.MAX_SAFE_INTEGER);
    });

  for (const [operatorId, count] of assignedMap.entries()) {
    if (team.some((entry) => entry.id === operatorId)) {
      continue;
    }
    const user = userMap.get(operatorId) || null;
    team.push({
      id: operatorId,
      name: user?.name || "Sin nombre",
      role: user?.role || null,
      handled_conversations: 0,
      human_messages_sent: 0,
      first_response_avg_min: null,
      avg_response_avg_min: null,
      assigned_now: count,
      attendances_attributed: attendanceByOperator.get(operatorId) || 0,
    });
  }

  team.sort((a, b) => {
    if (b.handled_conversations !== a.handled_conversations) {
      return b.handled_conversations - a.handled_conversations;
    }
    return (a.first_response_avg_min || Number.MAX_SAFE_INTEGER) - (b.first_response_avg_min || Number.MAX_SAFE_INTEGER);
  });

  let odooSync = null;
  if (tenantId && process.env.CONTROL_DB_URL) {
    const control = getControlClient();
    const config = await control.odooConfig.findUnique({
      where: { tenant_id: tenantId },
      select: {
        sync_enabled: true,
        sync_interval_minutes: true,
        next_due_at: true,
        last_success_at: true,
        last_error_at: true,
        last_error_message: true,
      },
    });
    if (config) {
      odooSync = config;
    }
  }

  return {
    period: normalizedPeriod,
    live: {
      active_now: activeNow,
      pending_unassigned: pendingUnassigned,
      assigned_now: assignedNow,
      bot_sessions_active: sessionsCount,
      status_distribution: [
        { status: "open", count: toNumber(statusMap.get("open")) },
        { status: "pending", count: toNumber(statusMap.get("pending")) },
        { status: "assigned", count: toNumber(statusMap.get("assigned")) },
      ],
      queue_age_buckets: queueAgeBuckets,
      current_nodes: currentNodeList,
    },
    period_summary: {
      contacts_new: conversationsInPeriod.length,
      operator_requests: handoffRows.length,
      attended_by_human: attendedByHuman,
      attendance_confirmed: attendanceConfirmed,
      registered_after_chat: registeredAfterChat,
      patient_existing: patientExisting,
      odoo_contact_only: directOdooContacts,
      message_timeline: timeline,
    },
    response: responseStats.aggregate,
    funnel: {
      steps: await buildFlowFunnel(activeFlow, { from: startDate, to: now, channel }),
      top_topics: await buildTopTopics(activeFlow, { from: startDate, to: now, channel }),
      tracking_ready: Boolean(activeFlow?.flow?.analytics?.funnel_steps?.length),
    },
    team,
    odoo: {
      sync: odooSync,
      match_distribution: [
        { status: "no_match", count: Math.max(0, conversationsInPeriod.length - registeredAfterChat - patientExisting - directOdooContacts) },
        { status: "contact", count: directOdooContacts },
        { status: "patient_existing", count: patientExisting },
        { status: "registered_after_chat", count: registeredAfterChat },
      ],
    },
    ai: await buildAiSummary(activeFlow, { from: startDate, to: now, channel }),
  };
}

module.exports = {
  getDateRange,
  sanitizePeriod,
  loadConversationResponseStats,
  buildOdooConversationMaps,
  buildDashboardOverview,
  getConversationOperatorHistoryMap,
};
