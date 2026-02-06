/**
 * Campaigns API Routes
 * Backwards-compatible wrapper aligned to tenant schema.
 */
const express = require("express");
const router = express.Router();
const prisma = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const logger = require("../lib/logger");
const adminRoutes = require("./admin");

const { queueCampaignMessages } = adminRoutes;

router.use(requireAuth);

function normalizeTemplate(template) {
    if (!template) return null;
    return {
        ...template,
        status: template.is_active ? "APPROVED" : "DISABLED",
    };
}

function normalizeCampaign(campaign) {
    if (!campaign) return campaign;
    const filter =
        campaign.audience_filter && typeof campaign.audience_filter === "object"
            ? campaign.audience_filter
            : {};
    const segmentId = filter.segment_id || null;
    const segmentName = filter.segment_name || null;
    const segment = segmentId
        ? {
            id: segmentId,
            name: segmentName || segmentId,
            estimated_count: filter.estimated_count || null,
        }
        : null;
    const counts = campaign._count || {};
    const recipients = Number.isFinite(counts.messages)
        ? counts.messages
        : counts.recipients || 0;
    return {
        ...campaign,
        template: normalizeTemplate(campaign.template),
        segment,
        _count: { ...counts, recipients },
    };
}

async function resolveTemplateId(templateId) {
    if (!templateId) return null;
    const existingTemplate = await prisma.template.findUnique({
        where: { id: templateId },
    });
    if (existingTemplate) {
        return existingTemplate.id;
    }
    const metaTemplate = await prisma.metaTemplate.findUnique({
        where: { id: templateId },
    });
    if (!metaTemplate) {
        return null;
    }
    const templateByName = await prisma.template.findUnique({
        where: { name: metaTemplate.name },
    });
    if (templateByName) {
        return templateByName.id;
    }
    const createdTemplate = await prisma.template.create({
        data: {
            name: metaTemplate.name,
            language: metaTemplate.language || "es",
            category: metaTemplate.category || null,
            body_preview: metaTemplate.body_text || metaTemplate.footer_text || "",
            is_active: metaTemplate.status === "APPROVED",
        },
    });
    return createdTemplate.id;
}

async function getMessageStats(campaignId) {
    const [total, queued, sent, failed] = await Promise.all([
        prisma.campaignMessage.count({ where: { campaign_id: campaignId } }),
        prisma.campaignMessage.count({
            where: { campaign_id: campaignId, status: "queued" },
        }),
        prisma.campaignMessage.count({
            where: { campaign_id: campaignId, status: "sent" },
        }),
        prisma.campaignMessage.count({
            where: { campaign_id: campaignId, status: "failed" },
        }),
    ]);
    return { total, queued, sent, failed };
}

/**
 * GET /api/campaigns
 * List campaigns with metrics (tenant schema)
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

        const take = parseInt(limit || "50", 10);
        const skip = parseInt(offset || "0", 10);

        const [campaignsRaw, total] = await Promise.all([
            prisma.campaign.findMany({
                where,
                orderBy: { created_at: "desc" },
                take,
                skip,
                include: {
                    template: {
                        select: {
                            id: true,
                            name: true,
                            category: true,
                            language: true,
                            body_preview: true,
                            is_active: true,
                            created_at: true,
                        },
                    },
                    created_by_user: {
                        select: { id: true, name: true },
                    },
                    _count: {
                        select: { messages: true },
                    },
                },
            }),
            prisma.campaign.count({ where }),
        ]);

        const campaigns = campaignsRaw.map(normalizeCampaign);

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
        const campaignRaw = await prisma.campaign.findUnique({
            where: { id: req.params.id },
            include: {
                template: {
                    select: {
                        id: true,
                        name: true,
                        category: true,
                        language: true,
                        body_preview: true,
                        variables_schema: true,
                        is_active: true,
                        created_at: true,
                    },
                },
                created_by_user: {
                    select: { id: true, name: true },
                },
                _count: {
                    select: { messages: true },
                },
            },
        });

        if (!campaignRaw) {
            return res.status(404).json({ error: "Campaign not found" });
        }

        const stats = await getMessageStats(campaignRaw.id);

        res.json({ campaign: normalizeCampaign(campaignRaw), stats });
    } catch (error) {
        logger.error("Failed to get campaign", { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/campaigns/:id/recipients
 * Get campaign recipients with status (mapped from CampaignMessage)
 */
