/**
 * Contacts API Routes
 * Import and manage contacts from Odoo
 */
const express = require("express");
const router = express.Router();
const { requireAuth, requireAnyPermission } = require("../middleware/auth");
const logger = require("../lib/logger");
const { getControlClient } = require("../control/controlClient");

const contactImportService = require("../services/contactImportService");
const { hasOdooConfig } = require("../services/odooClient");

const CONTACTS_READ_ACCESS = [
    { group: "modules", key: "campaigns" },
    { group: "settings", key: "odoo" },
];
const CONTACTS_WRITE_ACCESS = [
    { group: "modules", key: "campaigns", action: "write" },
    { group: "settings", key: "odoo", action: "write" },
];

// All routes require authentication
router.use(requireAuth);

async function getTenantOdooSyncRecord(tenantId) {
    if (!process.env.CONTROL_DB_URL || !tenantId) {
        return null;
    }
    const control = getControlClient();
    return control.odooConfig.findUnique({
        where: { tenant_id: tenantId },
        select: {
            id: true,
            sync_interval_minutes: true,
            last_partner_write_at: true,
            last_patient_write_at: true,
        },
    });
}

async function persistTenantOdooSyncState(tenantId, updates = {}) {
    if (!process.env.CONTROL_DB_URL || !tenantId) {
        return;
    }
    const existing = await getTenantOdooSyncRecord(tenantId);
    if (!existing?.id) {
        return;
    }
    const control = getControlClient();
    await control.odooConfig.update({
        where: { id: existing.id },
        data: {
            ...updates,
            next_due_at: new Date(Date.now() + Math.max(1, existing.sync_interval_minutes || 5) * 60 * 1000),
        },
    });
}

/**
 * GET /api/contacts
 * List local contacts with pagination
 */
router.get("/contacts", requireAnyPermission(CONTACTS_READ_ACCESS), async (req, res) => {
    try {
        const { search, isPatient, offset, limit } = req.query;
        const result = await contactImportService.getContacts({
            search,
            isPatient: isPatient === "true" ? true : isPatient === "false" ? false : undefined,
            offset: parseInt(offset || "0", 10),
            limit: parseInt(limit || "50", 10),
        });
        res.json(result);
    } catch (error) {
        logger.error("Failed to get contacts", { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/contacts/stats
 * Get contact statistics
 */
router.get("/contacts/stats", requireAnyPermission(CONTACTS_READ_ACCESS), async (req, res) => {
    try {
        const stats = await contactImportService.getContactStats();
        res.json(stats);
    } catch (error) {
        logger.error("Failed to get contact stats", { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/contacts/odoo-status
 * Check Odoo connectivity status
 */
router.get("/contacts/odoo-status", requireAnyPermission(CONTACTS_READ_ACCESS), async (req, res) => {
    try {
        const connected = await hasOdooConfig();
        let sync = null;
        if (process.env.CONTROL_DB_URL && req.user?.tenant_id) {
            const control = getControlClient();
            sync = await control.odooConfig.findUnique({
                where: { tenant_id: req.user.tenant_id },
                select: {
                    sync_enabled: true,
                    sync_interval_minutes: true,
                    next_due_at: true,
                    last_success_at: true,
                    last_error_at: true,
                    last_error_message: true,
                },
            });
        }
        res.json({ connected, sync });
    } catch (error) {
        logger.error("Failed to check Odoo status", { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/contacts/odoo-fields
 * Get available Odoo fields for variable mapping
 */
router.get("/contacts/odoo-fields", requireAnyPermission(CONTACTS_READ_ACCESS), (req, res) => {
    const fields = contactImportService.getOdooFieldOptions();
    res.json({ fields });
});

/**
 * POST /api/contacts/import-odoo
 * Initial full import from Odoo
 */
router.post("/contacts/import-odoo", requireAnyPermission(CONTACTS_WRITE_ACCESS), async (req, res) => {
    try {
        const { limit } = req.body;
        const result = await contactImportService.importAllFromOdoo({ limit });
        await persistTenantOdooSyncState(req.user?.tenant_id, {
            last_partner_write_at: result?.cursors?.last_partner_write_at || undefined,
            last_patient_write_at: result?.cursors?.last_patient_write_at || undefined,
            last_success_at: new Date(),
            last_error_at: null,
            last_error_message: null,
        });
        res.json(result);
    } catch (error) {
        logger.error("Odoo import failed", { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/contacts/refresh-odoo
 * Incremental refresh from Odoo (only new contacts)
 */
router.post("/contacts/refresh-odoo", requireAnyPermission(CONTACTS_WRITE_ACCESS), async (req, res) => {
    try {
        const syncRecord = await getTenantOdooSyncRecord(req.user?.tenant_id);
        const result = await contactImportService.refreshFromOdoo({
            lastPartnerWriteAt: syncRecord?.last_partner_write_at || null,
            lastPatientWriteAt: syncRecord?.last_patient_write_at || null,
        });
        await persistTenantOdooSyncState(req.user?.tenant_id, {
            last_partner_write_at: result?.cursors?.last_partner_write_at || undefined,
            last_patient_write_at: result?.cursors?.last_patient_write_at || undefined,
            last_success_at: new Date(),
            last_error_at: null,
            last_error_message: null,
        });
        res.json(result);
    } catch (error) {
        logger.error("Odoo refresh failed", { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/contacts/:id
 * Update a local contact
 */
router.put("/contacts/:id", requireAnyPermission(CONTACTS_WRITE_ACCESS), async (req, res) => {
    try {
        const contact = await contactImportService.updateContact(req.params.id, req.body || {});
        res.json({ contact });
    } catch (error) {
        logger.error("Failed to update contact", { error: error.message });
        res.status(error.message === "not_found" ? 404 : 500).json({ error: error.message });
    }
});

/**
 * DELETE /api/contacts/:id
 * Delete a local contact
 */
router.delete("/contacts/:id", requireAnyPermission(CONTACTS_WRITE_ACCESS), async (req, res) => {
    try {
        await contactImportService.deleteContact(req.params.id);
        res.json({ success: true });
    } catch (error) {
        logger.error("Failed to delete contact", { error: error.message });
        res.status(error.message === "not_found" ? 404 : 500).json({ error: error.message });
    }
});

module.exports = router;
