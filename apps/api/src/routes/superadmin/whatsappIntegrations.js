/**
 * Rutas de integración de WhatsApp (Embedded Signup / Coexistence)
 * 
 * Se montan desde routes/superadmin/index.js
 * 
 * Endpoints:
 *  GET  /integrations/whatsapp/config   → Devuelve appId + configId (sin secretos)
 *  POST /integrations/whatsapp/exchange → Canjea code OAuth, obtiene WABA/Phone, guarda Channel
 */
const express = require("express");
const router = express.Router();

const { requireAuth } = require("../../middleware/auth");
const logger = require("../../lib/logger");
const { getControlClient } = require("../../control/controlClient");
const { encryptString } = require("../../core/crypto");
const { clearChannelCache } = require("../../tenancy/tenantResolver");

// Reutilizamos requireSuperAdmin del index principal
function requireSuperAdmin(req, res, next) {
    if (!req.user || req.user.role !== "superadmin") {
        return res.status(403).json({ error: "forbidden" });
    }
    return next();
}

// ─── GET /integrations/whatsapp/config ────────────────────────────
// Devuelve appId y configId al frontend para lanzar el popup.
// NO expone secretos (app_secret queda en backend).
router.get("/integrations/whatsapp/config", requireAuth, requireSuperAdmin, (req, res) => {
    const { WHATSAPP_APP_ID, WHATSAPP_CONFIG_ID } = require("../../config");

    if (!WHATSAPP_APP_ID || !WHATSAPP_CONFIG_ID) {
        return res.status(500).json({
            error: "whatsapp_not_configured",
            message: "Faltan WHATSAPP_APP_ID o WHATSAPP_CONFIG_ID en las variables de entorno del servidor.",
        });
    }

    return res.json({
        app_id: WHATSAPP_APP_ID,
        config_id: WHATSAPP_CONFIG_ID,
    });
});

// ─── POST /integrations/whatsapp/exchange ─────────────────────────
// Recibe el 'code' del popup de Facebook Login (Embedded Signup).
// Canjea por token de 60 días, obtiene WABA + números, suscribe webhooks, guarda Channel.
//
// ███████████████████████████████████████████████████████████████
// █ CRÍTICO: NO llama a /register (eso mata la WhatsApp Business App) █
// ███████████████████████████████████████████████████████████████
router.post("/integrations/whatsapp/exchange", requireAuth, requireSuperAdmin, async (req, res) => {
    const { code, tenant_id, waba_id: inputWabaId, phone_number_id: inputPhoneId } = req.body;

    if (!code || !tenant_id) {
        return res.status(400).json({
            error: "missing_fields",
            message: "Se requieren code y tenant_id.",
        });
    }

    const { VERIFY_TOKEN } = require("../../config");
    const metaClient = require("../../services/metaClient");
    const control = getControlClient();

    try {
        // 1. Verificar que el tenant existe
        const tenant = await control.tenant.findUnique({ where: { id: tenant_id } });
        if (!tenant) {
            return res.status(404).json({ error: "tenant_not_found" });
        }

        // 2. Canjear código OAuth → User Access Token (60 días)
        const userToken = await metaClient.exchangeCodeForToken(code);

        let targetWabaId = inputWabaId || null;
        let targetPhoneId = inputPhoneId || null;
        let phoneNumberDisplay = "";

        // 3. Si el frontend no envió WABA ID, buscar las WABAs del token
        if (!targetWabaId) {
            const wabas = await metaClient.getSharedWabas(userToken);
            if (!wabas || wabas.length === 0) {
                return res.status(400).json({
                    error: "no_waba_found",
                    message: "No se encontraron cuentas WhatsApp Business asociadas. Verificá que seleccionaste un negocio con WhatsApp configurado.",
                });
            }
            targetWabaId = wabas[0].id;
        }

        // 4. Obtener números de teléfono de la WABA
        const phones = await metaClient.getPhoneNumbers(targetWabaId, userToken);

        if (!phones || phones.length === 0) {
            return res.status(400).json({
                error: "no_phone_numbers",
                message: "La cuenta WABA no tiene números de teléfono registrados.",
            });
        }

        // Seleccionar número (el que envió el frontend, o el primero)
        let selectedPhone = null;
        if (targetPhoneId) {
            selectedPhone = phones.find(p => p.id === targetPhoneId);
        }
        if (!selectedPhone) {
            selectedPhone = phones[0];
            targetPhoneId = selectedPhone.id;
        }

        phoneNumberDisplay = selectedPhone.display_phone_number || selectedPhone.verified_name || "WhatsApp";

        // 5. Suscribir WABA a webhooks de nuestra App
        //    Esto habilita recibir mensajes. NO es /register.
        await metaClient.subscribeWabaToApp(targetWabaId, userToken);

        // 6. Crear o actualizar Channel en Control DB
        const existingChannel = await control.channel.findUnique({
            where: { phone_number_id: targetPhoneId },
        });

        const channelPayload = {
            tenant_id,
            provider: "whatsapp",
            phone_number_id: targetPhoneId,
            display_name: phoneNumberDisplay,
            waba_id: targetWabaId,
            verify_token: VERIFY_TOKEN,
            wa_token_encrypted: encryptString(userToken),
            // Null = usa WHATSAPP_APP_SECRET global para verificar webhooks
            // (la App es nuestra, no del cliente)
            app_secret_encrypted: null,
            is_active: true,
            is_default: false,
        };

        let savedChannel;
        if (existingChannel) {
            savedChannel = await control.channel.update({
                where: { id: existingChannel.id },
                data: channelPayload,
            });
        } else {
            savedChannel = await control.channel.create({
                data: channelPayload,
            });
        }

        // 7. Limpiar cache de resolución de canal
        clearChannelCache(targetPhoneId);

        // 8. Audit log
        await control.auditLogControl.create({
            data: {
                tenant_id,
                user_id: req.user?.id,
                action: "whatsapp_embedded_signup",
                data_json: {
                    channel_id: savedChannel.id,
                    waba_id: targetWabaId,
                    phone_number_id: targetPhoneId,
                    display_name: phoneNumberDisplay,
                },
            },
        });

        return res.json({
            success: true,
            channel: {
                id: savedChannel.id,
                tenant_id: savedChannel.tenant_id,
                phone_number_id: savedChannel.phone_number_id,
                display_name: savedChannel.display_name,
                waba_id: savedChannel.waba_id,
                is_active: savedChannel.is_active,
            },
        });

    } catch (error) {
        logger.error("whatsapp.exchange_failed", {
            error: error.message,
            tenant_id,
        });
        return res.status(500).json({
            error: "exchange_failed",
            message: error.message || "Error procesando la conexión de WhatsApp.",
        });
    }
});

module.exports = router;
