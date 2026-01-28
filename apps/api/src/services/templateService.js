/**
 * Template Service
 * Business logic for template management - sync, create, update, webhook handling
 */
const prisma = require("../db");
const logger = require("../lib/logger");
const {
    listTemplates,
    createTemplate,
    getTemplate,
    deleteTemplate,
    buildTemplateComponents,
    parseMetaTemplate,
} = require("./metaGraphApi");

/**
 * Sync all templates from Meta to local database
 * Creates new templates, updates existing ones
 */
async function syncTemplatesFromMeta() {
    logger.info("Starting template sync from Meta");

    const result = await listTemplates();
    if (!result.ok) {
        logger.error("Failed to fetch templates from Meta", result.error);
        throw new Error(result.error?.message || "Failed to fetch templates");
    }

    const metaTemplates = result.data || [];
    const syncedIds = [];
    const errors = [];

    for (const metaTemplate of metaTemplates) {
        try {
            const parsed = parseMetaTemplate(metaTemplate);

            // Upsert template by name + language
            const existing = await prisma.metaTemplate.findFirst({
                where: {
                    name: parsed.name,
                    language: parsed.language,
                },
            });

            if (existing) {
                // Update existing template
                await prisma.metaTemplate.update({
                    where: { id: existing.id },
                    data: {
                        meta_template_id: parsed.meta_template_id,
                        category: parsed.category,
                        status: parsed.status,
                        quality_score: parsed.quality_score,
                        components_json: parsed.components_json,
                        body_text: parsed.body_text,
                        header_type: parsed.header_type,
                        header_content: parsed.header_content,
                        footer_text: parsed.footer_text,
                        buttons_json: parsed.buttons_json,
                        rejection_reason: parsed.rejection_reason,
                        last_synced_at: new Date(),
                    },
                });
                syncedIds.push(existing.id);
            } else {
                // Create new template
                const created = await prisma.metaTemplate.create({
                    data: {
                        name: parsed.name,
                        meta_template_id: parsed.meta_template_id,
                        category: parsed.category,
                        language: parsed.language,
                        status: parsed.status,
                        quality_score: parsed.quality_score,
                        components_json: parsed.components_json,
                        body_text: parsed.body_text,
                        header_type: parsed.header_type,
                        header_content: parsed.header_content,
                        footer_text: parsed.footer_text,
                        buttons_json: parsed.buttons_json,
                        rejection_reason: parsed.rejection_reason,
                        last_synced_at: new Date(),
                    },
                });
                syncedIds.push(created.id);
            }
        } catch (error) {
            errors.push({
                template: metaTemplate.name,
                error: error.message,
            });
            logger.error("Error syncing template", {
                name: metaTemplate.name,
                error: error.message,
            });
        }
    }

    logger.info("Template sync completed", {
        total: metaTemplates.length,
        synced: syncedIds.length,
        errors: errors.length,
    });

    return {
        total: metaTemplates.length,
        synced: syncedIds.length,
        errors,
    };
}

/**
 * Get all templates from local database
 */
async function getAllTemplates(options = {}) {
    const where = {
        is_deleted: false,
    };

    if (options.status) {
        where.status = options.status;
    }

    if (options.category) {
        where.category = options.category;
    }

    if (options.search) {
        where.OR = [
            { name: { contains: options.search, mode: "insensitive" } },
            { body_text: { contains: options.search, mode: "insensitive" } },
        ];
    }

    const templates = await prisma.metaTemplate.findMany({
        where,
        orderBy: { created_at: "desc" },
        include: {
            variable_mappings: true,
            created_by_user: {
                select: { id: true, name: true, email: true },
            },
        },
    });

    return templates;
}

/**
 * Get single template by ID with mappings
 */
async function getTemplateById(id) {
    const template = await prisma.metaTemplate.findUnique({
        where: { id },
        include: {
            variable_mappings: {
                orderBy: { var_index: "asc" },
            },
            created_by_user: {
                select: { id: true, name: true, email: true },
            },
        },
    });

    return template;
}

/**
 * Create a local draft template (not submitted to Meta yet)
 */
