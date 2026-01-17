const { sendText, sendList, sendLocation } = require("./whatsapp");
const {
  findPatientByPhone,
  findPartnerByPhone,
  findPatientByCI,
  getPosOrdersWithLines,
  getLastPosOrders,
} = require("./odoo");
const sessionStore = require("./sessionStore");

const STATES = {
  MAIN_MENU: "MAIN_MENU",
  ASK_CI: "ASK_CI",
  PATIENT_MENU: "PATIENT_MENU",
};

const ACTIONS = {
  INFO_PRICES: "INFO_PRICES",
  INFO_LOCATION: "INFO_LOCATION",
  INFO_HOURS: "INFO_HOURS",
  PATIENT_ENTRY: "PATIENT_ENTRY",
  HANDOFF: "HANDOFF",
  PATIENT_PAYMENTS: "PATIENT_PAYMENTS",
  PATIENT_POS_LAST: "PATIENT_POS_LAST",
  PATIENT_MY_DATA: "PATIENT_MY_DATA",
  MAIN_MENU: "MAIN_MENU",
};

const MAIN_MENU_COPY = "👋 Bienvenido a Podopie\nElige una opción:";

const MAIN_MENU = {
  header: null,
  body: MAIN_MENU_COPY,
  footer: null,
  button: "Ver opciones",
  sections: [
    {
      title: "Opciones",
      rows: [
        { id: ACTIONS.INFO_PRICES, title: "💬 Consultar precios/servicios" },
        { id: ACTIONS.INFO_LOCATION, title: "📍 Ubicación y sucursales" },
        { id: ACTIONS.INFO_HOURS, title: "⏰ Horarios" },
        {
          id: ACTIONS.PATIENT_ENTRY,
          title: "👤 Soy paciente (ver pagos / historial)",
        },
        { id: ACTIONS.HANDOFF, title: "🧑‍💼 Hablar con recepción" },
      ],
    },
  ],
};

const PATIENT_MENU = {
  header: "Paciente",
  body: "Selecciona una opción:",
  footer: null,
  button: "Ver opciones",
  sections: [
    {
      title: "Mi cuenta",
      rows: [
        { id: ACTIONS.PATIENT_PAYMENTS, title: "Pagos pendientes" },
        { id: ACTIONS.PATIENT_POS_LAST, title: "Ultimas compras" },
        { id: ACTIONS.PATIENT_MY_DATA, title: "Mis datos" },
      ],
    },
    {
      title: "Navegacion",
      rows: [{ id: ACTIONS.MAIN_MENU, title: "⬅ Menú" }],
    },
  ],
};

const HOURS_TEXT =
  "Horarios de atencion:\nLunes a Viernes 09:00 a 19:00\nSabados 09:00 a 13:00";
const LOCATION_TEXT = "Estamos en Podopie. Te comparto la ubicacion.";
const PRICES_TEXT =
  "Para precios y servicios, contanos que tratamiento te interesa y te respondemos a la brevedad.";

