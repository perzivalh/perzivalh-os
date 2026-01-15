const axios = require("axios");

const { ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASS } = process.env;

const baseUrl = (ODOO_URL || "").replace(/\/+$/, "");
const client = axios.create({
  baseURL: baseUrl,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

let sessionCookie = null;
let sessionUid = null;
let sessionReadyAt = null;

function hasOdooConfig() {
  return Boolean(ODOO_URL && ODOO_DB && ODOO_USER && ODOO_PASS);
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
      login: ODOO_USER,
      password: ODOO_PASS,
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
  return sessionUid;
}

async function loginViaJsonRpc() {
  const payload = {
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "web",
      method: "session_authenticate",
      args: [ODOO_DB, ODOO_USER, ODOO_PASS],
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
  return sessionUid;
}

async function odooLogin() {
  try {
    return await loginViaWeb();
  } catch (error) {
    console.warn("Odoo login via web failed, retrying via jsonrpc");
    return loginViaJsonRpc();
  }
}

async function ensureSession() {
  if (!sessionCookie || !sessionUid) {
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
      args: [ODOO_DB, sessionUid, ODOO_PASS, model, method, args, kwargs],
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

async function findPatientByPhone(phoneVariants) {
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
    phoneVariants,
    fields
  );
  if (!record) {
    return null;
  }
  return { model: "medical.patient", record };
}

async function findPartnerByPhone(phoneVariants) {
  const fields = ["id", "name", "phone", "mobile", "vat"];
  const phoneFields = ["mobile", "phone"];
  const record = await findByPhoneInModel(
    "res.partner",
    phoneFields,
    phoneVariants,
    fields
  );
  if (!record) {
    return null;
  }
  return { model: "res.partner", record };
}

async function findPatientByCI(ci) {
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
    return { model: "medical.patient", record: patient };
  }

  const partnerFields = ["id", "name", "phone", "mobile", "vat"];
  const partnerCiFields = ["vat", "x_ci", "nif", "identification_id"];
  const partner = await findByCiInModel(
    "res.partner",
    partnerCiFields,
    ci,
    partnerFields
  );
  if (!partner) {
    return null;
  }
  return { model: "res.partner", record: partner };
}

async function getUnpaidInvoices(partnerId) {
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
  return records.filter((invoice) => {
    const residual = Number(invoice.amount_residual || 0);
    return residual > 0 || invoice.payment_state !== "paid";
  });
}

async function getLastPosOrders(partnerId, limit = 5) {
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

module.exports = {
  odooLogin,
  searchRead,
  findPartnerByPhone,
  findPatientByPhone,
  findPatientByCI,
  getUnpaidInvoices,
  getLastPosOrders,
  hasOdooConfig,
  getSessionInfo: () => ({
    uid: sessionUid,
    readyAt: sessionReadyAt,
  }),
};