async function createDraft(data, userId = null) {
    // Validate name format
    const nameRegex = /^[a-z][a-z0-9_]*$/;
    if (!nameRegex.test(data.name)) {
        throw new Error("Template name must be lowercase with underscores only, starting with a letter");
    }

    // Check for duplicate name + language
    const existing = await prisma.metaTemplate.findFirst({
        where: {
            name: data.name,
            language: data.language || "es",
            is_deleted: false,
        },
    });

    if (existing) {
        throw new Error("A template with this name and language already exists");
    }

    const template = await prisma.metaTemplate.create({
        data: {
            name: data.name,
            category: data.category || "UTILITY",
            language: data.language || "es",
            status: "DRAFT",
            body_text: data.body_text || "",
            header_type: data.header_type || null,
            header_content: data.header_content || null,
            footer_text: data.footer_text || null,
            buttons_json: data.buttons || null,
            components_json: [],
            created_by_user_id: userId,
        },
    });

    // Create variable mappings if provided
    if (data.variable_mappings && data.variable_mappings.length > 0) {
        await prisma.metaTemplateVariableMapping.createMany({
            data: data.variable_mappings.map((mapping) => ({
                template_id: template.id,
                var_index: mapping.var_index,
                display_name: mapping.display_name || null,
                source_type: mapping.source_type || "static",
                source_path: mapping.source_path || "",
                default_value: mapping.default_value || null,
                transform: mapping.transform || null,
            })),
        });
    }

    // Log audit
    await prisma.auditLogTenant.create({
        data: {
            action: "template_draft_created",
            data_json: {
                entity: "template",
                entity_id: template.id,
                name: template.name,
                category: template.category,
                language: template.language,
            },
            ...(userId ? { user: { connect: { id: userId } } } : {}),
        },
    });

    return getTemplateById(template.id);
}

/**
 * Update a draft template
 */
async function updateDraft(id, data, userId = null) {
    const template = await prisma.metaTemplate.findUnique({
        where: { id },
    });

    if (!template) {
        throw new Error("Template not found");
    }

    if (template.status !== "DRAFT") {
        throw new Error("Only draft templates can be edited locally. Use Meta Business Manager for approved templates.");
    }

    const updated = await prisma.metaTemplate.update({
        where: { id },
        data: {
            body_text: data.body_text !== undefined ? data.body_text : template.body_text,
            header_type: data.header_type !== undefined ? data.header_type : template.header_type,
            header_content: data.header_content !== undefined ? data.header_content : template.header_content,
            footer_text: data.footer_text !== undefined ? data.footer_text : template.footer_text,
            buttons_json: data.buttons !== undefined ? data.buttons : template.buttons_json,
            category: data.category !== undefined ? data.category : template.category,
        },
    });

    // Log audit
    await prisma.auditLogTenant.create({
        data: {
            action: "template_draft_updated",
            data_json: { entity: "template", entity_id: id, changes: Object.keys(data) },
            ...(userId ? { user: { connect: { id: userId } } } : {}),
        },
    });

    return getTemplateById(id);
}

/**
 * Update variable mappings for a template
 */
async function updateVariableMappings(templateId, mappings, userId = null) {
    // Delete existing mappings
    await prisma.metaTemplateVariableMapping.deleteMany({
        where: { template_id: templateId },
    });

    // Create new mappings
    if (mappings && mappings.length > 0) {
        await prisma.metaTemplateVariableMapping.createMany({
            data: mappings.map((mapping) => ({
                template_id: templateId,
                var_index: mapping.var_index,
                display_name: mapping.display_name || null,
                source_type: mapping.source_type || "static",
                source_path: mapping.source_path || "",
                default_value: mapping.default_value || null,
                transform: mapping.transform || null,
            })),
        });
    }

    // Log audit
    await prisma.auditLogTenant.create({
        data: {
            action: "template_mappings_updated",
            data_json: {
                entity: "template",
                entity_id: templateId,
                mappings_count: mappings?.length || 0,
            },
            ...(userId ? { user: { connect: { id: userId } } } : {}),
        },
    });

    return getTemplateById(templateId);
}

/**
 * Submit a draft template to Meta for review
 */
async function submitToMeta(templateId, userId = null) {
    const template = await prisma.metaTemplate.findUnique({
        where: { id: templateId },
    });

    if (!template) {
        throw new Error("Template not found");
    }

    if (template.status !== "DRAFT" && template.status !== "REJECTED") {
        throw new Error("Only draft or rejected templates can be submitted");
    }

    // Build components from template data
    const components = buildTemplateComponents({
        bodyText: template.body_text,
        headerType: template.header_type,
        headerContent: template.header_content,
        footerText: template.footer_text,
        buttons: template.buttons_json || [],
    });

    // Submit to Meta
    const result = await createTemplate({
        name: template.name,
        category: template.category,
        language: template.language,
        components,
    });

    if (!result.ok) {
        // Update template with error
        await prisma.metaTemplate.update({
            where: { id: templateId },
            data: {
                meta_response_json: result.error,
                rejection_reason: result.error?.message,
            },
        });

        // Log audit
        await prisma.auditLogTenant.create({
            data: {
                action: "template_submit_failed",
                data_json: {
                    entity: "template",
                    entity_id: templateId,
                    error: result.error,
                },
                ...(userId ? { user: { connect: { id: userId } } } : {}),
            },
        });

        throw new Error(result.error?.message || "Failed to submit template to Meta");
    }

    // Update template with Meta response
    await prisma.metaTemplate.update({
        where: { id: templateId },
        data: {
            meta_template_id: result.data.id,
            status: "PENDING",
            components_json: components,
            meta_response_json: result.data,
            last_synced_at: new Date(),
        },
    });

    // Log audit
    await prisma.auditLogTenant.create({
        data: {
            action: "template_submitted",
            data_json: {
                entity: "template",
                entity_id: templateId,
                meta_template_id: result.data.id,
                name: template.name,
            },
            ...(userId ? { user: { connect: { id: userId } } } : {}),
        },
    });

    return getTemplateById(templateId);
}

