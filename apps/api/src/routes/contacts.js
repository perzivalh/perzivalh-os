/**
 * Contacts API Routes
 * Import and manage contacts from Odoo
 */
const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const logger = require("../lib/logger");

const contactImportService = require("../services/contactImportService");

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/contacts
 * List local contacts with pagination
 */
router.get("/contacts", async (req, res) => {
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
router.get("/contacts/stats", async (req, res) => {
    try {
        const stats = await contactImportService.getContactStats();
        res.json(stats);
    } catch (error) {
        logger.error("Failed to get contact stats", { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/contacts/odoo-fields
 * Get available Odoo fields for variable mapping
 */
router.get("/contacts/odoo-fields", (req, res) => {
    const fields = contactImportService.getOdooFieldOptions();
    res.json({ fields });
});

/**
 * POST /api/contacts/import-odoo
 * Initial full import from Odoo
 */
router.post("/contacts/import-odoo", requireRole(["admin", "marketing"]), async (req, res) => {
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
router.post("/contacts/refresh-odoo", requireRole(["admin", "marketing"]), async (req, res) => {
    try {
        const result = await contactImportService.refreshFromOdoo();
        res.json(result);
    } catch (error) {
        logger.error("Odoo refresh failed", { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
