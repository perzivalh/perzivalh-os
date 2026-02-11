/**
 * metaClient.js — Servicio para interactuar con la Graph API de Meta
 * 
 * Maneja el flujo de Embedded Signup para WhatsApp Coexistence.
 * Usa las credenciales GLOBALES del SaaS (WHATSAPP_APP_ID / WHATSAPP_APP_SECRET),
 * no credenciales por tenant.
 */
const axios = require("axios");
const logger = require("../lib/logger");

const GRAPH_API_VERSION = "v22.0";
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const metaClient = {
    /**
     * Intercambia el código de autorización de Embedded Signup por un User Access Token.
     * Este token dura ~60 días.
     * 
     * @param {string} code - Código de OAuth recibido del popup de Facebook Login
     * @returns {Promise<string>} - User Access Token de larga duración
     */
    async exchangeCodeForToken(code) {
        const { WHATSAPP_APP_ID, WHATSAPP_APP_SECRET } = require("../config");

        if (!WHATSAPP_APP_ID || !WHATSAPP_APP_SECRET) {
            throw new Error("Faltan WHATSAPP_APP_ID o WHATSAPP_APP_SECRET en variables de entorno del servidor");
        }

        try {
            const response = await axios.get(`${GRAPH_URL}/oauth/access_token`, {
                params: {
                    client_id: WHATSAPP_APP_ID,
                    client_secret: WHATSAPP_APP_SECRET,
                    code: code,
                }
            });

            if (!response.data?.access_token) {
                throw new Error("Meta no devolvió access_token");
            }

            return response.data.access_token;
        } catch (error) {
            logger.error("metaClient.exchangeCodeForToken", {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message,
            });

            const metaError = error.response?.data?.error?.message;
            throw new Error(metaError || "Error intercambiando código OAuth con Meta");
        }
    },

    /**
     * Obtiene las WABAs (WhatsApp Business Accounts) compartidas con nuestra App
     * a través del token del usuario (obtenido del Embedded Signup).
     * 
     * En Embedded Signup, el endpoint correcto es:
     * GET /debug_token → inspeccionar scopes
     * GET /{business_id}/owned_whatsapp_business_accounts 
     * 
     * Pero la forma más directa para Embedded Signup es usar:
     * GET /me/businesses → listar negocios → obtener WABAs de cada uno.
     * 
     * Sin embargo, la manera MÁS práctica cuando el frontend pasa waba_id/phone_id:
     * simplemente validar que existen con el token.
     * 
     * @param {string} token - User Access Token
     * @returns {Promise<Array>} - Lista de WABAs [{id, name}]
     */
    async getSharedWabas(token) {
        try {
            // Listar negocios del usuario y sus WABAs
            const response = await axios.get(`${GRAPH_URL}/me/businesses`, {
                params: {
                    access_token: token,
                    fields: "id,name",
                    limit: 50,
                }
            });

            const businesses = response.data?.data || [];
            const wabas = [];

            for (const biz of businesses) {
                try {
                    const wabaResp = await axios.get(`${GRAPH_URL}/${biz.id}/owned_whatsapp_business_accounts`, {
                        params: {
                            access_token: token,
                            fields: "id,name,currency,timezone_id,message_template_namespace",
                        }
                    });
                    const bizWabas = wabaResp.data?.data || [];
                    bizWabas.forEach(w => wabas.push({ ...w, business_id: biz.id, business_name: biz.name }));
                } catch (bizErr) {
                    // Puede no tener WABAs, no es error fatal
                    logger.warn("metaClient.getSharedWabas.biz_skip", { business_id: biz.id, error: bizErr.message });
                }
            }

            return wabas;
        } catch (error) {
            logger.error("metaClient.getSharedWabas", {
                message: error.response?.data || error.message,
            });
            throw new Error("Error obteniendo cuentas WhatsApp Business");
        }
    },

    /**
     * Obtiene los números de teléfono de una WABA específica
     * 
     * @param {string} wabaId - WhatsApp Business Account ID
     * @param {string} token - User Access Token
     * @returns {Promise<Array>} - Lista de números [{id, display_phone_number, verified_name, ...}]
     */
    async getPhoneNumbers(wabaId, token) {
        try {
            const response = await axios.get(`${GRAPH_URL}/${wabaId}/phone_numbers`, {
                params: {
                    access_token: token,
                    fields: "id,display_phone_number,verified_name,code_verification_status,quality_rating,name_status",
                }
            });
            return response.data?.data || [];
        } catch (error) {
            logger.error("metaClient.getPhoneNumbers", {
                wabaId,
                message: error.response?.data || error.message,
            });
            throw new Error("Error obteniendo números de teléfono de la WABA");
        }
    },

    /**
     * Suscribe nuestra App a los Webhooks de una WABA.
     * Esto es lo que habilita que los mensajes lleguen a nuestro webhook.
     * 
     * IMPORTANTE: Esto NO es lo mismo que /register. 
     * /register (2FA) → reclama el número para Cloud API exclusivamente.
     * /subscribed_apps → solo suscribe a recibir eventos.
     * 
     * @param {string} wabaId - WhatsApp Business Account ID
     * @param {string} token - User Access Token
     * @returns {Promise<boolean>} - true si la suscripción fue exitosa
     */
    async subscribeWabaToApp(wabaId, token) {
        try {
            const response = await axios.post(
                `${GRAPH_URL}/${wabaId}/subscribed_apps`,
                {},
                { params: { access_token: token } }
            );
            return response.data?.success === true;
        } catch (error) {
            logger.error("metaClient.subscribeWabaToApp", {
                wabaId,
                message: error.response?.data || error.message,
            });
            throw new Error("Error suscribiendo a webhooks de la WABA");
        }
    },

    /**
     * Refresca un User Access Token antes de que expire (60 días).
     * Devuelve un nuevo token con vida extendida.
     * 
     * Se usa con: grant_type=fb_exchange_token
     * 
     * @param {string} currentToken - Token actual (válido, no expirado)
     * @returns {Promise<string>} - Nuevo token de larga duración
     */
    async refreshUserToken(currentToken) {
        const { WHATSAPP_APP_ID, WHATSAPP_APP_SECRET } = require("../config");

        try {
            const response = await axios.get(`${GRAPH_URL}/oauth/access_token`, {
                params: {
                    grant_type: "fb_exchange_token",
                    client_id: WHATSAPP_APP_ID,
                    client_secret: WHATSAPP_APP_SECRET,
                    fb_exchange_token: currentToken,
                }
            });

            if (!response.data?.access_token) {
                throw new Error("Meta no devolvió nuevo access_token al refrescar");
            }

            return response.data.access_token;
        } catch (error) {
            logger.error("metaClient.refreshUserToken", {
                message: error.response?.data || error.message,
            });
            throw new Error("Error refrescando token con Meta");
        }
    },
};

module.exports = metaClient;
