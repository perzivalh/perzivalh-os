/**
 * Audience Service
 * Build and manage audience segments for campaigns
 */
const prisma = require("../db");
const logger = require("../lib/logger");

/**
 * Create a new audience segment
 */
async function createSegment(data, userId = null) {
    const segment = await prisma.audienceSegment.create({
        data: {
            name: data.name,
            description: data.description || null,
            rules_json: data.rules || [],
            estimated_count: 0,
            created_by_user_id: userId,
        },
    });

    // Calculate initial estimate
    const count = await estimateRecipientCount(segment.id);
    await prisma.audienceSegment.update({
        where: { id: segment.id },
        data: { estimated_count: count },
    });

    // Audit log
    await prisma.auditLogTenant.create({
        data: {
            action: "audience_created",
            data_json: {
                entity: "audience",
                entity_id: segment.id,
                name: segment.name,
                rules: data.rules,
            },
            ...(userId ? { user: { connect: { id: userId } } } : {}),
        },
    });

    return getSegmentById(segment.id);
}

/**
 * Get all audience segments
 */
async function getAllSegments(options = {}) {
    const where = { is_active: true };

    if (options.search) {
        where.OR = [
            { name: { contains: options.search, mode: "insensitive" } },
            { description: { contains: options.search, mode: "insensitive" } },
        ];
    }

    const segments = await prisma.audienceSegment.findMany({
        where,
        orderBy: { created_at: "desc" },
        include: {
            created_by_user: {
                select: { id: true, name: true },
            },
        },
    });

    return segments;
}

/**
 * Get single segment by ID
 */
async function getSegmentById(id) {
    const segment = await prisma.audienceSegment.findUnique({
        where: { id },
        include: {
            created_by_user: {
                select: { id: true, name: true },
            },
        },
    });

    return segment;
}

/**
 * Update an audience segment
 */
async function updateSegment(id, data, userId = null) {
    const segment = await prisma.audienceSegment.update({
        where: { id },
        data: {
            name: data.name !== undefined ? data.name : undefined,
            description: data.description !== undefined ? data.description : undefined,
            rules_json: data.rules !== undefined ? data.rules : undefined,
        },
    });

    // Recalculate estimate if rules changed
    if (data.rules !== undefined) {
        const count = await estimateRecipientCount(id);
        await prisma.audienceSegment.update({
            where: { id },
            data: { estimated_count: count },
        });
    }

    // Audit log
    await prisma.auditLogTenant.create({
        data: {
            action: "audience_updated",
            data_json: { entity: "audience", entity_id: id, changes: Object.keys(data) },
            ...(userId ? { user: { connect: { id: userId } } } : {}),
        },
    });

    return getSegmentById(id);
}

/**
 * Soft delete a segment
 */
async function deleteSegment(id, userId = null) {
    await prisma.audienceSegment.update({
        where: { id },
        data: { is_active: false },
    });

    await prisma.audienceTag.deleteMany({
        where: { segment_id: id },
    });

    await prisma.auditLogTenant.create({
        data: {
            action: "audience_deleted",
            data_json: { entity: "audience", entity_id: id },
            ...(userId ? { user: { connect: { id: userId } } } : {}),
        },
    });

    return { deleted: true };
}

/**
 * Build Prisma WHERE clause from segment rules
 * Rules format:
 * [
 *   { type: "tag", operator: "has", value: "paciente_activo" },
 *   { type: "verified", operator: "is", value: true },
 *   { type: "last_message", operator: "within_days", value: 30 },
 *   { type: "source", operator: "is", value: "odoo" }, // odoo or conversation
 * ]
 */
