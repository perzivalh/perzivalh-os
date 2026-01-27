/**
 * Rutas públicas - privacy, terms, data-deletion, health
 */
const express = require("express");
const router = express.Router();

const { PRIVACY_HTML, TERMS_HTML, DATA_DELETION_HTML } = require("../utils/htmlTemplates");

// Política de privacidad
router.get("/privacy", (req, res) => {
    res.type("html").send(PRIVACY_HTML);
});

// Términos y condiciones
router.get("/terms", (req, res) => {
    res.type("html").send(TERMS_HTML);
});

// Instrucciones de eliminación de datos
router.get("/data-deletion", (req, res) => {
    res.type("html").send(DATA_DELETION_HTML);
});

// Health check
router.get("/health", (req, res) => {
    res.send("ok");
});

module.exports = router;
