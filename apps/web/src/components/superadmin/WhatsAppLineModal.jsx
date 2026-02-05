import React, { useState, useEffect } from "react";
import { XIcon, LoaderIcon, EyeIcon, EyeOffIcon } from "./icons";

const EMPTY_CHANNEL = {
    display_name: "",
    phone_number_id: "",
    waba_id: "",
    verify_token: "",
    wa_token: "",
    app_secret: "",
    is_active: true,
    is_default: false,
};

export function WhatsAppLineModal({ isOpen, onClose, initialData, onSave, tenantId }) {
    const [form, setForm] = useState(EMPTY_CHANNEL);
    const [showToken, setShowToken] = useState(false);
    const [showSecret, setShowSecret] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen) {
            setForm(initialData || { ...EMPTY_CHANNEL });
            setError(null);
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // Basic validation
        if (!form.phone_number_id || !form.verify_token || (!initialData && !form.wa_token)) {
            setError("Los campos ID de Teléfono, Verify Token y Access Token son obligatorios.");
            setLoading(false);
            return;
        }

        try {
            await onSave({ ...form, tenant_id: tenantId });
            onClose();
        } catch (err) {
            console.error("Error saving channel:", err);
            setError(err.message || "Error al guardar la línea.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="sa-modal-overlay" onClick={onClose}>
            <div className="sa-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="sa-modal-header">
                    <div className="sa-modal-title">
                        {initialData ? "Editar Línea WhatsApp" : "Nueva Línea WhatsApp"}
                    </div>
                    <button className="sa-modal-close" onClick={onClose}>
                        <XIcon width={24} height={24} />
                    </button>
                </div>

                <div className="sa-modal-body">
                    {error && (
                        <div className="sa-alert" style={{ marginBottom: "1rem" }}>
                            {error}
                        </div>
                    )}

                    <div className="sa-form-grid">
                        <div className="sa-field">
                            <label>Nombre para mostrar (Opcional)</label>
                            <input
                                value={form.display_name || ""}
                                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                                placeholder="Ej: Ventas Principal"
                            />
                        </div>

                        <div className="sa-field">
                            <label>Phone Number ID *</label>
                            <input
                                value={form.phone_number_id || ""}
                                onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })}
                                placeholder="Identificador del número de teléfono"
                            />
                        </div>

                        <div className="sa-field">
                            <label>WABA ID (WhatsApp Business Account ID)</label>
                            <input
                                value={form.waba_id || ""}
                                onChange={(e) => setForm({ ...form, waba_id: e.target.value })}
                                placeholder="Identificador de la cuenta de WhatsApp Business"
                            />
                        </div>

                        <div className="sa-field">
                            <label>Verify Token (Webhook) *</label>
                            <input
                                value={form.verify_token || ""}
                                onChange={(e) => setForm({ ...form, verify_token: e.target.value })}
                                placeholder="Token de verificación webhook"
                            />
                        </div>

                        <div className="sa-field" style={{ gridColumn: "1 / -1" }}>
                            <label>Permanent Access Token *</label>
                            <div style={{ position: "relative" }}>
                                <input
                                    type={showToken ? "text" : "password"}
                                    value={form.wa_token || ""}
                                    onChange={(e) => setForm({ ...form, wa_token: e.target.value })}
                                    placeholder={initialData ? "(Dejar vacío para no cambiar)" : "Token de acceso permanente"}
                                    style={{ width: "100%", paddingRight: "40px" }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowToken(!showToken)}
                                    style={{
                                        position: "absolute",
                                        right: "10px",
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        background: "none",
                                        border: "none",
                                        color: "rgba(255,255,255,0.5)",
                                        cursor: "pointer",
                                    }}
                                >
                                    {showToken ? <EyeOffIcon width={18} height={18} /> : <EyeIcon width={18} height={18} />}
                                </button>
                            </div>
                        </div>

                        <div className="sa-field" style={{ gridColumn: "1 / -1" }}>
                            <label>App Secret (Opcional)</label>
                            <div style={{ position: "relative" }}>
                                <input
                                    type={showSecret ? "text" : "password"}
                                    value={form.app_secret || ""}
                                    onChange={(e) => setForm({ ...form, app_secret: e.target.value })}
                                    placeholder={initialData ? "(Dejar vacío para no cambiar)" : "App Secret de Meta"}
                                    style={{ width: "100%", paddingRight: "40px" }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowSecret(!showSecret)}
                                    style={{
                                        position: "absolute",
                                        right: "10px",
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        background: "none",
                                        border: "none",
                                        color: "rgba(255,255,255,0.5)",
                                        cursor: "pointer",
                                    }}
                                >
                                    {showSecret ? <EyeOffIcon width={18} height={18} /> : <EyeIcon width={18} height={18} />}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: "1.5rem", display: "flex", gap: "2rem" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", color: "#e5e7eb", fontSize: "0.8rem" }}>
                            <input
                                type="checkbox"
                                checked={Boolean(form.is_active)}
                                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                                style={{ width: "16px", height: "16px" }}
                            />
                            Línea Activa
                        </label>

                        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", color: "#e5e7eb", fontSize: "0.8rem" }}>
                            <input
                                type="checkbox"
                                checked={Boolean(form.is_default)}
                                onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                                style={{ width: "16px", height: "16px" }}
                            />
                            Línea Principal (Por Defecto)
                        </label>
                    </div>
                </div>

                <div className="sa-modal-footer">
                    <button className="sa-btn ghost" onClick={onClose} disabled={loading}>
                        Cancelar
                    </button>
                    <button className="sa-btn primary" onClick={handleSubmit} disabled={loading}>
                        {loading ? (
                            <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <LoaderIcon width={16} height={16} className="animate-spin" /> Guardando...
                            </span>
                        ) : (
                            "Guardar Línea"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}