function buildWhereFromRules(rules, source = "all") {
    let resolvedSource = source;

    for (const rule of rules || []) {
        const ruleType = rule.type || rule.field;
        if (ruleType === "source" && rule.value) {
            resolvedSource = rule.value;
        }
    }

    // Determine which source to query
    const queryOdoo = resolvedSource === "all" || resolvedSource === "odoo";
    const queryConversations =
        resolvedSource === "all" || resolvedSource === "conversation";
    const queryImports = resolvedSource === "all" || resolvedSource === "import";

    // Build conditions
    const conversationConditions = [];
    const odooContactConditions = [];
    const importContactConditions = [];
    const tagConditions = [];

    for (const rule of rules || []) {
        const ruleType = rule.type || rule.field;
        switch (ruleType) {
            case "tag":
                if (rule.operator === "has") {
                    tagConditions.push({
                        tags: {
                            some: {
                                tag: { name: rule.value },
                            },
                        },
                    });
                    importContactConditions.push({
                        tags_json: { array_contains: [rule.value] },
                    });
                } else if (rule.operator === "not_has") {
                    tagConditions.push({
                        tags: {
                            none: {
                                tag: { name: rule.value },
                            },
                        },
                    });
                    importContactConditions.push({
                        OR: [
                            { tags_json: { equals: null } },
                            { tags_json: { equals: [] } },
                            { NOT: { tags_json: { array_contains: [rule.value] } } },
                        ],
                    });
                } else if (rule.operator === "none") {
                    tagConditions.push({
                        tags: { none: {} },
                    });
                    importContactConditions.push({
                        OR: [
                            { tags_json: { equals: null } },
                            { tags_json: { equals: [] } },
                        ],
                    });
                }
                break;

            case "primary_tag":
                if (rule.operator === "is") {
                    if (rule.value === null || rule.value === "__NONE__") {
                        conversationConditions.push({
                            primary_tag_id: null,
                        });
                    } else {
                        conversationConditions.push({
                            primary_tag_id: rule.value,
                        });
                    }
                }
                break;

            case "phone_number_id":
                if (rule.value) {
                    conversationConditions.push({
                        phone_number_id: rule.value,
                    });
                }
                break;

            case "verified":
                if (rule.value === true) {
                    conversationConditions.push({
                        verified_at: { not: null },
                    });
                } else {
                    conversationConditions.push({
                        verified_at: null,
                    });
                }
                break;

            case "last_message":
                if (rule.operator === "within_days" && rule.value) {
                    const cutoffDate = new Date();
                    cutoffDate.setDate(cutoffDate.getDate() - parseInt(rule.value, 10));
                    conversationConditions.push({
                        last_message_at: { gte: cutoffDate },
                    });
                } else if (rule.operator === "older_than_days" && rule.value) {
                    const cutoffDate = new Date();
                    cutoffDate.setDate(cutoffDate.getDate() - parseInt(rule.value, 10));
                    conversationConditions.push({
                        last_message_at: { lt: cutoffDate },
                    });
                }
                break;

            case "status":
                conversationConditions.push({
                    status: rule.value,
                });
                break;

            case "is_patient":
                odooContactConditions.push({
                    is_patient: rule.value === true,
                });
                break;

            case "source":
                // This affects which tables to query, handled above
                break;
        }
    }

    return {
        conversationWhere: {
            AND: [...conversationConditions, ...tagConditions],
        },
        odooContactWhere: {
            AND: odooContactConditions,
            phone_e164: { not: null },
        },
        importContactWhere: {
            AND: importContactConditions,
        },
        queryOdoo,
        queryConversations,
        queryImports,
    };
}

/**
 * Estimate recipient count for a segment
 */
async function estimateRecipientCount(segmentId) {
    const segment = await prisma.audienceSegment.findUnique({
        where: { id: segmentId },
    });

    if (!segment) {
        return 0;
    }

    const {
        conversationWhere,
        odooContactWhere,
        importContactWhere,
        queryOdoo,
        queryConversations,
        queryImports,
    } = buildWhereFromRules(segment.rules_json);

    let totalCount = 0;
    const phonesSeen = new Set();

    // Count from conversations
    if (queryConversations) {
        const conversations = await prisma.conversation.findMany({
            where: conversationWhere,
            select: { phone_e164: true },
        });
        for (const c of conversations) {
            if (c.phone_e164 && !phonesSeen.has(c.phone_e164)) {
                phonesSeen.add(c.phone_e164);
                totalCount++;
            }
        }
    }

    // Count from Odoo contacts (if not already in conversations)
    if (queryOdoo) {
        const contacts = await prisma.odooContact.findMany({
            where: odooContactWhere,
            select: { phone_e164: true },
        });
        for (const c of contacts) {
            if (c.phone_e164 && !phonesSeen.has(c.phone_e164)) {
                phonesSeen.add(c.phone_e164);
                totalCount++;
            }
        }
    }

    if (queryImports) {
        const contacts = await prisma.importedContact.findMany({
            where: importContactWhere,
            select: { phone_e164: true },
        });
        for (const c of contacts) {
            if (c.phone_e164 && !phonesSeen.has(c.phone_e164)) {
                phonesSeen.add(c.phone_e164);
                totalCount++;
            }
        }
    }

    return totalCount;
}

