/**
 * Flow: Podopie Clinica
 * Flujo para clínica de podología con integración Odoo
 * 
 * Este es el flow original de Podopie migrado al nuevo formato
 */
module.exports = {
    id: "flow_podopie",
    name: "Podopie Clínica",
    description: "Flujo completo para clínica de podología: servicios, ubicaciones, pacientes con integración Odoo",
    version: "1.0.0",
    icon: "🦶",
    category: "salud",

    // Estados del bot
    states: {
        MAIN_MENU: "MAIN_MENU",
        ASK_CI: "ASK_CI",
        PATIENT_MENU: "PATIENT_MENU",
    },

    // Acciones disponibles
    actions: {
        INFO_PRICES: "INFO_PRICES",
        INFO_LOCATION: "INFO_LOCATION",
        INFO_HOURS: "INFO_HOURS",
        PATIENT_ENTRY: "PATIENT_ENTRY",
        HANDOFF: "HANDOFF",
        SERVICE_BRANCHES: "SERVICE_BRANCHES",
        SERVICE_MENU: "SERVICE_MENU",
        PATIENT_PAYMENTS: "PATIENT_PAYMENTS",
        PATIENT_POS_LAST: "PATIENT_POS_LAST",
        PATIENT_MY_DATA: "PATIENT_MY_DATA",
        MAIN_MENU: "MAIN_MENU",
    },

    // Config de media
    media: {
        logo: { type: "image", source: "branding.logo_url" },
    },

    // Menú principal
    mainMenu: {
        body: "👋 Bienvenido a {{brand_name}}\nElige una opción:",
        button: "Ver opciones",
        sections: [
            {
                title: "Opciones",
                rows: [
                    { id: "INFO_PRICES", title: "💬 Precios/servicios", description: "Consultar precios/servicios" },
                    { id: "INFO_LOCATION", title: "📍 Ubicación", description: "Ubicación y sucursales" },
                    { id: "INFO_HOURS", title: "⏰ Horarios", description: "Horarios de atención" },
                    { id: "PATIENT_ENTRY", title: "👤 Soy paciente", description: "Ver pagos / historial" },
                    { id: "HANDOFF", title: "🧑‍💼 Recepción", description: "Hablar con recepción" },
                ],
            },
        ],
    },

    // Menú de paciente
    patientMenu: {
        header: "Paciente",
        body: "Selecciona una opción:",
        button: "Ver opciones",
        sections: [
            {
                title: "Mi cuenta",
                rows: [
                    { id: "PATIENT_PAYMENTS", title: "Pagos pendientes" },
                    { id: "PATIENT_POS_LAST", title: "Últimas compras" },
                    { id: "PATIENT_MY_DATA", title: "Mis datos" },
                ],
            },
            {
                title: "Navegación",
                rows: [
                    { id: "MAIN_MENU", title: "⬅ Menú" },
                ],
            },
        ],
    },

    // Configuración específica del flow
    config: {
        requiresOdoo: true,
        pricesFallback: "Para precios y servicios, contanos qué tratamiento te interesa y te respondemos a la brevedad.",
        servicesBody: "Servicios destacados:",
        branchListBody: "Selecciona una sucursal:",
        branchHoursBody: "Selecciona una sucursal para ver horarios:",
        maxListTitle: 24,
    },

    // Indica que usa el handler legacy de flows.js
    // En el futuro se migrará toda la lógica aquí
    useLegacyHandler: true,
};
