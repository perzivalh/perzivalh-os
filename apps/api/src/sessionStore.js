const prisma = require("./db");

const DEFAULT_STATE = "MAIN_MENU";

function serializeData(data) {
  return JSON.stringify(data || {});
}

function deserializeData(data) {
  if (!data) {
    return {};
  }
  try {
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

async function getSession(waId, phoneNumberId) {
  if (!waId) {
    return {
      state: DEFAULT_STATE,
      data: {},
      updatedAt: new Date().toISOString(),
    };
  }
  const phoneId = phoneNumberId || null;

  const existing = await prisma.session.findUnique({
    where: {
      wa_id_phone_number_id: {
        wa_id: waId,
        phone_number_id: phoneId,
      },
    },
  });

  if (!existing) {
    const created = await prisma.session.create({
      data: {
        wa_id: waId,
        phone_number_id: phoneId,
        state: DEFAULT_STATE,
        data: {},
      },
    });
    return {
      state: created.state,
      data: created.data || {},
      updatedAt: created.updated_at.toISOString(),
      inactivity_notice_at: created.inactivity_notice_at,
      next_due_at: created.next_due_at,
      phone_number_id: created.phone_number_id,
      wa_id: created.wa_id,
      flow_id: created.flow_id || null,
    };
  }

  return {
    state: existing.state,
    data: existing.data || {},
    updatedAt: existing.updated_at.toISOString(),
    inactivity_notice_at: existing.inactivity_notice_at,
    next_due_at: existing.next_due_at,
    phone_number_id: existing.phone_number_id,
    wa_id: existing.wa_id,
    flow_id: existing.flow_id || null,
  };
}

async function saveSession(waId, phoneNumberId, session) {
  if (!waId) {
    return;
  }
  const phoneId = phoneNumberId || null;
  const payload = {
    state: session.state || DEFAULT_STATE,
    data: deserializeData(serializeData(session.data)),
    inactivity_notice_at: session.inactivity_notice_at || null,
    next_due_at: session.next_due_at || null,
    flow_id: session.flow_id || session.data?.flow_id || null,
  };

  await prisma.session.upsert({
    where: {
      wa_id_phone_number_id: {
        wa_id: waId,
        phone_number_id: phoneId,
      },
    },
    update: payload,
    create: {
      wa_id: waId,
      phone_number_id: phoneId,
      state: payload.state,
      data: payload.data,
      inactivity_notice_at: payload.inactivity_notice_at,
      next_due_at: payload.next_due_at,
      flow_id: payload.flow_id,
    },
  });
}

async function updateSession(waId, phoneNumberId, updates) {
  const current = await getSession(waId, phoneNumberId);
  const next = {
    ...current,
    ...updates,
    data: { ...current.data, ...(updates.data || {}) },
    updatedAt: new Date().toISOString(),
  };
  if (updates.flow_id || updates.data?.flow_id) {
    next.flow_id = updates.flow_id || updates.data?.flow_id;
  }
  await saveSession(waId, phoneNumberId, next);
  return next;
}

async function clearSession(waId, phoneNumberId) {
  if (!waId) {
    return;
  }
  const phoneId = phoneNumberId || null;
  await prisma.session.deleteMany({
    where: {
      wa_id: waId,
      phone_number_id: phoneId,
    },
  });
}

async function listSessions(limit = 200) {
  const rows = await prisma.session.findMany({
    orderBy: { updated_at: "desc" },
    take: limit,
  });
  return rows.map((row) => ({
    wa_id: row.wa_id,
    phone_number_id: row.phone_number_id,
    state: row.state,
    data: row.data || {},
    updatedAt: row.updated_at.toISOString(),
    inactivity_notice_at: row.inactivity_notice_at,
    next_due_at: row.next_due_at,
    flow_id: row.flow_id,
  }));
}

async function listSessionsDue({ flowId, dueBefore, limit = 200 }) {
  const rows = await prisma.session.findMany({
    where: {
      flow_id: flowId || undefined,
      next_due_at: {
        lte: dueBefore || new Date(),
      },
    },
    orderBy: { next_due_at: "asc" },
    take: limit,
  });
  return rows.map((row) => ({
    wa_id: row.wa_id,
    phone_number_id: row.phone_number_id,
    state: row.state,
    data: row.data || {},
    updatedAt: row.updated_at.toISOString(),
    inactivity_notice_at: row.inactivity_notice_at,
    next_due_at: row.next_due_at,
    flow_id: row.flow_id,
  }));
}

module.exports = {
  getSession,
  saveSession,
  updateSession,
  clearSession,
  listSessions,
  listSessionsDue,
};
