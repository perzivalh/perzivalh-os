import React, { useEffect, useState } from "react";
import "../styles/templates.css";

const STATUS_COLORS = {
    DRAFT: { bg: "#e3e8ef", text: "#475569", label: "BORRADOR" },
    PENDING: { bg: "#fef3c7", text: "#d97706", label: "PENDIENTE" },
    APPROVED: { bg: "#d1fae5", text: "#059669", label: "APROBADA" },
    REJECTED: { bg: "#fee2e2", text: "#dc2626", label: "RECHAZADA" },
    PAUSED: { bg: "#fef3c7", text: "#d97706", label: "PAUSADA" },
    DISABLED: { bg: "#e5e7eb", text: "#6b7280", label: "DESHABILITADA" },
};

const CATEGORY_LABELS = {
    MARKETING: "MARKETING",
    UTILITY: "UTILITY",
    AUTHENTICATION: "AUTH",
};

function TemplatesView({
    templates,
    onLoadTemplates,
    onSyncTemplates,
    onCreateTemplate,
    onSelectTemplate,
    formatDate,
}) {
    const [search, setSearch] = useState("");
    const [syncing, setSyncing] = useState(false);
    const [filterStatus, setFilterStatus] = useState("");

    useEffect(() => {
        if (onLoadTemplates) {
            onLoadTemplates();
        }
    }, []);

    const handleSync = async () => {
        setSyncing(true);
        try {
            await onSyncTemplates();
        } finally {
            setSyncing(false);
        }
    };

    const filteredTemplates = (templates || []).filter((t) => {
        const matchesSearch =
            !search ||
            t.name.toLowerCase().includes(search.toLowerCase()) ||
            (t.body_text || "").toLowerCase().includes(search.toLowerCase());
        const matchesStatus = !filterStatus || t.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    return (
        <div className="templates-view">
            <div className="templates-header">
                <div className="templates-title-section">
                    <h1>Plantillas de Meta</h1>
                    <span className="meta-status-badge">
                        <span className="status-dot green"></span>
                        CONECTADO A META API
                    </span>
                </div>
                <div className="templates-actions">
                    <div className="search-box ui-search">
                        <span className="template-search-icon ui-search-icon" aria-hidden="true" />
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
                        className="status-filter"
                    >
                        <option value="">Todos los estados</option>
                        <option value="APPROVED">Aprobadas</option>
                        <option value="PENDING">Pendientes</option>
                        <option value="REJECTED">Rechazadas</option>
                        <option value="DRAFT">Borradores</option>
                    </select>
                    <button
                        className="btn-secondary"
                        onClick={handleSync}
                        disabled={syncing}
                    >
                        {syncing ? "Sincronizando..." : "⟳ Sincronizar"}
                    </button>
                    <button className="btn-primary" onClick={onCreateTemplate}>
                        <span>+</span> Crear Nueva Plantilla
                    </button>
                </div>
            </div>

            <div className="templates-grid">
                {filteredTemplates.map((template) => {
                    const statusStyle = STATUS_COLORS[template.status] || STATUS_COLORS.DRAFT;
                    return (
                        <div
                            key={template.id}
                            className="template-card"
                            onClick={() => onSelectTemplate && onSelectTemplate(template)}
                        >
                            <div className="template-card-header">
                                <div className="template-icon">
                                    {template.category === "MARKETING" ? "📢" : template.category === "UTILITY" ? "🔧" : "🔐"}
                                </div>
                                <span
                                    className="status-badge"
                                    style={{
                                        backgroundColor: statusStyle.bg,
                                        color: statusStyle.text,
                                    }}
                                >
                                    {statusStyle.label}
                                </span>
                            </div>
                            <h3 className="template-name">{template.name}</h3>
                            <div className="template-meta">
                                <span className="category-tag">
                                    {CATEGORY_LABELS[template.category] || template.category}
                                </span>
                                <span className="language-tag">
                                    {template.language === "es" ? "ESPAÑOL (ES)" : template.language?.toUpperCase()}
                                </span>
                            </div>
                            {template.body_text && (
                                <p className="template-preview">
                                    {template.body_text.length > 100
                                        ? template.body_text.slice(0, 100) + "..."
                                        : template.body_text}
                                </p>
                            )}
                            <div className="template-card-footer">
                                <button className="btn-text" onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectTemplate && onSelectTemplate(template);
                                }}>
                                    👁 Previsualizar
                                </button>
                                <button className="btn-icon">⋯</button>
                            </div>
                        </div>
                    );
                })}

                {/* Create new template card */}
                <div className="template-card create-card" onClick={onCreateTemplate}>
                    <div className="create-icon">+</div>
                    <h3>Crear nueva plantilla</h3>
                    <p>Empieza a diseñar tu flujo de WhatsApp</p>
                </div>
            </div>

            {filteredTemplates.length === 0 && !search && (
                <div className="empty-state">
                    <p>No hay plantillas. Crea una nueva o sincroniza desde Meta.</p>
                </div>
            )}
        </div>
    );
}

export default TemplatesView;
