const { sendText, sendList, sendLocation } = require("./whatsapp");
const {
  findPatientByPhone,
  findPartnerByPhone,
  findPatientByCI,
  getUnpaidInvoices,
  getLastPosOrders,
} = require("./odoo");
const sessionStore = require("./sessionStore");

const STATES = {
  MAIN: "MAIN",
  ASK_CI: "ASK_CI",
  LINKING: "LINKING",
  DONE: "DONE",
};

const ACTIONS = {
  PAYMENTS: "PAYMENTS",
  POS_LAST: "POS_LAST",
  MY_DATA: "MY_DATA",
  LOCATION: "LOCATION",
  HOURS: "HOURS",
};

const MENU = {
  header: "Podopie",
  body: "¿Qué querés hacer?",
  footer: "Escribí 'menu' para volver al menú.",
  button: "Ver opciones",
  sections: [
    {
      title: "Mi cuenta",
      rows: [
        { id: ACTIONS.PAYMENTS, title: "📌 Pagos pendientes" },
        { id: ACTIONS.POS_LAST, title: "🧾 Últimas compras" },
        { id: ACTIONS.MY_DATA, title: "🧑‍⚕️ Mis datos" },
      ],
    },
    {
      title: "Información",
      rows: [
        { id: ACTIONS.LOCATION, title: "📍 Ubicación" },
        { id: ACTIONS.HOURS, title: "🕒 Horarios" },
      ],
    },
  ],
};

const HOURS_TEXT =
  "Horarios de atención:\nLunes a Viernes 09:00 a 19:00\nSábados 09:00 a 13:00";
const LOCATION_TEXT = "Estamos en Podopie. Te comparto la ubicación.";

const LOCATION = {
  latitude: process.env.LOCATION_LAT,
  longitude: process.env.LOCATION_LNG,
  name: process.env.LOCATION_NAME || "Podopie",
  address: process.env.LOCATION_ADDRESS || "Dirección pendiente",
};

