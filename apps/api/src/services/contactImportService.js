/**
 * Contact Import Service
 * Import, sync and reconcile contacts from Odoo.
 */
const prisma = require("../db");
const logger = require("../lib/logger");
const {
  normalizePhone,
  toCanonicalBoliviaPhone,
  searchRead,
} = require("./odooClient");
const {
  updateConversationFlags,
  updateConversationVerification,
} = require("./conversations");

const DEFAULT_BATCH_SIZE = 500;

function parseOdooDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pickPhoneRaw(record = {}) {
  return record.mobile || record.phone || null;
}

function toPhoneE164FromRaw(phoneRaw) {
  const variants = normalizePhone(phoneRaw);
  return (
    variants.find((entry) => entry.startsWith("+")) ||
    toCanonicalBoliviaPhone(phoneRaw)
  );
}

function extractPartnerId(partnerField) {
  if (Array.isArray(partnerField)) {
    return partnerField[0] || null;
  }
  const parsed = Number(partnerField);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatWriteDateForOdoo(date) {
  if (!date) {
    return null;
  }
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) {
    return null;
  }
  return value.toISOString().slice(0, 19).replace("T", " ");
}

async function upsertOdooContactFromPartner(partner) {
  const phoneRaw = pickPhoneRaw(partner);
  const phoneE164 = toPhoneE164FromRaw(phoneRaw);
  const phoneCanonical = toCanonicalBoliviaPhone(phoneRaw || partner.phone || partner.mobile);
  const partnerCreatedAt = parseOdooDate(partner.create_date);
  const partnerWriteAt = parseOdooDate(partner.write_date) || partnerCreatedAt || new Date();
  const data = {
    name: partner.name || "Sin nombre",
    phone_e164: phoneE164 || null,
    phone_canonical: phoneCanonical || null,
    phone_raw: phoneRaw || null,
    email: partner.email || null,
    vat: partner.vat || null,
    partner_created_at: partnerCreatedAt,
    partner_write_at: partnerWriteAt,
    last_synced_at: new Date(),
  };

  const existing = await prisma.odooContact.findUnique({
    where: { odoo_partner_id: partner.id },
    select: { id: true },
  });

  if (existing) {
    await prisma.odooContact.update({
      where: { odoo_partner_id: partner.id },
      data,
    });
    return { imported: true, created: false, updated: true, partnerId: partner.id };
  }

  await prisma.odooContact.create({
    data: {
      odoo_partner_id: partner.id,
      is_patient: false,
      ...data,
    },
  });
  return { imported: true, created: true, updated: false, partnerId: partner.id };
}

async function upsertOdooContactFromPatient(patient) {
  const partnerId = extractPartnerId(patient.partner_id);
  if (!partnerId) {
    return { updated: false, partnerId: null };
  }

  const phoneRaw = pickPhoneRaw(patient);
  const phoneE164 = toPhoneE164FromRaw(phoneRaw);
  const phoneCanonical = toCanonicalBoliviaPhone(phoneRaw || patient.phone || patient.mobile);
  const patientCreatedAt = parseOdooDate(patient.create_date);
  const patientWriteAt = parseOdooDate(patient.write_date) || patientCreatedAt || new Date();

  const existing = await prisma.odooContact.findUnique({
    where: { odoo_partner_id: partnerId },
    select: {
      id: true,
      is_patient: true,
      first_seen_as_patient_at: true,
    },
  });

  const data = {
    name: patient.name || "Sin nombre",
    phone_e164: phoneE164 || undefined,
    phone_canonical: phoneCanonical || undefined,
    phone_raw: phoneRaw || undefined,
    is_patient: true,
    odoo_patient_id: patient.id || null,
    patient_created_at: patientCreatedAt,
    patient_write_at: patientWriteAt,
    first_seen_as_patient_at:
      existing?.first_seen_as_patient_at ||
      patientCreatedAt ||
      new Date(),
    last_synced_at: new Date(),
  };

  if (existing) {
    await prisma.odooContact.update({
      where: { odoo_partner_id: partnerId },
      data,
    });
  } else {
    await prisma.odooContact.create({
      data: {
        odoo_partner_id: partnerId,
        name: patient.name || "Sin nombre",
        is_patient: true,
        ...data,
      },
    });
  }

  return { updated: true, partnerId };
}

