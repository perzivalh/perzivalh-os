/**
 * Campaign Job Queue Service
 * Postgres-based job queue for campaign sending with rate limiting
 * No external dependencies like Redis required
 */
const prisma = require("../db");
const logger = require("../lib/logger");
const { sendTemplate } = require("../whatsapp");
const { getSegmentRecipients } = require("./audienceService");

// Rate limiting: Meta allows 80 messages/second
const RATE_LIMIT_PER_SECOND = parseInt(process.env.CAMPAIGN_RATE_LIMIT_PER_SEC || "50", 10);
const BATCH_SIZE = parseInt(process.env.CAMPAIGN_BATCH_SIZE || "50", 10);
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes - if job is locked longer, consider it stale
const POLL_INTERVAL_MS = 5000; // 5 seconds between polls

let workerRunning = false;
let workerInterval = null;

/**
 * Enqueue a campaign for sending
 */
async function enqueueCampaign(campaignId) {
    // Create or update job entry
    await prisma.campaignJob.upsert({
        where: { campaign_id: campaignId },
        update: {
            status: "pending",
            progress: 0,
            last_error: null,
            locked_at: null,
            locked_by: null,
        },
        create: {
            campaign_id: campaignId,
            status: "pending",
            progress: 0,
        },
    });

    // Update campaign status
    await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "scheduled" },
    });

    logger.info("Campaign enqueued", { campaignId });
    return { enqueued: true };
}

/**
 * Start the campaign worker
 */
function startWorker() {
    if (workerRunning) {
        logger.info("Campaign worker already running");
        return;
    }

    workerRunning = true;
    logger.info("Starting campaign worker");

    workerInterval = setInterval(async () => {
        try {
            await pollAndProcess();
        } catch (error) {
            logger.error("Worker poll error", { error: error.message });
        }
    }, POLL_INTERVAL_MS);
}

/**
 * Stop the campaign worker
 */
function stopWorker() {
    if (workerInterval) {
        clearInterval(workerInterval);
        workerInterval = null;
    }
    workerRunning = false;
    logger.info("Campaign worker stopped");
}

/**
 * Poll for pending jobs and process them
 */
async function pollAndProcess() {
    const workerId = `worker_${process.pid}_${Date.now()}`;
    const staleTimeout = new Date(Date.now() - LOCK_TIMEOUT_MS);

    // Try to acquire a job using optimistic locking
    // Find jobs that are either pending or have stale locks
    const job = await prisma.campaignJob.findFirst({
        where: {
            OR: [
                { status: "pending" },
                { status: "running", locked_at: { lt: staleTimeout } },
            ],
        },
        orderBy: { created_at: "asc" },
    });

    if (!job) {
        return; // No jobs to process
    }

    // Try to acquire lock atomically
    const lockResult = await prisma.campaignJob.updateMany({
        where: {
            id: job.id,
            OR: [
                { locked_at: null },
                { locked_at: { lt: staleTimeout } },
            ],
        },
        data: {
            status: "running",
            locked_at: new Date(),
            locked_by: workerId,
            started_at: job.started_at || new Date(),
        },
    });

    if (lockResult.count === 0) {
        // Another worker got the job
        return;
    }

    logger.info("Acquired campaign job", { campaignId: job.campaign_id, workerId });

    try {
        await processCampaignJob(job.campaign_id);
    } catch (error) {
        logger.error("Campaign job failed", {
            campaignId: job.campaign_id,
            error: error.message,
        });

        await prisma.campaignJob.update({
            where: { id: job.id },
            data: {
                status: "failed",
                last_error: error.message,
                locked_at: null,
                locked_by: null,
            },
        });

        await prisma.campaign.update({
            where: { id: job.campaign_id },
            data: {
                status: "failed",
                error_message: error.message,
            },
        });
    }
}

/**
 * Process a single campaign job
 */
