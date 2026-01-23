const axios = require("axios");

const {
  ODOO_BASE_URL,
  ODOO_URL,
  ODOO_DB,
  ODOO_USERNAME,
  ODOO_USER,
  ODOO_PASSWORD,
  ODOO_PASS,
} = process.env;

const baseUrl = (ODOO_BASE_URL || ODOO_URL || "").replace(/\/+$/, "");
const username = ODOO_USERNAME || ODOO_USER || "";
const password = ODOO_PASSWORD || ODOO_PASS || "";

const client = axios.create({
  baseURL: baseUrl,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

const SESSION_TTL_MS = 30 * 60 * 1000;
let sessionCookie = null;
let sessionUid = null;
let sessionReadyAt = null;
let sessionExpiresAt = 0;

function hasOdooConfig() {
  return Boolean(baseUrl && ODOO_DB && username && password);
}

function digitsOnly(value) {
  return (value || "").toString().replace(/\D+/g, "");
}

function normalizeCI(ciRaw) {
  return digitsOnly(ciRaw);
}

function normalizePhone(raw) {
  const digits = digitsOnly(raw);
  if (!digits) {
    return [];
  }
  const variants = new Set();
  const addVariant = (value) => {
    if (value) {
      variants.add(value);
    }
  };
  addVariant(digits);
  if (digits.startsWith("591") && digits.length > 8) {
    const local = digits.slice(3);
    addVariant(local);
    addVariant(`+591${local}`);
  }
  if (digits.startsWith("0") && digits.length >= 8) {
    const local = digits.slice(-8);
    addVariant(local);
    addVariant(`+591${local}`);
  }
  if (digits.length === 8) {
    addVariant(`+591${digits}`);
  }
  if (digits.startsWith("591")) {
    addVariant(`+${digits}`);
  }
  return Array.from(variants);
}

function getCookieHeader(setCookie) {
  if (!setCookie) {
    return null;
  }
  if (Array.isArray(setCookie)) {
    return setCookie.map((entry) => entry.split(";")[0]).join("; ");
  }
  return setCookie.split(";")[0];
}

function isSessionExpired(error) {
  const name = error?.data?.name || "";
  const message = error?.data?.message || "";
  return (
    name.toLowerCase().includes("session") ||
    message.toLowerCase().includes("session") ||
    message.toLowerCase().includes("expired")
  );
}

async function loginViaWeb() {
  if (!hasOdooConfig()) {
    throw new Error("Odoo config missing");
  }

  const payload = {
    jsonrpc: "2.0",
    params: {
      db: ODOO_DB,
      login: username,
      password,
    },
    id: Date.now(),
  };

  const response = await client.post("/web/session/authenticate", payload);
  if (response.data?.error) {
    throw new Error("Odoo login failed");
  }

  const result = response.data?.result;
  if (!result?.uid) {
    throw new Error("Odoo login missing uid");
  }

  sessionUid = result.uid;
  sessionCookie = getCookieHeader(response.headers["set-cookie"]);
  sessionReadyAt = new Date().toISOString();
  sessionExpiresAt = Date.now() + SESSION_TTL_MS;
  return sessionUid;
}

async function loginViaJsonRpc() {
  const payload = {
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "web",
      method: "session_authenticate",
      args: [ODOO_DB, username, password],
    },
    id: Date.now(),
  };

  const response = await client.post("/jsonrpc", payload);
  if (response.data?.error) {
    throw new Error("Odoo login failed");
  }
  const result = response.data?.result;
  const uid = result?.uid || result?.session_id || result?.id;
  if (!uid) {
    throw new Error("Odoo login missing uid");
  }
  sessionUid = uid;
  sessionCookie = getCookieHeader(response.headers["set-cookie"]);
  sessionReadyAt = new Date().toISOString();
  sessionExpiresAt = Date.now() + SESSION_TTL_MS;
  return sessionUid;
}

async function odooLogin() {
  try {
    return await loginViaWeb();
  } catch (error) {
    return loginViaJsonRpc();
  }
}

async function ensureSession() {
  if (!sessionCookie || !sessionUid || Date.now() > sessionExpiresAt) {
    await odooLogin();
  }
}

async function callKw(model, method, args = [], kwargs = {}) {
  if (!hasOdooConfig()) {
    throw new Error("Odoo config missing");
  }

  await ensureSession();

  const payload = {
    jsonrpc: "2.0",
    method: "call",
    params: {
      model,
      method,
      args,
      kwargs,
    },
    id: Date.now(),
  };

  try {
    const response = await client.post("/web/dataset/call_kw", payload, {
      headers: sessionCookie ? { Cookie: sessionCookie } : undefined,
    });
    if (response.data?.error) {
      throw response.data.error;
    }
    return response.data?.result;
  } catch (error) {
    if (isSessionExpired(error)) {
      sessionCookie = null;
      sessionUid = null;
      await odooLogin();
      const retry = await client.post("/web/dataset/call_kw", payload, {
        headers: sessionCookie ? { Cookie: sessionCookie } : undefined,
      });
      if (retry.data?.error) {
        throw retry.data.error;
      }
      return retry.data?.result;
    }
    const status = error?.response?.status;
    if (status === 404 || status === 405) {
      return callKwViaJsonRpc(model, method, args, kwargs);
    }
    throw error;
  }
}

async function callKwViaJsonRpc(model, method, args = [], kwargs = {}) {
  await ensureSession();
  const payload = {
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "object",
      method: "execute_kw",
      args: [ODOO_DB, sessionUid, password, model, method, args, kwargs],
    },
    id: Date.now(),
  };

  const response = await client.post("/jsonrpc", payload, {
    headers: sessionCookie ? { Cookie: sessionCookie } : undefined,
  });
  if (response.data?.error) {
    throw response.data.error;
  }
  return response.data?.result;
}

