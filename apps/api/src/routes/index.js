/**
 * Router principal - centraliza todas las rutas de la API
 */
const express = require("express");

// Importar routers
const publicRoutes = require("./public");
const authRoutes = require("./auth");
const webhookRoutes = require("./webhook");
const conversationsRoutes = require("./conversations");
const dashboardRoutes = require("./dashboard");
const adminRoutes = require("./admin");
const superadminRoutes = require("./superadmin");
const debugRoutes = require("./debug");

// New routes for Campaigns/Templates module - with error handling
let templatesRoutes, audiencesRoutes, contactsRoutes, campaignsRoutes;

try {
    templatesRoutes = require("./templates");
    console.log("[ROUTES] templates loaded OK");
} catch (e) {
    console.error("[ROUTES] templates FAILED:", e.message);
    templatesRoutes = express.Router();
}

try {
    audiencesRoutes = require("./audiences");
    console.log("[ROUTES] audiences loaded OK");
} catch (e) {
    console.error("[ROUTES] audiences FAILED:", e.message);
    audiencesRoutes = express.Router();
}

try {
    contactsRoutes = require("./contacts");
    console.log("[ROUTES] contacts loaded OK");
} catch (e) {
    console.error("[ROUTES] contacts FAILED:", e.message);
    contactsRoutes = express.Router();
}

try {
    campaignsRoutes = require("./campaigns");
    console.log("[ROUTES] campaigns loaded OK");
} catch (e) {
    console.error("[ROUTES] campaigns FAILED:", e.message);
    campaignsRoutes = express.Router();
}

/**
 * Configura todas las rutas en la aplicación Express
 * @param {express.Application} app - Aplicación Express
 */
function setupRoutes(app) {
    // Rutas públicas (sin autenticación)
    app.use("/", publicRoutes);

    // Webhook de WhatsApp
    app.use("/", webhookRoutes);

    // Rutas de debug
    app.use("/debug", debugRoutes);

    // Rutas de autenticación
    app.use("/api/auth", authRoutes);

    // Rutas de API que requieren autenticación
    app.use("/api", conversationsRoutes);
    app.use("/api", dashboardRoutes);

    // Campaigns and Templates API
    app.use("/api", templatesRoutes);
    app.use("/api", audiencesRoutes);
    app.use("/api", contactsRoutes);
    app.use("/api", campaignsRoutes);

    // Rutas de administración
    app.use("/api/admin", adminRoutes);

    // Rutas de superadmin
    app.use("/api/superadmin", superadminRoutes);
}

module.exports = { setupRoutes };