function normalizeText(text) {
  return (text || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function onlyDigits(text) {
  return (text || "").replace(/\D+/g, "");
}

function normalizePhones(waId) {
  const digits = onlyDigits(waId);
  if (!digits) {
    return [];
  }
  const variants = new Set();
  variants.add(`+${digits}`);
  variants.add(digits);
  if (digits.length >= 8) {
    const short = digits.slice(-8);
    variants.add(short);
    variants.add(`0${short}`);
  }
  return Array.from(variants);
}

function mergeVariants(...lists) {
  const merged = new Set();
  for (const list of lists) {
    for (const item of list || []) {
      merged.add(item);
    }
  }
  return Array.from(merged);
}

function extractPartnerId(record) {
  const partner = record?.partner_id;
  if (Array.isArray(partner)) {
    return partner[0];
  }
  if (typeof partner === "number") {
    return partner;
  }
  return null;
}

async function sendMainMenu(waId) {
  await sendList(
    waId,
    MENU.header,
    MENU.body,
    MENU.footer,
    MENU.button,
    MENU.sections
  );
}

async function linkByPhone(waId) {
  const variants = normalizePhones(waId);
  const patientMatch = await findPatientByPhone(variants);
  if (patientMatch) {
    const record = patientMatch.record;
    let partnerId = extractPartnerId(record);
    if (!partnerId) {
      const partnerMatch = await findPartnerByPhone(variants);
      if (partnerMatch) {
        partnerId = partnerMatch.record.id;
      }
    }
    return {
      patientId: record.id,
      partnerId,
      name: record.name,
      phone: record.phone,
      mobile: record.mobile,
      vat: record.vat,
    };
  }

  const partnerMatch = await findPartnerByPhone(variants);
  if (partnerMatch) {
    const record = partnerMatch.record;
    return {
      partnerId: record.id,
      name: record.name,
      phone: record.phone,
      mobile: record.mobile,
      vat: record.vat,
    };
  }

  return null;
}

async function handleAskCi(waId, session, text) {
  const normalized = normalizeText(text);
  if (normalized === "salir") {
    await sessionStore.clearSession(waId);
    await sendText(waId, "Listo, sesión cerrada.");
    return null;
  }

  const ci = onlyDigits(text);
  if (!ci) {
    await sendText(
      waId,
      "No entendí el CI. Escribilo solo con números o responde 'SALIR'."
    );
    return session;
  }

  let match = null;
  try {
    match = await findPatientByCI(ci);
  } catch (error) {
    console.error("Odoo CI lookup error", error?.message || error);
    await sendText(
      waId,
      "Tuvimos un problema al validar tu CI. Probá de nuevo en unos minutos."
    );
    return session;
  }
  if (!match) {
    await sendText(
      waId,
      "No encontré ese CI. ¿Querés intentar de nuevo? Escribe tu CI o responde 'SALIR'."
    );
    return session;
  }

  const record = match.record;
  let partnerId =
    match.model === "medical.patient" ? extractPartnerId(record) : record.id;
  const patientId = match.model === "medical.patient" ? record.id : null;
  if (match.model === "medical.patient" && !partnerId) {
    try {
      const variants = mergeVariants(
        normalizePhones(waId),
        normalizePhones(record.phone),
        normalizePhones(record.mobile)
      );
      const partnerMatch = await findPartnerByPhone(variants);
      if (partnerMatch) {
        partnerId = partnerMatch.record.id;
      }
    } catch (error) {
      console.error("Odoo partner lookup error", error?.message || error);
    }
  }

  const next = await sessionStore.updateSession(waId, {
    state: STATES.MAIN,
    data: {
      partnerId,
      patientId,
      name: record.name,
      phone: record.phone,
      mobile: record.mobile,
      vat: record.vat,
      lastAction: "IDENTIFIED_BY_CI",
    },
  });
  console.log(
    `[FLOW] wa_id=${waId} linked_by=ci patient=${patientId || "n/a"} partner=${
      partnerId || "n/a"
    }`
  );
  await sendMainMenu(waId);
  return next;
}

async function ensureLinked(waId, session) {
  if (session.data?.partnerId || session.data?.patientId) {
    return session;
  }

  await sessionStore.updateSession(waId, { state: STATES.LINKING });
  let data = null;
  try {
    data = await linkByPhone(waId);
  } catch (error) {
    console.error("Odoo phone lookup error", error?.message || error);
    await sendText(
      waId,
      "Tuvimos un problema al validar tu identidad. Probá más tarde."
    );
    return session;
  }
  if (data) {
    const next = await sessionStore.updateSession(waId, {
      state: STATES.MAIN,
      data: { ...data, lastAction: "IDENTIFIED_BY_PHONE" },
    });
    console.log(
      `[FLOW] wa_id=${waId} linked_by=phone patient=${
        data.patientId || "n/a"
      } partner=${data.partnerId || "n/a"}`
    );
    return next;
  }

  const next = await sessionStore.updateSession(waId, { state: STATES.ASK_CI });
  await sendText(
    waId,
    "👋 Hola! Para ayudarte necesito validar tu identidad. Escribe tu CI (solo números)."
  );
  return next;
}

function formatInvoices(invoices) {
  return invoices
    .map((invoice) => {
      const date = invoice.invoice_date || "s/f";
      const amount = Number(invoice.amount_residual || 0).toFixed(2);
      return `- ${invoice.name || "Factura"} | ${date} | ${amount}`;
    })
    .join("\n");
}

function formatPosOrders(orders) {
  return orders
    .map((order) => {
      const date = order.date_order || "s/f";
      const amount = Number(order.amount_total || 0).toFixed(2);
      return `- ${order.name || "Orden"} | ${date} | ${amount}`;
    })
    .join("\n");
}

async function handleMenuAction(waId, actionId, session) {
  const partnerId = session.data?.partnerId;

  if (actionId === ACTIONS.PAYMENTS) {
    if (!partnerId) {
      await sendText(
        waId,
        "Necesito validar tu identidad antes de ver pagos. Escribí tu CI."
      );
      await sessionStore.updateSession(waId, { state: STATES.ASK_CI });
      return;
    }
    let invoices = [];
    try {
      invoices = await getUnpaidInvoices(partnerId);
    } catch (error) {
      console.error("Odoo payments error", error?.message || error);
      await sendText(
        waId,
        "No pude consultar tus pagos pendientes en este momento."
      );
      return;
    }
    if (!invoices.length) {
      await sendText(waId, "✅ No tienes pagos pendientes.");
    } else {
      await sendText(
        waId,
        `Pagos pendientes:\n${formatInvoices(invoices)}`
      );
    }
    await sessionStore.updateSession(waId, {
      state: STATES.MAIN,
      data: { lastAction: ACTIONS.PAYMENTS },
    });
    await sendMainMenu(waId);
    return;
  }

  if (actionId === ACTIONS.POS_LAST) {
    if (!partnerId) {
      await sendText(
        waId,
        "Necesito validar tu identidad antes de ver compras. Escribí tu CI."
      );
      await sessionStore.updateSession(waId, { state: STATES.ASK_CI });
      return;
    }
    let orders = [];
    try {
      orders = await getLastPosOrders(partnerId, 5);
    } catch (error) {
      console.error("Odoo POS error", error?.message || error);
      await sendText(
        waId,
        "No pude consultar tus compras en este momento."
      );
      return;
    }
    if (!orders.length) {
      await sendText(waId, "No encontré compras recientes.");
    } else {
      await sendText(waId, `Últimas compras:\n${formatPosOrders(orders)}`);
    }
    await sessionStore.updateSession(waId, {
      state: STATES.MAIN,
      data: { lastAction: ACTIONS.POS_LAST },
    });
    await sendMainMenu(waId);
    return;
  }

  if (actionId === ACTIONS.MY_DATA) {
    const name = session.data?.name || "Paciente";
    const phone = session.data?.phone || session.data?.mobile || "-";
    const vat = session.data?.vat || "-";
    const patientId = session.data?.patientId || "-";
    const partner = session.data?.partnerId || "-";
    await sendText(
      waId,
      `Mis datos:\nNombre: ${name}\nTel: ${phone}\nCI/NIT: ${vat}\nPaciente ID: ${patientId}\nPartner ID: ${partner}`
    );
    await sessionStore.updateSession(waId, {
      state: STATES.MAIN,
      data: { lastAction: ACTIONS.MY_DATA },
    });
    await sendMainMenu(waId);
    return;
  }

  if (actionId === ACTIONS.LOCATION) {
    await sendText(waId, LOCATION_TEXT);
    await sendLocation(
      waId,
      LOCATION.latitude,
      LOCATION.longitude,
      LOCATION.name,
      LOCATION.address
    );
    await sessionStore.updateSession(waId, {
      state: STATES.MAIN,
      data: { lastAction: ACTIONS.LOCATION },
    });
    await sendMainMenu(waId);
    return;
  }

  if (actionId === ACTIONS.HOURS) {
    await sendText(waId, HOURS_TEXT);
    await sessionStore.updateSession(waId, {
      state: STATES.MAIN,
      data: { lastAction: ACTIONS.HOURS },
    });
    await sendMainMenu(waId);
    return;
  }

  await sendMainMenu(waId);
}

async function handleIncomingText(waId, text) {
  const normalized = normalizeText(text);
  const session = await sessionStore.getSession(waId);

  if (normalized === "salir") {
    await sessionStore.clearSession(waId);
    await sendText(waId, "Listo, sesión cerrada.");
    return;
  }

  if (normalized === "menu" || normalized === "0") {
    const linked = await ensureLinked(waId, session);
    if (linked.state === STATES.ASK_CI) {
      return;
    }
    await sendMainMenu(waId);
    return;
  }

  if (session.state === STATES.ASK_CI) {
    await handleAskCi(waId, session, text);
    return;
  }

  const linked = await ensureLinked(waId, session);
  if (linked.state === STATES.ASK_CI) {
    return;
  }

  await sendMainMenu(waId);
}

async function handleInteractive(waId, selectionId) {
  if (!selectionId) {
    return;
  }
  const session = await sessionStore.getSession(waId);
  const linked = await ensureLinked(waId, session);
  if (linked.state === STATES.ASK_CI) {
    return;
  }
  await handleMenuAction(waId, selectionId, linked);
}

module.exports = {
  handleIncomingText,
  handleInteractive,
  normalizePhones,
  STATES,
  ACTIONS,
};