/**
 * Soft delete a template
 */
async function deleteTemplateLocal(templateId, userId = null) {
    const template = await prisma.metaTemplate.findUnique({
        where: { id: templateId },
    });

    if (!template) {
        throw new Error("Template not found");
    }

    // Mark as deleted locally
    await prisma.metaTemplate.update({
        where: { id: templateId },
        data: { is_deleted: true },
    });

    // If template exists in Meta, try to delete there too
    if (template.meta_template_id && template.status !== "DRAFT") {
        try {
            await deleteTemplate(template.name);
        } catch (error) {
            logger.warn("Failed to delete template from Meta", {
                name: template.name,
                error: error.message,
            });
        }
    }

    // Log audit
    await prisma.auditLogTenant.create({
        data: {
            action: "template_deleted",
            data_json: {
                entity: "template",
                entity_id: templateId,
                name: template.name,
            },
            ...(userId ? { user: { connect: { id: userId } } } : {}),
        },
    });

    return { deleted: true };
}

/**
 * Handle template status update from webhook
 */
async function handleTemplateStatusUpdate(event) {
    const { message_template_id, message_template_name, event: eventType, reason } = event;

    // Log the webhook
    await prisma.templateWebhookLog.create({
        data: {
            event_type: "message_template_status_update",
            template_name: message_template_name,
            template_id: message_template_id?.toString(),
            raw_json: event,
        },
    });

    // Map event type to our status
    const statusMap = {
        APPROVED: "APPROVED",
        REJECTED: "REJECTED",
        PENDING: "PENDING",
        PENDING_DELETION: "DISABLED",
        DELETED: "DISABLED",
        DISABLED: "DISABLED",
        REINSTATED: "APPROVED",
        FLAGGED: "PAUSED",
        PAUSED: "PAUSED",
    };

    const newStatus = statusMap[eventType] || null;
    if (!newStatus) {
        logger.warn("Unknown template status event", { eventType });
        return;
    }

    // Find and update template
    const template = await prisma.metaTemplate.findFirst({
        where: {
            OR: [
                { meta_template_id: message_template_id?.toString() },
                { name: message_template_name },
            ],
        },
    });

    if (!template) {
        logger.warn("Template not found for status update", {
            id: message_template_id,
            name: message_template_name,
        });
        return;
    }

    await prisma.metaTemplate.update({
        where: { id: template.id },
        data: {
            status: newStatus,
            rejection_reason: reason || null,
            last_synced_at: new Date(),
        },
    });

    // Log audit
    await prisma.auditLogTenant.create({
        data: {
            action: "template_status_webhook",
            data_json: {
                entity: "template",
                entity_id: template.id,
                event: eventType,
                newStatus,
                reason,
            },
        },
    });

    logger.info("Template status updated from webhook", {
        name: template.name,
        oldStatus: template.status,
        newStatus,
    });
}

/**
 * Handle template quality update from webhook
 */
async function handleTemplateQualityUpdate(event) {
    const { message_template_id, message_template_name, new_quality_score } = event;

    // Log the webhook
    await prisma.templateWebhookLog.create({
        data: {
            event_type: "message_template_quality_update",
            template_name: message_template_name,
            template_id: message_template_id?.toString(),
            raw_json: event,
        },
    });

    // Find and update template
    const template = await prisma.metaTemplate.findFirst({
        where: {
            OR: [
                { meta_template_id: message_template_id?.toString() },
                { name: message_template_name },
            ],
        },
    });

    if (!template) {
        logger.warn("Template not found for quality update", {
            id: message_template_id,
            name: message_template_name,
        });
        return;
    }

    await prisma.metaTemplate.update({
        where: { id: template.id },
        data: {
            quality_score: new_quality_score || null,
            last_synced_at: new Date(),
        },
    });

    logger.info("Template quality updated from webhook", {
        name: template.name,
        quality: new_quality_score,
    });
}

module.exports = {
    syncTemplatesFromMeta,
    getAllTemplates,
    getTemplateById,
    createDraft,
    updateDraft,
    updateVariableMappings,
    submitToMeta,
    deleteTemplateLocal,
    handleTemplateStatusUpdate,
    handleTemplateQualityUpdate,
};