async function processCampaignJob(campaignId) {
    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: {
            template: {
                include: {
                    variable_mappings: true,
                },
            },
            segment: true,
        },
    });

    if (!campaign) {
        throw new Error("Campaign not found");
    }

    if (campaign.template.status !== "APPROVED") {
        throw new Error("Template is not approved by Meta");
    }

    // Update campaign status to running
    await prisma.campaign.update({
        where: { id: campaignId },
        data: {
            status: "running",
            started_at: campaign.started_at || new Date(),
        },
    });

    // Check if recipients already exist (resume scenario)
    let recipientCount = await prisma.campaignRecipient.count({
        where: { campaign_id: campaignId },
    });

    // If no recipients, populate them
    if (recipientCount === 0 && campaign.segment_id) {
        await populateCampaignRecipients(campaignId, campaign.segment_id);
        recipientCount = await prisma.campaignRecipient.count({
            where: { campaign_id: campaignId },
        });
    }

    // Update total recipients count
    await prisma.campaign.update({
        where: { id: campaignId },
        data: { total_recipients: recipientCount },
    });

    // Process in batches
    let processed = 0;
    let hasMore = true;

    while (hasMore) {
        // Check if campaign was paused
        const currentJob = await prisma.campaignJob.findUnique({
            where: { campaign_id: campaignId },
        });

        if (currentJob?.status === "paused") {
            logger.info("Campaign paused, stopping processing", { campaignId });
            return;
        }

        // Get batch of pending recipients
        const recipients = await prisma.campaignRecipient.findMany({
            where: {
                campaign_id: campaignId,
                status: "pending",
            },
            take: BATCH_SIZE,
        });

        if (recipients.length === 0) {
            hasMore = false;
            break;
        }

        // Process batch with rate limiting
        for (const recipient of recipients) {
            await sendToRecipient(campaign, recipient);
            processed++;

            // Rate limiting delay: 1000ms / RATE_LIMIT_PER_SECOND
            await sleep(1000 / RATE_LIMIT_PER_SECOND);
        }

        // Update job progress
        await prisma.campaignJob.update({
            where: { campaign_id: campaignId },
            data: {
                progress: processed,
                locked_at: new Date(), // Refresh lock
            },
        });

        logger.info("Campaign batch processed", {
            campaignId,
            processed,
            total: recipientCount,
        });
    }

    // Mark campaign as completed
    await prisma.campaignJob.update({
        where: { campaign_id: campaignId },
        data: {
            status: "completed",
            completed_at: new Date(),
            locked_at: null,
            locked_by: null,
        },
    });

    // Update campaign with final counts
    const stats = await getCampaignStats(campaignId);
    await prisma.campaign.update({
        where: { id: campaignId },
        data: {
            status: "completed",
            completed_at: new Date(),
            sent_count: stats.sent,
            failed_count: stats.failed,
        },
    });

    logger.info("Campaign completed", { campaignId, stats });
}

/**
 * Populate campaign recipients from segment
 */
async function populateCampaignRecipients(campaignId, segmentId) {
    const recipients = await getSegmentRecipients(segmentId);

    if (recipients.length === 0) {
        throw new Error("No recipients found for segment");
    }

    // Create recipient records in batches
    const batchSize = 100;
    for (let i = 0; i < recipients.length; i += batchSize) {
        const batch = recipients.slice(i, i + batchSize);
        await prisma.campaignRecipient.createMany({
            data: batch.map((r) => ({
                campaign_id: campaignId,
                conversation_id: r.conversation_id,
                odoo_contact_id: r.odoo_contact_id,
                wa_id: r.wa_id,
                phone_e164: r.phone_e164,
                recipient_name: r.name,
                status: "pending",
            })),
            skipDuplicates: true,
        });
    }

    logger.info("Campaign recipients populated", {
        campaignId,
        count: recipients.length,
    });
}

/**
 * Send template message to a single recipient
 */
async function sendToRecipient(campaign, recipient) {
    try {
        // Build template components with resolved variables
        const components = buildTemplateComponentsForRecipient(
            campaign.template,
            recipient
        );

        // Send using existing sendTemplate function
        const result = await sendTemplate(
            recipient.wa_id,
            campaign.template.name,
            campaign.template.language,
            components
        );

        if (result.ok) {
            // Extract message ID from response
            const wamid = result.response?.data?.messages?.[0]?.id || null;

            await prisma.campaignRecipient.update({
                where: { id: recipient.id },
                data: {
                    status: "sent",
                    wamid,
                    sent_at: new Date(),
                },
            });

            // Update campaign sent count
            await prisma.campaign.update({
                where: { id: campaign.id },
                data: { sent_count: { increment: 1 } },
            });
        } else {
            await prisma.campaignRecipient.update({
                where: { id: recipient.id },
                data: {
                    status: "failed",
                    error_json: result.error,
                    failed_at: new Date(),
                },
            });

            // Update campaign failed count
            await prisma.campaign.update({
                where: { id: campaign.id },
                data: { failed_count: { increment: 1 } },
            });
        }
    } catch (error) {
        await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: {
                status: "failed",
                error_json: { message: error.message },
                failed_at: new Date(),
            },
        });

        await prisma.campaign.update({
            where: { id: campaign.id },
            data: { failed_count: { increment: 1 } },
        });
    }
}

/**
 * Build template components with resolved variables for a recipient
 */
