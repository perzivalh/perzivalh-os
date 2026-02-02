import React, { useMemo, useState, useEffect, useRef } from "react";
import { apiGet, apiPost } from "../api";
import { useToast } from "./ToastProvider.jsx";

const STATUS_LABELS = {
  draft: "BORRADOR",
  scheduled: "PROGRAMADA",
  sending: "ENVIANDO",
  sent: "FINALIZADA",
  failed: "ERROR",
};

const TEMPLATE_STATUS = {
  APPROVED: { label: "APROBADA", className: "approved" },
  PENDING: { label: "PENDIENTE", className: "pending" },
  REJECTED: { label: "RECHAZADA", className: "rejected" },
  DRAFT: { label: "BORRADOR", className: "draft" },
  PAUSED: { label: "PAUSADA", className: "pending" },
  DISABLED: { label: "DESHABILITADA", className: "draft" },
};

const CATEGORY_LABELS = {
  MARKETING: "MARKETING",
  UTILITY: "UTILIDAD",
  AUTHENTICATION: "AUTENTICACION",
};

const CAMPAIGN_TABS = [
  {
    id: "audiences",
    label: "Audiencias",
    title: "Audiencias",
    subtitle: "Gestiona, segmenta y organiza tus listas de contactos.",
  },
  {
    id: "templates",
    label: "Biblioteca de Plantillas",
    title: "Biblioteca de Plantillas",
    subtitle: "Consulta y gestiona las plantillas de mensajes autorizadas por WhatsApp.",
  },
  {
    id: "new",
    label: "Nueva Campaña",
    title: "Nueva Campaña",
    subtitle: "Configura y programa Envíos masivos en minutos.",
  },
  {
    id: "history",
    label: "Historial de Envíos",
    title: "Historial de Envíos",
    subtitle: "Revisa el desempeño y estado de tus Campañas recientes.",
  },
];

const TAB_ALIASES = {
  audiencias: "audiences",
  audiences: "audiences",
  templates: "templates",
  plantillas: "templates",
  biblioteca: "templates",
  nueva: "new",
  campaign: "new",
  campaigns: "new",
  nueva_campana: "new",
  history: "history",
  historial: "history",
};

const AUDIENCE_FLOW_TABS = [
  {
    id: "dynamic",
    label: "Audiencias Dinámicas",
    title: "Automatización de Audiencias y Tags",
    subtitle: "Unificación de flujos de datos Perzivalh CRM",
    actionLabel: "Guardar Configuración",
  },
  {
    id: "excel",
    label: "Importar Excel",
    title: "Importación de Contactos Excel",
    subtitle: "Gestión de base de datos externa Perzivalh CRM",
    actionLabel: "Iniciar Importación",
  },
  {
    id: "odoo",
    label: "Importar de Odoo",
    title: "Sincronización Inteligente Odoo",
    subtitle: "Automatización de audiencias Perzivalh OS",
    actionLabel: "Actualizar Lista Odoo",
  },
];