async function searchRead(model, domain, fields, limit = 10, order = null) {
  const kwargs = {
    fields,
    limit,
  };
  if (order) {
    kwargs.order = order;
  }
  return callKw(model, "search_read", [domain], kwargs);
}

async function safeSearchRead(model, domain, fields, limit, order) {
  try {
    return await searchRead(model, domain, fields, limit, order);
  } catch (error) {
    const message = error?.data?.message || error?.message || "";
    if (message.toLowerCase().includes("field")) {
      return null;
    }
    console.error("Odoo search_read error", model, message);
    return null;
  }
}

async function findByPhoneInModel(model, phoneFields, phoneVariants, extraFields) {
  for (const field of phoneFields) {
    for (const variant of phoneVariants) {
      const records = await safeSearchRead(
        model,
        [[field, "ilike", variant]],
        extraFields,
        1
      );
      if (records && records.length) {
        return records[0];
      }
    }
  }
  return null;
}

async function findByCiInModel(model, ciFields, ci, extraFields) {
  for (const field of ciFields) {
    const records = await safeSearchRead(
      model,
      [[field, "ilike", ci]],
      extraFields,
      1
    );
    if (records && records.length) {
      return records[0];
    }
  }
  return null;
}

async function findPartnerByPhone(phoneVariants) {
  const variants = Array.isArray(phoneVariants)
    ? phoneVariants
    : normalizePhone(phoneVariants);
  const fields = ["id", "name", "phone", "mobile", "vat", "email"];
  const phoneFields = ["mobile", "phone", "x_phone", "x_mobile", "whatsapp"];
  const record = await findByPhoneInModel(
    "res.partner",
    phoneFields,
    variants,
    fields
  );
  if (!record) {
    return null;
  }
  return record;
}

async function findPartnerByCI(ciDigits) {
  const ci = normalizeCI(ciDigits);
  if (!ci) {
    return null;
  }
  const partnerFields = ["id", "name", "phone", "mobile", "vat", "email"];
  const partnerCiFields = ["vat", "x_ci", "nif", "identification_id", "dni"];
  const partner = await findByCiInModel(
    "res.partner",
    partnerCiFields,
    ci,
    partnerFields
  );
  return partner || null;
}

async function findPatientByPhone(phoneVariants) {
  const variants = Array.isArray(phoneVariants)
    ? phoneVariants
    : normalizePhone(phoneVariants);
  const fields = [
    "id",
    "name",
    "partner_id",
    "phone",
    "mobile",
    "vat",
    "ci",
    "x_ci",
  ];
  const phoneFields = [
    "phone",
    "mobile",
    "telefono",
    "whatsapp",
    "x_phone",
    "x_mobile",
  ];
  const record = await findByPhoneInModel(
    "medical.patient",
    phoneFields,
    variants,
    fields
  );
  if (!record) {
    return null;
  }
  return record;
}

