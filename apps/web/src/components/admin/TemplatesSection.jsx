/**
 * TemplatesSection - Plantillas de Meta/WhatsApp (Updated with Grid UI)
 */
import React, { useState, useEffect } from "react";
import "../../styles/templates.css";
import "../../styles/template-editor.css";

const STATUS_COLORS = {
    DRAFT: { bg: "#e3e8ef", text: "#475569", label: "BORRADOR" },
    PENDING: { bg: "#fef3c7", text: "#d97706", label: "PENDIENTE" },
    APPROVED: { bg: "#d1fae5", text: "#059669", label: "APROBADA" },
    REJECTED: { bg: "#fee2e2", text: "#dc2626", label: "RECHAZADA" },
    PAUSED: { bg: "#fef3c7", text: "#d97706", label: "PAUSADA" },
    DISABLED: { bg: "#e5e7eb", text: "#6b7280", label: "DESHABILITADA" },
};

const CATEGORY_OPTIONS = [
    { value: "UTILITY", label: "Utility" },
    { value: "MARKETING", label: "Marketing" },
    { value: "AUTHENTICATION", label: "Authentication" },
];

const LANGUAGE_OPTIONS = [
    { value: "es", label: "Español (ES)" },
    { value: "en", label: "English (EN)" },
];

function TemplatesSection({
    templates = [],
    templateForm,
    setTemplateForm,
    handleTemplateSubmit,
    handleTemplateSubmitToMeta,
    handleSyncTemplates,
    onLoadTemplates,
}) {
    const [view, setView] = useState("list"); // 'list' | 'editor'
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [search, setSearch] = useState("");
    const [syncing, setSyncing] = useState(false);
    const [filterStatus, setFilterStatus] = useState("");
    const [submitting, setSubmitting] = useState(false);

    // New form state for editor
    const [editorForm, setEditorForm] = useState({
        name: "",
        category: "UTILITY",
        language: "es",
        body_text: "",
        header_type: "",
        header_content: "",
        footer_text: "",
        buttons: [],
    });

    // Variable mappings state
    const [variableMappings, setVariableMappings] = useState([]);

    useEffect(() => {
        if (onLoadTemplates) {
            onLoadTemplates();
        }
    }, []);

    const handleSync = async () => {
        setSyncing(true);
        try {
            await handleSyncTemplates();
        } finally {
            setSyncing(false);
        }
    };

    const handleCreateNew = () => {
        setEditingTemplate(null);
        setEditorForm({
            name: "",
            category: "UTILITY",
            language: "es",
            body_text: "",
            header_type: "",
            header_content: "",
            footer_text: "",
            buttons: [],
        });
        setVariableMappings([]);
        setView("editor");
    };

    const handleSelectTemplate = (template) => {
        setEditingTemplate(template);
        setEditorForm({
            name: template.name || "",
            category: template.category || "UTILITY",
            language: template.language || "es",
            body_text: template.body_text || template.body_preview || "",
            header_type: template.header_type || "",
            header_content: template.header_content || "",
            footer_text: template.footer_text || "",
            buttons: template.buttons_json || [],
        });
        setVariableMappings(template.variable_mappings || []);
        setView("editor");
    };

    const handleSaveTemplate = async (e) => {
        e.preventDefault();
        const formData = {
            ...editorForm,
            id: editingTemplate?.id,
            variable_mappings: variableMappings,
        };

        if (setTemplateForm) {
            setTemplateForm(formData);
        }
        if (handleTemplateSubmit) {
            const saved = await handleTemplateSubmit(null, formData);
            if (saved) {
                setEditingTemplate(saved);
            }
        }
    };

    const handleSubmitTemplate = async () => {
        if (!handleTemplateSubmitToMeta) {
            return;
        }
        setSubmitting(true);
        try {
            let targetId = editingTemplate?.id;
            if (!targetId) {
                const formData = {
                    ...editorForm,
                    variable_mappings: variableMappings,
                };
                const saved = await handleTemplateSubmit(null, formData);
                targetId = saved?.id;
                if (saved) {
                    setEditingTemplate(saved);
                }
            }
            if (targetId) {
                await handleTemplateSubmitToMeta(targetId);
                setView("list");
                setEditingTemplate(null);
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleDiscard = () => {
        setView("list");
        setEditingTemplate(null);
    };

    // Extract variables from body_text ({{1}}, {{2}}, etc.)
    const extractVariables = (text) => {
        const matches = text.match(/\{\{(\d+)\}\}/g) || [];
        return [...new Set(matches)].map((m) => parseInt(m.replace(/[{}]/g, "")));
    };

    const bodyVariables = extractVariables(editorForm.body_text);

    // Filter templates
    const filteredTemplates = templates.filter((t) => {
        const matchesSearch =
            !search ||
            t.name?.toLowerCase().includes(search.toLowerCase()) ||
            (t.body_text || t.body_preview || "").toLowerCase().includes(search.toLowerCase());
        const matchesStatus = !filterStatus || t.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    // Render list view
    if (view === "list") {
        return (
            <div className="templates-section">
                <div className="templates-header">
                    <div className="templates-title-row">
                        <h1>Plantillas de Meta</h1>
                        <span className="meta-connected-badge">
                            <span className="status-dot"></span>
                            CONECTADO A META API
                        </span>
                    </div>
                    <div className="templates-actions">
                        <div className="search-input-wrap">
                            <input
                                type="text"
                                placeholder="Buscar plantillas..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="status-filter-select"
                        >
                            <option value="">Todos</option>
                            <option value="APPROVED">Aprobadas</option>
                            <option value="PENDING">Pendientes</option>
                            <option value="REJECTED">Rechazadas</option>
                            <option value="DRAFT">Borradores</option>
                        </select>
                        <button
                            className="btn-sync"
                            onClick={handleSync}
                            disabled={syncing}
                        >
                            {syncing ? "⟳ Sincronizando..." : "⟳ Sincronizar"}
                        </button>
                        <button className="btn-create-template" onClick={handleCreateNew}>
                            <span>+</span> Crear Nueva Plantilla
                        </button>
                    </div>
                </div>

                <div className="templates-grid">
                    {filteredTemplates.map((template) => {
                        const status = STATUS_COLORS[template.status] || STATUS_COLORS.DRAFT;
                        return (
                            <div
                                key={template.id}
                                className="template-card"
                                onClick={() => handleSelectTemplate(template)}
                            >
                                <div className="template-card-head">
                                    <div className="template-category-icon">
                                        {template.category === "MARKETING" ? "📢" : template.category === "UTILITY" ? "🔧" : "🔐"}
                                    </div>
                                    <span
                                        className="template-status-badge"
                                        style={{ backgroundColor: status.bg, color: status.text }}
                                    >
                                        {status.label}
                                    </span>
                                </div>
                                <h3 className="template-card-name">{template.name}</h3>
                                <div className="template-card-meta">
                                    <span className="tag-category">{template.category}</span>
                                    <span className="tag-language">
                                        {template.language === "es" ? "ESPAÑOL (ES)" : template.language?.toUpperCase()}
                                    </span>
                                </div>
                                {(template.body_text || template.body_preview) && (
                                    <p className="template-card-preview">
                                        {(template.body_text || template.body_preview).slice(0, 80)}...
                                    </p>
                                )}
                                <div className="template-card-actions">
                                    <button className="btn-preview" onClick={(e) => {
                                        e.stopPropagation();
                                        handleSelectTemplate(template);
                                    }}>
                                        👁 Previsualizar
                                    </button>
                                    <button className="btn-more">⋯</button>
                                </div>
                            </div>
                        );
                    })}

                    {/* Create new card */}
                    <div className="template-card template-card-create" onClick={handleCreateNew}>
                        <div className="create-icon">+</div>
                        <h3>Crear nueva plantilla</h3>
                        <p>Empieza a diseñar tu flujo de WhatsApp</p>
                    </div>
                </div>

                {filteredTemplates.length === 0 && !search && (
                    <div className="templates-empty">
                        <p>No hay plantillas. Crea una nueva o sincroniza desde Meta.</p>
                    </div>
                )}
            </div>
        );
    }

    // Render editor view
    return (
        <div className="template-editor">
            <div className="editor-header">
                <div className="editor-breadcrumb">
                    <button className="btn-back" onClick={handleDiscard}>← Volver</button>
                    <span className="breadcrumb-sep">/</span>
                    <span>{editingTemplate ? "Editar Plantilla" : "Nueva Plantilla"}</span>
                </div>
                <div className="editor-actions">
                    <button className="btn-save-draft" onClick={handleSaveTemplate}>
                        💾 Guardar Borrador
                    </button>
                    {(editingTemplate?.status === "DRAFT" || editingTemplate?.status === "REJECTED" || !editingTemplate) && (
                        <button
                            className="btn-primary"
                            onClick={handleSubmitTemplate}
                            disabled={submitting || !editorForm.name || !editorForm.body_text}
                        >
                            {submitting ? "Enviando..." : "Enviar a Meta"}
                        </button>
                    )}
                    <button className="btn-discard" onClick={handleDiscard}>
                        🗑 Descartar
                    </button>
                </div>
            </div>

            <div className="editor-layout">
                {/* Left panel - Form */}
                <div className="editor-form-panel">
                    <div className="form-section">
                        <h3>⚙ General Settings</h3>
                        <label className="form-field">
                            <span>Template Name</span>
                            <input
                                type="text"
                                placeholder="patient_appointment_reminder"
                                value={editorForm.name}
                                onChange={(e) =>
                                    setEditorForm({
                                        ...editorForm,
                                        name: e.target.value
                                            .toLowerCase()
                                            .replace(/[^a-z0-9_]/g, "_"),
                                    })
                                }
                            />
                        </label>
                        <div className="form-row">
                            <label className="form-field">
                                <span>Category</span>
                                <select
                                    value={editorForm.category}
                                    onChange={(e) => setEditorForm({ ...editorForm, category: e.target.value })}
                                >
                                    {CATEGORY_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="form-field">
                                <span>Language</span>
                                <select
                                    value={editorForm.language}
                                    onChange={(e) => setEditorForm({ ...editorForm, language: e.target.value })}
                                >
                                    {LANGUAGE_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                    </div>

                    <div className="form-section">
                        <div className="form-section-header">
                            <h3>✏ Message Body</h3>
                            <button className="btn-insert-var" type="button" onClick={() => {
                                const nextVar = bodyVariables.length + 1;
                                setEditorForm({
                                    ...editorForm,
                                    body_text: editorForm.body_text + `{{${nextVar}}}`
                                });
                            }}>
                                + Insert Variable
                            </button>
                        </div>
                        <textarea
                            rows="6"
                            placeholder="Hola {{1}}, te recordamos tu cita en PODOPIE para el día {{2}} a las {{3}}. Por favor, confirma tu asistencia."
                            value={editorForm.body_text}
                            onChange={(e) => setEditorForm({ ...editorForm, body_text: e.target.value })}
                        />
                        <div className="char-count">{editorForm.body_text.length} / 1024</div>
                    </div>
                </div>

                {/* Center panel - Phone Preview */}
                <div className="editor-preview-panel">
                    <div className="phone-frame">
                        <div className="phone-header">
                            <span className="phone-back">←</span>
                            <div className="phone-contact">
                                <div className="phone-avatar">🏥</div>
                                <div className="phone-name">PODOPIE Clinic</div>
                            </div>
                            <div className="phone-icons">📹 📞</div>
                        </div>
                        <div className="phone-body">
                            <div className="phone-date-label">TODAY</div>
                            <div className="phone-message">
                                <div className="message-bubble">
                                    {editorForm.body_text || "Tu mensaje aparecerá aquí..."}
                                </div>
                                <div className="message-time">10:42 AM</div>
                            </div>
                            {editorForm.buttons && editorForm.buttons.length > 0 && (
                                <div className="phone-buttons">
                                    {editorForm.buttons.map((btn, i) => (
                                        <button key={i} className="phone-action-btn">
                                            {btn.text || `Button ${i + 1}`}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="preview-label">🔍 High-fidelity dynamic preview</div>
                </div>

                {/* Right panel - Variable Mappings */}
                <div className="editor-mapping-panel">
                    <div className="mapping-tabs">
                        <button className="tab active">VARIABLES</button>
                        <button className="tab">BUTTONS</button>
                    </div>
                    <div className="mapping-section">
                        <h4>ODOO FIELD MAPPING</h4>
                        {bodyVariables.length === 0 ? (
                            <p className="mapping-empty">Agrega variables {"{{1}}"}, {"{{2}}"}... en tu mensaje</p>
                        ) : (
                            bodyVariables.map((varNum) => {
                                const mapping = variableMappings.find((m) => m.var_index === varNum) || {};
                                return (
                                    <div key={varNum} className="mapping-item">
                                        <div className="mapping-var-badge">
                                            {`{{${varNum}}}`} Variable
                                        </div>
                                        <select
                                            value={mapping.source_path || ""}
                                            onChange={(e) => {
                                                const newMappings = variableMappings.filter((m) => m.var_index !== varNum);
                                                newMappings.push({
                                                    var_index: varNum,
                                                    source_type: "odoo",
                                                    source_path: e.target.value,
                                                });
                                                setVariableMappings(newMappings);
                                            }}
                                        >
                                            <option value="">Select Odoo Field...</option>
                                            <option value="partner_id.name">patient_id.name</option>
                                            <option value="start_date">start_date (Formatted)</option>
                                            <option value="start_time">start_time</option>
                                            <option value="partner_id.phone">patient_phone</option>
                                        </select>
                                        <span className={`mapping-status ${mapping.source_path ? "linked" : "needs"}`}>
                                            {mapping.source_path ? "✓ Linked" : "⚠ Needs mapping"}
                                        </span>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <div className="mapping-section">
                        <div className="mapping-section-header">
                            <h4>ACTION BUTTONS</h4>
                            <button className="btn-add-button" onClick={() => {
                                setEditorForm({
                                    ...editorForm,
                                    buttons: [...(editorForm.buttons || []), { type: "QUICK_REPLY", text: "" }]
                                });
                            }}>
                                + Add Button
                            </button>
                        </div>
                        {(editorForm.buttons || []).map((btn, i) => (
                            <div key={i} className="button-item">
                                <span className="button-icon">🔘</span>
                                <input
                                    type="text"
                                    placeholder="Button text"
                                    value={btn.text || ""}
                                    onChange={(e) => {
                                        const newButtons = [...editorForm.buttons];
                                        newButtons[i] = { ...newButtons[i], text: e.target.value };
                                        setEditorForm({ ...editorForm, buttons: newButtons });
                                    }}
                                />
                                <button className="btn-remove" onClick={() => {
                                    const newButtons = editorForm.buttons.filter((_, idx) => idx !== i);
                                    setEditorForm({ ...editorForm, buttons: newButtons });
                                }}>×</button>
                            </div>
                        ))}
                    </div>

                    <div className="mapping-tip">
                        <span className="tip-icon">💡</span>
                        <span>Tip: Asegúrate de que tus variables estén correctamente mapeadas a campos de Odoo antes de enviar.</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default TemplatesSection;