/**
 * Get recipients for a segment (for campaign sending)
 * Returns array of { wa_id, phone_e164, name, source, source_id }
 */
async function getSegmentRecipients(segmentId, options = {}) {
    const segment = await prisma.audienceSegment.findUnique({
        where: { id: segmentId },
    });

    if (!segment) {
        throw new Error("Segment not found");
    }

    const {
        conversationWhere,
        odooContactWhere,
        importContactWhere,
        queryOdoo,
        queryConversations,
        queryImports,
    } = buildWhereFromRules(segment.rules_json);

    const recipients = [];
    const phonesSeen = new Set();

    // Get from conversations first
    if (queryConversations) {
        const conversations = await prisma.conversation.findMany({
            where: conversationWhere,
            select: {
                id: true,
                wa_id: true,
                phone_e164: true,
                display_name: true,
                partner_id: true,
            },
            take: options.limit || 10000,
        });

        for (const c of conversations) {
            if (c.phone_e164 && !phonesSeen.has(c.phone_e164)) {
                phonesSeen.add(c.phone_e164);
                recipients.push({
                    wa_id: c.wa_id,
                    phone_e164: c.phone_e164,
                    name: c.display_name || null,
                    source: "conversation",
                    conversation_id: c.id,
                    odoo_contact_id: null,
                    partner_id: c.partner_id,
                });
            }
        }
    }

    // Get from Odoo contacts
    if (queryOdoo) {
        const contacts = await prisma.odooContact.findMany({
            where: odooContactWhere,
            select: {
                id: true,
                odoo_partner_id: true,
                name: true,
                phone_e164: true,
            },
            take: options.limit || 10000,
        });

        for (const c of contacts) {
            if (c.phone_e164 && !phonesSeen.has(c.phone_e164)) {
                phonesSeen.add(c.phone_e164);
                // Clean phone for wa_id (remove + prefix)
                const waId = c.phone_e164.replace(/^\+/, "");
                recipients.push({
                    wa_id: waId,
                    phone_e164: c.phone_e164,
                    name: c.name || null,
                    source: "odoo",
                    conversation_id: null,
                    odoo_contact_id: c.id,
                    partner_id: c.odoo_partner_id,
                });
            }
        }
    }

    if (queryImports) {
        const contacts = await prisma.importedContact.findMany({
            where: importContactWhere,
            select: {
                id: true,
                phone_e164: true,
                name: true,
            },
            take: options.limit || 10000,
        });

        for (const c of contacts) {
            if (c.phone_e164 && !phonesSeen.has(c.phone_e164)) {
                phonesSeen.add(c.phone_e164);
                const waId = c.phone_e164.replace(/^\+/, "");
                recipients.push({
                    wa_id: waId,
                    phone_e164: c.phone_e164,
                    name: c.name || null,
                    source: "import",
                    conversation_id: null,
                    odoo_contact_id: null,
                    partner_id: null,
                });
            }
        }
    }

    return recipients;
}

/**
 * Preview recipients for a segment (limited results for UI)
 */
async function previewSegmentRecipients(segmentId, limit = 50) {
    const recipients = await getSegmentRecipients(segmentId, { limit });
    const total = await estimateRecipientCount(segmentId);

    return {
        recipients: recipients.slice(0, limit),
        total,
        showing: Math.min(recipients.length, limit),
    };
}

/**
 * Refresh estimated counts for all segments
 */
async function refreshAllSegmentCounts() {
    const segments = await prisma.audienceSegment.findMany({
        where: { is_active: true },
        select: { id: true },
    });

    for (const segment of segments) {
        try {
            const count = await estimateRecipientCount(segment.id);
            await prisma.audienceSegment.update({
                where: { id: segment.id },
                data: { estimated_count: count },
            });
        } catch (error) {
            logger.error("Failed to refresh segment count", {
                segmentId: segment.id,
                error: error.message,
            });
        }
    }

    logger.info("Refreshed all segment counts", { count: segments.length });
}

module.exports = {
    createSegment,
    getAllSegments,
    getSegmentById,
    updateSegment,
    deleteSegment,
    buildWhereFromRules,
    estimateRecipientCount,
    getSegmentRecipients,
    previewSegmentRecipients,
    refreshAllSegmentCounts,
};
