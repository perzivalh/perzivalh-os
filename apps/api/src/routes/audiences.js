/**
 * Audiences API Routes
 * Manage audience segments for campaigns
 */
const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const logger = require("../lib/logger");

const audienceService = require("../services/audienceService");

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
        logger.error("Failed to get audiences", { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

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
