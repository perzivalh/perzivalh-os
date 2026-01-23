import React, { useMemo, useState } from "react";

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

  const segments = useMemo(() => {
    if (tags && tags.length) {
      return tags.slice(0, 6).map((tag, index) => ({
        id: tag.id || `${tag.name}-${index}`,
        name: tag.name,
        subtitle: "Segmento por etiqueta",
        count: tag.count || tag.total || 0,
      }));
    }
    return FALLBACK_SEGMENTS;
  }, [tags]);

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
          <button className="campaigns-ghost" type="button">
            Importar Contactos
          </button>
          <button className="campaigns-danger" type="button">
            + Nuevo Segmento
          </button>
        </div>
      </header>

      <div className="campaigns-layout">
        <aside className="campaigns-audiences">
          <div className="campaigns-section-title">Mis audiencias</div>
          <div className="audience-list">
            {segments.map((segment) => (
              <button
                key={segment.id}
                type="button"
                className={`audience-card ${
                  campaignFilter.tag === segment.name ? "active" : ""
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