const IMPORT_FIELDS = [
  { value: "phone", label: "Teléfono" },
  { value: "name", label: "Nombre Completo" },
  { value: "city", label: "Ciudad" },
  { value: "tags", label: "Etiquetas" },
  { value: "ignore", label: "Sin Mapear" },
];

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
  const [templateCategory, setTemplateCategory] = useState("all");
  const [audienceSearch, setAudienceSearch] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { pushToast } = useToast();
  const formRef = useRef(null);
  const [audienceFlowOpen, setAudienceFlowOpen] = useState(false);
  const [audienceFlowTab, setAudienceFlowTab] = useState("dynamic");
  const [automationSettings, setAutomationSettings] = useState({
    enabled: false,
    phone_number_id: null,
  });
  const [loadingAutomation, setLoadingAutomation] = useState(false);
  const [dynamicAudiences, setDynamicAudiences] = useState([]);
  const [dynamicLoading, setDynamicLoading] = useState(false);
  const [syncingDynamic, setSyncingDynamic] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [importFile, setImportFile] = useState(null);
  const [importFileBase64, setImportFileBase64] = useState("");
  const [importPreview, setImportPreview] = useState(null);
  const [importMapping, setImportMapping] = useState([]);
  const [importOptions, setImportOptions] = useState({
    targetMode: "new",
    listName: "",
    targetSegmentId: "",
    prefix: "",
    ignoreDuplicates: true,
  });
  const [importSummary, setImportSummary] = useState(null);
  const [importingExcel, setImportingExcel] = useState(false);
  const [odooStatus, setOdooStatus] = useState({ connected: false });
  const [checkingOdoo, setCheckingOdoo] = useState(false);
  const [refreshingOdoo, setRefreshingOdoo] = useState(false);
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") {
      return "templates";
    }
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("tab");
    if (!raw) {
      return "templates";
    }
    return TAB_ALIASES[raw] || raw;
  });

  // Modal states
  const [showContactsModal, setShowContactsModal] = useState(false);

  // Contacts list state
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [odooStats, setOdooStats] = useState(null);

  // Custom segments from API
  const [customSegments, setCustomSegments] = useState([]);

  // Load segments on mount
  useEffect(() => {
    loadSegments();
    loadOdooStats();
  }, []);

  useEffect(() => {
    if (!audienceFlowOpen) return;
    loadAutomationSettings();
    loadDynamicAudiences();
    loadOdooStatus();
  }, [audienceFlowOpen]);

  useEffect(() => {
    if (!audienceFlowOpen || audienceFlowTab !== "odoo") return;
    loadOdooStatus();
  }, [audienceFlowTab, audienceFlowOpen]);

  useEffect(() => {
    if (!CAMPAIGN_TABS.find((tab) => tab.id === activeTab)) {
      setActiveTab("templates");
    }
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.set("tab", activeTab);
    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", nextUrl);
  }, [activeTab]);

  async function loadSegments() {
    try {
      const res = await apiGet("/api/audiences");
      if (res && res.segments) {
        setCustomSegments(res.segments);
      }
    } catch (err) {
      console.error("Failed to load segments", err);
    }
  }

  async function loadOdooStats() {
    try {
      const res = await apiGet("/api/contacts/stats");
      setOdooStats(res || null);
    } catch (err) {
      console.error("Failed to load Odoo stats", err);
      setOdooStats(null);
    }
  }

  async function loadAutomationSettings() {
    setLoadingAutomation(true);
    try {
      const res = await apiGet("/api/audiences/automation-settings");
      setAutomationSettings(res?.settings || { enabled: false, phone_number_id: null });
    } catch (err) {
      console.error("Failed to load automation settings", err);
    } finally {
      setLoadingAutomation(false);
    }
  }

  async function loadDynamicAudiences() {
    setDynamicLoading(true);
    try {
      const res = await apiGet("/api/audiences/dynamic-tags");
      setDynamicAudiences(res?.items || []);
    } catch (err) {
      console.error("Failed to load dynamic audiences", err);
    } finally {
      setDynamicLoading(false);
    }
  }

  async function handleSaveAutomation() {
    try {
      const res = await apiPost("/api/audiences/automation-settings", {
        enabled: automationSettings.enabled,
      });
      setAutomationSettings(res?.settings || automationSettings);
      pushToast({ message: "Configuración guardada" });
    } catch (err) {
      pushToast({ type: "error", message: err.message || "No se pudo guardar" });
    }
  }

  async function handleSyncHistorical() {
    setSyncingDynamic(true);
    try {
      await apiPost("/api/audiences/sync-historical", {});
      await loadDynamicAudiences();
      pushToast({ message: "Sincronización completa" });
    } catch (err) {
      pushToast({ type: "error", message: err.message || "Error al sincronizar" });
    } finally {
      setSyncingDynamic(false);
    }
  }

  async function handleCreateDynamicTag() {
    const name = newTagName.trim();
    if (!name) return;
    try {
      await apiPost("/api/audiences/dynamic-tags", { name });
      setNewTagName("");
      await loadDynamicAudiences();
      pushToast({ message: "Etiqueta creada correctamente" });
    } catch (err) {
      pushToast({ type: "error", message: err.message || "No se pudo crear etiqueta" });
    }
  }

  async function loadOdooStatus() {
    setCheckingOdoo(true);
    try {
      const res = await apiGet("/api/contacts/odoo-status");
      setOdooStatus(res || { connected: false });
    } catch (err) {
      console.error("Failed to load Odoo status", err);
      setOdooStatus({ connected: false });
    } finally {
      setCheckingOdoo(false);
    }
  }

  async function handleRefreshOdoo() {
    setRefreshingOdoo(true);
    try {
      await apiPost("/api/contacts/refresh-odoo", {});
      await loadOdooStats();
      pushToast({ message: "Lista Odoo actualizada" });
    } catch (err) {
      pushToast({ type: "error", message: err.message || "Error al actualizar Odoo" });
    } finally {
      setRefreshingOdoo(false);
    }
  }

  async function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result || "";
        const base64 = result.toString().split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function handleFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportSummary(null);
    try {
      const base64 = await readFileAsBase64(file);
      setImportFileBase64(base64);
      const preview = await apiPost("/api/audiences/import-preview", {
        file_base64: base64,
        filename: file.name,
      });
      setImportPreview(preview);
      setImportMapping(preview?.mapping || []);
    } catch (err) {
      setImportPreview(null);
      setImportMapping([]);
      pushToast({ type: "error", message: err.message || "No se pudo leer el archivo" });
    }
  }

  async function handleImportExcel() {
    if (!importFile || !importFileBase64) {
      pushToast({ type: "error", message: "Selecciona un archivo válido" });
      return;
    }
    setImportingExcel(true);
    try {
      const payload = {
        file_base64: importFileBase64,
        filename: importFile.name,
        mapping: importMapping,
        options: {
          baseTagName: importOptions.listName,
          targetSegmentId:
            importOptions.targetMode === "existing" ? importOptions.targetSegmentId : "",
          prefix: importOptions.prefix,
          ignoreDuplicates: importOptions.ignoreDuplicates,
        },
      };
      const res = await apiPost("/api/audiences/import-excel", payload);
      setImportSummary(res);
      await loadSegments();
      await loadDynamicAudiences();
      pushToast({ message: "Importación completada" });
    } catch (err) {
      pushToast({ type: "error", message: err.message || "Error al importar" });
    } finally {
      setImportingExcel(false);
    }
  }

  async function loadContacts() {
    setLoadingContacts(true);
    try {
      const res = await apiGet("/api/contacts");
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

  function handleAudiencePrimaryAction() {
    if (audienceFlowTab === "dynamic") {
      handleSaveAutomation();
      return;
    }
    if (audienceFlowTab === "excel") {
      handleImportExcel();
      return;
    }
    if (audienceFlowTab === "odoo") {
      handleRefreshOdoo();
    }
  }

  const segments = useMemo(() => {
    const odooSegment = {
      id: "odoo",
      name: "odoo",
      subtitle: "Origen: Odoo",
      count: odooStats?.total || 0,
      type: "odoo",
    };

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

    return [odooSegment, ...apiSegments, ...tagSegments];
  }, [tags, customSegments, odooStats]);

  const filteredSegments = useMemo(() => {
    const query = audienceSearch.trim().toLowerCase();
    if (!query) {
      return segments;
    }
    return segments.filter((segment) => {
      const name = segment.name?.toLowerCase() || "";
      const subtitle = segment.subtitle?.toLowerCase() || "";
      return name.includes(query) || subtitle.includes(query);
    });
  }, [segments, audienceSearch]);

  const templateCategories = useMemo(() => {
    const unique = new Set();
    (templates || []).forEach((template) => {
      if (template.category) {
        unique.add(template.category);
      }
    });
    return Array.from(unique);
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    const query = templateSearch.trim().toLowerCase();
    const categoryFilter = templateCategory === "all" ? "" : templateCategory.toLowerCase();
    return (templates || []).filter((template) => {
      const name = template.name?.toLowerCase() || "";
      const category = template.category?.toLowerCase() || "";
      const matchesQuery = !query || name.includes(query) || category.includes(query);
      const matchesCategory = !categoryFilter || category === categoryFilter;
      return matchesQuery && matchesCategory;
    });
  }, [templateSearch, templateCategory, templates]);

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

  const activeTabMeta =
    CAMPAIGN_TABS.find((tab) => tab.id === activeTab) || CAMPAIGN_TABS[1];
  const activeAudienceMeta =
    AUDIENCE_FLOW_TABS.find((tab) => tab.id === audienceFlowTab) ||
    AUDIENCE_FLOW_TABS[0];
  const headerMeta = audienceFlowOpen ? activeAudienceMeta : activeTabMeta;

  return (
    <section className="campaigns-page">
      <div className="campaigns-shell">
        <header className="campaigns-header">
          <div className="campaigns-title-block">
            <div className="campaigns-title-row">
              {audienceFlowOpen && (
                <button
                  className="campaigns-back"
                  type="button"
                  onClick={() => setAudienceFlowOpen(false)}
                  aria-label="Volver"
                >
                  ?
                </button>
              )}
              <span className="campaigns-heading">{headerMeta.title}</span>
            </div>
            <div
              className={`campaigns-subtitle ${
                audienceFlowOpen ? "campaigns-subtitle--upper" : ""
              }`}
            >
              {headerMeta.subtitle}
            </div>
          </div>
          <div className="campaigns-actions">
            {audienceFlowOpen && (
              <>
                <button
                  className="campaigns-ghost"
                  type="button"
                  onClick={() => setAudienceFlowOpen(false)}
                >
                  {audienceFlowTab === "excel" ? "Cancelar" : "Descartar"}
                </button>
                <button
                  className="campaigns-primary"
                  type="button"
                  onClick={handleAudiencePrimaryAction}
                  disabled={
                    (audienceFlowTab === "excel" &&
                      (importingExcel ||
                        !importFileBase64 ||
                        (importOptions.targetMode === "new" &&
                          !importOptions.listName.trim()) ||
                        (importOptions.targetMode === "existing" &&
                          !importOptions.targetSegmentId))) ||
                    (audienceFlowTab === "odoo" && refreshingOdoo)
                  }
                >
                  {activeAudienceMeta.actionLabel}
                </button>
              </>
            )}
            {!audienceFlowOpen && activeTab === "audiences" && (
              <>
                <button
                  className="campaigns-ghost"
                  type="button"
                  onClick={() => {
                    setAudienceFlowOpen(true);
                    setAudienceFlowTab("excel");
                  }}
                >
                  Importar Contactos
                </button>
                <button
                  className="campaigns-primary"
                  type="button"
                  onClick={() => {
                    setAudienceFlowOpen(true);
                    setAudienceFlowTab("dynamic");
                  }}
                >
                  + Nueva Audiencia
                </button>
              </>
            )}
            {!audienceFlowOpen && activeTab === "new" && (
              <button
                className="campaigns-primary"
                type="button"
                onClick={() => formRef.current?.requestSubmit?.()}
              >
                + Lanzar Campaña
              </button>
            )}
          </div>
        </header>

        {!audienceFlowOpen && (
          <nav className="campaigns-tabs" role="tablist" aria-label="Secciones de Campañas">
            {CAMPAIGN_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`campaigns-tab ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}

        <div className="campaigns-tab-panel">
          {audienceFlowOpen ? (
            <section className="audience-flow">
              <nav
                className="audience-flow-tabs"
                role="tablist"
                aria-label="Flujo de nueva audiencia"
              >
                {AUDIENCE_FLOW_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={audienceFlowTab === tab.id}
                    className={`audience-flow-tab ${
                      audienceFlowTab === tab.id ? "active" : ""
                    }`}
                    onClick={() => setAudienceFlowTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>

              <div className="audience-flow-panel">
                {audienceFlowTab === "dynamic" && (
                  <div className="audience-flow-content">
                    <div className="audience-hero">
                      <div className="audience-hero-main">
                        <div className="audience-hero-title">
                          Sincronización Automática Total
                        </div>
                        <div className="audience-hero-subtitle">
                          Vincula tus etiquetas directamente con Audiencias Dinámicas.
                          La lógica del sistema es 1 Tag = 1 Audiencia.
                        </div>
                      </div>
                      <label className="audience-switch">
                        <span>Estado</span>
                        <input
                          type="checkbox"
                          checked={automationSettings.enabled}
                          onChange={(event) =>
                            setAutomationSettings((prev) => ({
                              ...prev,
                              enabled: event.target.checked,
                            }))
                          }
                          disabled={loadingAutomation}
                        />
                        <span>{automationSettings.enabled ? "ACTIVO" : "INACTIVO"}</span>
                      </label>
                    </div>

                    <div className="audience-rule-card">
                      <div className="audience-rule-title">
                        Regla de Automatización unificada
                      </div>
                      <p>
                        Cuando un operador o bot etiqueta a un contacto en el CRM,
                        este se añade instantáneamente a la lista de audiencia
                        correspondiente. No requiere intervención manual adicional.
                      </p>
                    </div>

                    <div className="audience-section-header">
                      <div>
                        <div className="audience-section-title">
                          Gestión de Etiquetas dinámicas
                        </div>
                        <div className="audience-section-subtitle">
                          Administra las etiquetas vinculadas que alimentan tus listas
                          de envío en tiempo real.
                        </div>
                      </div>
                      <div className="audience-section-actions">
                        <button
                          className="campaigns-ghost"
                          type="button"
                          onClick={handleSyncHistorical}
                          disabled={syncingDynamic}
                        >
                          {syncingDynamic
                            ? "Sincronizando..."
                            : "Sincronizar Datos Históricos"}
                        </button>
                        <button
                          className="campaigns-primary"
                          type="button"
                          onClick={handleCreateDynamicTag}
                          disabled={!newTagName.trim()}
                        >
                          Nueva Etiqueta / Audiencia
                        </button>
                      </div>
                    </div>

                    <div className="audience-tags-grid">
                      {dynamicLoading && (
                        <div className="empty-state">Cargando etiquetas...</div>
                      )}
                      {!dynamicLoading && dynamicAudiences.length === 0 && (
                        <div className="empty-state">
                          No hay etiquetas dinámicas aún.
                        </div>
                      )}
                      {!dynamicLoading &&
                        dynamicAudiences.map((item) => (
                          <div
                            key={item.id}
                            className={`audience-tag-card ${
                              item.is_default ? "default" : ""
                            }`}
                          >
                            <div className="audience-tag-head">
                              <div className="audience-tag-name">
                                {item.is_default
                                  ? "DEFAULT"
                                  : item.tag?.name || item.segment?.name}
                              </div>
                              <div className="audience-tag-count">
                                {item.segment?.estimated_count || 0}
                              </div>
                            </div>
                            <div className="audience-tag-meta">
                              Audiencia: {item.segment?.estimated_count || 0} contactos
                            </div>
                            <div className="audience-tag-status">
                              <span className="dot" />
                              Sincronizado
                              <span className="audience-tag-time">
                                {item.last_synced_at
                                  ? ` · ${formatDate(item.last_synced_at)}`
                                  : ""}
                              </span>
                            </div>
                          </div>
                        ))}
                      <div className="audience-tag-card add">
                        <div className="audience-tag-add">
                          <div className="audience-tag-add-icon">+</div>
                          <input
                            type="text"
                            placeholder="Crear nueva etiqueta"
                            value={newTagName}
                            onChange={(event) => setNewTagName(event.target.value)}
                          />
                          <button
                            type="button"
                            className="campaigns-primary"
                            onClick={handleCreateDynamicTag}
                            disabled={!newTagName.trim()}
                          >
                            Crear
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {audienceFlowTab === "excel" && (
                  <div className="audience-flow-content">
                    <div className="excel-dropzone">
                      <div className="excel-dropzone-inner">
                        <div className="excel-dropzone-icon">?</div>
                        <div className="excel-dropzone-title">
                          Sube tu archivo de Excel
                        </div>
                        <div className="excel-dropzone-subtitle">
                          Arrastra y suelta tu archivo .xlsx o .csv aquí o{" "}
                          <label className="excel-link">
                            explora tus archivos
                            <input
                              type="file"
                              accept=".csv,.xlsx"
                              onChange={handleFileSelect}
                            />
                          </label>
                        </div>
                        <div className="excel-dropzone-tags">
                          <span>Máximo 50MB</span>
                          <span>Hasta 50,000 filas</span>
                        </div>
                        {importFile && (
                          <div className="excel-file-name">{importFile.name}</div>
                        )}
                      </div>
                    </div>

                    <div className="excel-grid">
                      <div className="excel-card">
                        <div className="excel-card-title">Configuración de Importación</div>
                        <label className="excel-field">
                          <span>Lista de destino</span>
                          <select
                            value={importOptions.targetMode}
                            onChange={(event) =>
                              setImportOptions((prev) => ({
                                ...prev,
                                targetMode: event.target.value,
                              }))
                            }
                          >
                            <option value="new">Crear Nueva Lista</option>
                            <option value="existing">Elegir Lista Existente</option>
                          </select>
                        </label>
                        {importOptions.targetMode === "new" ? (
                          <label className="excel-field">
                            <span>Nombre de la nueva lista</span>
                            <input
                              type="text"
                              placeholder="Ej: IMPORT_JULIO"
                              value={importOptions.listName}
                              onChange={(event) =>
                                setImportOptions((prev) => ({
                                  ...prev,
                                  listName: event.target.value,
                                }))
                              }
                            />
                          </label>
                        ) : (
                          <label className="excel-field">
                            <span>Lista existente</span>
                            <select
                              value={importOptions.targetSegmentId}
                              onChange={(event) =>
                                setImportOptions((prev) => ({
                                  ...prev,
                                  targetSegmentId: event.target.value,
                                }))
                              }
                            >
                              <option value="">Selecciona una lista</option>
                              {customSegments.map((segment) => (
                                <option key={segment.id} value={segment.id}>
                                  {segment.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <label className="excel-field">
                          <span>Prefijo de etiqueta (opcional)</span>
                          <input
                            type="text"
                            placeholder="Ej: IMPORT_JULIO_"
                            value={importOptions.prefix}
                            onChange={(event) =>
                              setImportOptions((prev) => ({
                                ...prev,
                                prefix: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="excel-checkbox">
                          <input
                            type="checkbox"
                            checked={importOptions.ignoreDuplicates}
                            onChange={(event) =>
                              setImportOptions((prev) => ({
                                ...prev,
                                ignoreDuplicates: event.target.checked,
                              }))
                            }
                          />
                          Ignorar contactos duplicados
                        </label>
                        {importSummary && (
                          <div className="excel-summary">
                            Procesadas: {importSummary.processed} · Nuevos:{" "}
                            {importSummary.created} · Duplicados:{" "}
                            {importSummary.skipped} · Errores: {importSummary.errors}
                          </div>
                        )}
                      </div>

                      <div className="excel-card">
                        <div className="excel-card-title">
                          Vista previa de mapeo
                          <span className="excel-pill">
                            Columnas detectadas: {importPreview?.columns?.length || 0}
                          </span>
                        </div>
                        <div className="excel-map-table">
                          <div className="excel-map-head">
                            <span>Columna Excel</span>
                            <span>Mapeo CRM</span>
                            <span>Ejemplo</span>
                          </div>
                          {(importPreview?.columns || []).map((col, index) => (
                            <div className="excel-map-row" key={`${col}-${index}`}>
                              <span>{col}</span>
                              <select
                                value={importMapping[index] || "ignore"}
                                onChange={(event) =>
                                  setImportMapping((prev) => {
                                    const next = [...prev];
                                    next[index] = event.target.value;
                                    return next;
                                  })
                                }
                              >
                                {IMPORT_FIELDS.map((field) => (
                                  <option value={field.value} key={field.value}>
                                    {field.label}
                                  </option>
                                ))}
                              </select>
                              <span>
                                {importPreview?.previewRows?.[0]?.[index] || "--"}
                              </span>
                            </div>
                          ))}
                          {!importPreview && (
                            <div className="empty-state">
                              Sube un archivo para ver el mapeo.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {audienceFlowTab === "odoo" && (
                  <div className="audience-flow-content odoo-flow">
                    <div className="odoo-status">
                      <span className={`odoo-indicator ${odooStatus.connected ? "on" : "off"}`} />
                      Estado: {odooStatus.connected ? "Odoo conectado" : "Odoo no conectado"}
                    </div>
                    <div className="odoo-actions">
                      <button
                        className="campaigns-ghost"
                        type="button"
                        onClick={loadOdooStatus}
                        disabled={checkingOdoo}
                      >
                        {checkingOdoo ? "Validando..." : "Validar Conexión"}
                      </button>
                      <button
                        className="campaigns-primary"
                        type="button"
                        onClick={handleRefreshOdoo}
                        disabled={refreshingOdoo}
                      >
                        {refreshingOdoo ? "Actualizando..." : "Actualizar Lista Odoo"}
                      </button>
                    </div>
                    <div className="odoo-note">
                      Se importarán contactos y se crearán audiencias por etiqueta Automáticamente.
                    </div>
                  </div>
                )}
              </div>
            </section>
          ) : (
            <>
          {activeTab === "templates" && (
            <section className="campaigns-panel templates-panel">
              <div className="templates-toolbar">
                <label className="templates-search">
                  <span className="template-search-icon" aria-hidden="true" />
                  <input
                    type="text"
                    placeholder="Buscar por nombre de plantilla..."
                    value={templateSearch}
                    onChange={(event) => setTemplateSearch(event.target.value)}
                  />
                </label>
                <select
                  className="templates-select"
                  value={templateCategory}
                  onChange={(event) => setTemplateCategory(event.target.value)}
                >
                  <option value="all">Todas las categorias</option>
                  {templateCategories.map((category) => (
                    <option value={category.toLowerCase()} key={category}>
                      {CATEGORY_LABELS[category] || category}
                    </option>
                  ))}
                </select>
              </div>
              <div className="template-grid template-grid--library">
                {filteredTemplates.map((template) => {
                  const statusKey = (
                    template.status ||
                    (template.is_active ? "APPROVED" : "PENDING")
                  ).toUpperCase();
                  const statusMeta =
                    TEMPLATE_STATUS[statusKey] || TEMPLATE_STATUS.PENDING;
                  const categoryLabel =
                    CATEGORY_LABELS[template.category] ||
                    template.category ||
                    "GENERAL";
                  const selected = template.id === campaignForm.template_id;
                  const rejectionReason =
                    template.rejection_reason ||
                    template.rejectionReason ||
                    template.rejection_message ||
                    "";
                  const actionLabel =
                    statusKey === "REJECTED" ? "Ver detalles" : "Previsualizar";
                  return (
                    <div
                      key={template.id}
                      className={`template-card ${selected ? "selected" : ""}`}
                    >
                      <div className="template-head">
                        <div className="template-name" title={template.name}>
                          {template.name}
                        </div>
                        <span className={`template-status ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                      </div>
                      <div className="template-category">{categoryLabel}</div>
                      <div
                        className={`template-preview ${
                          statusKey === "REJECTED" ? "rejected" : ""
                        }`}
                      >
                        {template.body_preview ||
                          template.body_text ||
                          "Sin preview"}
                      </div>
                      {statusKey === "REJECTED" && rejectionReason && (
                        <div className="template-rejection">
                          Rechazada por Meta: {rejectionReason}
                        </div>
                      )}
                      <div className="template-footer">
                        <button
                          className="template-action"
                          type="button"
                          onClick={() => handleTemplateSelect(template.id)}
                        >
                          {actionLabel}
                        </button>
                        <button
                          className="template-menu"
                          type="button"
                          aria-label="Mas opciones"
                        >
                          ...
                        </button>
                      </div>
                    </div>
                  );
                })}
                {!filteredTemplates.length && (
                  <div className="empty-state">Sin plantillas disponibles</div>
                )}
              </div>
            </section>
          )}

          {activeTab === "audiences" && (
            <section className="campaigns-panel audiences-panel">
              <div className="audiences-layout">
                <div className="audiences-list">
                  <label className="audiences-search">
                    <span className="template-search-icon" aria-hidden="true" />
                    <input
                      type="text"
                      placeholder="Buscar lista..."
                      value={audienceSearch}
                      onChange={(event) => setAudienceSearch(event.target.value)}
                    />
                  </label>
                  <div className="audience-list">
                    {filteredSegments.map((segment) => (
                      <button
                        key={segment.id}
                        type="button"
                        className={`audience-card ${
                          campaignFilter.tag === segment.name ? "active" : ""
                        }`}
                        onClick={() => {
                          if (segment.type === "odoo") {
                            openContactsModal();
                            return;
                          }
                          setCampaignFilter((prev) => ({
                            ...prev,
                            tag: segment.name,
                          }));
                        }}
                      >
                        <div className="audience-title">
                          <span>{segment.name}</span>
                          <span className="audience-count">{segment.count}</span>
                        </div>
                        <div className="audience-subtitle">{segment.subtitle}</div>
                      </button>
                    ))}
                    {!filteredSegments.length && (
                      <div className="empty-state">Sin audiencias disponibles</div>
                    )}
                  </div>
                </div>
                <div className="audiences-detail">
                  <div className="audiences-detail-header">
                    <div>
                      <div className="audiences-detail-title">Detalle de audiencia</div>
                      <div className="audiences-detail-subtitle">
                        {selectedSegment
                          ? "Resumen y acciones rápidas"
                          : "Selecciona una audiencia"}
                      </div>
                    </div>
                    <button
                      className="campaigns-ghost"
                      type="button"
                      onClick={openContactsModal}
                    >
                      Ver contactos
                    </button>
                  </div>
                  {selectedSegment ? (
                    <div className="audiences-detail-body">
                      <div className="audience-metric">
                        <div className="audience-metric-label">Contactos</div>
                        <div className="audience-metric-value">
                          {selectedSegment.count}
                        </div>
                      </div>
                      <div className="audience-metric">
                        <div className="audience-metric-label">Descripcion</div>
                        <div className="audience-metric-value">
                          {selectedSegment.subtitle}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="audiences-empty">
                      Selecciona una audiencia para ver su resumen.
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {activeTab === "new" && (
            <section className="campaigns-panel campaign-form-panel">
              <form
                className="campaigns-form"
                ref={formRef}
                onSubmit={onCreateCampaign}
              >
                <label className="campaigns-field">
                  <span>Nombre de Campaña</span>
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
                    {segments
                      .filter((segment) => segment.type !== "odoo")
                      .map((segment) => (
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
                  Lanzar Campaña
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
            </section>
          )}

          {activeTab === "history" && (
            <section className="campaigns-panel campaigns-history">
              <div className="campaigns-history-header">
                <div>
                  <div className="campaigns-history-title">Historial de Envíos</div>
                  <div className="campaigns-history-subtitle">Últimos 30 días</div>
                </div>
                <button
                  className="campaigns-link"
                  type="button"
                  onClick={onLoadCampaigns}
                >
                  Ver todo el historial
                </button>
              </div>
              <div className="history-table history-table--main">
                <div className="history-head">
                  <span>Campaña / Fecha</span>
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
                  <div className="empty-state">Sin Campañas registradas</div>
                )}
              </div>
              {selectedCampaignId && (
                <div className="campaigns-messages">
                  <div className="campaigns-history-title">Mensajes</div>
                  <div className="history-table history-table--messages">
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
          )}
            </>
          )}
        </div>
      </div>

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
    </section>
  );
}

export default CampaignsView;




