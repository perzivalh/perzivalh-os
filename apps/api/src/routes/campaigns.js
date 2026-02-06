/**
 * Campaigns API Routes
 * Create and manage broadcast campaigns
 */
const express = require("express");
const router = express.Router();
const prisma = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const logger = require("../lib/logger");

const {
    enqueueCampaign,
    pauseCampaign,
    resumeCampaign,
    getCampaignStats,
} = require("../services/campaignJobQueue");

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/campaigns
 * List all campaigns with metrics
 */
router.get("/campaigns", async (req, res) => {
    try {
        const { status, limit, offset, q } = req.query;

        const where = {};
        if (status) {
            where.status = status;
        }
        if (q) {
            const query = String(q).trim();
            if (query) {
                where.OR = [
                    { name: { contains: query, mode: "insensitive" } },
                    { template: { name: { contains: query, mode: "insensitive" } } },
                ];
            }
        }

        const campaigns = await prisma.campaign.findMany({
            where,
            orderBy: { created_at: "desc" },
            take: parseInt(limit || "50", 10),
            skip: parseInt(offset || "0", 10),
            include: {
                template: {
                    select: { id: true, name: true, category: true, status: true },
                },
                segment: {
                    select: { id: true, name: true, estimated_count: true },
                },
                created_by_user: {
                    select: { id: true, name: true },
                },
                _count: {
                    select: { recipients: true },
                },
            },
        });

        const total = await prisma.campaign.count({ where });

        res.json({ campaigns, total });
    } catch (error) {
        logger.error("Failed to get campaigns", { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/campaigns/:id
 * Get single campaign with stats
 */
router.get("/campaigns/:id", async (req, res) => {
    try {
        const campaign = await prisma.campaign.findUnique({
            where: { id: req.params.id },
            include: {
                template: {
                    include: { variable_mappings: true },
                },
                segment: true,
                created_by_user: {
                    select: { id: true, name: true },
                },
            },
        });

        if (!campaign) {
            return res.status(404).json({ error: "Campaign not found" });
        }

        const stats = await getCampaignStats(campaign.id);

        res.json({ campaign, stats });
    } catch (error) {
        logger.error("Failed to get campaign", { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/campaigns/:id/recipients
 * Get campaign recipients with status
 */
router.get("/campaigns/:id/recipients", async (req, res) => {
    try {
        const { status, limit, offset } = req.query;

        const where = { campaign_id: req.params.id };
        if (status) {
            where.status = status;
        }

        const recipients = await prisma.campaignRecipient.findMany({
            where,
            orderBy: { queued_at: "desc" },
            take: parseInt(limit || "100", 10),
            skip: parseInt(offset || "0", 10),
            select: {
                id: true,
                wa_id: true,
                phone_e164: true,
                recipient_name: true,
                status: true,
                sent_at: true,
                delivered_at: true,
                read_at: true,
                failed_at: true,
                error_json: true,
            },
        });

        const total = await prisma.campaignRecipient.count({ where });

        res.json({ recipients, total });
    } catch (error) {
        logger.error("Failed to get recipients", { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/campaigns
 * Create a new campaign
 */
router.post("/campaigns", requireRole(["admin", "marketing"]), async (req, res) => {
    try {
        const { name, template_id, segment_id, scheduled_at } = req.body;
        const userId = req.user?.id || null;

        // Validate template exists and is approved
        const template = await prisma.metaTemplate.findUnique({
            where: { id: template_id },
        });

        if (!template) {
            return res.status(400).json({ error: "Template not found" });
        }

        if (template.status !== "APPROVED") {
            return res.status(400).json({
                error: "Template must be approved by Meta before using in campaigns"
            });
        }

        // Validate segment exists
        if (segment_id) {
            const segment = await prisma.audienceSegment.findUnique({
                where: { id: segment_id },
            });
            if (!segment) {
                return res.status(400).json({ error: "Segment not found" });
            }
        }

        const campaign = await prisma.campaign.create({
            data: {
                name,
                template_id,
                segment_id: segment_id || null,
                scheduled_at: scheduled_at ? new Date(scheduled_at) : null,
                status: "draft",
                created_by_user_id: userId,
            },
            include: {
                template: {
                    select: { id: true, name: true, status: true },
                },
                segment: {
                    select: { id: true, name: true, estimated_count: true },
                },
            },
        });

        // Audit log
        await prisma.auditLog.create({
            data: {
                user_id: userId,
                action: "campaign_created",
                entity: "campaign",
                entity_id: campaign.id,
                data_json: { name, template_id, segment_id },
            },
        });

        res.status(201).json({ campaign });
    } catch (error) {
        logger.error("Failed to create campaign", { error: error.message });
        res.status(400).json({ error: error.message });
    }
});

/**
 * PUT /api/campaigns/:id
 * Update a draft campaign
 */
router.put("/campaigns/:id", requireRole(["admin", "marketing"]), async (req, res) => {
    try {
        const { name, template_id, segment_id, scheduled_at } = req.body;

        const existing = await prisma.campaign.findUnique({
            where: { id: req.params.id },
        });

        if (!existing) {
            return res.status(404).json({ error: "Campaign not found" });
        }

        if (existing.status === "running") {
            return res.status(400).json({ error: "Running campaigns cannot be edited" });
        }

        const campaign = await prisma.campaign.update({
            where: { id: req.params.id },
            data: {
                name: name !== undefined ? name : undefined,
                template_id: template_id !== undefined ? template_id : undefined,
                segment_id: segment_id !== undefined ? segment_id : undefined,
                scheduled_at: scheduled_at !== undefined ? (scheduled_at ? new Date(scheduled_at) : null) : undefined,
            },
            include: {
                template: {
                    select: { id: true, name: true, status: true },
                },
                segment: {
                    select: { id: true, name: true, estimated_count: true },
                },
            },
        });

        res.json({ campaign });
    } catch (error) {
        logger.error("Failed to update campaign", { error: error.message });
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/campaigns/:id/launch
 * Launch a campaign (start sending)
 */
router.post("/campaigns/:id/launch", requireRole(["admin", "marketing"]), async (req, res) => {
    try {
        const userId = req.user?.id || null;
        const campaign = await prisma.campaign.findUnique({
            where: { id: req.params.id },
            include: {
                template: true,
                segment: true,
            },
        });

        if (!campaign) {
            return res.status(404).json({ error: "Campaign not found" });
        }

        if (!["draft", "scheduled"].includes(campaign.status)) {
            return res.status(400).json({ error: "Campaign cannot be launched in current status" });
        }

        if (campaign.template.status !== "APPROVED") {
            return res.status(400).json({ error: "Template must be approved by Meta" });
        }

        if (!campaign.segment_id) {
            return res.status(400).json({ error: "Campaign must have an audience segment" });
        }

        // Enqueue for processing
        await enqueueCampaign(campaign.id);

        // Audit log
        await prisma.auditLog.create({
            data: {
                user_id: userId,
                action: "campaign_launched",
                entity: "campaign",
                entity_id: campaign.id,
                data_json: { name: campaign.name },
            },
        });

        res.json({ launched: true, message: "Campaign queued for sending" });
    } catch (error) {
        logger.error("Failed to launch campaign", { error: error.message });
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/campaigns/:id/pause
 * Pause a running campaign
 */
router.post("/campaigns/:id/pause", requireRole(["admin", "marketing"]), async (req, res) => {
    try {
        await pauseCampaign(req.params.id);
        res.json({ paused: true });
    } catch (error) {
        logger.error("Failed to pause campaign", { error: error.message });
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/campaigns/:id/resume
 * Resume a paused campaign
 */
router.post("/campaigns/:id/resume", requireRole(["admin", "marketing"]), async (req, res) => {
    try {
        await resumeCampaign(req.params.id);
        res.json({ resumed: true });
    } catch (error) {
        logger.error("Failed to resume campaign", { error: error.message });
        res.status(400).json({ error: error.message });
    }
});

/**
 * DELETE /api/campaigns/:id
 * Delete a draft campaign
 */
router.delete("/campaigns/:id", requireRole(["admin", "marketing"]), async (req, res) => {
    try {
        const campaign = await prisma.campaign.findUnique({
            where: { id: req.params.id },
        });

        if (!campaign) {
            return res.status(404).json({ error: "Campaign not found" });
        }

        if (campaign.status === "running") {
            return res.status(400).json({ error: "Running campaigns cannot be deleted" });
        }

        await prisma.campaign.delete({
            where: { id: req.params.id },
        });

        res.json({ deleted: true });
    } catch (error) {
        logger.error("Failed to delete campaign", { error: error.message });
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/campaigns/:id/resend
 * Clone and relaunch a completed/failed campaign
 */
router.post("/campaigns/:id/resend", requireRole(["admin", "marketing"]), async (req, res) => {
    try {
        const userId = req.user?.id || null;
        const campaign = await prisma.campaign.findUnique({
            where: { id: req.params.id },
        });

        if (!campaign) {
            return res.status(404).json({ error: "Campaign not found" });
        }

        if (!campaign.segment_id) {
            return res.status(400).json({ error: "Campaign must have an audience segment" });
        }

        const cloned = await prisma.campaign.create({
            data: {
                name: `${campaign.name} (Reenvío)`,
                template_id: campaign.template_id,
                segment_id: campaign.segment_id,
                status: "draft",
                created_by_user_id: userId,
            },
            include: {
                template: {
                    select: { id: true, name: true, status: true },
                },
                segment: {
                    select: { id: true, name: true, estimated_count: true },
                },
            },
        });

        await enqueueCampaign(cloned.id);

        res.json({ campaign: cloned, launched: true });
    } catch (error) {
        logger.error("Failed to resend campaign", { error: error.message });
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
