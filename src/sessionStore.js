const path = require("path");
const { promisify } = require("util");

let sqlite3 = null;
try {
  sqlite3 = require("sqlite3").verbose();
} catch (error) {
  sqlite3 = null;
}

const SQLITE_PATH = process.env.SQLITE_PATH;
const DEFAULT_STATE = "MAIN";

const memoryStore = new Map();
let db = null;
let dbRun;
let dbGet;
let dbAll;

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
    : path.join(__dirname, "..", SQLITE_PATH);
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

async function getSession(waId) {
  await initPromise;
  if (!waId) {
    return {
      state: DEFAULT_STATE,
      data: {},
      updatedAt: new Date().toISOString(),
    };
  }

  if (!db) {
    if (!memoryStore.has(waId)) {
      memoryStore.set(waId, {
        state: DEFAULT_STATE,
        data: {},
        updatedAt: new Date().toISOString(),
      });
    }
    return memoryStore.get(waId);
  }

  const row = await dbGet("SELECT * FROM sessions WHERE wa_id = ?", [waId]);
  if (!row) {
    const session = {
      state: DEFAULT_STATE,
      data: {},
      updatedAt: new Date().toISOString(),
    };
    await saveSession(waId, session);
    return session;
  }
  return {
    state: row.state,
    data: deserializeData(row.data),
    updatedAt: row.updated_at,
  };
}

async function saveSession(waId, session) {
  await initPromise;
  if (!waId) {
    return;
  }

  const payload = {
    state: session.state || DEFAULT_STATE,
    data: session.data || {},
    updatedAt: new Date().toISOString(),
  };

  if (!db) {
    memoryStore.set(waId, payload);
    return;
  }

  await dbRun(
    `INSERT OR REPLACE INTO sessions (wa_id, state, data, updated_at)
     VALUES (?, ?, ?, ?)`,
    [waId, payload.state, serializeData(payload.data), payload.updatedAt]
  );
}

async function updateSession(waId, updates) {
  const current = await getSession(waId);
  const next = {
    ...current,
    ...updates,
    data: { ...current.data, ...(updates.data || {}) },
    updatedAt: new Date().toISOString(),
  };
  await saveSession(waId, next);
  return next;
}

async function clearSession(waId) {
  await initPromise;
  if (!waId) {
    return;
  }
  if (!db) {
    memoryStore.delete(waId);
    return;
  }
  await dbRun("DELETE FROM sessions WHERE wa_id = ?", [waId]);
}

async function listSessions(limit = 200) {
  await initPromise;
  if (!db) {
    return Array.from(memoryStore.entries())
      .slice(0, limit)
      .map(([waId, session]) => ({
        wa_id: waId,
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
    wa_id: row.wa_id,
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
