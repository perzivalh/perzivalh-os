const { sendText, sendList, sendLocation, sendButtons, sendImage } = require("./whatsapp");
const prisma = require("./db");
const {
  normalizeCI,
  normalizePhone,
  findPatientByPhone,
  findPartnerByPhone,
  findPatientByCI,
  findPartnerByCI,
  getPosOrdersWithLines,
  getLastPosOrders,
  getPatientIdFromPartner,
} = require("./services/odooClient");
const sessionStore = require("./sessionStore");
const { updateConversationByWaId } = require("./services/conversations");

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
  SERVICE_BRANCHES: "SERVICE_BRANCHES",
  SERVICE_MENU: "SERVICE_MENU",
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
        {
          id: ACTIONS.INFO_PRICES,
          title: "💬 Precios/servicios",
          description: "💬 Consultar precios/servicios",
        },
        {
          id: ACTIONS.INFO_LOCATION,
          title: "📍 Ubicación",
          description: "📍 Ubicación y sucursales",
        },
        {
          id: ACTIONS.INFO_HOURS,
          title: "⏰ Horarios",
          description: "⏰ Horarios",
        },
        {
          id: ACTIONS.PATIENT_ENTRY,
          title: "👤 Soy paciente",
          description: "👤 Soy paciente (ver pagos / historial)",
        },
        {
          id: ACTIONS.HANDOFF,
          title: "🧑‍💼 Recepción",
          description: "🧑‍💼 Hablar con recepción",
        },
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

const SERVICES_BODY = "Servicios destacados:";
const BRANCH_LIST_BODY = "Selecciona una sucursal:";
const BRANCH_HOURS_BODY = "Selecciona una sucursal para ver horarios:";
const PRICES_FALLBACK =
  "Para precios y servicios, contanos que tratamiento te interesa y te respondemos a la brevedad.";

const MAX_LIST_TITLE = 24;

