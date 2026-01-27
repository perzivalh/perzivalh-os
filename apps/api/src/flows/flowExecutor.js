/**
 * Flow Executor Dynamic
 * Ejecuta flows definidos en JSON/JS sin lógica hardcodeada
 */
const { sendText, sendInteractive } = require("../whatsapp");
const logger = require("../lib/logger");
const { normalizeText } = require("../lib/normalize");

// Simple store for flow state (in memory for now, ideally in Redis/DB)
// conversationId -> state
const flowStates = new Map();

/**
 * Procesa un mensaje de texto entrante para un flow dinámico
 */
async function executeDynamicFlow(waId, text, flowData, context = {}) {
    const normalized = normalizeText(text);
    const flow = flowData.flow;

    // 1. Detectar si es un saludo o inicio
    const isGreeting = ["hola", "inicio", "empezar", "menu", "bot"].includes(normalized);

    if (isGreeting) {
        return sendMainMenu(waId, flow);
    }

    // 2. Aquí iría la máquina de estados real
    // Por ahora, para "Bienvenida General", si dice cualquier cosa que no entendemos,
    // volvemos a mostrar el menú si es un input corto, o handoff si parece pedir ayuda.

    // Si es un flow simple como "Bienvenida General", probablemente solo queramos mostrar el menú
    // o procesar las opciones del menú.

    // Como es dynamic, vamos a asumir que cualquier interacción textual 
    // que no sea una selección de menú (handled by handleInteractive)
    // debería disparar el menú principal de nuevo para orientación.
    return sendMainMenu(waId, flow);
}

/**
 * Procesa una respuesta interactiva (botón/lista)
 */
async function executeDynamicInteractive(waId, selectionId, flowData, context = {}) {
    const flow = flowData.flow;

    // Buscar la acción en el flow
    // En general.flow.js: actions: { HANDOFF: "HANDOFF" }

    if (selectionId === "HANDOFF") {
        await sendText(waId, "💬 Te estamos conectando con un asesor. Por favor espera un momento...");
        // Aquí se activaría la lógica de handoff real (tagging, status change)
        // Pero eso se maneja en el webhook antes de llamar aquí si detecta intención
        // En este caso, es una selección explícita de botón.
        return;
    }

    // Si no reconocemos la acción, volvemos al menú
    return sendMainMenu(waId, flow);
}

/**
 * Envía el menú principal definido en el flow
 */
async function sendMainMenu(waId, flow) {
    if (!flow.mainMenu) {
        logger.warn("flow.missing_main_menu", { flowId: flow.id });
        return sendText(waId, "Hola! (Menú no configurado)");
    }

    const { body, button, sections } = flow.mainMenu;

    // Reemplazar variables básicas
    const processedBody = body.replace("{{brand_name}}", "nuestro negocio"); // TODO: get from tenant config

    // Si tiene secciones, enviamos lista o botones
    if (sections && sections.length > 0) {
        // Si hay POCAS opciones (<= 3) y 1 sección, usar botones
        // Si hay MÁS, usar lista.
        // Por simplicidad, usemos el método sendInteractive que ya abstrae o hace lista.

        // Convertir formato de flow a formato esperado por sendInteractive
        // sendInteractive espera: (waId, bodyText, sections, title)
        // flow.sections tiene la estructura correcta: [{title, rows: [{id, title, description}]}]

        try {
            await sendInteractive(waId, processedBody, sections, button || "Ver menú");
        } catch (err) {
            logger.error("flow.send_menu_failed", { error: err.message });
            await sendText(waId, processedBody); // Fallback
        }
    } else {
        // Solo texto
        await sendText(waId, processedBody);
    }
}

module.exports = {
    executeDynamicFlow,
    executeDynamicInteractive
};