async function findPatientByCI(ciDigits) {
  const ci = normalizeCI(ciDigits);
  if (!ci) {
    return null;
  }
  const fields = [
    "id",
    "name",
    "partner_id",
    "phone",
    "mobile",
    "vat",
    "ci",
    "x_ci",
  ];
  const ciFields = ["ci", "x_ci", "vat", "nif", "identification_id", "dni"];
  const patient = await findByCiInModel(
    "medical.patient",
    ciFields,
    ci,
    fields
  );
  if (patient) {
    return patient;
  }
  return null;
}

async function getPatientIdFromPartner(partnerId) {
  if (!partnerId) {
    return null;
  }
  const records = await safeSearchRead(
    "medical.patient",
    [["partner_id", "=", partnerId]],
    ["id"],
    1
  );
  if (records && records.length) {
    return records[0].id || null;
  }
  return null;
}

async function getPartnerSummary(partnerId) {
  if (!partnerId) {
    return null;
  }
  const records = await safeSearchRead(
    "res.partner",
    [["id", "=", partnerId]],
    ["id", "name", "phone", "mobile", "vat", "email"],
    1
  );
  if (!records || !records.length) {
    return null;
  }
  const record = records[0];
  return {
    id: record.id,
    name: record.name,
    ci: record.vat,
    phones: [record.phone, record.mobile].filter(Boolean),
    email: record.email || null,
  };
}

async function getPendingInvoices(partnerId) {
  if (!partnerId) {
    return [];
  }
  const domain = [
    ["partner_id", "=", partnerId],
    ["move_type", "in", ["out_invoice", "out_refund"]],
    ["state", "=", "posted"],
  ];
  const fields = [
    "name",
    "invoice_date",
    "amount_total",
    "amount_residual",
    "payment_state",
  ];
  const records =
    (await searchRead("account.move", domain, fields, 20, "invoice_date desc")) ||
    [];
  return records
    .filter((invoice) => {
      const residual = Number(invoice.amount_residual || 0);
      return residual > 0 || invoice.payment_state !== "paid";
    })
    .slice(0, 10);
}

async function getLastPosOrders(partnerId, limit = 10) {
  if (!partnerId) {
    return [];
  }
  const domain = [["partner_id", "=", partnerId]];
  const fields = ["name", "date_order", "amount_total", "state"];
  return (
    (await searchRead("pos.order", domain, fields, limit, "date_order desc")) ||
    []
  );
}

async function getPosOrdersWithLines(partnerId, limit = 50) {
  if (!partnerId) {
    return { orders: [], lines: [] };
  }

  const domain = [["partner_id", "=", partnerId]];
  const primaryFields = [
    "id",
    "name",
    "date_order",
    "amount_total",
    "amount_paid",
    "state",
  ];
  const fallbackFields = ["id", "name", "date_order", "amount_total", "state"];

  let orders = await safeSearchRead(
    "pos.order",
    domain,
    primaryFields,
    limit,
    "date_order desc"
  );
  if (!orders) {
    orders = await safeSearchRead(
      "pos.order",
      domain,
      fallbackFields,
      limit,
      "date_order desc"
    );
  }
  if (!orders) {
    return { orders: [], lines: [] };
  }

  const orderIds = orders.map((order) => order.id).filter(Boolean);
  if (!orderIds.length) {
    return { orders, lines: [] };
  }

  const lineFieldsPrimary = [
    "order_id",
    "full_product_name",
    "name",
    "qty",
    "price_subtotal_incl",
    "price_subtotal",
    "price_unit",
    "product_id",
  ];
  const lineFieldsFallback = [
    "order_id",
    "name",
    "qty",
    "price_subtotal",
    "price_unit",
    "product_id",
  ];

  let lines = await safeSearchRead(
    "pos.order.line",
    [["order_id", "in", orderIds]],
    lineFieldsPrimary,
    2000,
    null
  );
  if (!lines) {
    lines = await safeSearchRead(
      "pos.order.line",
      [["order_id", "in", orderIds]],
      lineFieldsFallback,
      2000,
      null
    );
  }

  return { orders, lines: lines || [] };
}

module.exports = {
  hasOdooConfig,
  normalizeCI,
  normalizePhone,
  findPartnerByCI,
  findPartnerByPhone,
  getPartnerSummary,
  getPendingInvoices,
  getLastPosOrders,
  getPatientIdFromPartner,
  findPatientByCI,
  findPatientByPhone,
  getPosOrdersWithLines,
  getSessionInfo: () => ({
    uid: sessionUid,
    readyAt: sessionReadyAt,
    expiresAt: sessionExpiresAt,
  }),
};
