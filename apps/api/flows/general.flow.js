/**
 * Flow: Bienvenida General
 * Flujo básico de bienvenida y handoff
 * Ideal para clientes nuevos que aún no tienen flujo personalizado
 */
module.exports = {
    id: "flow_general",
    name: "Bienvenida General",
    description: "Saludo básico + transferencia a operador. Para clientes sin bot personalizado.",
    version: "1.0.0",
    icon: "👋",
    category: "general",

    // Estados
    states: {
        MAIN_MENU: "MAIN_MENU",
    },

    // Acciones
    actions: {
        HANDOFF: "HANDOFF",
        MAIN_MENU: "MAIN_MENU",
    },

    // Menú principal simple
    mainMenu: {
        body: "👋 ¡Hola! Bienvenido a {{brand_name}}.\n\n¿En qué podemos ayudarte?",
        button: "Ver opciones",
        sections: [
            {
                title: "Opciones",
                rows: [
                    { id: "HANDOFF", title: "💬 Hablar con alguien", description: "Te conectamos con un asesor" },
                ],
            },
        ],
    },

    config: {
        requiresOdoo: false,
        autoHandoff: true,
    },

    useLegacyHandler: false,
};