const LOCATION = {
  latitude: process.env.LOCATION_LAT,
  longitude: process.env.LOCATION_LNG,
  name: process.env.LOCATION_NAME || "Podopie",
  address: process.env.LOCATION_ADDRESS || "Direccion pendiente",
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

function getLineName(line) {
  if (!line) {
    return "";
  }
  if (line.full_product_name) {
    return line.full_product_name;
  }
  if (line.name) {
    return line.name;
  }
  if (Array.isArray(line.product_id)) {
    return line.product_id[1] || "";
  }
  return "";
}

function getLineAmount(line) {
  const incl = Number(line.price_subtotal_incl || 0);
  if (incl) {
    return incl;
  }
  const subtotal = Number(line.price_subtotal || 0);
  if (subtotal) {
    return subtotal;
  }
  const qty = Number(line.qty || 1);
  const unit = Number(line.price_unit || 0);
  return qty * unit;
}

function parsePlanSessions(name) {
  if (!name) {
    return null;
  }
  const match = name.match(/(\d+)\s*SESION(?:ES)?/i);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

function parseLaserSession(name) {
  if (!name) {
    return null;
  }
  const match = name.match(/\bLASER\s*(\d+)/i);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

function isPagoLaser(name) {
  return name.toUpperCase().includes("PAGO LASER");
}

function isRefundName(name) {
  return name.toUpperCase().includes("REEMBOLSO");
}

function extractOrderId(value) {
  if (Array.isArray(value)) {
    return value[0];
  }
  if (typeof value === "number") {
    return value;
  }
  return null;
}

async function sendMainMenu(waId) {
  await sessionStore.updateSession(waId, { state: STATES.MAIN_MENU });
  await sendList(
    waId,
    MAIN_MENU.header,
    MAIN_MENU.body,
    MAIN_MENU.footer,
    MAIN_MENU.button,
    MAIN_MENU.sections
  );
}

async function sendPatientMenu(waId) {
  await sessionStore.updateSession(waId, { state: STATES.PATIENT_MENU });
  await sendList(
    waId,
    PATIENT_MENU.header,
    PATIENT_MENU.body,
    PATIENT_MENU.footer,
    PATIENT_MENU.button,
    PATIENT_MENU.sections
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

async function buildLaserSummary(partnerId) {
  const { orders, lines } = await getPosOrdersWithLines(partnerId, 80);
  if (!orders.length) {
    return null;
  }

  const linesByOrder = new Map();
  for (const line of lines) {
    const orderId = extractOrderId(line.order_id);
    if (!orderId) {
      continue;
    }
    if (!linesByOrder.has(orderId)) {
      linesByOrder.set(orderId, []);
    }
    linesByOrder.get(orderId).push(line);
  }

  const sortedOrders = [...orders].sort((a, b) => {
    const aTime = Date.parse(a.date_order || "") || 0;
    const bTime = Date.parse(b.date_order || "") || 0;
    return bTime - aTime;
  });

  let planOrder = null;
  let planLine = null;
  let planSessions = null;

  for (const order of sortedOrders) {
    if (isRefundName(order.name || "")) {
      continue;
    }
    const orderLines = linesByOrder.get(order.id) || [];
    if (orderLines.some((line) => isRefundName(getLineName(line)))) {
      continue;
    }
    for (const line of orderLines) {
      const sessions = parsePlanSessions(getLineName(line));
      if (sessions) {
        planOrder = order;
        planLine = line;
        planSessions = sessions;
        break;
      }
    }
    if (planOrder) {
      break;
    }
  }

  if (!planOrder || !planLine || !planSessions) {
    return null;
  }

  const planTotal =
    getLineAmount(planLine) || Number(planOrder.amount_total || 0);
  const initialPaid = Number(planOrder.amount_paid || 0);
  const planDate = Date.parse(planOrder.date_order || "") || 0;

  let pagoTotal = 0;
  let sessionsUsed = 0;

  for (const order of sortedOrders) {
    if (isRefundName(order.name || "")) {
      continue;
    }
    const orderDate = Date.parse(order.date_order || "") || 0;
    if (orderDate && planDate && orderDate < planDate) {
      continue;
    }
    const orderLines = linesByOrder.get(order.id) || [];
    if (orderLines.some((line) => isRefundName(getLineName(line)))) {
      continue;
    }
    for (const line of orderLines) {
      const name = getLineName(line);
      if (!name) {
        continue;
      }
      if (isPagoLaser(name)) {
        pagoTotal += getLineAmount(line);
        continue;
      }
      const sessionNum = parseLaserSession(name);
      if (sessionNum !== null) {
        const qty = Number(line.qty || 1);
        sessionsUsed += qty > 0 ? qty : 1;
      }
    }
  }

  const paidTotal = initialPaid + pagoTotal;
  const pending = Math.max(0, planTotal - paidTotal);
  const nextSession = Math.min(planSessions, sessionsUsed + 1);

  return {
    planName: getLineName(planLine),
    planSessions,
    planTotal,
    paidTotal,
    pending,
    sessionsUsed,
    nextSession,
  };
}

async function handleAskCi(waId, session, text) {
  const normalized = normalizeText(text);
  if (normalized === "salir") {
    await sessionStore.clearSession(waId);
    await sendText(waId, "Listo, sesion cerrada.");
    return null;
  }

  const ci = onlyDigits(text);
  if (!ci) {
    await sendText(
      waId,
      "No entendi el CI. Escribilo solo con numeros o responde 'SALIR'."
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
      "Tuvimos un problema al validar tu CI. Proba de nuevo en unos minutos."
    );
    return session;
  }
  if (!match) {
    await sendText(
      waId,
      "No encontre ese CI. Queres intentar de nuevo? Escribe tu CI o responde 'SALIR'."
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
    state: STATES.PATIENT_MENU,
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
  await sendPatientMenu(waId);
  return next;
}

async function ensureLinkedForPatient(waId, session) {
  if (session.data?.partnerId || session.data?.patientId) {
    return session;
  }

  await sessionStore.updateSession(waId, { state: STATES.PATIENT_MENU });
  let data = null;
  try {
    data = await linkByPhone(waId);
  } catch (error) {
    console.error("Odoo phone lookup error", error?.message || error);
    await sendText(
      waId,
      "Tuvimos un problema al validar tu identidad. Proba mas tarde."
    );
    return session;
  }
  if (data) {
    const next = await sessionStore.updateSession(waId, {
      state: STATES.PATIENT_MENU,
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
    "Hola! Para ayudarte necesito validar tu identidad. Escribe tu CI (solo numeros)."
  );
  return next;
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

async function handlePatientAction(waId, actionId, session) {
  const partnerId = session.data?.partnerId;

  if (actionId === ACTIONS.PATIENT_PAYMENTS) {
    if (!partnerId) {
      await sendText(
        waId,
        "Necesito validar tu identidad antes de ver pagos. Escribi tu CI."
      );
      await sessionStore.updateSession(waId, { state: STATES.ASK_CI });
      return;
    }
    let summary = null;
    try {
      summary = await buildLaserSummary(partnerId);
    } catch (error) {
      console.error("Odoo payments error", error?.message || error);
      await sendText(
        waId,
        "No pude consultar tus pagos pendientes en este momento."
      );
      return;
    }
    if (!summary) {
      await sendText(
        waId,
        "No encontre un plan de sesiones laser activo asociado a tu cuenta."
      );
    } else {
      const lines = [
        `Plan: ${summary.planName || `${summary.planSessions} sesiones`}`,
        `Sesiones usadas: ${summary.sessionsUsed} de ${summary.planSessions}`,
        `Sesion siguiente: ${summary.nextSession}`,
      ];
      if (summary.pending <= 0) {
        lines.unshift("No tienes pagos pendientes de sesiones laser.");
      } else {
        lines.unshift(
          `Pendiente por sesiones laser: ${summary.pending.toFixed(2)} Bs.`
        );
      }
      await sendText(waId, lines.join("\n"));
    }
    await sessionStore.updateSession(waId, {
      state: STATES.PATIENT_MENU,
      data: { lastAction: ACTIONS.PATIENT_PAYMENTS },
    });
    await sendPatientMenu(waId);
    return;
  }

  if (actionId === ACTIONS.PATIENT_POS_LAST) {
    if (!partnerId) {
      await sendText(
        waId,
        "Necesito validar tu identidad antes de ver compras. Escribi tu CI."
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
      await sendText(waId, "No encontre compras recientes.");
    } else {
      await sendText(waId, `Ultimas compras:\n${formatPosOrders(orders)}`);
    }
    await sessionStore.updateSession(waId, {
      state: STATES.PATIENT_MENU,
      data: { lastAction: ACTIONS.PATIENT_POS_LAST },
    });
    await sendPatientMenu(waId);
    return;
  }

  if (actionId === ACTIONS.PATIENT_MY_DATA) {
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
      state: STATES.PATIENT_MENU,
      data: { lastAction: ACTIONS.PATIENT_MY_DATA },
    });
    await sendPatientMenu(waId);
    return;
  }

  await sendPatientMenu(waId);
}

async function handleInfoAction(waId, actionId) {
  if (actionId === ACTIONS.INFO_PRICES) {
    await sendText(waId, PRICES_TEXT);
    await sendMainMenu(waId);
    return;
  }

  if (actionId === ACTIONS.INFO_LOCATION) {
    await sendText(waId, LOCATION_TEXT);
    await sendLocation(
      waId,
      LOCATION.latitude,
      LOCATION.longitude,
      LOCATION.name,
      LOCATION.address
    );
    await sendMainMenu(waId);
    return;
  }

  if (actionId === ACTIONS.INFO_HOURS) {
    await sendText(waId, HOURS_TEXT);
    await sendMainMenu(waId);
    return;
  }

  await sendMainMenu(waId);
}

function isMenuTrigger(normalized) {
  return ["menu", "inicio", "volver"].includes(normalized);
}

async function handleIncomingText(waId, text) {
  const normalized = normalizeText(text);
  const session = await sessionStore.getSession(waId);

  if (normalized === "salir") {
    await sessionStore.clearSession(waId);
    await sendText(waId, "Listo, sesion cerrada.");
    return;
  }

  if (isMenuTrigger(normalized) || normalized === "0") {
    await sendMainMenu(waId);
    return;
  }

  if (session.state === STATES.ASK_CI) {
    await handleAskCi(waId, session, text);
    return;
  }

  await sendMainMenu(waId);
}

async function handleInteractive(waId, selectionId) {
  if (!selectionId) {
    return;
  }
  const session = await sessionStore.getSession(waId);

  if (selectionId === ACTIONS.MAIN_MENU) {
    await sendMainMenu(waId);
    return;
  }

  if (
    selectionId === ACTIONS.INFO_PRICES ||
    selectionId === ACTIONS.INFO_LOCATION ||
    selectionId === ACTIONS.INFO_HOURS
  ) {
    await handleInfoAction(waId, selectionId);
    return;
  }

  if (selectionId === ACTIONS.PATIENT_ENTRY) {
    const linked = await ensureLinkedForPatient(waId, session);
    if (linked.state === STATES.ASK_CI) {
      return;
    }
    await sendPatientMenu(waId);
    return;
  }

  if (
    selectionId === ACTIONS.PATIENT_PAYMENTS ||
    selectionId === ACTIONS.PATIENT_POS_LAST ||
    selectionId === ACTIONS.PATIENT_MY_DATA
  ) {
    await handlePatientAction(waId, selectionId, session);
    return;
  }
}

module.exports = {
  handleIncomingText,
  handleInteractive,
  normalizePhones,
  STATES,
  ACTIONS,
};
