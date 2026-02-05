import React, { useState, useEffect, useMemo } from "react";
import "../styles/template-editor.css";

const CATEGORIES = [
    { value: "UTILITY", label: "Utility" },
    { value: "MARKETING", label: "Marketing" },
    { value: "AUTHENTICATION", label: "Authentication" },
];

const LANGUAGES = [
    { value: "es", label: "Español (ES)" },
    { value: "en_US", label: "English (US)" },
    { value: "pt_BR", label: "Português (BR)" },
];

const ODOO_FIELDS = [
    { value: "patient_id.name", label: "Nombre del Paciente", group: "Paciente" },
    { value: "patient_id.phone", label: "Teléfono", group: "Paciente" },
    { value: "patient_id.email", label: "Email", group: "Paciente" },
    { value: "appointment.date", label: "Fecha de Cita", group: "Cita" },
    { value: "appointment.time", label: "Hora de Cita", group: "Cita" },
    { value: "invoice.amount", label: "Monto Pendiente", group: "Pagos" },
    { value: "static", label: "Valor Estático", group: "Otro" },
];

function TemplateEditorView({
    template,
    onSave,
    onSubmitToMeta,
    onDiscard,
    odooFields,
    brandName = "",
}) {
    const brandLabel = (brandName || "PODOPIE").trim();
    const brandInitial = brandLabel.charAt(0).toUpperCase() || "P";
    const [formData, setFormData] = useState({
        name: "",
        category: "UTILITY",
        language: "es",
        body_text: "",
        header_type: "none",
        header_content: "",
        footer_text: "",
        buttons: [],
    });

    const [variableMappings, setVariableMappings] = useState([]);
    const [activeTab, setActiveTab] = useState("variables");
    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (template) {
            setFormData({
                name: template.name || "",
                category: template.category || "UTILITY",
                language: template.language || "es",
                body_text: template.body_text || "",
                header_type: template.header_type || "none",
                header_content: template.header_content || "",
                footer_text: template.footer_text || "",
                buttons: template.buttons_json || [],
            });
            setVariableMappings(template.variable_mappings || []);
        }
    }, [template]);

    // Extract variables from body text
    const detectedVariables = useMemo(() => {
        const matches = formData.body_text.match(/\{\{(\d+)\}\}/g) || [];
        return [...new Set(matches)].map((m) => parseInt(m.replace(/[{}]/g, ""), 10));
    }, [formData.body_text]);

    const handleInputChange = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const insertVariable = (index) => {
        const textarea = document.getElementById("body-text-input");
        if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = formData.body_text;
            const newText = text.slice(0, start) + `{{${index}}}` + text.slice(end);
            handleInputChange("body_text", newText);
        }
    };

    const addButton = () => {
        if (formData.buttons.length >= 3) return;
        setFormData((prev) => ({
            ...prev,
            buttons: [...prev.buttons, { type: "QUICK_REPLY", text: "" }],
        }));
    };

    const updateButton = (index, field, value) => {
        setFormData((prev) => ({
            ...prev,
            buttons: prev.buttons.map((btn, i) =>
                i === index ? { ...btn, [field]: value } : btn
            ),
        }));
    };

    const removeButton = (index) => {
        setFormData((prev) => ({
            ...prev,
            buttons: prev.buttons.filter((_, i) => i !== index),
        }));
    };

    const updateVariableMapping = (varIndex, field, value) => {
        setVariableMappings((prev) => {
            const existing = prev.find((m) => m.var_index === varIndex);
            if (existing) {
                return prev.map((m) =>
                    m.var_index === varIndex ? { ...m, [field]: value } : m
                );
            }
            return [...prev, { var_index: varIndex, [field]: value, source_type: "odoo" }];
        });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave({ ...formData, variable_mappings: variableMappings });
        } finally {
            setSaving(false);
        }
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            await onSubmitToMeta();
        } finally {
            setSubmitting(false);
        }
    };

    // Build preview text with placeholders
    const previewText = useMemo(() => {
        let text = formData.body_text;
        variableMappings.forEach((mapping) => {
            const placeholder = mapping.display_name || `Variable ${mapping.var_index}`;
            text = text.replace(`{{${mapping.var_index}}}`, `{{${placeholder}}}`);
        });
        return text;
    }, [formData.body_text, variableMappings]);

    const isNewTemplate = !template?.id;
    const isDraft = !template || template.status === "DRAFT";

    return (
        <div className="template-editor">
            {/* Top Bar */}
            <div className="editor-topbar">
                <div className="breadcrumb">
                    <span className="breadcrumb-link" onClick={onDiscard}>
                        Templates
                    </span>
                    <span className="breadcrumb-separator">/</span>
                    <span>{isNewTemplate ? "New Meta Template" : template.name}</span>
                </div>
                <div className="topbar-actions">
                    <button className="btn-outline" onClick={onDiscard}>
                        ✕ Discard
                    </button>
                    <button
                        className="btn-secondary"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        💾 {saving ? "Guardando..." : "Save Draft"}
                    </button>
                    {isDraft && (
                        <button
                            className="btn-primary"
                            onClick={handleSubmit}
                            disabled={submitting || !formData.name || !formData.body_text}
                        >
                            {submitting ? "Enviando..." : "Submit to Meta"}
                        </button>
                    )}
                </div>
            </div>

            {/* Main Editor */}
            <div className="editor-main">
                {/* Left Panel - Settings & Body */}
                <div className="editor-left">
                    <h2>Create WhatsApp Template</h2>
                    <p className="subtitle">
                        Configure message logic and map Odoo CRM fields for automation.
                    </p>

                    <section className="editor-section">
                        <h3>
                            <span className="section-icon">⚙️</span> General Settings
                        </h3>
                        <div className="form-group">
                            <label>Template Name</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => handleInputChange("name", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                                placeholder="patient_appointment_reminder"
                                disabled={!isDraft}
                            />
                            <small>Only lowercase letters, numbers, and underscores</small>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Category</label>
                                <select
                                    value={formData.category}
                                    onChange={(e) => handleInputChange("category", e.target.value)}
                                    disabled={!isDraft}
                                >
                                    {CATEGORIES.map((cat) => (
                                        <option key={cat.value} value={cat.value}>
                                            {cat.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Language</label>
                                <select
                                    value={formData.language}
                                    onChange={(e) => handleInputChange("language", e.target.value)}
                                    disabled={!isDraft}
                                >
                                    {LANGUAGES.map((lang) => (
                                        <option key={lang.value} value={lang.value}>
                                            {lang.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </section>

                    <section className="editor-section">
                        <h3>
                            <span className="section-icon">💬</span> Message Body
                            <button
                                className="btn-link insert-var-btn"
                                onClick={() => insertVariable(detectedVariables.length + 1)}
                            >
                                + Insert Variable
                            </button>
                        </h3>
                        <textarea
                            id="body-text-input"
                            value={formData.body_text}
                            onChange={(e) => handleInputChange("body_text", e.target.value)}
                            placeholder={`Hola {{1}}, te recordamos tu cita en ${brandLabel} para el día {{2}} a las {{3}}. Por favor, confirma tu asistencia.`}
                            rows={6}
                            disabled={!isDraft}
                        />
                        <div className="char-count">
                            {formData.body_text.length} / 1024
                        </div>
                        <div className="text-toolbar">
                            <button className="toolbar-btn">B</button>
                            <button className="toolbar-btn">I</button>
                            <button className="toolbar-btn">😊</button>
                        </div>
                    </section>

                    {/* Buttons Section */}
                    <section className="editor-section">
                        <h3>
                            <span className="section-icon">🔘</span> Action Buttons
                            <button
                                className="btn-link"
                                onClick={addButton}
                                disabled={formData.buttons.length >= 3}
                            >
                                + Add Button
                            </button>
                        </h3>
                        {formData.buttons.map((btn, index) => (
                            <div key={index} className="button-row">
                                <select
                                    value={btn.type}
                                    onChange={(e) => updateButton(index, "type", e.target.value)}
                                >
                                    <option value="QUICK_REPLY">Quick Reply</option>
                                    <option value="URL">URL</option>
                                    <option value="PHONE_NUMBER">Phone</option>
                                </select>
                                <input
                                    type="text"
                                    value={btn.text || ""}
                                    onChange={(e) => updateButton(index, "text", e.target.value)}
                                    placeholder="Button text"
                                />
                                {btn.type === "URL" && (
                                    <input
                                        type="text"
                                        value={btn.url || ""}
                                        onChange={(e) => updateButton(index, "url", e.target.value)}
                                        placeholder="https://..."
                                    />
                                )}
                                <button className="btn-remove" onClick={() => removeButton(index)}>
                                    ✕
                                </button>
                            </div>
                        ))}
                    </section>
                </div>

                {/* Center - Phone Preview */}
                <div className="editor-center">
                    <div className="phone-preview">
                        <div className="phone-header">
                            <span className="back-arrow">←</span>
                            <div className="contact-info">
                                <div className="avatar">{brandInitial}</div>
                                <div>
                                    <div className="contact-name">{brandLabel}</div>
                                    <div className="contact-status">Online</div>
                                </div>
                            </div>
                        </div>
                        <div className="phone-chat">
                            <div className="date-divider">TODAY</div>
                            <div className="message-bubble">
                                <p>{previewText || "Your message preview will appear here..."}</p>
                                <span className="message-time">10:42 AM</span>
                            </div>
                            {formData.buttons.length > 0 && (
                                <div className="preview-buttons">
                                    {formData.buttons.map((btn, i) => (
                                        <button key={i} className="preview-button">
                                            {btn.text || `Button ${i + 1}`}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="phone-input">
                            <input type="text" placeholder="Type a message ..." disabled />
                            <button className="send-btn">📤</button>
                        </div>
                        <div className="preview-label">● High-fidelity dynamic preview</div>
                    </div>
                </div>

                {/* Right Panel - Variables & Buttons */}
                <div className="editor-right">
                    <div className="tabs">
                        <button
                            className={activeTab === "variables" ? "active" : ""}
                            onClick={() => setActiveTab("variables")}
                        >
                            VARIABLES
                        </button>
                        <button
                            className={activeTab === "buttons" ? "active" : ""}
                            onClick={() => setActiveTab("buttons")}
                        >
                            BUTTONS
                        </button>
                    </div>

                    {activeTab === "variables" && (
                        <div className="variables-panel">
                            <h4>ODOO FIELD MAPPING</h4>
                            {detectedVariables.length === 0 ? (
                                <p className="no-vars">
                                    No variables detected. Insert {"{{1}}"} in your message body.
                                </p>
                            ) : (
                                detectedVariables.map((varIndex) => {
                                    const mapping = variableMappings.find(
                                        (m) => m.var_index === varIndex
                                    );
                                    return (
                                        <div key={varIndex} className="variable-mapping">
                                            <div className="var-badge">
                                                {`{{${varIndex}}} Variable`}
                                                {mapping?.source_path && (
                                                    <span className="linked-badge">✓ Linked</span>
                                                )}
                                            </div>
                                            <input
                                                type="text"
                                                placeholder="Display name (e.g., Patient Name)"
                                                value={mapping?.display_name || ""}
                                                onChange={(e) =>
                                                    updateVariableMapping(varIndex, "display_name", e.target.value)
                                                }
                                            />
                                            <select
                                                value={mapping?.source_path || ""}
                                                onChange={(e) =>
                                                    updateVariableMapping(varIndex, "source_path", e.target.value)
                                                }
                                            >
                                                <option value="">Select Odoo Field...</option>
                                                {(odooFields || ODOO_FIELDS).map((field) => (
                                                    <option key={field.value} value={field.value}>
                                                        {field.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    );
                                })
                            )}
                            <div className="tip-box">
                                <span className="tip-icon">💡</span>
                                <p>
                                    Tip: Ensure your variables are correctly mapped to Odoo fields before
                                    submitting. Meta may reject templates with ambiguous placeholder usage.
                                </p>
                            </div>
                        </div>
                    )}

                    {activeTab === "buttons" && (
                        <div className="buttons-panel">
                            <h4>ACTION BUTTONS</h4>
                            {formData.buttons.length === 0 ? (
                                <p className="no-vars">No buttons added yet.</p>
                            ) : (
                                formData.buttons.map((btn, i) => (
                                    <div key={i} className="button-preview">
                                        <strong>{btn.text || `Button ${i + 1}`}</strong>
                                        <span className="button-type">{btn.type}</span>
                                    </div>
                                ))
                            )}
                            <button className="btn-add-button" onClick={addButton}>
                                + Add Button
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Status Bar */}
            <div className="editor-statusbar">
                <span className="status-item">🟢 SYSTEM ONLINE</span>
                <span className="status-item">✓ META API CONNECTED</span>
                <span className="status-item">
                    ID: {template?.meta_template_id || "HSM_XXXXXX_XX"}
                </span>
                <span className="status-item">
                    LAST MODIFIED: {template?.updated_at ? new Date(template.updated_at).toLocaleString() : "Just now"}
                </span>
            </div>
        </div>
    );
}

export default TemplateEditorView;
