import React, { useMemo, useState, useEffect, useRef } from "react";
import { apiGet, apiPost, apiDelete, apiPut } from "../api";
import { useToast } from "./ToastProvider.jsx";

const STATUS_LABELS = {
  draft: "BORRADOR",
  scheduled: "PROGRAMADA",
  running: "ENVIANDO",
  sending: "ENVIANDO",
  completed: "FINALIZADA",
  sent: "FINALIZADA",
  paused: "PAUSADA",
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
    subtitle: "MÓDULO DE GESTIÓN Y CAMPAÑAS",
  },
  {
    id: "templates",
    label: "Biblioteca de Plantillas",
    title: "Biblioteca de Plantillas",
    subtitle: "Consulta y gestiona las plantillas de mensajes autorizadas por WhatsApp.",
  },
  {
    id: "new",
    label: "Campañas",
    title: "Campañas",
    subtitle: "Historial de envíos y difusión WhatsApp",
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
  history: "new",
  historial: "new",
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
  channels,
  selectedTemplate,
  statusOptions,
  onCreateCampaign,
  onLoadCampaigns,
  onLoadCampaignMessages,
  onSendCampaign,
  onUpdateCampaign,
  onDeleteCampaign,
  onResendCampaign,
  campaignsTotal,
  formatDate,
  brandName,
}) {
  const brandLabel = (brandName || "Perzivalh").trim();
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateCategory, setTemplateCategory] = useState("all");
  const [templatePreviewOpen, setTemplatePreviewOpen] = useState(false);
  const [templatePreviewTemplate, setTemplatePreviewTemplate] = useState(null);
  const [audienceSearch, setAudienceSearch] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [campaignSearch, setCampaignSearch] = useState("");
  const [campaignStatusFilter, setCampaignStatusFilter] = useState("all");
  const [campaignLaunchOpen, setCampaignLaunchOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [launchTemplateSearch, setLaunchTemplateSearch] = useState("");
  const [openCampaignMenuId, setOpenCampaignMenuId] = useState(null);
  const [campaignMenuPlacement, setCampaignMenuPlacement] = useState("down");
  const [openContactMenuId, setOpenContactMenuId] = useState(null);
  const [contactEditOpen, setContactEditOpen] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactEditForm, setContactEditForm] = useState({
    id: "",
    name: "",
    phone: "",
    email: "",
    vat: "",
  });
  const [campaignScheduleMode, setCampaignScheduleMode] = useState(
    campaignForm.send_now === false || campaignForm.scheduled_for ? "schedule" : "now"
  );
  const [campaignPage, setCampaignPage] = useState(1);
  const [campaignPageSize] = useState(6);
  const { pushToast } = useToast();
  const formRef = useRef(null);
  const [audienceFlowOpen, setAudienceFlowOpen] = useState(false);
  const [audienceFlowTab, setAudienceFlowTab] = useState("dynamic");
  const audienceFlowTabs = useMemo(
    () =>
      AUDIENCE_FLOW_TABS.map((tab) => ({
        ...tab,
        subtitle: tab.subtitle.replace(/Perzivalh/g, brandLabel),
      })),
    [brandLabel]
  );
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
  const [odooSyncResult, setOdooSyncResult] = useState(null);
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

  const [odooStats, setOdooStats] = useState(null);
  const [selectedAudienceId, setSelectedAudienceId] = useState(null);
  const [audienceContacts, setAudienceContacts] = useState([]);
  const [audienceContactsTotal, setAudienceContactsTotal] = useState(0);
  const [audienceContactsLoading, setAudienceContactsLoading] = useState(false);
  const [audienceContactSearch, setAudienceContactSearch] = useState("");
  const [selectedContactKeys, setSelectedContactKeys] = useState(new Set());
  const [bulkTargetAudienceId, setBulkTargetAudienceId] = useState("");
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [audiencePage, setAudiencePage] = useState(1);
  const [audiencePageSize] = useState(10);
  const [audienceFilters, setAudienceFilters] = useState({
    tag: "Todas",
    date: "Cualquier fecha",
    status: "Activos",
  });
  const [openAudienceMenuId, setOpenAudienceMenuId] = useState(null);
  const selectAllRef = useRef(null);
  const availableLines = useMemo(
    () => (channels || []).filter((channel) => channel?.phone_number_id),
    [channels]
  );
  const [selectedLineId, setSelectedLineId] = useState("");
  const selectedLine = useMemo(
    () =>
      availableLines.find((line) => line.phone_number_id === selectedLineId) ||
      availableLines[0] ||
      null,
    [availableLines, selectedLineId]
  );
  const selectedLineLabel =
    selectedLine?.display_name || selectedLine?.phone_number_id || "";

  useEffect(() => {
    const nextMode =
      campaignForm.send_now === false || campaignForm.scheduled_for ? "schedule" : "now";
    setCampaignScheduleMode(nextMode);
  }, [campaignForm.send_now, campaignForm.scheduled_for]);

  // Custom segments from API
  const [customSegments, setCustomSegments] = useState([]);

  // Load segments on mount
  useEffect(() => {
    loadSegments();
    loadOdooStats();
  }, []);

  useEffect(() => {
    if (!selectedLineId && availableLines.length) {
      setSelectedLineId(availableLines[0].phone_number_id);
    }
  }, [availableLines, selectedLineId]);

  useEffect(() => {
    if (!audienceFlowOpen) return;
    loadAutomationSettings();
    loadDynamicAudiences();
    loadOdooStatus();
  }, [audienceFlowOpen, selectedLineId]);

  useEffect(() => {
    if (activeTab !== "new" || campaignLaunchOpen) {
      return undefined;
    }
    const handler = setTimeout(() => {
      setCampaignPage(1);
      onLoadCampaigns(1, campaignPageSize, campaignSearch.trim());
    }, 350);
    return () => clearTimeout(handler);
  }, [campaignSearch, campaignPageSize, campaignLaunchOpen, activeTab, onLoadCampaigns]);

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
      const res = await apiGet("/api/audiences?with_counts=true");
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
      const query = selectedLine?.phone_number_id
        ? `?phone_number_id=${encodeURIComponent(selectedLine.phone_number_id)}`
        : "";
      const res = await apiGet(`/api/audiences/automation-settings${query}`);
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
      const params = new URLSearchParams();
      if (selectedLine?.phone_number_id) {
        params.set("phone_number_id", selectedLine.phone_number_id);
      }
      if (selectedLineLabel) {
        params.set("line_name", selectedLineLabel);
      }
      const query = params.toString();
      const res = await apiGet(`/api/audiences/dynamic-tags${query ? `?${query}` : ""}`);
      setDynamicAudiences(res?.items || []);
    } catch (err) {
      console.error("Failed to load dynamic audiences", err);
    } finally {
      setDynamicLoading(false);
    }
  }

  async function handleSaveAutomation(nextEnabled = automationSettings.enabled) {
    try {
      const res = await apiPost("/api/audiences/automation-settings", {
        enabled: nextEnabled,
        phone_number_id: selectedLine?.phone_number_id || null,
        line_name: selectedLineLabel || null,
      });
      setAutomationSettings(res?.settings || { ...automationSettings, enabled: nextEnabled });
      pushToast({ message: "Configuración guardada" });
    } catch (err) {
      pushToast({ type: "error", message: err.message || "No se pudo guardar" });
    }
  }

  async function handleToggleAutomation(nextEnabled) {
    setAutomationSettings((prev) => ({ ...prev, enabled: nextEnabled }));
    await handleSaveAutomation(nextEnabled);
  }

  async function handleSyncHistorical() {
    setSyncingDynamic(true);
    try {
      await apiPost("/api/audiences/sync-historical", {
        phone_number_id: selectedLine?.phone_number_id || null,
        line_name: selectedLineLabel || null,
      });
      await loadDynamicAudiences();
      await loadSegments();
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
      await apiPost("/api/audiences/dynamic-tags", {
        name,
        phone_number_id: selectedLine?.phone_number_id || null,
        line_name: selectedLineLabel || null,
      });
      setNewTagName("");
      await loadDynamicAudiences();
      await loadSegments();
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
    setOdooSyncResult(null);
    try {
      const res = await apiPost("/api/contacts/refresh-odoo", {});
      setOdooSyncResult(res || null);
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

  function handleClearImportFile() {
    setImportFile(null);
    setImportFileBase64("");
    setImportPreview(null);
    setImportMapping([]);
    setImportSummary(null);
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
          phoneNumberId: selectedLine?.phone_number_id || null,
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

  async function loadAudienceContacts(segment, options = {}) {
    if (!segment) {
      setAudienceContacts([]);
      setAudienceContactsTotal(0);
      return;
    }
    const page = options.page || 1;
    const search = options.search || "";
    setAudienceContactsLoading(true);
    try {
      if (segment.type === "odoo") {
        const offset = (page - 1) * audiencePageSize;
        const res = await apiGet(
          `/api/contacts?search=${encodeURIComponent(search)}&offset=${offset}&limit=${audiencePageSize}`
        );
        let contacts = res?.contacts || [];
        if (audienceFilters.tag !== "Todas") {
          contacts = contacts.filter((contact) => {
            const tags = contact.tags_json || [];
            if (audienceFilters.tag === "Con etiquetas") {
              return Array.isArray(tags) && tags.length > 0;
            }
            if (audienceFilters.tag === "Sin etiquetas") {
              return !Array.isArray(tags) || tags.length === 0;
            }
            return true;
          });
        }
        if (audienceFilters.status !== "Activos") {
          contacts = contacts.filter((contact) => {
            const status = (contact.status || "ACTIVO").toUpperCase();
            return audienceFilters.status === "Activos"
              ? status === "ACTIVO"
              : status !== "ACTIVO";
          });
        }
        setAudienceContacts(contacts);
        setAudienceContactsTotal(res?.total || contacts.length);
        return;
      }

      const limit = search ? 1000 : 200;
      const preview = await apiGet(
        `/api/audiences/${segment.id}/preview?limit=${limit}`
      );
      const recipients = preview?.recipients || [];
      const query = search.trim().toLowerCase();
      let filtered = !query
        ? recipients
        : recipients.filter((recipient) => {
            const name = recipient.name?.toLowerCase() || "";
            const phone = recipient.phone_e164?.toLowerCase() || "";
            return name.includes(query) || phone.includes(query);
          });
      if (audienceFilters.tag === "Sin etiquetas") {
        filtered = filtered.filter((recipient) => !recipient.tags || recipient.tags.length === 0);
      }
      const total = query ? filtered.length : preview?.total || filtered.length;
      const start = (page - 1) * audiencePageSize;
      const paged = filtered.slice(start, start + audiencePageSize);
      setAudienceContacts(paged);
      setAudienceContactsTotal(total);
    } catch (err) {
      console.error("Failed to load audience contacts", err);
      setAudienceContacts([]);
      setAudienceContactsTotal(0);
    } finally {
      setAudienceContactsLoading(false);
    }
  }

  function handleSelectAudience(segment) {
    setSelectedAudienceId(segment?.id || null);
    setAudiencePage(1);
    setSelectedContactKeys(new Set());
    setBulkTargetAudienceId("");
  }

  async function handleRefreshAudienceCounts() {
    try {
      await apiPost("/api/audiences/refresh-counts", {});
      await loadSegments();
      if (selectedAudience) {
        await loadAudienceContacts(selectedAudience, {
          page: audiencePage,
          search: audienceContactSearch,
        });
      }
      pushToast({ message: "Conteos actualizados" });
    } catch (err) {
      pushToast({ type: "error", message: err.message || "No se pudo actualizar" });
    }
  }

  async function handleDeleteAudience(segment) {
    if (!segment || segment.type === "odoo" || segment.isDefault) return;
    const confirmed = window.confirm(
      `¿Eliminar la audiencia "${segment.name}"? Esta acción la desactiva y no borra contactos.`
    );
    if (!confirmed) return;
    try {
      await apiDelete(`/api/audiences/${segment.id}`);
      await loadSegments();
      if (selectedAudienceId === segment.id) {
        setSelectedAudienceId(null);
      }
      setOpenAudienceMenuId(null);
      pushToast({ message: "Audiencia eliminada" });
    } catch (err) {
      pushToast({ type: "error", message: err.message || "No se pudo eliminar" });
    }
  }

  async function handleRenameAudience(segment) {
    if (!segment || segment.type === "odoo" || segment.isDefault) return;
    const nextName = window.prompt("Nuevo nombre de la audiencia:", segment.name);
    if (!nextName || !nextName.trim()) return;
    try {
      await apiPut(`/api/audiences/${segment.id}`, { name: nextName.trim() });
      await loadSegments();
      setOpenAudienceMenuId(null);
      pushToast({ message: "Audiencia renombrada" });
    } catch (err) {
      pushToast({ type: "error", message: err.message || "No se pudo renombrar" });
    }
  }

  function cycleAudienceFilter(key, options) {
    setAudienceFilters((prev) => {
      const current = prev[key];
      const index = options.indexOf(current);
      const nextValue = options[(index + 1) % options.length];
      return { ...prev, [key]: nextValue };
    });
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

    const apiSegments = customSegments.map((seg) => ({
      id: seg.id,
      name: seg.name,
      subtitle: seg.description || "Segmento personalizado",
      count: seg.estimated_count || 0,
      type: "segment",
      isDefault: (seg.name || "").toUpperCase().startsWith("DEFAULT"),
      rules: seg.rules_json,
      tagName: Array.isArray(seg.rules_json)
        ? seg.rules_json.find(
            (rule) => (rule.type || rule.field) === "tag" && rule.value
          )?.value || ""
        : "",
    }));

    return [odooSegment, ...apiSegments];
  }, [customSegments, odooStats]);

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

  const selectedAudience = useMemo(() => {
    return segments.find((segment) => segment.id === selectedAudienceId);
  }, [segments, selectedAudienceId]);

  const parseTemplateButtons = (template) => {
    const raw = template?.buttons_json ?? template?.buttons ?? [];
    if (Array.isArray(raw)) {
      return raw;
    }
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        return [];
      }
    }
    return [];
  };

  const previewButtons = useMemo(
    () => parseTemplateButtons(selectedTemplate),
    [selectedTemplate]
  );

  const templatePreviewButtons = useMemo(
    () => parseTemplateButtons(templatePreviewTemplate),
    [templatePreviewTemplate]
  );

  const audienceTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(audienceContactsTotal / audiencePageSize));
  }, [audienceContactsTotal, audiencePageSize]);

  const audiencePages = useMemo(() => {
    const pages = [];
    const start = Math.max(1, audiencePage - 1);
    const end = Math.min(audienceTotalPages, start + 2);
    for (let i = start; i <= end; i += 1) {
      pages.push(i);
    }
    return pages;
  }, [audiencePage, audienceTotalPages]);

  const normalizeCampaignStatus = (status) => {
    if (status === "sent") return "completed";
    if (status === "sending") return "running";
    return status || "";
  };

  const campaignStatusBuckets = useMemo(() => {
    const buckets = {
      all: campaigns.length,
      completed: 0,
      scheduled: 0,
      draft: 0,
      failed: 0,
      running: 0,
    };
    campaigns.forEach((item) => {
      const status = normalizeCampaignStatus(item.status);
      if (status === "completed") buckets.completed += 1;
      if (status === "scheduled") buckets.scheduled += 1;
      if (status === "draft") buckets.draft += 1;
      if (status === "failed") buckets.failed += 1;
      if (status === "running") buckets.running += 1;
    });
    return buckets;
  }, [campaigns]);

  const filteredCampaigns = useMemo(() => {
    const query = campaignSearch.trim().toLowerCase();
    return campaigns.filter((campaign) => {
      const matchesSearch = !query || (campaign.name || "").toLowerCase().includes(query);
      const normalizedStatus = normalizeCampaignStatus(campaign.status);
      const matchesStatus =
        campaignStatusFilter === "all" || normalizedStatus === campaignStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [campaigns, campaignSearch, campaignStatusFilter]);

  const campaignPages = useMemo(() => {
    const pages = [];
    const totalCount = campaignsTotal || campaigns.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / campaignPageSize));
    const start = Math.max(1, campaignPage - 1);
    const end = Math.min(totalPages, start + 2);
    for (let i = start; i <= end; i += 1) {
      pages.push(i);
    }
    return { pages, totalPages };
  }, [campaignsTotal, campaigns.length, campaignPage, campaignPageSize]);

  useEffect(() => {
    if (activeTab !== "audiences") return;
    if (!selectedAudienceId && segments.length) {
      setSelectedAudienceId(segments[0].id);
    }
  }, [segments, activeTab, selectedAudienceId]);

  useEffect(() => {
    if (activeTab !== "new" && campaignLaunchOpen) {
      setCampaignLaunchOpen(false);
      setEditingCampaign(null);
      resetCampaignDraft();
    }
  }, [activeTab, campaignLaunchOpen]);

  useEffect(() => {
    if (activeTab !== "audiences") return undefined;
    const handler = setTimeout(() => {
      loadAudienceContacts(selectedAudience, {
        page: audiencePage,
        search: audienceContactSearch,
      });
    }, 300);
    return () => clearTimeout(handler);
  }, [
    selectedAudienceId,
    audiencePage,
    audienceContactSearch,
    activeTab,
    selectedAudience,
    audienceFilters,
  ]);

  useEffect(() => {
    setSelectedContactKeys(new Set());
    setBulkTargetAudienceId("");
  }, [selectedAudienceId]);

  const selectableContacts = useMemo(
    () =>
      audienceContacts.filter(
        (contact) => contact.conversation_id || contact.conversationId
      ),
    [audienceContacts]
  );

  const selectedContacts = useMemo(() => {
    const map = new Map(
      audienceContacts.map((contact) => [
        contact.conversation_id || contact.conversationId || "",
        contact,
      ])
    );
    return Array.from(selectedContactKeys)
      .map((key) => map.get(key))
      .filter(Boolean);
  }, [audienceContacts, selectedContactKeys]);

  const currentAudienceTagName = selectedAudience?.tagName || "";
  const tagSegments = useMemo(
    () => segments.filter((segment) => segment.tagName),
    [segments]
  );
  const targetSegment = tagSegments.find((segment) => segment.id === bulkTargetAudienceId);
  const targetTagName = targetSegment?.tagName || "";

  useEffect(() => {
    if (!selectAllRef.current) {
      return;
    }
    const totalSelectable = selectableContacts.length;
    const selectedCount = selectedContactKeys.size;
    selectAllRef.current.indeterminate =
      selectedCount > 0 && selectedCount < totalSelectable;
  }, [selectableContacts.length, selectedContactKeys]);

  function toggleSelectAllContacts(checked) {
    if (!checked) {
      setSelectedContactKeys(new Set());
      return;
    }
    const next = new Set(
      selectableContacts.map(
        (contact) => contact.conversation_id || contact.conversationId || ""
      )
    );
    setSelectedContactKeys(next);
  }

  function toggleSelectContact(contact) {
    const key = contact.conversation_id || contact.conversationId || "";
    if (!key) {
      return;
    }
    setSelectedContactKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function handleBulkAction(action) {
    if (!selectedContacts.length || bulkActionLoading) return;
    const targetNeeded = action === "add" || action === "move";
    if (targetNeeded && !targetTagName) {
      pushToast({ type: "error", message: "Selecciona una audiencia destino válida." });
      return;
    }
    if ((action === "remove" || action === "move") && !currentAudienceTagName) {
      pushToast({
        type: "error",
        message: "La audiencia actual no permite quitar contactos.",
      });
      return;
    }
    if (targetTagName && targetTagName === currentAudienceTagName && action !== "remove") {
      pushToast({
        type: "error",
        message: "La audiencia destino debe ser diferente a la actual.",
      });
      return;
    }

    const toProcess = selectedContacts
      .map((contact) => ({
        contact,
        conversationId: contact.conversation_id || contact.conversationId || "",
      }))
      .filter((item) => item.conversationId);
    const skipped = selectedContacts.length - toProcess.length;

    if (!toProcess.length) {
      pushToast({
        type: "error",
        message: "No hay contactos compatibles para esta acción.",
      });
      return;
    }

    setBulkActionLoading(true);
    try {
      await Promise.all(
        toProcess.map(({ conversationId }) =>
          apiPost(`/api/conversations/${conversationId}/tags`, {
            add:
              action === "add" || action === "move"
                ? [targetTagName]
                : [],
            remove:
              action === "remove" || action === "move"
                ? [currentAudienceTagName]
                : [],
          })
        )
      );
      if (skipped) {
        pushToast({
          type: "error",
          message: `${skipped} contacto(s) no se pudieron actualizar.`,
        });
      }
      setSelectedContactKeys(new Set());
      setBulkTargetAudienceId("");
      await loadSegments();
      await loadAudienceContacts(selectedAudience, {
        page: audiencePage,
        search: audienceContactSearch,
      });
      pushToast({ message: "Cambios aplicados correctamente." });
    } catch (error) {
      pushToast({ type: "error", message: error.message || "No se pudo actualizar." });
    } finally {
      setBulkActionLoading(false);
    }
  }

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

  const filteredLaunchTemplates = useMemo(() => {
    const query = launchTemplateSearch.trim().toLowerCase();
    return (templates || []).filter((template) => {
      const name = template.name?.toLowerCase() || "";
      return !query || name.includes(query);
    });
  }, [launchTemplateSearch, templates]);

  const selectedSegment = useMemo(() => {
    if (campaignFilter.segment_id) {
      return segments.find((segment) => segment.id === campaignFilter.segment_id) || null;
    }
    if (campaignFilter.tag) {
      return segments.find((segment) => segment.name === campaignFilter.tag) || null;
    }
    return null;
  }, [segments, campaignFilter.segment_id, campaignFilter.tag]);

  const audienceValue = useMemo(() => {
    if (campaignFilter.segment_id) {
      return `segment:${campaignFilter.segment_id}`;
    }
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
  }, [
    campaignFilter.segment_id,
    campaignFilter.tag,
    campaignFilter.assigned_user_id,
    campaignFilter.status,
    campaignFilter.verified_only,
  ]);

  function handleAudienceChange(value) {
    setCampaignFilter((prev) => {
      const next = {
        ...prev,
        status: "",
        tag: "",
        assigned_user_id: "",
        verified_only: false,
        segment_id: "",
        segment_name: "",
      };
      if (value.startsWith("segment:")) {
        const segmentId = value.slice(8);
        const segment = segments.find((item) => item.id === segmentId);
        next.segment_id = segmentId;
        next.segment_name = segment?.name || "";
      } else if (value.startsWith("tag:")) {
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

  function formatDateTimeLocal(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (num) => String(num).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function handleTemplateSelect(templateId) {
    setCampaignForm((prev) => ({
      ...prev,
      template_id: templateId,
    }));
  }

  function resetCampaignDraft() {
    setCampaignForm({
      name: "",
      template_id: "",
      scheduled_for: "",
      send_now: true,
    });
    setCampaignFilter({
      status: "",
      tag: "",
      assigned_user_id: "",
      verified_only: false,
      segment_id: "",
      segment_name: "",
    });
    setLaunchTemplateSearch("");
  }

  function handleEditCampaign(campaign) {
    if (!campaign) return;
    setEditingCampaign(campaign);
    setCampaignLaunchOpen(true);
    setLaunchTemplateSearch("");
    setCampaignForm((prev) => ({
      ...prev,
      name: campaign.name || "",
      template_id: campaign.template_id || campaign.template?.id || "",
      scheduled_for: formatDateTimeLocal(campaign.scheduled_for || campaign.scheduled_at),
      send_now: !(campaign.scheduled_for || campaign.scheduled_at),
    }));
    const filter = campaign.audience_filter || {};
    const segmentId = filter.segment_id || campaign.segment_id || "";
    const segmentName = filter.segment_name || campaign.segment?.name || "";
    setCampaignFilter((prev) => ({
      ...prev,
      status: filter.status || "",
      tag: filter.tag || "",
      assigned_user_id: filter.assigned_user_id || "",
      verified_only: Boolean(filter.verified_only),
      segment_id: segmentId,
      segment_name: segmentName,
    }));
  }

  function handleDeleteCampaignClick(campaign) {
    if (!campaign?.id || !onDeleteCampaign) return;
    const confirmed = window.confirm(`¿Eliminar la campaña "${campaign.name}"?`);
    if (!confirmed) return;
    onDeleteCampaign(campaign.id);
  }

  function handleResendCampaignClick(campaign) {
    if (!campaign?.id || !onResendCampaign) return;
    const confirmed = window.confirm(`¿Reenviar la campaña "${campaign.name}"?`);
    if (!confirmed) return;
    onResendCampaign(campaign.id);
  }

  function toggleCampaignMenu(id, event) {
    setOpenCampaignMenuId((prev) => (prev === id ? null : id));
    if (event?.currentTarget && typeof window !== "undefined") {
      const rect = event.currentTarget.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const prefersUp = spaceBelow < 180 && spaceAbove > spaceBelow;
      setCampaignMenuPlacement(prefersUp ? "up" : "down");
    }
  }

  function toggleContactMenu(id) {
    setOpenContactMenuId((prev) => (prev === id ? null : id));
  }

  function handleOpenContactEdit(contact) {
    if (!contact?.id) {
      return;
    }
    setContactEditForm({
      id: contact.id,
      name: contact.name || "",
      phone: contact.phone_e164 || contact.phone || "",
      email: contact.email || "",
      vat: contact.vat || "",
    });
    setContactEditOpen(true);
    setOpenContactMenuId(null);
  }

  async function handleSaveContact(event) {
    event.preventDefault();
    if (!contactEditForm.id) {
      return;
    }
    setContactSaving(true);
    try {
      const result = await apiPut(`/api/contacts/${contactEditForm.id}`, {
        name: contactEditForm.name,
        phone: contactEditForm.phone,
        email: contactEditForm.email,
        vat: contactEditForm.vat,
      });
      if (result?.contact) {
        setAudienceContacts((prev) =>
          prev.map((item) => (item.id === result.contact.id ? result.contact : item))
        );
      }
      setContactEditOpen(false);
      pushToast({ message: "Contacto actualizado" });
      await loadAudienceContacts(selectedAudience, {
        page: audiencePage,
        search: audienceContactSearch,
      });
    } catch (err) {
      pushToast({ type: "error", message: err.message || "No se pudo actualizar" });
    } finally {
      setContactSaving(false);
    }
  }

  async function handleDeleteContact(contact) {
    if (!contact?.id) {
      return;
    }
    const confirmed = window.confirm(`¿Eliminar el contacto "${contact.name || contact.phone_e164 || "Sin nombre"}"?`);
    if (!confirmed) {
      return;
    }
    try {
      await apiDelete(`/api/contacts/${contact.id}`);
      setAudienceContacts((prev) => prev.filter((item) => item.id !== contact.id));
      setOpenContactMenuId(null);
      pushToast({ message: "Contacto eliminado" });
      await loadAudienceContacts(selectedAudience, {
        page: audiencePage,
        search: audienceContactSearch,
      });
    } catch (err) {
      pushToast({ type: "error", message: err.message || "No se pudo eliminar" });
    }
  }

  function handleSubmitCampaign(event) {
    event.preventDefault();
    if (!campaignForm.name.trim() || !campaignForm.template_id) {
      return;
    }
    const filter = {};
    if (campaignFilter.status) {
      filter.status = campaignFilter.status;
    }
    if (campaignFilter.tag) {
      filter.tag = campaignFilter.tag.trim();
    }
    if (campaignFilter.assigned_user_id) {
      filter.assigned_user_id = campaignFilter.assigned_user_id;
    }
    if (campaignFilter.verified_only) {
      filter.verified_only = true;
    }
    if (campaignFilter.segment_id) {
      filter.segment_id = campaignFilter.segment_id;
      if (campaignFilter.segment_name) {
        filter.segment_name = campaignFilter.segment_name;
      }
    }
    if (editingCampaign && onUpdateCampaign) {
      onUpdateCampaign(editingCampaign.id, {
        name: campaignForm.name.trim(),
        template_id: campaignForm.template_id,
        segment_id: campaignFilter.segment_id || null,
        audience_filter: filter,
        scheduled_for: campaignForm.scheduled_for || null,
      });
      setCampaignLaunchOpen(false);
      setEditingCampaign(null);
      resetCampaignDraft();
      return;
    }
    onCreateCampaign(event);
  }

  function handleTemplatePreview(template) {
    setTemplatePreviewTemplate(template);
    setTemplatePreviewOpen(true);
  }

  const activeTabMeta =
    CAMPAIGN_TABS.find((tab) => tab.id === activeTab) || CAMPAIGN_TABS[1];
  const campaignLaunchMeta = {
    title: "Campañas",
    subtitle: "CONFIGURACIÓN DE NUEVO ENVÍO MASIVO",
  };
  const activeAudienceMeta =
    audienceFlowTabs.find((tab) => tab.id === audienceFlowTab) ||
    audienceFlowTabs[0];
  const headerMeta = audienceFlowOpen
    ? activeAudienceMeta
    : activeTab === "new" && campaignLaunchOpen
      ? campaignLaunchMeta
      : activeTabMeta;

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
                  {"<"}
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
                <button
                  className="campaigns-primary campaigns-primary--dropdown"
                  type="button"
                  onClick={() => {
                    setAudienceFlowOpen(true);
                    setAudienceFlowTab("dynamic");
                  }}
                >
                  <span className="campaigns-primary-icon">+</span>
                  Nueva Audiencia
                </button>
            )}
            {!audienceFlowOpen && activeTab === "new" && (
              <>
                {campaignLaunchOpen ? (
                  <>
                    <button
                      className="campaigns-ghost"
                      type="button"
                      onClick={() => {
                        setCampaignLaunchOpen(false);
                        setEditingCampaign(null);
                        resetCampaignDraft();
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      className="campaigns-primary"
                      type="button"
                      onClick={() => formRef.current?.requestSubmit?.()}
                    >
                      {editingCampaign ? "Guardar cambios" : "Lanzar Campaña"}
                    </button>
                  </>
                ) : (
                  <button
                    className="campaigns-primary"
                    type="button"
                    onClick={() => setCampaignLaunchOpen(true)}
                  >
                    + Lanzar Campaña
                  </button>
                )}
              </>
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
                        <div className="audience-line-picker">
                          <span>Línea activa</span>
                          <select
                            value={selectedLine?.phone_number_id || ""}
                            onChange={(event) => setSelectedLineId(event.target.value)}
                            disabled={!availableLines.length}
                          >
                            {!availableLines.length && (
                              <option value="">Sin líneas registradas</option>
                            )}
                            {availableLines.map((line) => (
                              <option key={line.id} value={line.phone_number_id}>
                                {line.display_name || line.phone_number_id}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <label className="audience-switch">
                        <span>Estado</span>
                        <input
                          type="checkbox"
                          checked={automationSettings.enabled}
                          onChange={(event) => handleToggleAutomation(event.target.checked)}
                          disabled={loadingAutomation || !availableLines.length}
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
                                  ? item.segment?.name || "DEFAULT"
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
                    {!importFile ? (
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
                        </div>
                      </div>
                    ) : (
                      <div className="excel-file-panel">
                        <div>
                          <div className="excel-file-title">Archivo cargado</div>
                          <div className="excel-file-name">{importFile.name}</div>
                        </div>
                        <div className="excel-file-actions">
                          <label className="excel-link">
                            Cambiar archivo
                            <input
                              type="file"
                              accept=".csv,.xlsx"
                              onChange={handleFileSelect}
                            />
                          </label>
                          <button
                            className="campaigns-danger"
                            type="button"
                            onClick={handleClearImportFile}
                          >
                            Eliminar archivo
                          </button>
                        </div>
                      </div>
                    )}

                    {importFile ? (
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
                    ) : (
                      <div className="excel-placeholder">
                        <div className="excel-placeholder-title">
                          Agrega un archivo para continuar
                        </div>
                        <div className="excel-placeholder-subtitle">
                          Luego podrás mapear todas las columnas a los campos del CRM.
                        </div>
                      </div>
                    )}
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
                    {odooSyncResult && (
                      <div className="odoo-summary">
                        <div className="odoo-summary-title">Resultado de sincronización</div>
                        <div className="odoo-summary-metrics">
                          <span>Añadidos: {odooSyncResult.created || 0}</span>
                          <span>Actualizados: {odooSyncResult.updated || 0}</span>
                          <span>Omitidos: {odooSyncResult.skipped || 0}</span>
                        </div>
                        {odooSyncResult.preview?.created?.length ? (
                          <div className="odoo-preview">
                            <div className="odoo-preview-title">Contactos añadidos</div>
                            <ul>
                              {odooSyncResult.preview.created.map((contact) => (
                                <li key={`${contact.phone_e164 || contact.name}-${contact.id || ""}`}>
                                  <strong>{contact.name || "Sin nombre"}</strong>{" "}
                                  <span>{contact.phone_e164 || ""}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          ) : (
            <>
          {activeTab === "templates" && (
            <section className="campaigns-panel templates-panel">
              <div className="templates-toolbar">
                <label className="templates-search ui-search">
                  <span className="template-search-icon ui-search-icon" aria-hidden="true" />
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
                          onClick={() => handleTemplatePreview(template)}
                        >
                          {actionLabel}
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
                  <label className="audiences-search ui-search">
                    <span className="template-search-icon ui-search-icon" aria-hidden="true" />
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
                          selectedAudienceId === segment.id ? "active" : ""
                        }`}
                        onClick={() => handleSelectAudience(segment)}
                      >
                        <div className="audience-title">
                          <span>{segment.name}</span>
                          <div className="audience-title-actions">
                            <span className="audience-count">
                              {segment.count?.toLocaleString("es-PE") || 0}
                            </span>
                        {!segment.isDefault && segment.type !== "odoo" && (
                          <div className="audience-menu-wrapper">
                            <button
                              className="audience-menu"
                              type="button"
                              aria-label="Opciones de audiencia"
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenAudienceMenuId((prev) =>
                                  prev === segment.id ? null : segment.id
                                );
                              }}
                            >
                              ...
                            </button>
                            {openAudienceMenuId === segment.id && (
                              <div className="audience-menu-dropdown">
                                <button
                                  type="button"
                                  onClick={() => handleRenameAudience(segment)}
                                >
                                  Renombrar
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() => handleDeleteAudience(segment)}
                                >
                                  Eliminar
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                          </div>
                        </div>
                        <div className="audience-subtitle">{segment.subtitle}</div>
                      </button>
                    ))}
                    {!filteredSegments.length && (
                      <div className="empty-state">Sin audiencias disponibles</div>
                    )}
                  </div>
                </div>
                <div className="audiences-table-panel">
                    <div className="audiences-filters">
                      <div className="audiences-filter">
                        <span>ETIQUETA:</span>
                        <button
                          className="audiences-filter-chip"
                          type="button"
                          onClick={() =>
                            cycleAudienceFilter("tag", [
                              "Todas",
                              "Con etiquetas",
                              "Sin etiquetas",
                            ])
                          }
                        >
                          {audienceFilters.tag}
                        </button>
                      </div>
                      <div className="audiences-filter">
                        <span>FECHA:</span>
                        <button
                          className="audiences-filter-chip"
                          type="button"
                          onClick={() =>
                            cycleAudienceFilter("date", [
                              "Cualquier fecha",
                              "Últimos 30 días",
                            ])
                          }
                        >
                          {audienceFilters.date}
                        </button>
                      </div>
                      <div className="audiences-filter">
                        <span>ESTADO:</span>
                        <button
                          className="audiences-filter-chip"
                          type="button"
                          onClick={() =>
                            cycleAudienceFilter("status", ["Activos", "Inactivos"])
                          }
                        >
                          {audienceFilters.status}
                        </button>
                      </div>
                    <div className="audiences-filter-actions">
                      <button
                        className="audiences-icon-btn"
                        type="button"
                        aria-label="Descargar"
                      >
                        {"\u2193"}
                      </button>
                      <button
                        className="audiences-icon-btn"
                        type="button"
                        aria-label="Actualizar"
                        onClick={handleRefreshAudienceCounts}
                      >
                        {"\u21bb"}
                      </button>
                    </div>
                  </div>
                  <div className="audiences-search-row">
                    <label className="audiences-search-field ui-search">
                      <span className="template-search-icon ui-search-icon" aria-hidden="true" />
                      <input
                        type="text"
                        placeholder="Buscar contacto en esta lista..."
                        value={audienceContactSearch}
                        onChange={(event) => {
                          setAudienceContactSearch(event.target.value);
                          setAudiencePage(1);
                        }}
                      />
                    </label>
                    <div className="audiences-total">
                      {audienceContactsTotal.toLocaleString("es-PE")} contactos en total
                    </div>
                  </div>
                  <div className="audiences-bulk">
                    <div className="audiences-bulk-info">
                      {selectedContacts.length} seleccionados
                    </div>
                    <select
                      className="audiences-bulk-select"
                      value={bulkTargetAudienceId}
                      onChange={(event) => setBulkTargetAudienceId(event.target.value)}
                    >
                      <option value="">Selecciona audiencia destino...</option>
                      {tagSegments.map((segment) => (
                        <option key={`bulk-${segment.id}`} value={segment.id}>
                          {segment.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="audiences-bulk-btn"
                      type="button"
                      disabled={
                        bulkActionLoading ||
                        !selectedContacts.length ||
                        !targetTagName ||
                        targetTagName === currentAudienceTagName
                      }
                      onClick={() => handleBulkAction("add")}
                    >
                      Añadir
                    </button>
                    <button
                      className="audiences-bulk-btn"
                      type="button"
                      disabled={
                        bulkActionLoading ||
                        !selectedContacts.length ||
                        !targetTagName ||
                        targetTagName === currentAudienceTagName
                      }
                      onClick={() => handleBulkAction("move")}
                    >
                      Mover
                    </button>
                    <button
                      className="audiences-bulk-btn danger"
                      type="button"
                      disabled={bulkActionLoading || !selectedContacts.length || !currentAudienceTagName}
                      onClick={() => handleBulkAction("remove")}
                    >
                      Eliminar
                    </button>
                  </div>
                  {selectedAudience?.type === "odoo" && (
                    <div className="audiences-bulk-note">
                      Las acciones masivas solo aplican a contactos con conversación de WhatsApp.
                    </div>
                  )}
                  <div className="audiences-table">
                    <div className="audiences-table-head">
                      <span>
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          aria-label="Seleccionar todos"
                          checked={
                            selectableContacts.length > 0 &&
                            selectedContactKeys.size === selectableContacts.length
                          }
                          onChange={(event) => toggleSelectAllContacts(event.target.checked)}
                        />
                      </span>
                      <span>CONTACTO</span>
                      <span>WHATSAPP</span>
                      <span>ETIQUETAS</span>
                      <span>FECHA REGISTRO</span>
                      <span>ESTADO</span>
                      <span />
                    </div>
                    {audienceContactsLoading && (
                      <div className="loading">Cargando contactos...</div>
                    )}
                    {!audienceContactsLoading && audienceContacts.length === 0 && (
                      <div className="empty-state">No hay contactos en esta audiencia.</div>
                    )}
                    {!audienceContactsLoading &&
                      audienceContacts.map((contact) => {
                        const contactName = contact.name || "Sin nombre";
                        const contactEmail = contact.email || "";
                        const contactPhone = contact.phone_e164 || contact.phone || "-";
                        const contactTags = Array.isArray(contact.tags)
                          ? contact.tags
                          : contact.tags
                            ? [contact.tags]
                            : [];
                        const initials = (contactName || "?").trim().slice(0, 1).toUpperCase();
                        const contactKey =
                          contact.conversation_id || contact.conversationId || "";
                        return (
                          <div className="audiences-table-row" key={contact.id || contactPhone}>
                            <input
                              type="checkbox"
                              aria-label="Seleccionar contacto"
                              checked={selectedContactKeys.has(contactKey)}
                              onChange={() => toggleSelectContact(contact)}
                              disabled={!contactKey}
                            />
                            <div className="audiences-contact">
                              <div className="audiences-avatar">{initials}</div>
                              <div className="audiences-contact-info">
                                <div className="audiences-contact-name">{contactName}</div>
                                {contactEmail && (
                                  <div className="audiences-contact-email">{contactEmail}</div>
                                )}
                              </div>
                            </div>
                            <div>{contactPhone}</div>
                            <div className="audiences-tags">
                              {contactTags.length ? (
                                contactTags.map((tag) => (
                                  <span className="audiences-tag" key={`${contact.id}-${tag}`}>
                                    {tag}
                                  </span>
                                ))
                              ) : (
                                <span className="audiences-tag empty">—</span>
                              )}
                            </div>
                            <div>{contact.created_at ? formatDate(contact.created_at) : "—"}</div>
                            <div className="audiences-status">
                              {(contact.status || "ACTIVO").toUpperCase()}
                            </div>
                            <div className="audiences-menu-wrapper">
                              <button
                                className="audiences-menu"
                                type="button"
                                aria-label="Opciones"
                                onClick={() => toggleContactMenu(contact.id)}
                                disabled={!contact.id}
                              >
                                ...
                              </button>
                              {openContactMenuId === contact.id && (
                                <div className="audiences-menu-dropdown">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenContactEdit(contact)}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className="danger"
                                    onClick={() => handleDeleteContact(contact)}
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  <div className="audiences-pagination">
                    <div className="audiences-page-info">
                      Página {audiencePage} de {audienceTotalPages}
                    </div>
                    <div className="audiences-page-actions">
                      <button
                        className="audiences-page-btn"
                        type="button"
                        disabled={audiencePage <= 1}
                        onClick={() => setAudiencePage((page) => Math.max(1, page - 1))}
                      >
                        {"<"}
                      </button>
                      {audiencePages.map((page) => (
                        <button
                          key={`aud-page-${page}`}
                          className={`audiences-page-btn ${
                            page === audiencePage ? "active" : ""
                          }`}
                          type="button"
                          onClick={() => setAudiencePage(page)}
                        >
                          {page}
                        </button>
                      ))}
                      <button
                        className="audiences-page-btn"
                        type="button"
                        disabled={audiencePage >= audienceTotalPages}
                        onClick={() =>
                          setAudiencePage((page) => Math.min(audienceTotalPages, page + 1))
                        }
                      >
                        {">"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "new" && (
            <section className="campaigns-panel campaigns-module">
              {!campaignLaunchOpen ? (
                <div className="campaigns-dashboard">
                  <aside className="campaigns-sidebar">
                    <label className="campaigns-search ui-search">
                      <span className="template-search-icon ui-search-icon" aria-hidden="true" />
                      <input
                        type="text"
                        placeholder="Buscar campaña..."
                        value={campaignSearch}
                        onChange={(event) => setCampaignSearch(event.target.value)}
                      />
                    </label>
                    <div className="campaigns-filters-list">
                      <button
                        className={`campaigns-filter-item ${
                          campaignStatusFilter === "all" ? "active" : ""
                        }`}
                        type="button"
                        onClick={() => setCampaignStatusFilter("all")}
                      >
                        <span>Todas las Campañas</span>
                        <span className="campaigns-filter-count">
                          {campaignStatusBuckets.all}
                        </span>
                      </button>
                      <button
                        className={`campaigns-filter-item ${
                          campaignStatusFilter === "completed" ? "active" : ""
                        }`}
                        type="button"
                        onClick={() => setCampaignStatusFilter("completed")}
                      >
                        <span>Enviadas</span>
                        <span className="campaigns-filter-count">
                          {campaignStatusBuckets.completed}
                        </span>
                      </button>
                      <button
                        className={`campaigns-filter-item ${
                          campaignStatusFilter === "scheduled" ? "active" : ""
                        }`}
                        type="button"
                        onClick={() => setCampaignStatusFilter("scheduled")}
                      >
                        <span>Programadas</span>
                        <span className="campaigns-filter-count">
                          {campaignStatusBuckets.scheduled}
                        </span>
                      </button>
                      <button
                        className={`campaigns-filter-item ${
                          campaignStatusFilter === "draft" ? "active" : ""
                        }`}
                        type="button"
                        onClick={() => setCampaignStatusFilter("draft")}
                      >
                        <span>Borradores</span>
                        <span className="campaigns-filter-count">
                          {campaignStatusBuckets.draft}
                        </span>
                      </button>
                      <button
                        className={`campaigns-filter-item ${
                          campaignStatusFilter === "failed" ? "active" : ""
                        }`}
                        type="button"
                        onClick={() => setCampaignStatusFilter("failed")}
                      >
                        <span>Fallidas</span>
                        <span className="campaigns-filter-count">
                          {campaignStatusBuckets.failed}
                        </span>
                      </button>
                    </div>
                    <div className="campaigns-quota">
                      <div className="campaigns-quota-title">Cuota de mensajes</div>
                      <div className="campaigns-quota-bar">
                        <div className="campaigns-quota-fill" style={{ width: "65%" }} />
                      </div>
                      <div className="campaigns-quota-meta">65% usado</div>
                    </div>
                  </aside>
                  <div className="campaigns-table-panel">
                    <div className="campaigns-table-filters">
                      <div className="campaigns-filter-chip">Canal: WhatsApp Business</div>
                      <div className="campaigns-filter-chip">Periodo: Últimos 30 días</div>
                      <div className="campaigns-table-actions">
                        <button className="audiences-icon-btn" type="button">
                          {"\u2193"}
                        </button>
                        <button
                          className="audiences-icon-btn"
                          type="button"
                          onClick={() =>
                            onLoadCampaigns(campaignPage, campaignPageSize, campaignSearch.trim())
                          }
                        >
                          {"\u21bb"}
                        </button>
                      </div>
                    </div>
                      <div className="campaigns-table">
                        <div className="campaigns-table-head">
                          <span>Campaña</span>
                          <span>Fecha</span>
                          <span>Audiencia</span>
                        <span>Enviados</span>
                        <span>Leídos</span>
                        <span>Respuestas</span>
                        <span>Estado</span>
                        <span />
                      </div>
                      {filteredCampaigns.map((campaign) => {
                        const sent = campaign.messages_count || campaign.audience_count || "--";
                        const reads = campaign.read_count || "--";
                        const replies = campaign.reply_count || "--";
                        const normalizedStatus = normalizeCampaignStatus(campaign.status);
                        const statusLabel = STATUS_LABELS[normalizedStatus] || normalizedStatus;
                        const isSending = ["running", "sending"].includes(normalizedStatus);
                        const canResend = ["completed", "failed"].includes(normalizedStatus);
                        const canEdit = !isSending;
                        const canDelete = !isSending;
                        return (
                          <div className="campaigns-table-row" key={campaign.id}>
                            <div className="campaigns-table-title">
                              <div className="campaigns-table-name">{campaign.name}</div>
                              <div className="campaigns-table-ref">
                                Ref: {campaign.id.slice(0, 10)}
                              </div>
                            </div>
                            <div className="campaigns-table-date">
                              {formatDate(campaign.created_at)}
                            </div>
                            <div className="campaigns-table-tags">
                              <span className="campaigns-pill">
                                {campaign.audience_label || "Base General"}
                              </span>
                            </div>
                            <div className="campaigns-metric">{sent}</div>
                            <div className="campaigns-metric">{reads}</div>
                            <div className="campaigns-metric">{replies}</div>
                            <div className={`campaigns-status ${normalizedStatus}`}>
                              {statusLabel}
                            </div>
                            <div className="campaigns-row-actions">
                              <div className="campaigns-row-menu">
                                <button
                                  className="campaigns-row-menu-btn"
                                  type="button"
                                  aria-label="Opciones"
                                  onClick={(event) => toggleCampaignMenu(campaign.id, event)}
                                >
                                  ...
                                </button>
                                {openCampaignMenuId === campaign.id && (
                                  <div
                                    className={`campaigns-row-dropdown ${
                                      campaignMenuPlacement === "up" ? "drop-up" : ""
                                    }`}
                                  >
                                    {canEdit && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleEditCampaign(campaign);
                                          setOpenCampaignMenuId(null);
                                        }}
                                      >
                                        Editar
                                      </button>
                                    )}
                                    {canResend && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleResendCampaignClick(campaign);
                                          setOpenCampaignMenuId(null);
                                        }}
                                      >
                                        Reenviar
                                      </button>
                                    )}
                                    {canDelete && (
                                      <button
                                        type="button"
                                        className="danger"
                                        onClick={() => {
                                          handleDeleteCampaignClick(campaign);
                                          setOpenCampaignMenuId(null);
                                        }}
                                      >
                                        Eliminar
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {!filteredCampaigns.length && (
                        <div className="empty-state">Sin campañas registradas</div>
                      )}
                    </div>
                    <div className="campaigns-table-footer">
                      <span>
                        Mostrando {filteredCampaigns.length} de{" "}
                        {campaignsTotal || campaigns.length} campañas
                      </span>
                      <div className="audiences-page-actions">
                        <button
                          className="audiences-page-btn"
                          type="button"
                          disabled={campaignPage <= 1}
                          onClick={() => {
                            const next = Math.max(1, campaignPage - 1);
                            setCampaignPage(next);
                            onLoadCampaigns(next, campaignPageSize, campaignSearch.trim());
                          }}
                        >
                          {"<"}
                        </button>
                        {campaignPages.pages.map((page) => (
                          <button
                            key={`camp-page-${page}`}
                            className={`audiences-page-btn ${
                              page === campaignPage ? "active" : ""
                            }`}
                            type="button"
                            onClick={() => {
                              setCampaignPage(page);
                              onLoadCampaigns(page, campaignPageSize, campaignSearch.trim());
                            }}
                          >
                            {page}
                          </button>
                        ))}
                        <button
                          className="audiences-page-btn"
                          type="button"
                          disabled={campaignPage >= campaignPages.totalPages}
                          onClick={() => {
                            const next = Math.min(campaignPages.totalPages, campaignPage + 1);
                            setCampaignPage(next);
                            onLoadCampaigns(next, campaignPageSize, campaignSearch.trim());
                          }}
                        >
                          {">"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="campaigns-launch">
                  <form
                    className="campaigns-launch-form"
                    ref={formRef}
                    onSubmit={handleSubmitCampaign}
                  >
                    <div className="launch-step">
                      <span className="launch-step-number">1</span>
                      <div className="launch-card">
                        <div className="launch-step-title">Nombre de la Campaña</div>
                        <input
                          type="text"
                          placeholder="Ej: Promoción Black Friday 2024"
                          value={campaignForm.name}
                          onChange={(event) =>
                            setCampaignForm((prev) => ({
                              ...prev,
                              name: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                    <div className="launch-step">
                      <span className="launch-step-number">2</span>
                      <div className="launch-card">
                        <div className="launch-step-title">Seleccionar Audiencia</div>
                        <select
                          value={audienceValue}
                          onChange={(event) => handleAudienceChange(event.target.value)}
                        >
                          <option value="">Selecciona un segmento...</option>
                          {segments
                            .filter((segment) => segment.type !== "odoo")
                            .map((segment) => (
                              <option value={`segment:${segment.id}`} key={`seg-${segment.id}`}>
                                {segment.name}
                              </option>
                            ))}
                          <option value="verified">Solo verificados</option>
                          <option value="assigned:unassigned">Sin asignar</option>
                        </select>
                      </div>
                    </div>
                    <div className="launch-step">
                      <span className="launch-step-number">3</span>
                      <div className="launch-card">
                        <div className="launch-step-title">Elegir Plantilla de Meta</div>
                        <div className="launch-template-search ui-search">
                          <span className="template-search-icon ui-search-icon" aria-hidden="true" />
                          <input
                            type="text"
                            placeholder="Buscar plantilla..."
                            value={launchTemplateSearch}
                            onChange={(event) => setLaunchTemplateSearch(event.target.value)}
                          />
                          <button type="button" onClick={() => setLaunchTemplateSearch("")}>Limpiar</button>
                        </div>
                        <div className="launch-templates-scroll">
                          <div className="launch-templates">
                            {filteredLaunchTemplates.map((template) => {
                              const statusKey = template.status || "APPROVED";
                              const statusMeta =
                                TEMPLATE_STATUS[statusKey] || TEMPLATE_STATUS.APPROVED;
                              const selected = campaignForm.template_id === template.id;
                              return (
                                <button
                                  className={`launch-template ${selected ? "selected" : ""}`}
                                  type="button"
                                  key={template.id}
                                  onClick={() => handleTemplateSelect(template.id)}
                                >
                                  <div className="launch-template-icon" />
                                  <div className="launch-template-title">{template.name}</div>
                                  <div className="launch-template-preview">
                                    {template.body_preview || template.body_text || "Sin preview"}
                                  </div>
                                  <span className={`launch-template-status ${statusMeta.className}`}>
                                    {statusMeta.label}
                                  </span>
                                </button>
                              );
                            })}
                            {filteredLaunchTemplates.length === 0 && (
                              <div className="launch-empty">Sin plantillas</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="launch-step">
                      <span className="launch-step-number">4</span>
                      <div className="launch-card">
                        <div className="launch-step-title">Programación</div>
                        <div className="launch-schedule">
                          <button
                            className={`launch-schedule-option ${
                              campaignScheduleMode === "now" ? "active" : ""
                            }`}
                            type="button"
                            onClick={() => {
                              setCampaignScheduleMode("now");
                              setCampaignForm((prev) => ({
                                ...prev,
                                scheduled_for: "",
                                send_now: true,
                              }));
                            }}
                          >
                            Enviar Ahora
                          </button>
                          <button
                            className={`launch-schedule-option ${
                              campaignScheduleMode === "schedule" ? "active" : ""
                            }`}
                            type="button"
                            onClick={() => {
                              setCampaignScheduleMode("schedule");
                              setCampaignForm((prev) => ({ ...prev, send_now: false }));
                            }}
                          >
                            Programar Envío
                          </button>
                        </div>
                        {campaignScheduleMode === "schedule" && (
                          <input
                            type="datetime-local"
                            value={campaignForm.scheduled_for}
                            onChange={(event) =>
                              setCampaignForm((prev) => ({
                                ...prev,
                                scheduled_for: event.target.value,
                                send_now: false,
                              }))
                            }
                          />
                        )}
                      </div>
                    </div>
                  </form>
                  <aside className="campaigns-launch-preview">
                    <div className="preview-title">Vista previa en tiempo real</div>
                    <div className="preview-phone">
                      <div className="preview-phone-header">
                        <div className="preview-phone-notch" />
                        <div className="preview-phone-title">
                          <div className="preview-phone-avatar" />
                          <div>
                            <div className="preview-phone-name">Nombre del Cliente</div>
                            <div className="preview-phone-status">en línea</div>
                          </div>
                        </div>
                      </div>
                      <div className="preview-phone-body">
                        <div className="preview-day-pill">HOY</div>
                        <div className="preview-bubble">
                          {selectedTemplate?.body_preview ||
                            selectedTemplate?.body_text ||
                            "Selecciona una plantilla para ver el contenido."}
                        </div>
                        {previewButtons.length > 0 && (
                          <div className="preview-actions">
                            {previewButtons.map((btn, index) => (
                              <button type="button" key={`preview-btn-${index}`}>
                                {btn.text || btn.label || btn.title || `Botón ${index + 1}`}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="preview-time">10:45 AM</div>
                      </div>
                      <div className="preview-phone-input">
                        <span>Escribir mensaje...</span>
                        <div className="preview-mic" />
                      </div>
                    </div>
                    <div className="preview-summary">
                      <div className="preview-summary-title">Resumen</div>
                      <div className="preview-summary-row">
                        <span>Destinatarios</span>
                        <strong>{selectedSegment?.count || 0}</strong>
                      </div>
                      <div className="preview-summary-row">
                        <span>Plantilla</span>
                        <strong>{selectedTemplate?.name || "Sin plantilla"}</strong>
                      </div>
                    </div>
                  </aside>
                </div>
              )}
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

      {templatePreviewOpen && (
        <div className="modal-overlay" onClick={() => setTemplatePreviewOpen(false)}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Previsualizar plantilla</h2>
              <button
                className="modal-close"
                onClick={() => setTemplatePreviewOpen(false)}
              >
                x
              </button>
            </div>
            <div className="modal-body">
              <div className="preview-phone">
                <div className="preview-phone-header">
                  <div className="preview-phone-notch" />
                  <div className="preview-phone-title">
                    <div className="preview-phone-avatar" />
                    <div>
                      <div className="preview-phone-name">{brandLabel}</div>
                      <div className="preview-phone-status">en línea</div>
                    </div>
                  </div>
                </div>
                <div className="preview-phone-body">
                  <div className="preview-day-pill">HOY</div>
                  <div className="preview-bubble">
                    {templatePreviewTemplate?.body_preview ||
                      templatePreviewTemplate?.body_text ||
                      "Sin previsualización disponible."}
                  </div>
                  {templatePreviewButtons.length > 0 && (
                    <div className="preview-actions">
                      {templatePreviewButtons.map((btn, index) => (
                        <button type="button" key={`preview-modal-btn-${index}`}>
                          {btn.text || btn.label || btn.title || `Botón ${index + 1}`}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="preview-time">10:45 AM</div>
                </div>
                <div className="preview-phone-input">
                  <span>Escribir mensaje...</span>
                  <div className="preview-mic" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {contactEditOpen && (
        <div className="modal-overlay" onClick={() => setContactEditOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Editar contacto</h2>
              <button
                className="modal-close"
                type="button"
                onClick={() => setContactEditOpen(false)}
              >
                x
              </button>
            </div>
            <form className="modal-body" onSubmit={handleSaveContact}>
              <label className="field">
                <span>Nombre</span>
                <input
                  type="text"
                  value={contactEditForm.name}
                  onChange={(event) =>
                    setContactEditForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Teléfono</span>
                <input
                  type="text"
                  value={contactEditForm.phone}
                  onChange={(event) =>
                    setContactEditForm((prev) => ({ ...prev, phone: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={contactEditForm.email}
                  onChange={(event) =>
                    setContactEditForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>CI / NIT</span>
                <input
                  type="text"
                  value={contactEditForm.vat}
                  onChange={(event) =>
                    setContactEditForm((prev) => ({ ...prev, vat: event.target.value }))
                  }
                />
              </label>
              <div className="modal-actions">
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setContactEditOpen(false)}
                >
                  Cancelar
                </button>
                <button className="btn-primary" type="submit" disabled={contactSaving}>
                  {contactSaving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default CampaignsView;




