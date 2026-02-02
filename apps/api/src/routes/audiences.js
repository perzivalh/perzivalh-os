/**
 * Audiences API Routes
 * Manage audience segments for campaigns
 */
const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const logger = require("../lib/logger");

const audienceService = require("../services/audienceService");
const audienceAutomationService = require("../services/audienceAutomationService");
const audienceImportService = require("../services/audienceImportService");

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/audiences
 * List all audience segments
 */
router.get("/audiences", async (req, res) => {
    try {
        const { search } = req.query;
        const segments = await audienceService.getAllSegments({ search });
        res.json({ segments });
    } catch (error) {
        logger.error("Failed to get audiences", { error: error.message, stack: error.stack });
        // If table doesn't exist or other prisma error, return empty array
        if (error.code === "P2021" || error.message?.includes("does not exist")) {
            return res.json({ segments: [], error: "Table not migrated yet" });
        }
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/audiences/automation-settings
 * Get automation settings for dynamic audiences
 */
router.get("/audiences/automation-settings", async (req, res) => {
    try {
        const phoneNumberId = req.query.phone_number_id || null;
        const settings = await audienceAutomationService.getAutomationSettings({
            phoneNumberId,
        });
        res.json({ settings });
    } catch (error) {
        logger.error("Failed to get automation settings", { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/audiences/automation-settings
 * Update automation settings
 */
router.post(
    "/audiences/automation-settings",
    requireRole(["admin", "marketing"]),
    async (req, res) => {
        try {
            const userId = req.user?.id || null;
            const settings = await audienceAutomationService.setAutomationSettings({
                phoneNumberId: req.body.phone_number_id || null,
                enabled: req.body.enabled,
                userId,
            });
            res.json({ settings });
        } catch (error) {
            logger.error("Failed to update automation settings", { error: error.message });
            res.status(400).json({ error: error.message });
        }
    }
);

/**
 * GET /api/audiences/dynamic-tags
 * List dynamic audience mappings (tags + default)
 */
router.get("/audiences/dynamic-tags", async (req, res) => {
    try {
        const phoneNumberId = req.query.phone_number_id || null;
        const items = await audienceAutomationService.listDynamicAudiences({
            phoneNumberId,
        });
        res.json({ items });
    } catch (error) {
        logger.error("Failed to list dynamic audiences", { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/audiences/dynamic-tags
 * Create a new tag and its dynamic audience
 */
router.post(
    "/audiences/dynamic-tags",
    requireRole(["admin", "marketing"]),
    async (req, res) => {
        try {
            const userId = req.user?.id || null;
            const { name, color, phone_number_id } = req.body;
            const result = await audienceAutomationService.createTagWithAudience({
                name,
                color,
                phoneNumberId: phone_number_id || null,
                userId,
            });
            res.status(201).json(result);
        } catch (error) {
            logger.error("Failed to create dynamic tag", { error: error.message });
            res.status(400).json({ error: error.message });
        }
    }
);

/**
 * POST /api/audiences/sync-historical
 * Sync historical contacts for dynamic audiences
 */
router.post(
    "/audiences/sync-historical",
    requireRole(["admin", "marketing"]),
    async (req, res) => {
        try {
            const userId = req.user?.id || null;
            const phoneNumberId = req.body.phone_number_id || null;
            const result = await audienceAutomationService.syncHistorical({
                phoneNumberId,
                userId,
            });
            res.json(result);
        } catch (error) {
            logger.error("Failed to sync historical data", { error: error.message });
            res.status(500).json({ error: error.message });
        }
    }
);

/**
 * POST /api/audiences/import-preview
 * Preview Excel/CSV import
 */
router.post(
    "/audiences/import-preview",
    requireRole(["admin", "marketing"]),
    async (req, res) => {
        try {
            const { file_base64, filename } = req.body;
            const preview = await audienceImportService.previewImport({
                fileBase64: file_base64,
                filename,
            });
            res.json(preview);
        } catch (error) {
            logger.error("Failed to preview import", { error: error.message });
            res.status(400).json({ error: error.message });
        }
    }
);

/**
 * POST /api/audiences/import-excel
 * Import contacts from Excel/CSV
 */
router.post(
    "/audiences/import-excel",
    requireRole(["admin", "marketing"]),
    async (req, res) => {
        try {
            const userId = req.user?.id || null;
            const { file_base64, filename, mapping, options } = req.body;
            const result = await audienceImportService.importContacts({
                fileBase64: file_base64,
                filename,
                mapping,
                options,
                userId,
            });
            res.json(result);
        } catch (error) {
            logger.error("Failed to import contacts", { error: error.message });
            res.status(400).json({ error: error.message });
        }
    }
);

/**
 * GET /api/audiences/:id
 * Get single audience segment
 */
router.get("/audiences/:id", async (req, res) => {
    try {
        const segment = await audienceService.getSegmentById(req.params.id);
        if (!segment) {
            return res.status(404).json({ error: "Segment not found" });
        }
        res.json({ segment });
    } catch (error) {
        logger.error("Failed to get segment", { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/audiences/:id/preview
 * Preview recipients for a segment
 */
router.get("/audiences/:id/preview", async (req, res) => {
    try {
        const limit = parseInt(req.query.limit || "50", 10);
        const preview = await audienceService.previewSegmentRecipients(req.params.id, limit);
        res.json(preview);
    } catch (error) {
        logger.error("Failed to preview segment", { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/audiences
 * Create a new audience segment
 */
router.post("/audiences", requireRole(["admin", "marketing"]), async (req, res) => {
    try {
        const userId = req.user?.id || null;
        const segment = await audienceService.createSegment(req.body, userId);
        res.status(201).json({ segment });
    } catch (error) {
        logger.error("Failed to create segment", { error: error.message });
        res.status(400).json({ error: error.message });
    }
});

/**
 * PUT /api/audiences/:id
 * Update an audience segment
 */
router.put("/audiences/:id", requireRole(["admin", "marketing"]), async (req, res) => {
    try {
        const userId = req.user?.id || null;
        const segment = await audienceService.updateSegment(req.params.id, req.body, userId);
        res.json({ segment });
    } catch (error) {
        logger.error("Failed to update segment", { error: error.message });
        res.status(400).json({ error: error.message });
    }
});

/**
 * DELETE /api/audiences/:id
 * Soft delete an audience segment
 */
router.delete("/audiences/:id", requireRole(["admin", "marketing"]), async (req, res) => {
    try {
        const userId = req.user?.id || null;
        await audienceService.deleteSegment(req.params.id, userId);
        res.json({ deleted: true });
    } catch (error) {
        logger.error("Failed to delete segment", { error: error.message });
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/audiences/refresh-counts
 * Refresh estimated counts for all segments
 */
router.post("/audiences/refresh-counts", requireRole(["admin", "marketing"]), async (req, res) => {
    try {
        await audienceService.refreshAllSegmentCounts();
        res.json({ refreshed: true });
    } catch (error) {
        logger.error("Failed to refresh counts", { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
