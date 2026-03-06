/**
 * Contacts API Routes
 * Import and manage contacts from Odoo
 */
const express = require("express");
const router = express.Router();
const { requireAuth, requireAnyPermission } = require("../middleware/auth");
const logger = require("../lib/logger");

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
        res.json({ connected });
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
        const result = await contactImportService.refreshFromOdoo();
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