router.get("/campaigns/:id/recipients", async (req, res) => {
    try {
        const { status, limit, offset } = req.query;
        const where = { campaign_id: req.params.id };
        if (status) {
            where.status = status;
        }

        const take = parseInt(limit || "100", 10);
        const skip = parseInt(offset || "0", 10);

        const [recipientsRaw, total] = await Promise.all([
            prisma.campaignMessage.findMany({
                where,
                orderBy: { sent_at: "desc" },
                take,
                skip,
                include: {
                    conversation: {
                        select: { display_name: true },
                    },
                },
            }),
            prisma.campaignMessage.count({ where }),
        ]);

        const recipients = recipientsRaw.map((item) => ({
            id: item.id,
            wa_id: item.wa_id,
            phone_e164: item.phone_e164,
            recipient_name: item.conversation?.display_name || null,
            status: item.status,
            sent_at: item.sent_at,
            delivered_at: null,
            read_at: null,
            failed_at: item.status === "failed" ? item.sent_at : null,
            error_json: item.error_json,
        }));

        res.json({ recipients, total });
    } catch (error) {
        logger.error("Failed to get recipients", { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/campaigns
 * Create a new campaign (tenant schema)
 */
router.post("/campaigns", requireRole(["admin", "marketing"]), async (req, res) => {
    try {
        const name = (req.body?.name || "").trim();
        const templateId = req.body?.template_id;
        const scheduledRaw = req.body?.scheduled_for || req.body?.scheduled_at;
        const scheduledFor = scheduledRaw ? new Date(scheduledRaw) : null;
        const segmentId = req.body?.segment_id;
        const segmentName = req.body?.segment_name;
        const rawFilter = req.body?.audience_filter;
        const userId = req.user?.id || null;

        if (!name || !templateId) {
            return res.status(400).json({ error: "missing_fields" });
        }

        const resolvedTemplateId = await resolveTemplateId(templateId);
        if (!resolvedTemplateId) {
            return res.status(400).json({ error: "template_not_found" });
        }

        let audienceFilter = {};
        if (rawFilter && typeof rawFilter === "object") {
            audienceFilter = rawFilter;
        } else if (segmentId) {
            audienceFilter = {
                segment_id: segmentId,
                segment_name: segmentName || undefined,
            };
        }

        const campaign = await prisma.campaign.create({
            data: {
                name,
                template_id: resolvedTemplateId,
                audience_filter: audienceFilter,
                status: scheduledFor ? "scheduled" : "draft",
                created_by_user_id: userId,
                scheduled_for: scheduledFor,
            },
            include: {
                template: {
                    select: {
                        id: true,
                        name: true,
                        category: true,
                        language: true,
                        body_preview: true,
                        is_active: true,
                        created_at: true,
                    },
                },
                created_by_user: {
                    select: { id: true, name: true },
                },
                _count: {
                    select: { messages: true },
                },
            },
        });

        res.status(201).json({ campaign: normalizeCampaign(campaign) });
    } catch (error) {
        logger.error("Failed to create campaign", { error: error.message });
        res.status(400).json({ error: error.message });
    }
});

/**
 * PUT /api/campaigns/:id
 * Update a draft/scheduled campaign
 */
router.put("/campaigns/:id", requireRole(["admin", "marketing"]), async (req, res) => {
    try {
        const name = (req.body?.name || "").trim();
        const templateId = req.body?.template_id || null;
        const scheduledRaw = req.body?.scheduled_for ?? req.body?.scheduled_at;
        const scheduledFor = scheduledRaw ? new Date(scheduledRaw) : null;
        const segmentId = req.body?.segment_id;
        const segmentName = req.body?.segment_name;
        const rawFilter = req.body?.audience_filter;

        const existing = await prisma.campaign.findUnique({
            where: { id: req.params.id },
        });

        if (!existing) {
            return res.status(404).json({ error: "Campaign not found" });
        }

        if (existing.status === "sending") {
            return res.status(400).json({ error: "Sending campaigns cannot be edited" });
        }

        let resolvedTemplateId = existing.template_id;
        if (templateId) {
            const resolved = await resolveTemplateId(templateId);
            if (!resolved) {
                return res.status(400).json({ error: "template_not_found" });
            }
            resolvedTemplateId = resolved;
        }

        const updates = {};
        if (name) {
            updates.name = name;
        }
        if (resolvedTemplateId) {
            updates.template_id = resolvedTemplateId;
        }
        if (rawFilter !== undefined) {
            updates.audience_filter = rawFilter;
        } else if (segmentId !== undefined) {
            updates.audience_filter = {
                segment_id: segmentId,
                segment_name: segmentName || undefined,
            };
        }
        if (scheduledRaw !== undefined && ["draft", "scheduled"].includes(existing.status)) {
            updates.scheduled_for = scheduledFor;
            updates.status = scheduledFor ? "scheduled" : "draft";
        }

        const campaign = await prisma.campaign.update({
            where: { id: req.params.id },
            data: updates,
            include: {
                template: {
                    select: {
                        id: true,
                        name: true,
                        category: true,
                        language: true,
                        body_preview: true,
                        is_active: true,
                        created_at: true,
                    },
                },
                created_by_user: {
                    select: { id: true, name: true },
                },
                _count: {
                    select: { messages: true },
                },
            },
        });

        res.json({ campaign: normalizeCampaign(campaign) });
    } catch (error) {
        logger.error("Failed to update campaign", { error: error.message });
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/campaigns/:id/launch
 * Queue campaign messages for sending
 */
router.post("/campaigns/:id/launch", requireRole(["admin", "marketing"]), async (req, res) => {
    try {
        const campaign = await prisma.campaign.findUnique({
            where: { id: req.params.id },
        });

        if (!campaign) {
            return res.status(404).json({ error: "Campaign not found" });
        }

        if (!["draft", "scheduled"].includes(campaign.status)) {
            return res.status(400).json({ error: "Campaign cannot be launched in current status" });
        }

        const queued = await queueCampaignMessages(campaign, req.user?.id || null);
        const status = queued > 0 ? "sending" : "failed";
        const updated = await prisma.campaign.update({
            where: { id: campaign.id },
            data: { status },
        });

        res.json({ launched: queued > 0, queued, campaign: updated });
    } catch (error) {
        logger.error("Failed to launch campaign", { error: error.message });
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/campaigns/:id/pause
 * Not supported in tenant schema
 */
router.post("/campaigns/:id/pause", requireRole(["admin", "marketing"]), async (req, res) => {
    res.status(409).json({ error: "not_supported" });
});

/**
 * POST /api/campaigns/:id/resume
 * Not supported in tenant schema
 */
router.post("/campaigns/:id/resume", requireRole(["admin", "marketing"]), async (req, res) => {
    res.status(409).json({ error: "not_supported" });
});

/**
 * DELETE /api/campaigns/:id
 * Delete a campaign
 */
router.delete("/campaigns/:id", requireRole(["admin", "marketing"]), async (req, res) => {
    try {
        const campaign = await prisma.campaign.findUnique({
            where: { id: req.params.id },
        });

        if (!campaign) {
            return res.status(404).json({ error: "Campaign not found" });
        }

        if (campaign.status === "sending") {
            return res.status(400).json({ error: "Sending campaigns cannot be deleted" });
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
 * Clone and relaunch a campaign
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

        const cloned = await prisma.campaign.create({
            data: {
                name: `${campaign.name} (Reenvío)`,
                template_id: campaign.template_id,
                audience_filter: campaign.audience_filter || {},
                status: "draft",
                created_by_user_id: userId,
            },
        });

        const queued = await queueCampaignMessages(cloned, userId);
        const status = queued > 0 ? "sending" : "failed";
        const updated = await prisma.campaign.update({
            where: { id: cloned.id },
            data: { status },
        });

        res.json({ campaign: updated, launched: queued > 0, queued });
    } catch (error) {
        logger.error("Failed to resend campaign", { error: error.message });
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
