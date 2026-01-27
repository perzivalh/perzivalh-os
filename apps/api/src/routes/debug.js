/**
 * Rutas de debug
 */
const express = require("express");
const router = express.Router();

const sessionStore = require("../sessionStore");

// Estado del último webhook (para debugging)
let lastWebhook = null;

function setLastWebhook(data) {
    lastWebhook = data;
}

function getLastWebhook() {
    return lastWebhook;
}

// GET /debug/last-webhook
router.get("/last-webhook", (req, res) => {
    return res.json(lastWebhook || { receivedAt: null, body: null });
});

// GET /debug/session/:wa
router.get("/session/:wa", async (req, res) => {
    const waId = req.params.wa;
    const phoneNumberId = req.query.phone_number_id || null;
    const session = await sessionStore.getSession(waId, phoneNumberId);
    return res.json({
        wa_id: waId,
        phone_number_id: phoneNumberId,
        session,
    });
});

module.exports = router;
module.exports.setLastWebhook = setLastWebhook;
module.exports.getLastWebhook = getLastWebhook;