async function fetchAllOdooPartners(limit) {
  const partners = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const batch = await searchRead(
      "res.partner",
      [["active", "=", true]],
      ["id", "name", "phone", "mobile", "email", "vat", "create_date", "write_date"],
      DEFAULT_BATCH_SIZE,
      "id asc",
      offset
    );
    if (!batch?.length) {
      break;
    }
    for (const partner of batch) {
      partners.push(partner);
      if (limit && partners.length >= limit) {
        hasMore = false;
        break;
      }
    }
    offset += batch.length;
    if (batch.length < DEFAULT_BATCH_SIZE) {
      hasMore = false;
    }
  }

  return partners;
}

async function fetchIncrementalPartners(sinceDate) {
  const formatted = formatWriteDateForOdoo(sinceDate);
  const domain = [["active", "=", true]];
  if (formatted) {
    domain.push(["write_date", ">", formatted]);
  }

  let offset = 0;
  let hasMore = true;
  const rows = [];

  while (hasMore) {
    const batch = await searchRead(
      "res.partner",
      domain,
      ["id", "name", "phone", "mobile", "email", "vat", "create_date", "write_date"],
      DEFAULT_BATCH_SIZE,
      "write_date asc, id asc",
      offset
    );
    if (!batch?.length) {
      break;
    }
    rows.push(...batch);
    offset += batch.length;
    if (batch.length < DEFAULT_BATCH_SIZE) {
      hasMore = false;
    }
  }

  return rows;
}

async function fetchIncrementalPatients(sinceDate) {
  const formatted = formatWriteDateForOdoo(sinceDate);
  const domain = [];
  if (formatted) {
    domain.push(["write_date", ">", formatted]);
  }

  let offset = 0;
  let hasMore = true;
  const rows = [];

  while (hasMore) {
    const batch = await searchRead(
      "medical.patient",
      domain,
      ["id", "name", "partner_id", "phone", "mobile", "create_date", "write_date"],
      DEFAULT_BATCH_SIZE,
      "write_date asc, id asc",
      offset
    );
    if (!batch?.length) {
      break;
    }
    rows.push(...batch);
    offset += batch.length;
    if (batch.length < DEFAULT_BATCH_SIZE) {
      hasMore = false;
    }
  }

  return rows;
}

async function reconcileOdooContactsWithConversations(contactIds = []) {
  const where = contactIds.length
    ? { id: { in: contactIds } }
    : { phone_canonical: { not: null } };

  const contacts = await prisma.odooContact.findMany({
    where,
    select: {
      id: true,
      odoo_partner_id: true,
      odoo_patient_id: true,
      is_patient: true,
      phone_canonical: true,
      patient_created_at: true,
    },
  });

  let matchedConversations = 0;
  let autoAsistioApplied = 0;

  for (const contact of contacts) {
    if (!contact.phone_canonical) {
      continue;
    }
    const waDigits = contact.phone_canonical.replace(/^\+/, "");

    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { phone_canonical: contact.phone_canonical },
          { phone_e164: contact.phone_canonical },
          { wa_id: waDigits },
        ],
      },
      select: {
        id: true,
        created_at: true,
        partner_id: true,
        patient_id: true,
        asistio: true,
        asistio_source: true,
      },
    });

    for (const conversation of conversations) {
      matchedConversations += 1;
      if (
        conversation.partner_id !== contact.odoo_partner_id ||
        conversation.patient_id !== (contact.odoo_patient_id || null)
      ) {
        await updateConversationVerification({
          conversationId: conversation.id,
          partnerId: contact.odoo_partner_id,
          patientId: contact.odoo_patient_id || null,
          method: "odoo_sync_auto",
        });
      }

      const shouldAutoMarkAttendance =
        contact.is_patient &&
        contact.patient_created_at &&
        contact.patient_created_at >= conversation.created_at &&
        conversation.asistio_source !== "manual";

      if (shouldAutoMarkAttendance) {
        const updatedConversation = await updateConversationFlags({
          conversationId: conversation.id,
          asistio: true,
          source: "odoo_auto",
          metadata: {
            odoo_contact_id: contact.id,
            patient_created_at: contact.patient_created_at,
          },
        });
        if (updatedConversation?.asistio_source === "odoo_auto") {
          autoAsistioApplied += 1;
        }
      }
    }
  }

  return {
    contacts_checked: contacts.length,
    matched_conversations: matchedConversations,
    auto_asistio_applied: autoAsistioApplied,
  };
}

