import React, { useMemo, useState, useEffect } from "react";
import { apiGet, apiPost } from "../api";

const FALLBACK_SEGMENTS = [
  {
    id: "onico",
    name: "Pacientes Onicomicosis",
    subtitle: "Ultima actualizacion: Hoy",
    count: 450,
  },
  {
    id: "nuevos",
    name: "Nuevos Registros",
    subtitle: "Origen: Landing Page",
    count: 120,
  },
  {
    id: "cirugia",
    name: "Cirugia Podologica",
    subtitle: "Post-operatorio inmediato",
    count: 85,
  },
  {
    id: "re-agenda",
    name: "Re-agendamiento",
    subtitle: "Pacientes inactivos > 3 meses",
    count: 234,
  },
];

const STATUS_LABELS = {
  draft: "BORRADOR",
  scheduled: "PROGRAMADA",
  sending: "ENVIANDO",
  sent: "FINALIZADA",
  failed: "ERROR",
};

function CampaignsView({
  campaignForm,
  setCampaignForm,
  campaignFilter,
  setCampaignFilter,
  templates,
  campaigns,
  selectedCampaignId,
  campaignMessages,
  users,
  tags,
  selectedTemplate,
  statusOptions,
  onCreateCampaign,
  onLoadCampaigns,
  onLoadCampaignMessages,
  onSendCampaign,
  formatDate,
}) {
  const [templateSearch, setTemplateSearch] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Modal states
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSegmentModal, setShowSegmentModal] = useState(false);
  const [showContactsModal, setShowContactsModal] = useState(false);

  // Import contacts state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Segment form state
  const [segmentForm, setSegmentForm] = useState({ name: "", description: "", rules: [] });
  const [savingSegment, setSavingSegment] = useState(false);

  // Contacts list state
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Custom segments from API
  const [customSegments, setCustomSegments] = useState([]);

  // Load segments on mount
  useEffect(() => {
    loadSegments();
  }, []);

  async function loadSegments() {
    try {
      const res = await apiGet("/audiences");
      if (res && res.segments) {
        setCustomSegments(res.segments);
      }
    } catch (err) {
      console.error("Failed to load segments", err);
    }
  }

  async function handleImportContacts() {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await apiPost("/contacts/import-odoo", { source: "odoo" });
      setImportResult(res);
      loadSegments(); // Refresh segments
    } catch (err) {
      setImportResult({ error: err.message || "Error al importar" });
    } finally {
      setImporting(false);
    }
  }

  async function handleCreateSegment(e) {
    e.preventDefault();
    if (!segmentForm.name.trim()) return;
    setSavingSegment(true);
    try {
      await apiPost("/audiences", {
        name: segmentForm.name,
        description: segmentForm.description,
        rules_json: segmentForm.rules.length ? segmentForm.rules : [{ field: "all", operator: "eq", value: true }],
      });
      setShowSegmentModal(false);
      setSegmentForm({ name: "", description: "", rules: [] });
      loadSegments();
    } catch (err) {
      alert("Error: " + (err.message || "No se pudo crear el segmento"));
    } finally {
      setSavingSegment(false);
    }
  }

  async function loadContacts() {
    setLoadingContacts(true);
    try {
      const res = await apiGet("/contacts");
      setContacts(res?.contacts || []);
    } catch (err) {
      console.error("Failed to load contacts", err);
    } finally {
      setLoadingContacts(false);
    }
  }

  function openContactsModal() {
    setShowContactsModal(true);
    loadContacts();
  }

  const segments = useMemo(() => {
    // Combine custom segments with tag-based segments
    const tagSegments = (tags || []).slice(0, 6).map((tag, index) => ({
      id: tag.id || `tag-${tag.name}-${index}`,
      name: tag.name,
      subtitle: "Segmento por etiqueta",
      count: tag.count || tag.total || 0,
      type: "tag",
    }));

    const apiSegments = customSegments.map((seg) => ({
      id: seg.id,
      name: seg.name,
      subtitle: seg.description || "Segmento personalizado",
      count: seg.estimated_count || 0,
      type: "custom",
    }));

    return [...apiSegments, ...tagSegments];
  }, [tags, customSegments]);

  const filteredTemplates = useMemo(() => {
    const query = templateSearch.trim().toLowerCase();
    if (!query) {
      return templates;
    }
    return templates.filter((template) => {
      const name = template.name?.toLowerCase() || "";
      const category = template.category?.toLowerCase() || "";
      return name.includes(query) || category.includes(query);
    });
  }, [templateSearch, templates]);

  const selectedSegment = useMemo(() => {
    return segments.find((segment) => segment.name === campaignFilter.tag);
  }, [segments, campaignFilter.tag]);

  const audienceValue = useMemo(() => {
    if (campaignFilter.tag) {
      return `tag:${campaignFilter.tag}`;
    }
    if (campaignFilter.assigned_user_id) {
      return `assigned:${campaignFilter.assigned_user_id}`;
    }
    if (campaignFilter.status) {
      return `status:${campaignFilter.status}`;
    }
    if (campaignFilter.verified_only) {
      return "verified";
    }
    return "";
  }, [campaignFilter]);

  function handleAudienceChange(value) {
    setCampaignFilter((prev) => {
      const next = {
        ...prev,
        status: "",
        tag: "",
        assigned_user_id: "",
        verified_only: false,
      };
      if (value.startsWith("tag:")) {
        next.tag = value.slice(4);
      } else if (value.startsWith("status:")) {
        next.status = value.slice(7);
      } else if (value.startsWith("assigned:")) {
        next.assigned_user_id = value.slice(9);
      } else if (value === "verified") {
        next.verified_only = true;
      }
      return next;
    });
  }

  function handleTemplateSelect(templateId) {
    setCampaignForm((prev) => ({
      ...prev,
      template_id: templateId,
    }));
  }

  return (
    <section className="campaigns-page">
      <header className="campaigns-header">
        <div className="campaigns-title">
          <span className="campaigns-mark" />
          <div>
            <div className="campaigns-title-row">
              <span className="campaigns-brand">PODOPIE</span>
              <span className="campaigns-divider" />
              <span className="campaigns-heading">Campaigns</span>
            </div>
            <div className="campaigns-subtitle">
              Gestion de envios masivos y audiencias para CRM WhatsApp
            </div>
          </div>
        </div>
        <div className="campaigns-actions">
          <button
            className="campaigns-ghost"
            type="button"
            onClick={() => setShowImportModal(true)}
          >
            Importar Contactos
          </button>
          <button
            className="campaigns-danger"
            type="button"
            onClick={() => setShowSegmentModal(true)}
          >
            + Nuevo Segmento
          </button>
        </div>
      </header>

      {/* Import Contacts Modal */}
      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Importar Contactos</h2>
              <button className="modal-close" onClick={() => setShowImportModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p>Importar contactos desde Odoo (pacientes y partners)</p>
              {importResult && (
                <div className={`import-result ${importResult.error ? "error" : "success"}`}>
                  {importResult.error ? (
                    <span>❌ {importResult.error}</span>
                  ) : (
                    <span>✅ Importados: {importResult.imported || 0} contactos ({importResult.new || 0} nuevos, {importResult.updated || 0} actualizados)</span>
                  )}
                </div>
              )}
              <div className="modal-actions">
                <button
                  className="btn-primary"
                  onClick={handleImportContacts}
                  disabled={importing}
                >
                  {importing ? "Importando..." : "🔄 Importar desde Odoo"}
                </button>
                <button className="btn-secondary" onClick={openContactsModal}>
                  📋 Ver Contactos Existentes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Segment Modal */}
      {showSegmentModal && (
        <div className="modal-overlay" onClick={() => setShowSegmentModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Nuevo Segmento</h2>
              <button className="modal-close" onClick={() => setShowSegmentModal(false)}>×</button>
            </div>
            <form className="modal-body" onSubmit={handleCreateSegment}>
              <label className="form-field">
                <span>Nombre del Segmento</span>
                <input
                  type="text"
                  placeholder="Ej: Pacientes Onicomicosis"
                  value={segmentForm.name}
                  onChange={(e) => setSegmentForm({ ...segmentForm, name: e.target.value })}
                  required
                />
              </label>
              <label className="form-field">
                <span>Descripción</span>
                <textarea
                  placeholder="Descripción opcional..."
                  value={segmentForm.description}
                  onChange={(e) => setSegmentForm({ ...segmentForm, description: e.target.value })}
                  rows="2"
                />
              </label>
              <div className="form-field">
                <span>Reglas de Filtro</span>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      setSegmentForm({
                        ...segmentForm,
                        rules: [...segmentForm.rules, { field: e.target.value, operator: "eq", value: "" }]
                      });
                    }
                  }}
                >
                  <option value="">+ Agregar filtro...</option>
                  <option value="is_patient">Es paciente</option>
                  <option value="has_phone">Tiene teléfono</option>
                  <option value="tag">Tiene etiqueta</option>
                </select>
                {segmentForm.rules.map((rule, idx) => (
                  <div key={idx} className="filter-rule">
                    <span className="rule-badge">{rule.field}</span>
                    <button type="button" onClick={() => {
                      setSegmentForm({
                        ...segmentForm,
                        rules: segmentForm.rules.filter((_, i) => i !== idx)
                      });
                    }}>×</button>
                  </div>
                ))}
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowSegmentModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={savingSegment}>
                  {savingSegment ? "Guardando..." : "Crear Segmento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contacts List Modal */}
      {showContactsModal && (
        <div className="modal-overlay" onClick={() => setShowContactsModal(false)}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Contactos ({contacts.length})</h2>
              <button className="modal-close" onClick={() => setShowContactsModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {loadingContacts ? (
                <div className="loading">Cargando contactos...</div>
              ) : contacts.length === 0 ? (
                <div className="empty-state">No hay contactos. Importa desde Odoo.</div>
              ) : (
                <div className="contacts-table">
                  <div className="contacts-header">
                    <span>Nombre</span>
                    <span>Teléfono</span>
                    <span>Email</span>
                    <span>Tipo</span>
                  </div>
                  {contacts.slice(0, 50).map((contact) => (
                    <div key={contact.id} className="contacts-row">
                      <span>{contact.name}</span>
                      <span>{contact.phone_e164 || "-"}</span>
                      <span>{contact.email || "-"}</span>
                      <span className="contact-type">{contact.is_patient ? "Paciente" : "Contacto"}</span>
                    </div>
                  ))}
                  {contacts.length > 50 && (
                    <div className="contacts-more">...y {contacts.length - 50} más</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="campaigns-layout">
        <aside className="campaigns-audiences">
          <div className="campaigns-section-title">Mis audiencias</div>
          <div className="audience-list">
            {segments.map((segment) => (
              <button
                key={segment.id}
                type="button"
                className={`audience-card ${campaignFilter.tag === segment.name ? "active" : ""
                  }`}
                onClick={() =>
                  setCampaignFilter((prev) => ({
                    ...prev,
                    tag: segment.name,
                  }))
                }
              >
                <div className="audience-title">
                  <span>{segment.name}</span>
                  <span className="audience-count">{segment.count}</span>
                </div>
                <div className="audience-subtitle">{segment.subtitle}</div>
              </button>
            ))}
          </div>
        </aside>

        <div className="campaigns-templates">
          <div className="campaigns-section-header">
            <div className="campaigns-section-title">Plantillas Meta (HSM)</div>
            <div className="template-search">
              <span className="template-search-icon" aria-hidden="true" />
              <input
                type="text"
                placeholder="Buscar plantilla..."
                value={templateSearch}
                onChange={(event) => setTemplateSearch(event.target.value)}
              />
            </div>
          </div>
          <div className="template-grid">
            {filteredTemplates.map((template) => {
              const statusLabel = template.is_active ? "APROBADA" : "PENDIENTE";
              const statusClass = template.is_active ? "approved" : "pending";
              const category = (template.category || "Marketing").toUpperCase();
              const selected = template.id === campaignForm.template_id;
              return (
                <div
                  key={template.id}
                  className={`template-card ${selected ? "selected" : ""}`}
                >
                  <div className="template-head">
                    <div className="template-name">{template.name}</div>
                    <span className={`template-status ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </div>
                  <div className="template-category">{category}</div>
                  <div className="template-preview">
                    {template.body_preview || "Sin preview"}
                  </div>
                  <button
                    className="template-action"
                    type="button"
                    onClick={() => handleTemplateSelect(template.id)}
                  >
                    Previsualizar
                  </button>
                </div>
              );
            })}
            {!filteredTemplates.length && (
              <div className="empty-state">Sin plantillas disponibles</div>
            )}
          </div>
        </div>

        <aside className="campaigns-create">
          <div className="campaigns-section-title">Nueva campana</div>
          <form className="campaigns-form" onSubmit={onCreateCampaign}>
            <label className="campaigns-field">
              <span>Nombre de campana</span>
              <input
                type="text"
                placeholder="Ej: Promo Onicomicosis Mar"
                value={campaignForm.name}
                onChange={(event) =>
                  setCampaignForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label className="campaigns-field">
              <span>Seleccionar audiencia</span>
              <select
                value={audienceValue}
                onChange={(event) => handleAudienceChange(event.target.value)}
              >
                <option value="">Selecciona un segmento...</option>
                {segments.map((segment) => (
                  <option value={`tag:${segment.name}`} key={`seg-${segment.id}`}>
                    {segment.name}
                  </option>
                ))}
                <option value="verified">Solo verificados</option>
                <option value="assigned:unassigned">Sin asignar</option>
                {statusOptions.map((status) => (
                  <option value={`status:${status}`} key={`status-${status}`}>
                    Status: {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="campaigns-field">
              <span>Plantilla Meta</span>
              <select
                value={campaignForm.template_id}
                onChange={(event) =>
                  setCampaignForm((prev) => ({
                    ...prev,
                    template_id: event.target.value,
                  }))
                }
              >
                <option value="">Selecciona plantilla...</option>
                {templates.map((template) => (
                  <option value={template.id} key={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="campaigns-field">
              <span>Programacion</span>
              <input
                type="datetime-local"
                value={campaignForm.scheduled_for}
                onChange={(event) =>
                  setCampaignForm((prev) => ({
                    ...prev,
                    scheduled_for: event.target.value,
                  }))
                }
              />
            </label>

            <button
              className="campaigns-advanced-toggle"
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
            >
              {showAdvanced ? "Ocultar filtros avanzados" : "Filtros avanzados"}
            </button>

            {showAdvanced && (
              <div className="campaigns-advanced">
                <label className="campaigns-field">
                  <span>Status filtro</span>
                  <select
                    value={campaignFilter.status}
                    onChange={(event) =>
                      setCampaignFilter((prev) => ({
                        ...prev,
                        status: event.target.value,
                      }))
                    }
                  >
                    <option value="">Todos</option>
                    {statusOptions.map((status) => (
                      <option value={status} key={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="campaigns-field">
                  <span>Asignado</span>
                  <select
                    value={campaignFilter.assigned_user_id}
                    onChange={(event) =>
                      setCampaignFilter((prev) => ({
                        ...prev,
                        assigned_user_id: event.target.value,
                      }))
                    }
                  >
                    <option value="">Todos</option>
                    <option value="unassigned">Sin asignar</option>
                    {users.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="campaigns-field">
                  <span>Tag</span>
                  <select
                    value={campaignFilter.tag}
                    onChange={(event) =>
                      setCampaignFilter((prev) => ({
                        ...prev,
                        tag: event.target.value,
                      }))
                    }
                  >
                    <option value="">Todos</option>
                    {tags.map((tag) => (
                      <option value={tag.name} key={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="campaigns-toggle">
                  <input
                    type="checkbox"
                    checked={campaignFilter.verified_only}
                    onChange={(event) =>
                      setCampaignFilter((prev) => ({
                        ...prev,
                        verified_only: event.target.checked,
                      }))
                    }
                  />
                  Solo verificados
                </label>
              </div>
            )}

            <button className="campaigns-launch" type="submit">
              Lanzar Campana
            </button>
            <div className="campaigns-hint">
              Se enviaran aproximadamente{" "}
              <strong>{selectedSegment?.count || 0}</strong> mensajes HSM
            </div>
            <div className="campaigns-preview-box">
              {selectedTemplate?.body_preview ||
                "Selecciona una plantilla para ver preview"}
            </div>
          </form>
        </aside>
      </div>

      <section className="campaigns-history">
        <div className="campaigns-history-header">
          <div>
            <div className="campaigns-history-title">Historial de Envios</div>
            <div className="campaigns-history-subtitle">
              Ultimos 30 dias
            </div>
          </div>
          <button className="campaigns-link" type="button" onClick={onLoadCampaigns}>
            Ver todo el historial
          </button>
        </div>
        <div className="history-table">
          <div className="history-head">
            <span>Campana / Fecha</span>
            <span>Alcance</span>
            <span>Tasa de lectura</span>
            <span>Respuestas</span>
            <span>Estado</span>
            <span>Acciones</span>
          </div>
          {campaigns.map((campaign) => {
            const statusLabel = STATUS_LABELS[campaign.status] || campaign.status;
            const reach =
              campaign.audience_count ||
              campaign.messages_count ||
              campaign.total ||
              "--";
            return (
              <div className="history-row" key={campaign.id}>
                <div className="history-title">
                  <div className="history-name">{campaign.name}</div>
                  <div className="history-date">
                    {formatDate(campaign.created_at)}
                  </div>
                </div>
                <div className="history-metric">
                  <div className="history-value">{reach}</div>
                  <div className="history-label">contactos</div>
                </div>
                <div className="history-meter">
                  <div className="history-value">--</div>
                  <div className="history-bar">
                    <div className="history-bar-fill" style={{ width: "0%" }} />
                  </div>
                </div>
                <div className="history-metric">
                  <div className="history-value">--</div>
                  <div className="history-label">mensajes</div>
                </div>
                <div className={`history-status ${campaign.status}`}>
                  {statusLabel}
                </div>
                <div className="history-actions">
                  <button
                    className="campaigns-ghost small"
                    type="button"
                    onClick={() => onLoadCampaignMessages(campaign.id)}
                  >
                    Ver mensajes
                  </button>
                  <button
                    className="campaigns-danger small"
                    type="button"
                    onClick={() => onSendCampaign(campaign.id)}
                    disabled={campaign.status === "sending"}
                  >
                    Enviar
                  </button>
                </div>
              </div>
            );
          })}
          {!campaigns.length && (
            <div className="empty-state">Sin campanas registradas</div>
          )}
        </div>
        {selectedCampaignId && (
          <div className="campaigns-messages">
            <div className="campaigns-history-title">Mensajes</div>
            <div className="history-table">
              <div className="history-head">
                <span>WA</span>
                <span>Status</span>
                <span>Enviado</span>
              </div>
              {campaignMessages.map((message) => (
                <div className="history-row" key={message.id}>
                  <span>{message.wa_id}</span>
                  <span>{message.status}</span>
                  <span>{formatDate(message.sent_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </section>
  );
}

export default CampaignsView;