function normalizeText(text) {
  return (text || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function truncateTitle(value) {
  const text = (value || "").toString().trim();
  if (!text) {
    return "";
  }
  if (text.length <= MAX_LIST_TITLE) {
    return text;
  }
  return `${text.slice(0, MAX_LIST_TITLE - 3)}...`;
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

function formatServiceMessage(service) {
  const lines = [];
  lines.push(service.name);
  if (service.subtitle) {
    lines.push(service.subtitle);
  }
  lines.push(`Precio: Bs ${service.price_bob}`);
  if (service.duration_min) {
    lines.push(`Duración: ${service.duration_min} min`);
  }
  if (service.description) {
    lines.push(service.description);
  }
  return lines.join("\n");
}

function buildMapsLink(branch) {
  if (branch.lat === null || branch.lng === null) {
    return null;
  }
  return `https://maps.google.com/?q=${branch.lat},${branch.lng}`;
}

async function upsertProspect(waId, ciDigits) {
  if (!waId) {
    return;
  }
  try {
    await prisma.prospect.upsert({
      where: { wa_id: waId },
      update: {
        ci_digits: ciDigits || undefined,
      },
      create: {
        wa_id: waId,
        phone_e164: waId,
        ci_digits: ciDigits || null,
      },
    });
  } catch (error) {
    console.error("Prospect upsert error", error?.message || error);
  }
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

async function sendServicesList(waId) {
  let services = await prisma.service.findMany({
    where: { is_active: true, is_featured: true },
    orderBy: { name: "asc" },
    take: 10,
  });
  if (!services.length) {
    services = await prisma.service.findMany({
      where: { is_active: true },
      orderBy: { name: "asc" },
      take: 10,
    });
  }
  if (!services.length) {
    await sendText(waId, PRICES_FALLBACK);
    await sendMainMenu(waId);
    return;
  }

  const rows = services.map((service) => ({
    id: `service:${service.id}`,
    title: truncateTitle(service.name),
    description: `${service.subtitle ? `${service.subtitle} · ` : ""}Bs ${service.price_bob}`,
  }));

  await sendList(waId, "Servicios", SERVICES_BODY, null, "Ver servicios", [
    {
      title: "Destacados",
      rows,
    },
  ]);
}

async function sendServiceDetail(waId, serviceId) {
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service || !service.is_active) {
    await sendText(waId, "Ese servicio no está disponible.");
    await sendMainMenu(waId);
    return;
  }

  if (service.image_url) {
    await sendImage(waId, service.image_url, service.name);
  }
  await sendText(waId, formatServiceMessage(service));
  await sendButtons(waId, "¿Qué deseas hacer?", [
    { id: ACTIONS.SERVICE_BRANCHES, title: "📍 Ver sucursales" },
    { id: ACTIONS.HANDOFF, title: "🧑‍💼 Recepción" },
    { id: ACTIONS.MAIN_MENU, title: "⬅ Menú" },
  ]);
}

async function sendBranchList(waId, mode) {
  const branches = await prisma.branch.findMany({
    where: { is_active: true },
    orderBy: { name: "asc" },
  });
  if (!branches.length) {
    await sendText(waId, "No hay sucursales disponibles.");
    await sendMainMenu(waId);
    return;
  }

  const rows = branches.map((branch) => ({
    id: `branch:${mode}:${branch.id}`,
    title: truncateTitle(branch.name),
    description: branch.address,
  }));

  const body = mode === "hours" ? BRANCH_HOURS_BODY : BRANCH_LIST_BODY;
  await sendList(waId, "Sucursales", body, null, "Ver sucursales", [
    {
      title: "Sucursales",
      rows,
    },
  ]);
}

async function sendBranchLocation(waId, branchId) {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) {
    await sendText(waId, "Sucursal no encontrada.");
    await sendMainMenu(waId);
    return;
  }
  await sendLocation(waId, branch.lat, branch.lng, branch.name, branch.address);
  const lines = [branch.name, branch.address];
  if (branch.phone) {
    lines.push(`Tel: ${branch.phone}`);
  }
  const mapsLink = buildMapsLink(branch);
  if (mapsLink) {
    lines.push(mapsLink);
  }
  await sendText(waId, lines.join("\n"));
  await sendMainMenu(waId);
}

async function sendBranchHours(waId, branchId) {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) {
    await sendText(waId, "Sucursal no encontrada.");
    await sendMainMenu(waId);
    return;
  }
  await sendText(waId, `${branch.name}\n${branch.hours_text}`);
  await sendMainMenu(waId);
}

async function recordVerification(waId, partnerId, patientId, method) {
  try {
    await updateConversationByWaId(waId, {
      partner_id: partnerId ?? null,
      patient_id: patientId ?? null,
      verified_at: new Date(),
      verification_method: method || null,
    });
  } catch (error) {
    console.error("Conversation verification update error", error?.message || error);
  }
}

async function linkByPhone(waId) {
  const variants = normalizePhone(waId);
  const patientMatch = await findPatientByPhone(variants);
  if (patientMatch) {
    let partnerId = extractPartnerId(patientMatch);
    if (!partnerId) {
      const partnerMatch = await findPartnerByPhone(variants);
      if (partnerMatch) {
        partnerId = partnerMatch.id;
      }
    }
    return {
      patientId: patientMatch.id,
      partnerId,
      name: patientMatch.name,
      phone: patientMatch.phone,
      mobile: patientMatch.mobile,
      vat: patientMatch.vat,
    };
  }

  const partnerMatch = await findPartnerByPhone(variants);
  if (partnerMatch) {
    const patientId = await getPatientIdFromPartner(partnerMatch.id);
    return {
      partnerId: partnerMatch.id,
      patientId,
      name: partnerMatch.name,
      phone: partnerMatch.phone,
      mobile: partnerMatch.mobile,
      vat: partnerMatch.vat,
    };
  }

  return null;
}

async function resolveByCI(ciRaw, waId) {
  const ci = normalizeCI(ciRaw);
  if (!ci) {
    return null;
  }
  const patientMatch = await findPatientByCI(ci);
  if (patientMatch) {
    let partnerId = extractPartnerId(patientMatch);
    if (!partnerId) {
      const variants = mergeVariants(
        normalizePhone(patientMatch.phone),
        normalizePhone(patientMatch.mobile),
        normalizePhone(waId)
      );
      const partnerMatch = await findPartnerByPhone(variants);
      if (partnerMatch) {
        partnerId = partnerMatch.id;
      }
    }
    return {
      patientId: patientMatch.id,
      partnerId,
      name: patientMatch.name,
      phone: patientMatch.phone,
      mobile: patientMatch.mobile,
      vat: patientMatch.vat,
    };
  }

  const partnerMatch = await findPartnerByCI(ci);
  if (partnerMatch) {
    const patientId = await getPatientIdFromPartner(partnerMatch.id);
    return {
      partnerId: partnerMatch.id,
      patientId,
      name: partnerMatch.name,
      phone: partnerMatch.phone,
      mobile: partnerMatch.mobile,
      vat: partnerMatch.vat,
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

  const ci = normalizeCI(text);
  if (!ci) {
    await sendText(
      waId,
      "No entendi el CI. Escribilo solo con numeros o responde 'SALIR'."
    );
    return session;
  }

  let resolved = null;
  try {
    resolved = await resolveByCI(ci, waId);
  } catch (error) {
    console.error("Odoo CI lookup error", error?.message || error);
    await sendText(
      waId,
      "Tuvimos un problema al validar tu CI. Proba de nuevo en unos minutos."
    );
    return session;
  }
  if (!resolved) {
    await upsertProspect(waId, ci);
    await sendText(
      waId,
      "No encontre ese CI. Queres intentar de nuevo? Escribe tu CI o responde 'SALIR'."
    );
    return session;
  }

  const next = await sessionStore.updateSession(waId, {
    state: STATES.PATIENT_MENU,
    data: {
      partnerId: resolved.partnerId,
      patientId: resolved.patientId,
      name: resolved.name,
      phone: resolved.phone,
      mobile: resolved.mobile,
      vat: resolved.vat,
      lastAction: "IDENTIFIED_BY_CI",
    },
  });
  await recordVerification(waId, resolved.partnerId, resolved.patientId, "ci");
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
    await recordVerification(waId, data.partnerId, data.patientId, "phone");
    return next;
  }

  await upsertProspect(waId, null);
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
    await sendServicesList(waId);
    return;
  }

  if (actionId === ACTIONS.INFO_LOCATION) {
    await sendBranchList(waId, "location");
    return;
  }

  if (actionId === ACTIONS.INFO_HOURS) {
    await sendBranchList(waId, "hours");
    return;
  }

  await sendMainMenu(waId);
}

function isMenuTrigger(normalized) {
  return ["menu", "inicio", "volver"].includes(normalized);
}

function parseMainMenuSelection(normalized) {
  if (normalized === "1" || normalized.includes("precio") || normalized.includes("servicio")) {
    return ACTIONS.INFO_PRICES;
  }
  if (normalized === "2" || normalized.includes("ubicacion") || normalized.includes("sucursal")) {
    return ACTIONS.INFO_LOCATION;
  }
  if (normalized === "3" || normalized.includes("horario")) {
    return ACTIONS.INFO_HOURS;
  }
  if (normalized === "4" || normalized.includes("soy paciente") || normalized === "paciente") {
    return ACTIONS.PATIENT_ENTRY;
  }
  if (normalized === "5") {
    return ACTIONS.HANDOFF;
  }
  return null;
}

function parsePatientSelection(normalized) {
  if (normalized === "1" || normalized.includes("pago")) {
    return ACTIONS.PATIENT_PAYMENTS;
  }
  if (normalized === "2" || normalized.includes("compra")) {
    return ACTIONS.PATIENT_POS_LAST;
  }
  if (normalized === "3" || normalized.includes("dato")) {
    return ACTIONS.PATIENT_MY_DATA;
  }
  if (normalized === "menu" || normalized.includes("menu")) {
    return ACTIONS.MAIN_MENU;
  }
  return null;
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

  if (session.state === STATES.PATIENT_MENU) {
    const selection = parsePatientSelection(normalized);
    if (selection === ACTIONS.MAIN_MENU) {
      await sendMainMenu(waId);
      return;
    }
    if (
      selection === ACTIONS.PATIENT_PAYMENTS ||
      selection === ACTIONS.PATIENT_POS_LAST ||
      selection === ACTIONS.PATIENT_MY_DATA
    ) {
      await handlePatientAction(waId, selection, session);
      return;
    }
  }

  const mainSelection = parseMainMenuSelection(normalized);
  if (mainSelection === ACTIONS.INFO_PRICES) {
    await handleInfoAction(waId, ACTIONS.INFO_PRICES);
    return;
  }
  if (mainSelection === ACTIONS.INFO_LOCATION) {
    await handleInfoAction(waId, ACTIONS.INFO_LOCATION);
    return;
  }
  if (mainSelection === ACTIONS.INFO_HOURS) {
    await handleInfoAction(waId, ACTIONS.INFO_HOURS);
    return;
  }
  if (mainSelection === ACTIONS.PATIENT_ENTRY) {
    const linked = await ensureLinkedForPatient(waId, session);
    if (linked.state === STATES.ASK_CI) {
      return;
    }
    await sendPatientMenu(waId);
    return;
  }

  await sendMainMenu(waId);
}

async function handleInteractive(waId, selectionId) {
  if (!selectionId) {
    return;
  }
  const session = await sessionStore.getSession(waId);

  if (selectionId === ACTIONS.MAIN_MENU || selectionId === ACTIONS.SERVICE_MENU) {
    await sendMainMenu(waId);
    return;
  }

  if (selectionId === ACTIONS.SERVICE_BRANCHES) {
    await sendBranchList(waId, "location");
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

  if (selectionId.startsWith("service:")) {
    await sendServiceDetail(waId, selectionId.split(":")[1]);
    return;
  }

  if (selectionId.startsWith("branch:location:")) {
    await sendBranchLocation(waId, selectionId.split(":")[2]);
    return;
  }

  if (selectionId.startsWith("branch:hours:")) {
    await sendBranchHours(waId, selectionId.split(":")[2]);
    return;
  }

  await sendMainMenu(waId);
}

module.exports = {
  handleIncomingText,
  handleInteractive,
  STATES,
  ACTIONS,
};