async function syncPatientsFromOdoo({ lastPatientWriteAt = null } = {}) {
  let patientRows = [];
  try {
    patientRows = await fetchIncrementalPatients(lastPatientWriteAt);
  } catch (error) {
    logger.warn("odoo.patient_incremental_failed", {
      message: error.message || String(error),
    });
  }

  let updated = 0;
  const touchedPartnerIds = new Set();
  let lastWriteAt = lastPatientWriteAt ? new Date(lastPatientWriteAt) : null;

  for (const patient of patientRows) {
    const result = await upsertOdooContactFromPatient(patient);
    if (result.updated) {
      updated += 1;
    }
    if (result.partnerId) {
      touchedPartnerIds.add(result.partnerId);
    }
    const writeAt = parseOdooDate(patient.write_date) || parseOdooDate(patient.create_date);
    if (writeAt && (!lastWriteAt || writeAt > lastWriteAt)) {
      lastWriteAt = writeAt;
    }
  }

  return {
    updated,
    touchedPartnerIds: Array.from(touchedPartnerIds),
    lastPatientWriteAt: lastWriteAt,
  };
}

async function importAllFromOdoo(options = {}) {
  logger.info("odoo.import_full.started");
  const partners = await fetchAllOdooPartners(options.limit ? Number(options.limit) : null);

  let created = 0;
  let updated = 0;
  const touchedPartnerIds = [];

  for (const partner of partners) {
    const result = await upsertOdooContactFromPartner(partner);
    touchedPartnerIds.push(result.partnerId);
    if (result.created) {
      created += 1;
    }
    if (result.updated) {
      updated += 1;
    }
  }

  const patientSync = await syncPatientsFromOdoo({});
  const contactIds = touchedPartnerIds.length
    ? (await prisma.odooContact.findMany({
        where: { odoo_partner_id: { in: [...new Set([...touchedPartnerIds, ...patientSync.touchedPartnerIds])] } },
        select: { id: true },
      })).map((row) => row.id)
    : [];
  const reconciliation = await reconcileOdooContactsWithConversations(contactIds);

  return {
    totalProcessed: partners.length,
    imported: created + updated,
    new: created,
    updated,
    skipped: 0,
    patient_updates: patientSync.updated,
    reconciliation,
    cursors: {
      last_partner_write_at: partners.reduce((latest, partner) => {
        const writeAt = parseOdooDate(partner.write_date) || parseOdooDate(partner.create_date);
        if (!writeAt) {
          return latest;
        }
        return !latest || writeAt > latest ? writeAt : latest;
      }, null),
      last_patient_write_at: patientSync.lastPatientWriteAt,
    },
  };
}

async function refreshFromOdoo(options = {}) {
  logger.info("odoo.refresh.started", {
    sincePartner: options.lastPartnerWriteAt || null,
    sincePatient: options.lastPatientWriteAt || null,
  });

  const partners = await fetchIncrementalPartners(options.lastPartnerWriteAt || null);
  let created = 0;
  let updated = 0;
  const touchedPartnerIds = new Set();
  let lastPartnerWriteAt = options.lastPartnerWriteAt ? new Date(options.lastPartnerWriteAt) : null;

  for (const partner of partners) {
    const result = await upsertOdooContactFromPartner(partner);
    if (result.created) {
      created += 1;
    }
    if (result.updated) {
      updated += 1;
    }
    if (result.partnerId) {
      touchedPartnerIds.add(result.partnerId);
    }
    const writeAt = parseOdooDate(partner.write_date) || parseOdooDate(partner.create_date);
    if (writeAt && (!lastPartnerWriteAt || writeAt > lastPartnerWriteAt)) {
      lastPartnerWriteAt = writeAt;
    }
  }

  const patientSync = await syncPatientsFromOdoo({
    lastPatientWriteAt: options.lastPatientWriteAt || null,
  });

  const partnerIdsToReconcile = [...new Set([...touchedPartnerIds, ...patientSync.touchedPartnerIds])];
  const contactIds = partnerIdsToReconcile.length
    ? (await prisma.odooContact.findMany({
        where: { odoo_partner_id: { in: partnerIdsToReconcile } },
        select: { id: true },
      })).map((row) => row.id)
    : [];

  const reconciliation = await reconcileOdooContactsWithConversations(contactIds);

  logger.info("odoo.refresh.completed", {
    imported: created + updated,
    patientUpdates: patientSync.updated,
    matchedConversations: reconciliation.matched_conversations,
  });

  return {
    imported: created + updated,
    created,
    updated,
    skipped: 0,
    patient_updates: patientSync.updated,
    reconciliation,
    cursors: {
      last_partner_write_at: lastPartnerWriteAt,
      last_patient_write_at: patientSync.lastPatientWriteAt,
    },
  };
}

