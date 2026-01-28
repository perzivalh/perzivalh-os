/**
 * Contact Import Service
 * Import and sync contacts from Odoo
 */
const prisma = require("../db");
const logger = require("../lib/logger");
const { normalizePhone } = require("./odooClient");

// Import Odoo search functions
let odooClient = null;
try {
    odooClient = require("./odooClient");
} catch (error) {
    logger.warn("Odoo client not available for contact import");
}

/**
 * Import all contacts from Odoo (initial sync)
 * This fetches all res.partner records with phone numbers
 */
async function importAllFromOdoo(options = {}) {
    if (!odooClient || !(await odooClient.hasOdooConfig())) {
        throw new Error("Odoo not configured");
    }

    logger.info("Starting full Odoo contact import");

    const parsedLimit =
        options.limit !== undefined && options.limit !== null
            ? Number(options.limit)
            : null;
    const totalLimit =
        Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;
    const batchSize = 500;
    let offset = 0;
    let totalImported = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let hasMore = true;

    while (hasMore) {
        try {
            // Fetch partners from Odoo using odooClient's callKw
            const { searchRead } = require("./odooClient");

            const partners = await searchRead(
                "res.partner",
                [["active", "=", true]],
                ["id", "name", "phone", "mobile", "email", "vat"],
                batchSize,
                "id asc",
                offset
            );

            if (!partners || partners.length === 0) {
                hasMore = false;
                break;
            }

            // Process each partner
            for (const partner of partners) {
                const result = await importSinglePartner(partner);
                if (result.imported) {
                    totalImported++;
                    if (result.created) {
                        totalCreated++;
                    } else if (result.updated) {
                        totalUpdated++;
                    }
                } else {
                    totalSkipped++;
                }
            }

            offset += partners.length;

            // Check if we've reached the limit or no more records
            if (partners.length < batchSize || (totalLimit && offset >= totalLimit)) {
                hasMore = false;
            }

            logger.info("Odoo import progress", {
                processed: offset,
                imported: totalImported,
                skipped: totalSkipped,
            });
        } catch (error) {
            logger.error("Odoo import batch error", { offset, error: error.message });
            hasMore = false;
        }
    }

    // Try to get patient info for imported contacts
    await enrichContactsWithPatientInfo();

    logger.info("Odoo contact import completed", {
        totalProcessed: offset,
        totalImported,
        totalSkipped,
    });

    return {
        totalProcessed: offset,
        imported: totalImported,
        new: totalCreated,
        updated: totalUpdated,
        skipped: totalSkipped,
    };
}

/**
 * Import a single partner into OdooContact table
 */
async function importSinglePartner(partner) {
    // Get phone number (prefer mobile over phone)
    const phoneRaw = partner.mobile || partner.phone;
    if (!phoneRaw) {
        return { imported: false, reason: "no_phone" };
    }

    // Normalize phone using odooClient's normalizePhone
    const phoneVariants = normalizePhone(phoneRaw);
    if (phoneVariants.length === 0) {
        return { imported: false, reason: "invalid_phone" };
    }

    // Use the most complete variant (with country code)
    const phoneE164 = phoneVariants.find((p) => p.startsWith("+")) ||
        `+591${phoneVariants[0]}`;

    try {
        const existing = await prisma.odooContact.findUnique({
            where: { odoo_partner_id: partner.id },
            select: { id: true },
        });
        if (existing) {
            await prisma.odooContact.update({
                where: { odoo_partner_id: partner.id },
                data: {
                    name: partner.name || "Sin nombre",
                    phone_e164: phoneE164,
                    phone_raw: phoneRaw,
                    email: partner.email || null,
                    vat: partner.vat || null,
                    last_synced_at: new Date(),
                },
            });
            return { imported: true, updated: true, created: false };
        }
        await prisma.odooContact.create({
            data: {
                odoo_partner_id: partner.id,
                name: partner.name || "Sin nombre",
                phone_e164: phoneE164,
                phone_raw: phoneRaw,
                email: partner.email || null,
                vat: partner.vat || null,
                is_patient: false,
                last_synced_at: new Date(),
            },
        });
        return { imported: true, created: true, updated: false };
    } catch (error) {
        logger.error("Failed to import partner", {
            partnerId: partner.id,
            error: error.message,
        });
        return { imported: false, reason: "db_error" };
    }
}

/**
 * Refresh contacts from Odoo (incremental - only new partners)
 */
