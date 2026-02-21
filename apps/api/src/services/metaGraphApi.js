/**
 * Meta Graph API Client for WhatsApp Template Management
 * Handles all interactions with Meta's Graph API for templates
 */
const axios = require("axios");
const { getTenantContext } = require("../tenancy/tenantContext");
const logger = require("../lib/logger");

const GRAPH_API_VERSION = "v22.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Get WhatsApp Business Account configuration from tenant context
 */
function getWabaConfig() {
    const context = getTenantContext();
    const channel = context.channel || {};

    return {
        wabaId: channel.waba_id || process.env.WABA_ID || "",
        accessToken: channel.wa_token || process.env.ACCESS_TOKEN || "",
        phoneNumberId: channel.phone_number_id || process.env.PHONE_NUMBER_ID || "",
    };
}

/**
 * Make authenticated request to Graph API
 */
async function graphRequest(method, endpoint, data = null, options = {}) {
    const config = options.config || getWabaConfig();

    if (!config.accessToken) {
        throw new Error("ACCESS_TOKEN not configured");
    }

    const url = endpoint.startsWith("http") ? endpoint : `${GRAPH_API_BASE}${endpoint}`;

    try {
        const response = await axios({
            method,
            url,
            headers: {
                Authorization: `Bearer ${config.accessToken}`,
                "Content-Type": "application/json",
            },
            data: data || undefined,
            params: options.params || undefined,
            timeout: 30000,
        });

        return {
            ok: true,
            data: response.data,
        };
    } catch (error) {
        const errorData = error.response?.data?.error || {};
        logger.error("Graph API error", {
            endpoint,
            status: error.response?.status,
            error: errorData,
        });

        return {
            ok: false,
            error: {
                status: error.response?.status,
                code: errorData.code,
                message: errorData.message || error.message,
                type: errorData.type,
                fbtrace_id: errorData.fbtrace_id,
            },
        };
    }
}

/**
 * List all message templates from Meta WABA
 * @param {Object} options - { wabaId?, limit? }
 */
async function listTemplates(options = {}) {
    const config = getWabaConfig();
    const wabaId = options.wabaId || config.wabaId;

    if (!wabaId) {
        throw new Error("WABA_ID not configured");
    }

    const params = {
        limit: options.limit || 100,
    };

    if (options.status) {
        params.status = options.status; // APPROVED, PENDING, REJECTED, etc.
    }

    const result = await graphRequest("GET", `/${wabaId}/message_templates`, null, { params });

    if (!result.ok) {
        return result;
    }

    // Handle pagination if needed
    let templates = result.data.data || [];
    let paging = result.data.paging;

    // Fetch additional pages if needed (up to 500 templates)
    while (paging?.next && templates.length < 500) {
        const nextResult = await graphRequest("GET", paging.next);
        if (nextResult.ok && nextResult.data?.data) {
            templates = templates.concat(nextResult.data.data);
            paging = nextResult.data.paging;
        } else {
            break;
        }
    }

    return {
        ok: true,
        data: templates,
    };
}

/**
 * Get a single template by name
 */
async function getTemplate(templateName, options = {}) {
    const config = getWabaConfig();
    const wabaId = options.wabaId || config.wabaId;

    if (!wabaId) {
        throw new Error("WABA_ID not configured");
    }

    const result = await graphRequest("GET", `/${wabaId}/message_templates`, null, {
        params: {
            name: templateName,
        },
    });

    if (!result.ok) {
        return result;
    }

    const templates = result.data.data || [];
    if (templates.length === 0) {
        return {
            ok: false,
            error: { message: "Template not found", code: "NOT_FOUND" },
        };
    }

    return {
        ok: true,
        data: templates[0],
    };
}

/**
 * Create a new message template in Meta
 * @param {Object} templateData - Template configuration
 * @param {string} templateData.name - Template name (lowercase, underscores)
 * @param {string} templateData.category - MARKETING, UTILITY, or AUTHENTICATION
 * @param {string} templateData.language - Language code (e.g., "es", "en_US")
 * @param {Array} templateData.components - Template components array
 */
