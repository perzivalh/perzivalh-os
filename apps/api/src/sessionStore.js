const path = require("path");
const { promisify } = require("util");

let sqlite3 = null;
try {
  sqlite3 = require("sqlite3").verbose();
} catch (error) {
  sqlite3 = null;
}

const SQLITE_PATH = process.env.SQLITE_PATH;
const DEFAULT_STATE = "MAIN_MENU";

const memoryStore = new Map();
let db = null;
let dbRun;
let dbGet;
let dbAll;

function buildSessionKey(waId, phoneNumberId) {
  if (!waId) {
    return "";
  }
  const lineId = phoneNumberId ? String(phoneNumberId).trim() : "";
  return lineId ? `${lineId}:${waId}` : waId;
}

function parseSessionKey(key) {
  if (!key) {
    return { wa_id: "", phone_number_id: null };
  }
  const idx = key.indexOf(":");
  if (idx === -1) {
    return { wa_id: key, phone_number_id: null };
  }
  return {
    phone_number_id: key.slice(0, idx),
    wa_id: key.slice(idx + 1),
  };
}

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

async function initSqlite() {
  if (!SQLITE_PATH || !sqlite3) {
    if (SQLITE_PATH && !sqlite3) {
      console.warn("SQLITE_PATH set but sqlite3 not installed. Using memory.");
    }
    return;
  }
  const dbPath = path.isAbsolute(SQLITE_PATH)
    ? SQLITE_PATH
    : path.join(__dirname, "..", "..", "..", SQLITE_PATH);
  db = new sqlite3.Database(dbPath);
  dbRun = promisify(db.run.bind(db));
  dbGet = promisify(db.get.bind(db));
  dbAll = promisify(db.all.bind(db));
  await dbRun(
    `CREATE TABLE IF NOT EXISTS sessions (
      wa_id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  );
}

const initPromise = initSqlite().catch((error) => {
  console.error("SQLite session init error", error.message || error);
});

async function getSession(waId, phoneNumberId) {
  await initPromise;
  if (!waId) {
    return {
      state: DEFAULT_STATE,
      data: {},
      updatedAt: new Date().toISOString(),
    };
  }
  const key = buildSessionKey(waId, phoneNumberId);

  if (!db) {
    if (!memoryStore.has(key)) {
      memoryStore.set(key, {
        state: DEFAULT_STATE,
        data: {},
        updatedAt: new Date().toISOString(),
      });
    }
    return memoryStore.get(key);
  }

  const row = await dbGet("SELECT * FROM sessions WHERE wa_id = ?", [key]);
  if (!row) {
    const session = {
      state: DEFAULT_STATE,
      data: {},
      updatedAt: new Date().toISOString(),
    };
    await saveSession(waId, phoneNumberId, session);
    return session;
  }
  return {
    state: row.state,
    data: deserializeData(row.data),
    updatedAt: row.updated_at,
  };
}

async function saveSession(waId, phoneNumberId, session) {
  await initPromise;
  if (!waId) {
    return;
  }
  const key = buildSessionKey(waId, phoneNumberId);

  const payload = {
    state: session.state || DEFAULT_STATE,
    data: session.data || {},
    updatedAt: new Date().toISOString(),
  };

  if (!db) {
    memoryStore.set(key, payload);
    return;
  }

  await dbRun(
    `INSERT OR REPLACE INTO sessions (wa_id, state, data, updated_at)
     VALUES (?, ?, ?, ?)`,
    [key, payload.state, serializeData(payload.data), payload.updatedAt]
  );
}

async function updateSession(waId, phoneNumberId, updates) {
  const current = await getSession(waId, phoneNumberId);
  const next = {
    ...current,
    ...updates,
    data: { ...current.data, ...(updates.data || {}) },
    updatedAt: new Date().toISOString(),
  };
  await saveSession(waId, phoneNumberId, next);
  return next;
}

async function clearSession(waId, phoneNumberId) {
  await initPromise;
  if (!waId) {
    return;
  }
  const key = buildSessionKey(waId, phoneNumberId);
  if (!db) {
    memoryStore.delete(key);
    return;
  }
  await dbRun("DELETE FROM sessions WHERE wa_id = ?", [key]);
}

async function listSessions(limit = 200) {
  await initPromise;
  if (!db) {
    return Array.from(memoryStore.entries())
      .slice(0, limit)
      .map(([key, session]) => ({
        ...parseSessionKey(key),
        state: session.state,
        data: session.data,
        updatedAt: session.updatedAt,
      }));
  }
  const rows = await dbAll(
    "SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?",
    [limit]
  );
  return rows.map((row) => ({
    ...parseSessionKey(row.wa_id),
    state: row.state,
    data: deserializeData(row.data),
    updatedAt: row.updated_at,
  }));
}

module.exports = {
  getSession,
  saveSession,
  updateSession,
  clearSession,
  listSessions,
};
