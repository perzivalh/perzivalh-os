/**
 * Templates API Routes
 * Manage Meta WhatsApp message templates
 */
const express = require("express");
const router = express.Router();
const {
    requireAuth,
    requireAnyPermission,
    requireSettingPermission,
} = require("../middleware/auth");
const logger = require("../lib/logger");

const templateService = require("../services/templateService");
const TEMPLATE_READ_ACCESS = [
    { group: "settings", key: "templates" },
    { group: "modules", key: "campaigns" },
];

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/templates
 * List all templates from local DB
 */
router.get("/templates", requireAnyPermission(TEMPLATE_READ_ACCESS), async (req, res) => {
    try {
        const { status, category, search } = req.query;
        const templates = await templateService.getAllTemplates({
            status,
            category,
            search,
        });
        res.json({ templates });
    } catch (error) {
        logger.error("Failed to get templates", { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/templates/sync
 * Force sync templates from Meta API
 */
router.get("/templates/sync", requireSettingPermission("templates", "write"), async (req, res) => {
    try {
        const result = await templateService.syncTemplatesFromMeta();
        res.json(result);
    } catch (error) {
        logger.error("Template sync failed", { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/templates/:id
 * Get single template with variable mappings
 */
router.get("/templates/:id", requireAnyPermission(TEMPLATE_READ_ACCESS), async (req, res) => {
    try {
        const template = await templateService.getTemplateById(req.params.id);
        if (!template) {
            return res.status(404).json({ error: "Template not found" });
        }
        res.json({ template });
    } catch (error) {
        logger.error("Failed to get template", { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/templates/draft
 * Create a local draft template
 */
router.post("/templates/draft", requireSettingPermission("templates", "write"), async (req, res) => {
    try {
        const userId = req.user?.id || null;
        const template = await templateService.createDraft(req.body, userId);
        res.status(201).json({ template });
    } catch (error) {
        logger.error("Failed to create draft", { error: error.message });
        res.status(400).json({ error: error.message });
    }
});

/**
 * PUT /api/templates/:id
 * Update a draft template
 */
router.put("/templates/:id", requireSettingPermission("templates", "write"), async (req, res) => {
    try {
        const userId = req.user?.id || null;
        const template = await templateService.updateDraft(req.params.id, req.body, userId);
        res.json({ template });
    } catch (error) {
        logger.error("Failed to update template", { error: error.message });
        res.status(400).json({ error: error.message });
    }
});

/**
 * PUT /api/templates/:id/mappings
 * Update variable mappings for a template
 */
router.put("/templates/:id/mappings", requireSettingPermission("templates", "write"), async (req, res) => {
    try {
        const userId = req.user?.id || null;
        const { mappings } = req.body;
        const template = await templateService.updateVariableMappings(
            req.params.id,
            mappings,
            userId
        );
        res.json({ template });
    } catch (error) {
        logger.error("Failed to update mappings", { error: error.message });
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/templates/:id/submit
 * Submit a draft template to Meta for review
 */
router.post("/templates/:id/submit", requireSettingPermission("templates", "write"), async (req, res) => {
    try {
        const userId = req.user?.id || null;
        const template = await templateService.submitToMeta(req.params.id, userId);
        res.json({ template, message: "Template submitted to Meta for review" });
    } catch (error) {
        logger.error("Failed to submit template", { error: error.message });
        res.status(400).json({ error: error.message });
    }
});

/**
 * DELETE /api/templates/:id
 * Soft delete a template
 */
router.delete("/templates/:id", requireSettingPermission("templates", "write"), async (req, res) => {
    try {
        const userId = req.user?.id || null;
        await templateService.deleteTemplateLocal(req.params.id, userId);
        res.json({ deleted: true });
    } catch (error) {
        logger.error("Failed to delete template", { error: error.message });
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/templates/:id/restore
 * Restore a soft-deleted template
 */
router.post("/templates/:id/restore", requireSettingPermission("templates", "write"), async (req, res) => {
    try {
        const userId = req.user?.id || null;
        const template = await templateService.restoreTemplateLocal(req.params.id, userId);
        res.json({ template });
    } catch (error) {
        logger.error("Failed to restore template", { error: error.message });
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