async function createTemplate(templateData, options = {}) {
    const config = getWabaConfig();
    const wabaId = options.wabaId || config.wabaId;

    if (!wabaId) {
        throw new Error("WABA_ID not configured");
    }

    // Validate template name format (lowercase, underscores only)
    const nameRegex = /^[a-z][a-z0-9_]*$/;
    if (!nameRegex.test(templateData.name)) {
        return {
            ok: false,
            error: {
                message: "Template name must be lowercase with underscores only, starting with a letter",
                code: "INVALID_NAME",
            },
        };
    }

    // Build the request payload
    const payload = {
        name: templateData.name,
        category: templateData.category || "UTILITY",
        language: templateData.language || "es",
        components: templateData.components || [],
    };

    // Add allow_category_change if specified
    if (templateData.allow_category_change !== undefined) {
        payload.allow_category_change = templateData.allow_category_change;
    }

    const result = await graphRequest("POST", `/${wabaId}/message_templates`, payload);

    if (result.ok) {
        logger.info("Template created in Meta", {
            name: templateData.name,
            id: result.data.id,
        });
    }

    return result;
}

/**
 * Update an existing template (limited - only certain fields can be updated)
 * Note: Meta only allows updating templates that are APPROVED or REJECTED
 */
async function updateTemplate(templateId, templateData, options = {}) {
    const payload = {};

    if (templateData.components) {
        payload.components = templateData.components;
    }

    if (templateData.category) {
        payload.category = templateData.category;
    }

    const result = await graphRequest("POST", `/${templateId}`, payload);

    if (result.ok) {
        logger.info("Template updated in Meta", { templateId });
    }

    return result;
}

/**
 * Delete a template from Meta
 * @param {string} templateName - Name of the template to delete
 */
async function deleteTemplate(templateName, options = {}) {
    const config = getWabaConfig();
    const wabaId = options.wabaId || config.wabaId;

    if (!wabaId) {
        throw new Error("WABA_ID not configured");
    }

    const result = await graphRequest("DELETE", `/${wabaId}/message_templates`, null, {
        params: {
            name: templateName,
        },
    });

    if (result.ok) {
        logger.info("Template deleted from Meta", { name: templateName });
    }

    return result;
}

/**
 * Build template components from our simplified format
 * @param {Object} config - Simplified template config
 * @param {string} config.bodyText - Main body text with {{1}}, {{2}} variables
 * @param {string} config.headerType - "none", "text", "image", "video", "document"
 * @param {string} config.headerContent - Header text or media URL
 * @param {string} config.footerText - Optional footer text
 * @param {Array} config.buttons - Array of button configs
 */
function buildTemplateComponents(config) {
    const components = [];

    // Header component
    if (config.headerType && config.headerType !== "none") {
        const header = {
            type: "HEADER",
            format: config.headerType.toUpperCase(),
        };

        if (config.headerType === "text") {
            header.text = config.headerContent || "";
            // Extract variables from header
            const headerVars = extractVariables(header.text);
            if (headerVars.length > 0) {
                header.example = {
                    header_text: headerVars.map((_, i) => `Example${i + 1}`),
                };
            }
        } else if (["image", "video", "document"].includes(config.headerType)) {
            header.example = {
                header_handle: [config.headerContent || "https://example.com/placeholder.jpg"],
            };
        }

        components.push(header);
    }

    // Body component (required)
    if (config.bodyText) {
        const body = {
            type: "BODY",
            text: config.bodyText,
        };

        // Extract variables and add examples
        const bodyVars = extractVariables(config.bodyText);
        if (bodyVars.length > 0) {
            body.example = {
                body_text: [bodyVars.map((_, i) => `Example${i + 1}`)],
            };
        }

        components.push(body);
    }

    // Footer component
    if (config.footerText) {
        components.push({
            type: "FOOTER",
            text: config.footerText,
        });
    }

    // Buttons component
    if (config.buttons && config.buttons.length > 0) {
        const buttons = config.buttons.map((btn) => {
            if (btn.type === "QUICK_REPLY") {
                return {
                    type: "QUICK_REPLY",
                    text: btn.text,
                };
            } else if (btn.type === "URL") {
                return {
                    type: "URL",
                    text: btn.text,
                    url: btn.url,
                };
            } else if (btn.type === "PHONE_NUMBER") {
                return {
                    type: "PHONE_NUMBER",
                    text: btn.text,
                    phone_number: btn.phoneNumber,
                };
            }
            return btn;
        });

        components.push({
            type: "BUTTONS",
            buttons,
        });
    }

    return components;
}

