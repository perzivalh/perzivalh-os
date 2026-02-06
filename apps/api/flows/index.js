/**
 * Flow Loader
 * Escanea la carpeta flows/ y exporta todos los flows disponibles
 * Los flows nuevos se agregan automÃ¡ticamente al hacer commit
 */
const fs = require("fs");
const path = require("path");

const flowsDir = __dirname;

/**
 * Carga todos los flows disponibles desde la carpeta
 * @returns {Object} Mapa de flows { flow_id: flowDefinition }
 */
function loadAllFlows() {
    const flows = {};
    const files = fs.readdirSync(flowsDir);

    for (const file of files) {
        if (!file.endsWith(".flow.js")) {
            continue;
        }

        try {
            const flowPath = path.join(flowsDir, file);
            // Clear cache to allow hot reload in development
            delete require.cache[require.resolve(flowPath)];
            const flow = require(flowPath);

            if (flow && flow.id) {
                flows[flow.id] = flow;
            }
        } catch (error) {
            console.error(`Error loading flow ${file}:`, error.message);
        }
    }

    return flows;
}

/**
 * Obtiene lista de flows con metadata para UI
 * @returns {Array} Lista de flows con id, name, description, etc.
 */
function getFlowsList() {
    const flows = loadAllFlows();
    return Object.values(flows).map((flow) => ({
        id: flow.id,
        name: flow.name || flow.id,
        description: flow.description || "",
        version: flow.version || "1.0.0",
        icon: flow.icon || "ðŸ¤–",
        category: flow.category || "general",
        requires_ai: Boolean(flow.requires_ai || flow.ai?.enabled),
        ai: flow.ai || null,
    }));
}

/**
 * Obtiene un flow especÃ­fico por ID
 * @param {string} flowId
 * @returns {Object|null}
 */
function getFlow(flowId) {
    const flows = loadAllFlows();
    return flows[flowId] || null;
}

module.exports = {
    loadAllFlows,
    getFlowsList,
    getFlow,
};