async function enrichContactsWithPatientInfo() {
  const result = await syncPatientsFromOdoo({});
  return {
    updated: result.updated,
    lastPatientWriteAt: result.lastPatientWriteAt,
  };
}

async function getContacts(options = {}) {
  const where = {};

  if (options.search) {
    where.OR = [
      { name: { contains: options.search, mode: "insensitive" } },
      { phone_e164: { contains: options.search } },
      { email: { contains: options.search, mode: "insensitive" } },
    ];
  }

  if (options.isPatient !== undefined) {
    where.is_patient = options.isPatient;
  }

  const [contacts, total] = await Promise.all([
    prisma.odooContact.findMany({
      where,
      orderBy: { name: "asc" },
      skip: options.offset || 0,
      take: options.limit || 50,
    }),
    prisma.odooContact.count({ where }),
  ]);

  return {
    contacts,
    total,
    offset: options.offset || 0,
    limit: options.limit || 50,
  };
}

async function getContactStats() {
  const [total, patients, withPhone, lastSync] = await Promise.all([
    prisma.odooContact.count(),
    prisma.odooContact.count({ where: { is_patient: true } }),
    prisma.odooContact.count({ where: { phone_e164: { not: null } } }),
    prisma.odooContact.findFirst({
      orderBy: { last_synced_at: "desc" },
      select: { last_synced_at: true },
    }),
  ]);

  return {
    total,
    patients,
    withPhone,
    lastSyncAt: lastSync?.last_synced_at || null,
  };
}

async function updateContact(contactId, payload = {}) {
  const existing = await prisma.odooContact.findUnique({
    where: { id: contactId },
  });
  if (!existing) {
    throw new Error("not_found");
  }

  const updates = {};
  if (typeof payload.name === "string") {
    updates.name = payload.name.trim() || existing.name;
  }
  if (payload.email !== undefined) {
    updates.email = typeof payload.email === "string" && payload.email.trim()
      ? payload.email.trim()
      : null;
  }
  if (payload.vat !== undefined) {
    updates.vat = typeof payload.vat === "string" && payload.vat.trim()
      ? payload.vat.trim()
      : null;
  }
  if (payload.phone !== undefined) {
    const phoneRaw = typeof payload.phone === "string" ? payload.phone.trim() : "";
    updates.phone_raw = phoneRaw || null;
    updates.phone_e164 = phoneRaw ? toPhoneE164FromRaw(phoneRaw) : null;
    updates.phone_canonical = phoneRaw ? toCanonicalBoliviaPhone(phoneRaw) : null;
  }
  updates.last_synced_at = new Date();

  return prisma.odooContact.update({
    where: { id: contactId },
    data: updates,
  });
}

async function deleteContact(contactId) {
  await prisma.campaignRecipient.updateMany({
    where: { odoo_contact_id: contactId },
    data: { odoo_contact_id: null },
  });
  return prisma.odooContact.delete({
    where: { id: contactId },
  });
}

function getOdooFieldOptions() {
  return [
    { value: "res.partner.name", label: "Nombre del Paciente", group: "Paciente" },
    { value: "res.partner.phone", label: "Telefono", group: "Paciente" },
    { value: "res.partner.email", label: "Email", group: "Paciente" },
    { value: "res.partner.vat", label: "CI / NIT", group: "Paciente" },
    { value: "medical.patient.name", label: "Nombre (Paciente)", group: "Paciente" },
    { value: "account.move.amount_residual", label: "Saldo Pendiente", group: "Pagos" },
    { value: "account.move.name", label: "Numero de Factura", group: "Pagos" },
    { value: "pos.order.date_order", label: "Ultima Compra (Fecha)", group: "Historial" },
    { value: "pos.order.amount_total", label: "Ultima Compra (Monto)", group: "Historial" },
  ];
}

module.exports = {
  importAllFromOdoo,
  refreshFromOdoo,
  enrichContactsWithPatientInfo,
  reconcileOdooContactsWithConversations,
  getContacts,
  getContactStats,
  getOdooFieldOptions,
  updateContact,
  deleteContact,
};