async function refreshFromOdoo(options = {}) {
    if (!odooClient || !(await odooClient.hasOdooConfig())) {
        throw new Error("Odoo not configured");
    }

    logger.info("Starting incremental Odoo contact sync");

    // Get the last sync date from most recently synced contact
    const lastContact = await prisma.odooContact.findFirst({
        orderBy: { last_synced_at: "desc" },
        select: { last_synced_at: true, odoo_partner_id: true },
    });

    const lastPartnerId = lastContact?.odoo_partner_id || 0;

    try {
        const { searchRead } = require("./odooClient");

        // Fetch only partners with ID greater than last imported
        const partners = await searchRead(
            "res.partner",
            [
                ["active", "=", true],
                ["id", ">", lastPartnerId],
            ],
            ["id", "name", "phone", "mobile", "email", "vat"],
            1000,
            "id asc"
        );

        let imported = 0;
        let skipped = 0;

        for (const partner of partners || []) {
            const result = await importSinglePartner(partner);
            if (result.imported) {
                imported++;
            } else {
                skipped++;
            }
        }

        // Enrich with patient info
        if (imported > 0) {
            await enrichContactsWithPatientInfo();
        }

        logger.info("Incremental Odoo sync completed", { imported, skipped });

        return {
            newContacts: partners?.length || 0,
            imported,
            skipped,
        };
    } catch (error) {
        logger.error("Incremental Odoo sync failed", { error: error.message });
        throw error;
    }
}

/**
 * Enrich contacts with patient information from Odoo
 */
async function enrichContactsWithPatientInfo() {
    try {
        const { searchRead } = require("./odooClient");

        // Get contacts that haven't been checked for patient status
        const contacts = await prisma.odooContact.findMany({
            where: { is_patient: false },
            select: { id: true, odoo_partner_id: true },
            take: 500,
        });

        if (contacts.length === 0) {
            return;
        }

        const partnerIds = contacts.map((c) => c.odoo_partner_id);

        // Check which partners are patients in medical.patient
        try {
            const patients = await searchRead(
                "medical.patient",
                [["partner_id", "in", partnerIds]],
                ["id", "partner_id"],
                1000,
                null
            );

            if (!patients || patients.length === 0) {
                return;
            }

            // Map partner_id to patient_id
            const patientMap = new Map();
            for (const patient of patients) {
                const partnerId = Array.isArray(patient.partner_id)
                    ? patient.partner_id[0]
                    : patient.partner_id;
                if (partnerId) {
                    patientMap.set(partnerId, patient.id);
                }
            }

            // Update contacts that are patients
            for (const contact of contacts) {
                if (patientMap.has(contact.odoo_partner_id)) {
                    await prisma.odooContact.update({
                        where: { id: contact.id },
                        data: {
                            is_patient: true,
                            odoo_patient_id: patientMap.get(contact.odoo_partner_id),
                        },
                    });
                }
            }

            logger.info("Enriched contacts with patient info", {
                checked: contacts.length,
                patients: patientMap.size,
            });
        } catch (error) {
            // medical.patient model might not exist - that's ok
            logger.warn("Could not check patient info", { error: error.message });
        }
    } catch (error) {
        logger.error("Failed to enrich contacts", { error: error.message });
    }
}

/**
 * Get all local contacts with pagination
 */
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

/**
 * Get contact statistics
 */
async function getContactStats() {
    const [total, patients, withPhone] = await Promise.all([
        prisma.odooContact.count(),
        prisma.odooContact.count({ where: { is_patient: true } }),
        prisma.odooContact.count({ where: { phone_e164: { not: null } } }),
    ]);

    const lastSync = await prisma.odooContact.findFirst({
        orderBy: { last_synced_at: "desc" },
        select: { last_synced_at: true },
    });

    return {
        total,
        patients,
        withPhone,
        lastSyncAt: lastSync?.last_synced_at || null,
    };
}

/**
 * Get Odoo field options for variable mapping
 * Returns available fields that can be used in template variables
 */
function getOdooFieldOptions() {
    return [
        { value: "res.partner.name", label: "Nombre del Paciente", group: "Paciente" },
        { value: "res.partner.phone", label: "Teléfono", group: "Paciente" },
        { value: "res.partner.email", label: "Email", group: "Paciente" },
        { value: "res.partner.vat", label: "CI / NIT", group: "Paciente" },
        { value: "medical.patient.name", label: "Nombre (Paciente)", group: "Paciente" },
        { value: "account.move.amount_residual", label: "Saldo Pendiente", group: "Pagos" },
        { value: "account.move.name", label: "Número de Factura", group: "Pagos" },
        { value: "pos.order.date_order", label: "Última Compra (Fecha)", group: "Historial" },
        { value: "pos.order.amount_total", label: "Última Compra (Monto)", group: "Historial" },
    ];
}

module.exports = {
    importAllFromOdoo,
    refreshFromOdoo,
    importSinglePartner,
    enrichContactsWithPatientInfo,
    getContacts,
    getContactStats,
    getOdooFieldOptions,
};
