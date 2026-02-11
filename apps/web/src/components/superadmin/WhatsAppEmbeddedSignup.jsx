import React, { useState, useEffect, useCallback } from "react";
import { apiGet, apiPost } from "../../api";

/**
 * WhatsAppEmbeddedSignup
 * 
 * Componente que maneja el flujo de Embedded Signup de Meta.
 * 
 * NO usa variables de entorno del frontend.
 * Obtiene appId y configId desde el backend via:
 *   GET /api/superadmin/integrations/whatsapp/config
 * 
 * Flujo:
 * 1. Click en botón → Carga FB SDK si no existe → FB.login con config_id
 * 2. Popup de Facebook se abre → Usuario selecciona negocio y número
 * 3. Se recibe 'code' del SDK → Se envía al backend
 * 4. Backend canjea code por token, suscribe WABA, guarda Channel
 */

const FB_SDK_VERSION = "v22.0";

export function WhatsAppEmbeddedSignup({ tenantId, onSuccess, onError }) {
    const [loading, setLoading] = useState(false);
    const [sdkLoaded, setSdkLoaded] = useState(false);
    const [waConfig, setWaConfig] = useState(null);
    const [configError, setConfigError] = useState(null);

    // Obtener config del backend al montar el componente
    useEffect(() => {
        async function fetchConfig() {
            try {
                const data = await apiGet("/api/superadmin/integrations/whatsapp/config");
                setWaConfig(data);
            } catch (err) {
                console.error("Error obteniendo config de WhatsApp:", err);
                setConfigError(err.message || "Error de configuración");
            }
        }
        fetchConfig();
    }, []);

    // Cargar Facebook SDK cuando tengamos el appId
    useEffect(() => {
        if (!waConfig?.app_id) return;
        if (window.FB) {
            setSdkLoaded(true);
            return;
        }

        window.fbAsyncInit = function () {
            window.FB.init({
                appId: waConfig.app_id,
                autoLogAppEvents: true,
                xfbml: true,
                version: FB_SDK_VERSION,
            });
            setSdkLoaded(true);
        };

        // Insertar script del SDK
        (function (d, s, id) {
            let js;
            const fjs = d.getElementsByTagName(s)[0];
            if (d.getElementById(id)) return;
            js = d.createElement(s);
            js.id = id;
            js.src = "https://connect.facebook.net/en_US/sdk.js";
            fjs.parentNode.insertBefore(js, fjs);
        })(document, "script", "facebook-jssdk");
    }, [waConfig?.app_id]);

    const handleLogin = useCallback(() => {
        if (!sdkLoaded || !window.FB || !waConfig) {
            console.error("Facebook SDK o configuración no disponible");
            return;
        }

        setLoading(true);

        window.FB.login(
            function (response) {
                if (response.authResponse) {
                    const code = response.authResponse.code;
                    exchangeCode(code);
                } else {
                    console.log("Usuario canceló o no autorizó completamente.");
                    setLoading(false);
                    if (onError) onError("Cancelado por el usuario");
                }
            },
            {
                config_id: waConfig.config_id,
                response_type: "code",
                override_default_response_type: true,
                extras: {
                    feature: "whatsapp_embedded_signup",
                    sessionInfoVersion: "2",
                },
            }
        );
    }, [sdkLoaded, waConfig, tenantId]);

    const exchangeCode = async (code) => {
        try {
            const response = await apiPost("/api/superadmin/integrations/whatsapp/exchange", {
                code,
                tenant_id: tenantId,
            });

            if (response.success) {
                if (onSuccess) onSuccess(response.channel);
            } else {
                if (onError) onError(response.error || "Error al conectar WhatsApp");
            }
        } catch (err) {
            console.error("Error en canje de código:", err);
            if (onError) onError(err.message || "Error de conexión con el servidor");
        } finally {
            setLoading(false);
        }
    };

    // Si no hay configuración de WhatsApp en el servidor, mostrar mensaje
    if (configError) {
        return (
            <button
                type="button"
                className="sa-btn ghost"
                disabled
                title={configError}
                style={{ opacity: 0.5 }}
            >
                ⚠️ WhatsApp no configurado
            </button>
        );
    }

    return (
        <button
            type="button"
            className="sa-btn primary"
            onClick={handleLogin}
            disabled={!sdkLoaded || loading || !waConfig}
            style={{
                backgroundColor: "#25D366",
                borderColor: "#25D366",
                color: "#fff",
                fontWeight: 600,
            }}
        >
            {loading
                ? "Conectando..."
                : !waConfig
                    ? "Cargando..."
                    : "Conectar WhatsApp Oficial"}
        </button>
    );
}