function buildTemplateComponentsForRecipient(template, recipient) {
    const components = [];
    const mappings = template.variable_mappings || [];

    // Prepare variable values
    const variableValues = {};
    for (const mapping of mappings) {
        let value = mapping.default_value || "";

        // Resolve value based on source
        if (mapping.source_type === "static") {
            value = mapping.source_path || mapping.default_value || "";
        } else if (mapping.source_type === "db") {
            // Get from recipient data
            if (mapping.source_path === "recipient.name") {
                value = recipient.recipient_name || "";
            } else if (mapping.source_path === "recipient.phone") {
                value = recipient.phone_e164 || "";
            }
        }
        // For odoo source, would need additional lookup - using default for now

        variableValues[mapping.var_index] = value || mapping.default_value || "Cliente";
    }

    // Build body component parameters
    if (template.body_text) {
        const bodyVarCount = (template.body_text.match(/\{\{\d+\}\}/g) || []).length;
        if (bodyVarCount > 0) {
            const parameters = [];
            for (let i = 1; i <= bodyVarCount; i++) {
                parameters.push({
                    type: "text",
                    text: variableValues[i] || `{{${i}}}`,
                });
            }
            components.push({
                type: "body",
                parameters,
            });
        }
    }

    // Build header component if needed
    if (template.header_type === "text" && template.header_content) {
        const headerVarCount = (template.header_content.match(/\{\{\d+\}\}/g) || []).length;
        if (headerVarCount > 0) {
            const parameters = [];
            for (let i = 1; i <= headerVarCount; i++) {
                parameters.push({
                    type: "text",
                    text: variableValues[i] || `{{${i}}}`,
                });
            }
            components.push({
                type: "header",
                parameters,
            });
        }
    }

    return components;
}

/**
 * Get campaign statistics
 */
async function getCampaignStats(campaignId) {
    const stats = await prisma.campaignRecipient.groupBy({
        by: ["status"],
        where: { campaign_id: campaignId },
        _count: { status: true },
    });

    const result = {
        pending: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        total: 0,
    };

    for (const stat of stats) {
        result[stat.status] = stat._count.status;
        result.total += stat._count.status;
    }

    return result;
}

/**
 * Pause a running campaign
 */
async function pauseCampaign(campaignId) {
    await prisma.campaignJob.updateMany({
        where: { campaign_id: campaignId },
        data: { status: "paused" },
    });

    await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "paused" },
    });

    logger.info("Campaign paused", { campaignId });
    return { paused: true };
}

/**
 * Resume a paused campaign
 */
async function resumeCampaign(campaignId) {
    await prisma.campaignJob.updateMany({
        where: { campaign_id: campaignId },
        data: {
            status: "pending",
            locked_at: null,
            locked_by: null,
        },
    });

    await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "scheduled" },
    });

    logger.info("Campaign resumed", { campaignId });
    return { resumed: true };
}

/**
 * Handle message status update from webhook
 */
async function handleMessageStatusUpdate(wamid, status, timestamp = null) {
    if (!prisma?.campaignRecipient?.findFirst) {
        return;
    }
    // Find recipient by wamid
    const recipient = await prisma.campaignRecipient.findFirst({
        where: { wamid },
    });

    if (!recipient) {
        return; // Not a campaign message
    }

    const updateData = {};

    switch (status) {
        case "delivered":
            if (!recipient.delivered_at) {
                updateData.status = "delivered";
                updateData.delivered_at = timestamp ? new Date(timestamp * 1000) : new Date();
            }
            break;
        case "read":
            updateData.status = "read";
            updateData.read_at = timestamp ? new Date(timestamp * 1000) : new Date();
            break;
        case "failed":
            updateData.status = "failed";
            updateData.failed_at = new Date();
            break;
    }

    if (Object.keys(updateData).length > 0) {
        await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: updateData,
        });

        // Update campaign counts
        if (status === "delivered") {
            await prisma.campaign.update({
                where: { id: recipient.campaign_id },
                data: { delivered_count: { increment: 1 } },
            });
        } else if (status === "read") {
            await prisma.campaign.update({
                where: { id: recipient.campaign_id },
                data: { read_count: { increment: 1 } },
            });
        }
    }
}

/**
 * Sleep utility for rate limiting
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if worker should be started (on server startup)
 */
async function initializeWorker() {
    const enabled = process.env.CAMPAIGN_WORKER_ENABLED === "true";
    if (enabled) {
        startWorker();
    } else {
        logger.info("Campaign worker disabled by config");
    }
}

module.exports = {
    enqueueCampaign,
    startWorker,
    stopWorker,
    pauseCampaign,
    resumeCampaign,
    getCampaignStats,
    handleMessageStatusUpdate,
    initializeWorker,
    populateCampaignRecipients,
};