/**
 * Extract variable placeholders from text
 * Returns array of variable indices found
 */
function extractVariables(text) {
    if (!text) return [];
    const matches = text.match(/\{\{(\d+)\}\}/g) || [];
    return matches.map((m) => parseInt(m.replace(/[{}]/g, ""), 10));
}

/**
 * Parse Meta template response into our local format
 */
function parseMetaTemplate(metaTemplate) {
    const result = {
        meta_template_id: metaTemplate.id,
        name: metaTemplate.name,
        category: metaTemplate.category,
        language: metaTemplate.language,
        status: metaTemplate.status,
        quality_score: metaTemplate.quality_score?.score || null,
        components_json: metaTemplate.components || [],
        body_text: null,
        header_type: null,
        header_content: null,
        footer_text: null,
        buttons_json: null,
        rejection_reason: metaTemplate.rejected_reason || null,
    };

    // Parse components
    for (const component of metaTemplate.components || []) {
        if (component.type === "BODY") {
            result.body_text = component.text || null;
        } else if (component.type === "HEADER") {
            result.header_type = (component.format || "text").toLowerCase();
            result.header_content = component.text || null;
        } else if (component.type === "FOOTER") {
            result.footer_text = component.text || null;
        } else if (component.type === "BUTTONS") {
            result.buttons_json = component.buttons || [];
        }
    }

    return result;
}

/**
 * Get media URL and download the file from WhatsApp Cloud API
 * @param {string} mediaId - ID of the media to download
 * @param {Object} options - config options overriding context
 */
async function downloadMedia(mediaId, options = {}) {
    if (!mediaId) {
        throw new Error("mediaId is required");
    }

    const config = options.config || getWabaConfig();
    if (!config.accessToken) {
        throw new Error("ACCESS_TOKEN not configured");
    }

    // Step 1: Get the media URL from the media ID
    const urlResult = await graphRequest("GET", `/${mediaId}`, null, { config });
    if (!urlResult.ok || !urlResult.data?.url) {
        logger.error("Failed to retrieve media URL", { mediaId, error: urlResult.error });
        throw new Error("Failed to retrieve media URL");
    }

    const downloadUrl = urlResult.data.url;
    const mimeType = urlResult.data.mime_type;

    // Step 2: Download the actual media binary
    try {
        const response = await axios({
            method: "GET",
            url: downloadUrl,
            headers: {
                Authorization: `Bearer ${config.accessToken}`,
            },
            responseType: "arraybuffer", // Important to receive binary data
            timeout: 30000,
        });

        return {
            buffer: Buffer.from(response.data),
            mimeType: mimeType || response.headers["content-type"],
        };
    } catch (error) {
        logger.error("Failed to download media binary", {
            mediaId,
            url: downloadUrl,
            error: error.message,
        });
        throw new Error("Failed to download media binary");
    }
}

module.exports = {
    getWabaConfig,
    graphRequest,
    listTemplates,
    getTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    buildTemplateComponents,
    extractVariables,
    parseMetaTemplate,
    downloadMedia,
};
