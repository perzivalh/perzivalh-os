import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPatch, apiPost, apiDelete } from "../api";
import BotSection from "./superadmin/BotSection";
import { useToast } from "./ToastProvider.jsx";

// Importar desde módulos
import {
  EMPTY_PROVISION,
  PLAN_OPTIONS,
  TIMEZONE_OPTIONS,
} from "./superadmin/constants";
import {
  GridIcon,
  PlusIcon,
  GearIcon,
  SearchIcon,

  ArrowRightIcon,
} from "./superadmin/icons";
import { WhatsAppLinesSection } from "./superadmin/WhatsAppLinesSection";


function SuperAdminView({
  route = "/superadmin",
  onNavigate,
  onImpersonateTenant,
  onLogout = () => { },
}) {
  const [tenants, setTenants] = useState([]);
  const [channels, setChannels] = useState([]);
  const [tenantChannelsDetailed, setTenantChannelsDetailed] = useState([]);
  const [tenantSearch, setTenantSearch] = useState("");
  const [error, setError] = useState("");
  const [statusNote, setStatusNote] = useState("Verificacion de red: sistema ok");
  const [provisionForm, setProvisionForm] = useState(EMPTY_PROVISION);
  const [validationBusy, setValidationBusy] = useState(false);
  const [provisionBusy, setProvisionBusy] = useState(false);
  const [impersonateBusyId, setImpersonateBusyId] = useState("");
  const [editTenantId, setEditTenantId] = useState("");
  const [editTenantActive, setEditTenantActive] = useState(true);
  const [baselineForm, setBaselineForm] = useState(EMPTY_PROVISION);
  const [baselineActive, setBaselineActive] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const latestTenantRequest = useRef("");

  // Bot management state
  const [availableFlows, setAvailableFlows] = useState([]);
  const [tenantBots, setTenantBots] = useState([]);
  const [botsLoading, setBotsLoading] = useState(false);
  const { pushToast } = useToast();

  const routeTenantId = useMemo(() => {
    if (!route) {
      return "";
    }
    const match =
      route.match(/^\/superadmin\/tenants\/([^/]+)\/?$/) ||
      route.match(/^\/superadmin\/tenant\/([^/]+)\/?$/) ||
      route.match(/^\/superadmin\/edit\/([^/]+)\/?$/);
    return match ? match[1] : "";
  }, [route]);
  const isCreateRoute = route.startsWith("/superadmin/new");
  const isEditRoute = Boolean(routeTenantId);
  const isFormRoute = isCreateRoute || isEditRoute;

  const navigate = useCallback(
    (path) => {
      if (onNavigate) {
        onNavigate(path, { replace: false });
        return;
      }
      if (typeof window === "undefined") {
        return;
      }
      window.history.pushState({}, "", path);
    },
    [onNavigate]
  );

  async function loadData() {
    try {
      const tenantResponse = await apiGet("/api/superadmin/tenants");
      setTenants(tenantResponse.tenants || []);
      const channelResponse = await apiGet("/api/superadmin/channels");
      setChannels(channelResponse.channels || []);
      setError("");
    } catch (err) {
      setError(err.message || "No se pudo cargar datos.");
    }
  }

  useEffect(() => {
    loadData();
    loadAvailableFlows();
  }, []);

  const channelsByTenant = useMemo(() => {
    const map = new Map();
    channels.forEach((channel) => {
      const count = map.get(channel.tenant_id) || 0;
      map.set(channel.tenant_id, count + 1);
    });
    return map;
  }, [channels]);

  const filteredTenants = useMemo(() => {
    const query = tenantSearch.trim().toLowerCase();
    if (!query) {
      return tenants.slice();
    }
    return tenants.filter((tenant) => {
      const name = String(tenant.name || "").toLowerCase();
      const slug = String(tenant.slug || "").toLowerCase();
      const id = String(tenant.id || "").toLowerCase();
      return name.includes(query) || slug.includes(query) || id.includes(query);
    });
  }, [tenants, tenantSearch]);

  const totalTenants = tenants.length;
  const activeTenants = tenants.filter((tenant) => tenant.is_active).length;
  const dbReadyTenants = tenants.filter((tenant) => tenant.has_database).length;
  const odooReadyTenants = tenants.filter((tenant) => tenant.has_odoo).length;
  const odooPercent = totalTenants
    ? Math.round((odooReadyTenants / totalTenants) * 100)
    : 0;

  function formatDateShort(value) {
    if (!value) {
      return "--";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "--";
    }
    return parsed.toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  }

  function formatLoadPercent(seed) {
    const value = Math.abs(
      Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0)
    );
    const percent = 10 + (value % 70);
    return percent;
  }

  function resetProvisionForm() {
    setProvisionForm(EMPTY_PROVISION);
    setBaselineForm(EMPTY_PROVISION);
    setEditTenantId("");
    setEditTenantActive(true);
    setBaselineActive(true);
    setTenantBots([]);
    setTenantChannelsDetailed([]);
    setStatusNote("Verificacion de red: sistema ok");
    latestTenantRequest.current = "";
  }

  function handleNewTenantClick() {
    resetProvisionForm();
    setError("");
    navigate("/superadmin/new");
  }

  function handleDashboardClick() {
    latestTenantRequest.current = "";
    navigate("/superadmin");
  }

  async function handleImpersonateTenant(tenantId) {
    if (!onImpersonateTenant) {
      return;
    }
    try {
      setError("");
      setImpersonateBusyId(tenantId);
      await onImpersonateTenant(tenantId);
    } catch (err) {
      setError(err.message || "No se pudo entrar al tenant.");
    } finally {
      setImpersonateBusyId("");
    }
  }

  function normalizeProvision(form) {
    const next = {};
    Object.keys(EMPTY_PROVISION).forEach((key) => {
      const value = form[key];
      next[key] = typeof value === "string" ? value.trim() : value || "";
    });
    return { ...EMPTY_PROVISION, ...next };
  }

  async function loadTenantDetails(tenantId) {
    if (!tenantId) {
      return;
    }
    latestTenantRequest.current = tenantId;
    setEditTenantId(tenantId);
    setProvisionForm(EMPTY_PROVISION);
    setBaselineForm(EMPTY_PROVISION);
    setEditTenantActive(true);
    setBaselineActive(true);
    setTenantBots([]);
    setTenantChannelsDetailed([]);
    setDetailsLoading(true);
    setError("");
    try {
      const response = await apiGet(`/api/superadmin/tenants/${tenantId}/details`);
      if (latestTenantRequest.current !== tenantId) {
        return;
      }
      const tenant = response.tenant || {};
      const branding = response.branding || null;
      const odoo = response.odoo || null;
      const database = response.database || null;
      const channel = response.channel || null;
      setTenantChannelsDetailed(response.channels || []);
      const colors = branding?.colors || {};
      const nextForm = normalizeProvision({
        ...EMPTY_PROVISION,
        name: tenant.name || "",
        slug: tenant.slug || "",
        plan: tenant.plan || "",
        db_url: database?.db_url || "",

        brand_name: branding?.brand_name || "",
        logo_url: branding?.logo_url || "",
        brand_primary: colors?.primary || EMPTY_PROVISION.brand_primary,
        brand_accent: colors?.accent || EMPTY_PROVISION.brand_accent,
        brand_bg: colors?.bg || EMPTY_PROVISION.brand_bg,
        odoo_base_url: odoo?.base_url || "",
        odoo_db_name: odoo?.db_name || "",
        odoo_username: odoo?.username || "",
        odoo_password: odoo?.password || "",
      });
      setProvisionForm(nextForm);
      setBaselineForm(nextForm);
      setEditTenantId(tenant.id || tenantId);
      setEditTenantActive(Boolean(tenant.is_active));
      setBaselineActive(Boolean(tenant.is_active));
      setStatusNote("Modo edicion: cambios pendientes");
      await loadTenantBots(tenantId);
    } catch (err) {
      setError(err.message || "No se pudo cargar tenant.");
    } finally {
      setDetailsLoading(false);
    }
  }

  async function loadTenantChannels(tenantId) {
    if (!tenantId) return;
    try {
      const response = await apiGet(`/api/superadmin/tenants/${tenantId}/details`);
      if (editTenantId && editTenantId !== tenantId) {
        return;
      }
      setTenantChannelsDetailed(response.channels || []);
    } catch (err) {
      console.error("Error loading tenant channels", err);
    }
  }

  async function loadAvailableFlows() {
    try {
      const response = await apiGet("/api/superadmin/flows");
      setAvailableFlows(response.flows || []);
    } catch (err) {
      console.error("Error loading flows", err);
    }
  }

  async function loadTenantBots(tenantId) {
    if (!tenantId) return;
    setBotsLoading(true);
    try {
      const response = await apiGet(`/api/superadmin/tenant-bots?tenant_id=${tenantId}`);
      setTenantBots(response.tenant_bots || []);
    } catch (err) {
      console.error("Error loading tenant bots", err);
    } finally {
      setBotsLoading(false);
    }
  }

  async function handleToggleBot(botId, newActive) {
    try {
      await apiPatch(`/api/superadmin/tenant-bots/${botId}`, { is_active: newActive });
      setTenantBots((prev) =>
        prev.map((b) => (b.id === botId ? { ...b, is_active: newActive } : b))
      );
    } catch (err) {
      setError(err.message || "Error al cambiar estado del bot.");
    }
  }

  async function handleAddBot(flowId, config = null) {
    if (!editTenantId) return;
    try {
      const response = await apiPost("/api/superadmin/tenant-bots", {
        tenant_id: editTenantId,
        flow_id: flowId,
        config,
      });
      if (response.tenant_bot) {
        setTenantBots((prev) => [response.tenant_bot, ...prev]);
        pushToast({ message: "Bot agregado correctamente" });
      }
    } catch (err) {
      setError(err.message || "Error al agregar bot.");
      pushToast({ type: "error", message: err.message || "Error al agregar bot" });
    }
  }

  async function handleRemoveBot(botId) {
    const bot = tenantBots.find((item) => item.id === botId);
    try {
      await apiDelete(`/api/superadmin/tenant-bots/${botId}`);
      setTenantBots((prev) => prev.filter((b) => b.id !== botId));
      pushToast({
        message: "Bot eliminado correctamente",
        actionLabel: "DESHACER",
        duration: 8000,
        onAction: async () => {
          try {
            if (!bot) {
              return;
            }
            const response = await apiPost("/api/superadmin/tenant-bots", {
              tenant_id: bot.tenant_id,
              flow_id: bot.flow_id,
              config: bot.config || null,
            });
            if (response?.tenant_bot && bot.is_active === false) {
              await apiPatch(`/api/superadmin/tenant-bots/${response.tenant_bot.id}`, {
                is_active: false,
              });
            }
            await loadTenantBots(editTenantId);
            pushToast({ message: "Bot restaurado" });
          } catch (restoreError) {
            pushToast({
              type: "error",
              message: restoreError?.message || "No se pudo restaurar el bot",
            });
          }
        },
      });
    } catch (err) {
      setError(err.message || "Error al eliminar bot.");
      pushToast({ type: "error", message: err.message || "Error al eliminar bot" });
    }
  }

  async function handleUpdateBotConfig(botId, config) {
    try {
      const response = await apiPatch(`/api/superadmin/tenant-bots/${botId}`, {
        config,
      });
      if (response?.tenant_bot) {
        setTenantBots((prev) =>
          prev.map((b) => (b.id === botId ? response.tenant_bot : b))
        );
      }
      pushToast({ message: "Configuracion IA actualizada" });
    } catch (err) {
      setError(err.message || "Error al actualizar configuracion del bot.");
      pushToast({
        type: "error",
        message: err.message || "Error al actualizar configuracion del bot",
      });
    }
  }

  async function handleManageTenant(tenant) {
    setError("");
    navigate(`/superadmin/tenants/${tenant.id}`);
  }

  async function refreshLines() {
    await loadData();
    if (editTenantId) {
      await loadTenantChannels(editTenantId);
    }
  }

  function validateProvision() {
    const name = provisionForm.name.trim();
    const slug = provisionForm.slug.trim();
    const dbUrl = provisionForm.db_url.trim();
    if (!name || !slug) {
      return { ok: false, message: "Nombre y subdominio son requeridos." };
    }
    if (!editTenantId && !dbUrl) {
      return { ok: false, message: "Tenant DB URL es requerido." };
    }
    const wantsBranding =
      provisionForm.brand_name.trim() ||
      provisionForm.logo_url.trim() ||
      provisionForm.brand_primary ||
      provisionForm.brand_accent ||
      provisionForm.brand_bg;
    if (wantsBranding && !provisionForm.brand_name.trim()) {
      return { ok: false, message: "Brand name es requerido." };
    }
    const wantsOdoo =
      provisionForm.odoo_base_url ||
      provisionForm.odoo_db_name ||
      provisionForm.odoo_username ||
      provisionForm.odoo_password;
    if (
      wantsOdoo &&
      (!provisionForm.odoo_base_url ||
        !provisionForm.odoo_db_name ||
        !provisionForm.odoo_username ||
        (!editTenantId && !provisionForm.odoo_password))
    ) {
      return {
        ok: false,
        message: "Odoo incompleto: base_url, db_name, username, password.",
      };
    }
    return { ok: true };
  }

  function buildValidationNote(checks) {
    if (!checks) {
      return "Verificacion completada";
    }
    const segments = [];
    if (checks.database) {
      const dbLabel = checks.database.ok ? "DB ok" : "DB error";
      const dbLatency =
        typeof checks.database.latency_ms === "number"
          ? ` (${checks.database.latency_ms}ms)`
          : "";
      segments.push(`${dbLabel}${dbLatency}`);
    }
    if (checks.odoo) {
      const odooLabel = checks.odoo.ok ? "Odoo ok" : "Odoo error";
      const odooLatency =
        typeof checks.odoo.latency_ms === "number"
          ? ` (${checks.odoo.latency_ms}ms)`
          : "";
      segments.push(`${odooLabel}${odooLatency}`);
    }
    return segments.length
      ? `Verificacion completada: ${segments.join(" | ")}`
      : "Verificacion completada";
  }

  function resolveValidationError(checks) {
    if (checks?.database && !checks.database.ok) {
      const message = checks.database.details || checks.database.error;
      return formatValidationError(message || "Error en DB");
    }
    if (checks?.odoo && !checks.odoo.ok) {
      const message = checks.odoo.details || checks.odoo.error;
      return formatValidationError(message || "Error en Odoo");
    }
    return "No se pudo validar conexion";
  }

  function formatValidationError(value) {
    const raw = (value || "").toString();
    const lower = raw.toLowerCase();
    if (lower.includes("missing")) {
      return "Completa los campos de Odoo";
    }
    if (lower.includes("db_connection_failed")) {
      return "No se pudo conectar a la base de datos";
    }
    if (lower.includes("odoo") && lower.includes("failed")) {
      return "No se pudo autenticar en Odoo";
    }
    return raw || "No se pudo validar conexion";
  }

  async function handleValidateProvision() {
    const validation = validateProvision();
    if (!validation.ok) {
      setStatusNote(validation.message);
      return;
    }
    setValidationBusy(true);
    setStatusNote("Verificando conexion...");
    try {
      const response = await apiPost("/api/superadmin/tenants/validate", {
        db_url: provisionForm.db_url.trim(),
        odoo_base_url: provisionForm.odoo_base_url.trim(),
        odoo_db_name: provisionForm.odoo_db_name.trim(),
        odoo_username: provisionForm.odoo_username.trim(),
        odoo_password: provisionForm.odoo_password.trim(),
      });
      const note = buildValidationNote(response.checks);
      setStatusNote(note);
      if (response.ok) {
        pushToast({ message: note });
      } else {
        pushToast({
          type: "error",
          message: resolveValidationError(response.checks),
        });
      }
    } catch (err) {
      setStatusNote("Error validando conexion");
      pushToast({
        type: "error",
        message: err.message || "No se pudo validar conexion",
      });
    } finally {
      setValidationBusy(false);
    }
  }

  async function handleProvisionTenant(event) {
    event.preventDefault();
    if (isEditRoute && !hasChanges) {
      return;
    }
    const validation = validateProvision();
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    try {
      setProvisionBusy(true);
      setError("");
      let tenantId = editTenantId;
      if (tenantId) {
        await apiPatch(`/api/superadmin/tenants/${tenantId}`, {
          name: provisionForm.name.trim(),
          slug: provisionForm.slug.trim(),
          plan: provisionForm.plan.trim(),
          is_active: editTenantActive,
        });
      } else {
        const result = await apiPost("/api/superadmin/tenants", {
          name: provisionForm.name.trim(),
          slug: provisionForm.slug.trim(),
          plan: provisionForm.plan.trim(),
        });
        tenantId = result.tenant?.id;
      }

      if (!tenantId) {
        throw new Error("tenant_not_ready");
      }

      if (provisionForm.db_url.trim()) {
        await apiPost(`/api/superadmin/tenants/${tenantId}/database`, {
          db_url: provisionForm.db_url.trim(),
        });
      }

      const wantsBranding =
        provisionForm.brand_name.trim() ||
        provisionForm.logo_url.trim();
      if (wantsBranding) {
        await apiPatch("/api/superadmin/branding", {
          tenant_id: tenantId,
          brand_name: provisionForm.brand_name.trim(),
          logo_url: provisionForm.logo_url.trim() || null,
          colors: null,
        });
      }

      const wantsOdoo =
        provisionForm.odoo_base_url ||
        provisionForm.odoo_db_name ||
        provisionForm.odoo_username ||
        provisionForm.odoo_password;
      if (wantsOdoo) {
        const payload = {
          tenant_id: tenantId,
          base_url: provisionForm.odoo_base_url.trim(),
          db_name: provisionForm.odoo_db_name.trim(),
          username: provisionForm.odoo_username.trim(),
        };
        if (provisionForm.odoo_password.trim()) {
          payload.password = provisionForm.odoo_password.trim();
        }
        await apiPatch("/api/superadmin/odoo", payload);
      }

      await loadData();
      if (editTenantId) {
        const normalized = normalizeProvision(provisionForm);
        setProvisionForm(normalized);
        setBaselineForm(normalized);
        setBaselineActive(editTenantActive);
        setStatusNote("Cambios guardados");
        pushToast({ message: "Tenant actualizado correctamente" });
      } else {
        resetProvisionForm();
        pushToast({ message: "Tenant creado correctamente" });
      }
    } catch (err) {
      setError(err.message || "No se pudo guardar tenant.");
      pushToast({ type: "error", message: err.message || "No se pudo guardar tenant" });
    } finally {
      setProvisionBusy(false);
    }
  }

  async function handleToggleTenantActive() {
    if (!editTenantId) {
      return;
    }
    const nextActive = !editTenantActive;
    try {
      setProvisionBusy(true);
      setError("");
      await apiPatch(`/api/superadmin/tenants/${editTenantId}`, {
        is_active: nextActive,
      });
      setEditTenantActive(nextActive);
      setBaselineActive(nextActive);
      setStatusNote(nextActive ? "Tenant reactivado" : "Tenant bloqueado");
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo cambiar estado del tenant.");
    } finally {
      setProvisionBusy(false);
    }
  }

  const hasChanges = useMemo(() => {
    if (!editTenantId && !isEditRoute) {
      return true;
    }
    if (editTenantActive !== baselineActive) {
      return true;
    }
    return Object.keys(baselineForm).some((key) => {
      const a = String(provisionForm[key] ?? "");
      const b = String(baselineForm[key] ?? "");
      return a !== b;
    });
  }, [baselineActive, baselineForm, editTenantActive, editTenantId, isEditRoute, provisionForm]);

  useEffect(() => {
    if (isEditRoute && routeTenantId && routeTenantId !== editTenantId) {
      void loadTenantDetails(routeTenantId);
      return;
    }
    if (isCreateRoute && (editTenantId || detailsLoading)) {
      resetProvisionForm();
    }
  }, [detailsLoading, editTenantId, isCreateRoute, isEditRoute, routeTenantId]);

  return (
    <div className="sa-shell">
      <aside className="sa-rail">
        <div className="sa-rail-logo">PRZV</div>
        <button
          type="button"
          className={`sa-rail-btn ${!isFormRoute ? "active" : ""}`}
          onClick={handleDashboardClick}
        >
          <GridIcon className="sa-rail-icon" />
          <span>Dashboard</span>
        </button>
        <button
          type="button"
          className={`sa-rail-btn ${isCreateRoute ? "active" : ""}`}
          onClick={handleNewTenantClick}
        >
          <PlusIcon className="sa-rail-icon" />
          <span>Nuevo</span>
        </button>
        <button type="button" className="sa-rail-btn">
          <GearIcon className="sa-rail-icon" />
          <span>Ajustes</span>
        </button>
        <div className="sa-rail-footer">
          <div className="sa-avatar">SA</div>
          <div>
            <div className="sa-role">Superadmin</div>
            <div className="sa-meta">Control plane</div>
          </div>
        </div>
      </aside>

      <main className="sa-main">
        {!isFormRoute && (
          <>
            <header className="sa-topbar">
              <div>
                <div className="sa-kicker">Panel de control Perzivalh</div>
                <div className="sa-title">
                  Sistema operativo <span className="sa-dot" />
                </div>
                <div className="sa-subtitle">Estado general del entorno</div>
              </div>
              <div className="sa-top-actions">
                <span className="sa-version">v0.4 stable</span>
                <button className="sa-btn ghost" type="button" onClick={loadData}>
                  Recargar
                </button>
                <button className="sa-btn ghost" type="button" onClick={onLogout}>
                  Cerrar sesion
                </button>
                <button className="sa-btn primary" type="button" onClick={handleNewTenantClick}>
                  Nuevo tenant
                </button>
              </div>
            </header>

            <section className="sa-kpi-grid">
              <div className="sa-kpi-card">
                <div className="sa-kpi-label">Total de empresas (tenants)</div>
                <div className="sa-kpi-value">{totalTenants}</div>
                <div className="sa-kpi-meta">+{activeTenants} activas</div>
              </div>
              <div className="sa-kpi-card">
                <div className="sa-kpi-label">Usuarios activos totales</div>
                <div className="sa-kpi-value">--</div>
                <div className="sa-kpi-meta">En tiempo real</div>
              </div>
              <div className="sa-kpi-card">
                <div className="sa-kpi-label">Mensajes hoy</div>
                <div className="sa-kpi-value">--</div>
                <div className="sa-kpi-meta">Canal API</div>
              </div>
              <div className="sa-kpi-card">
                <div className="sa-kpi-label">Conexiones Odoo activas</div>
                <div className="sa-kpi-value">{odooPercent}%</div>
                <div className="sa-kpi-meta">{odooReadyTenants} sincronizadas</div>
              </div>
            </section>

            <section className="sa-table-card">
              <div className="sa-table-header">
                <div className="sa-search">
                  <SearchIcon className="sa-search-icon" />
                  <input
                    value={tenantSearch}
                    onChange={(event) => setTenantSearch(event.target.value)}
                    placeholder="Filtrar empresas..."
                  />
                </div>
                <div className="sa-table-actions">
                  <button className="sa-btn ghost" type="button">
                    Ordenar por salud
                  </button>
                  <button className="sa-btn ghost" type="button">
                    Exportar CSV
                  </button>
                </div>
              </div>

              <div className="sa-table">
                <div className="sa-table-head">
                  <div>ID referencia</div>
                  <div>Nombre de la empresa</div>
                  <div>Estado</div>
                  <div>Uso de recursos</div>
                  <div>Tiempo de actividad</div>
                  <div>Acciones</div>
                </div>
                {filteredTenants.length ? (
                  filteredTenants.map((tenant) => {
                    const loadPercent = formatLoadPercent(tenant.id || "tenant");
                    const hasDb = tenant.has_database ? "db" : "no-db";
                    const canEnter = tenant.has_database;
                    return (
                      <div key={tenant.id} className="sa-table-row">
                        <div className="sa-ref">{tenant.slug?.toUpperCase() || "TENANT"}</div>
                        <div>
                          <div className="sa-tenant-name">{tenant.name}</div>
                          <div className="sa-tenant-meta">{tenant.id.slice(0, 8)}</div>
                        </div>
                        <div className={`sa-status ${tenant.is_active ? "ok" : "warn"}`}>
                          {tenant.is_active ? "activo" : "inactivo"}
                        </div>
                        <div>
                          <div className="sa-progress">
                            <span
                              className={`sa-progress-fill ${hasDb}`}
                              style={{ width: `${loadPercent}%` }}
                            />
                          </div>
                          <div className="sa-tenant-meta">{loadPercent}% carga</div>
                        </div>
                        <div className="sa-tenant-meta">{formatDateShort(tenant.created_at)}</div>
                        <div>
                          <div className="sa-action-group">
                            <button
                              className="sa-action"
                              type="button"
                              onClick={() => handleImpersonateTenant(tenant.id)}
                              disabled={!canEnter || impersonateBusyId === tenant.id}
                            >
                              {!canEnter
                                ? "Sin DB"
                                : impersonateBusyId === tenant.id
                                  ? "Entrando..."
                                  : "Entrar"}
                            </button>
                            <button
                              className="sa-link"
                              type="button"
                              onClick={() => handleManageTenant(tenant)}
                            >
                              <ArrowRightIcon className="sa-link-icon" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="sa-empty">Sin tenants para mostrar.</div>
                )}
              </div>
              <div className="sa-footer-note">
                Mostrando {filteredTenants.length || 0} empresas en produccion
              </div>
            </section>
          </>
        )}

        {isFormRoute && (
          <>
            <header className="sa-create-header">
              <button className="sa-back" type="button" onClick={handleDashboardClick}>
                Volver al dashboard
              </button>
              <div className="sa-create-title">
                {isEditRoute ? "Editar tenant" : "Registrar nuevo tenant"}
              </div>
              <div className="sa-create-actions">
                <div className="sa-create-meta">Modo: superadmin</div>
                <button className="sa-btn ghost" type="button" onClick={onLogout}>
                  Cerrar sesion
                </button>
              </div>
            </header>

            {error ? <div className="sa-alert">{error}</div> : null}

            <form className="sa-form" onSubmit={handleProvisionTenant}>
              <div className="sa-form-grid sa-form-grid-2">
                <div className="sa-form-section">
                  <div className="sa-section-title">Identidad del tenant</div>
                  <div className="sa-field">
                    <label>Nombre de la empresa</label>
                    <input
                      value={provisionForm.name}
                      onChange={(event) =>
                        setProvisionForm({ ...provisionForm, name: event.target.value })
                      }
                      placeholder="Ej. Empresa Alfa"
                    />
                  </div>
                  <div className="sa-field">
                    <label>Subdominio reservado</label>
                    <input
                      value={provisionForm.slug}
                      onChange={(event) =>
                        setProvisionForm({ ...provisionForm, slug: event.target.value })
                      }
                      placeholder="alfa-salud"
                    />
                  </div>
                  <div className="sa-field sa-field-row">
                    <div className="sa-field">
                      <label>Plan</label>
                      <select
                        value={provisionForm.plan}
                        onChange={(event) =>
                          setProvisionForm({ ...provisionForm, plan: event.target.value })
                        }
                      >
                        <option value="">Seleccionar</option>
                        {PLAN_OPTIONS.map((plan) => (
                          <option key={plan.value} value={plan.value}>
                            {plan.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {isEditRoute && (
                      <div className="sa-field">
                        <label>Estado del tenant</label>
                        <select
                          value={editTenantActive ? "active" : "inactive"}
                          onChange={(event) =>
                            setEditTenantActive(event.target.value === "active")
                          }
                        >
                          <option value="active">Activo</option>
                          <option value="inactive">Bloqueado</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="sa-field">
                    <label>Brand name</label>
                    <input
                      value={provisionForm.brand_name}
                      onChange={(event) =>
                        setProvisionForm({ ...provisionForm, brand_name: event.target.value })
                      }
                      placeholder="Perzivalh"
                    />
                  </div>
                  <div className="sa-field">
                    <label>Logo URL</label>
                    <input
                      value={provisionForm.logo_url}
                      onChange={(event) =>
                        setProvisionForm({ ...provisionForm, logo_url: event.target.value })
                      }
                      placeholder="https://"
                    />
                  </div>
                  <div className="sa-field">
                    <label>Paleta de colores</label>
                    <div className="sa-note">
                      Personalización deshabilitada por ahora.
                    </div>
                  </div>
                  {!isEditRoute && (
                    <div className="sa-note">
                      Nota: al registrar un tenant se inicia el aprovisionamiento en el
                      entorno de produccion.
                    </div>
                  )}
                </div>

                <div className="sa-form-section">
                  <div className="sa-section-title">Variables de entorno (envs)</div>
                  <div className="sa-subsection">
                    <div className="sa-subsection-title">Base de datos</div>
                    <div className="sa-field">
                      <label>Tenant DB URL</label>
                      <input
                        value={provisionForm.db_url}
                        onChange={(event) =>
                          setProvisionForm({ ...provisionForm, db_url: event.target.value })
                        }
                        placeholder="postgresql://..."
                      />
                    </div>
                  </div>
                  <div className="sa-subsection">
                    <div className="sa-subsection-title">Odoo (opcional)</div>
                    <div className="sa-field">
                      <label>Odoo Base URL</label>
                      <input
                        value={provisionForm.odoo_base_url}
                        onChange={(event) =>
                          setProvisionForm({
                            ...provisionForm,
                            odoo_base_url: event.target.value,
                          })
                        }
                        placeholder="https://odoo-instancia"
                      />
                    </div>
                    <div className="sa-field">
                      <label>Odoo DB Name</label>
                      <input
                        value={provisionForm.odoo_db_name}
                        onChange={(event) =>
                          setProvisionForm({
                            ...provisionForm,
                            odoo_db_name: event.target.value,
                          })
                        }
                        placeholder="db_tenant_prod"
                      />
                    </div>
                    <div className="sa-field">
                      <label>Odoo User</label>
                      <input
                        value={provisionForm.odoo_username}
                        onChange={(event) =>
                          setProvisionForm({
                            ...provisionForm,
                            odoo_username: event.target.value,
                          })
                        }
                        placeholder="usuario@empresa.com"
                      />
                    </div>
                    <div className="sa-field">
                      <label>Odoo Password (opcional)</label>
                      <input
                        type="password"
                        value={provisionForm.odoo_password}
                        onChange={(event) =>
                          setProvisionForm({
                            ...provisionForm,
                            odoo_password: event.target.value,
                          })
                        }
                        placeholder="********"
                      />
                    </div>
                  </div>
                </div>

              </div>
              <div className="sa-form-actions">
                  <div className="sa-status-note">
                    {isEditRoute
                      ? detailsLoading
                        ? "Cargando datos..."
                        : hasChanges
                          ? "Cambios pendientes"
                          : "Sin cambios"
                      : statusNote}
                  </div>
                  <div className="sa-form-buttons">
                    {isEditRoute ? (
                      <>
                        {hasChanges && (
                          <button className="sa-btn primary" type="submit" disabled={provisionBusy}>
                            {provisionBusy ? "Guardando..." : "Guardar cambios"}
                          </button>
                        )}
                        <button
                          className="sa-btn danger"
                          type="button"
                          onClick={handleToggleTenantActive}
                          disabled={provisionBusy || !editTenantId}
                        >
                          {editTenantActive ? "Bloquear tenant" : "Reactivar tenant"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="sa-btn ghost"
                          type="button"
                          onClick={handleValidateProvision}
                          disabled={validationBusy || provisionBusy}
                        >
                          {validationBusy ? "Validando..." : "Validar conexion"}
                        </button>
                        <button className="sa-btn primary" type="submit" disabled={provisionBusy}>
                          {provisionBusy ? "Guardando..." : "Desplegar instancia"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
            </form>

            {/* WhatsApp Lines Section - only show when editing existing tenant */}
            {editTenantId ? (
              <WhatsAppLinesSection
                channels={
                  tenantChannelsDetailed.length
                    ? tenantChannelsDetailed
                    : channels.filter((c) => c.tenant_id === editTenantId)
                }
                tenantId={editTenantId}
                onRefresh={refreshLines}
              />
            ) : (
              <div style={{ marginTop: "2rem", padding: "1rem", border: "1px dashed rgba(255,255,255,0.2)", borderRadius: "12px", color: "rgba(255,255,255,0.5)", fontSize: "0.8rem", textAlign: "center" }}>
                Crea el tenant primero para configurar las líneas de WhatsApp.
              </div>
            )}

            {/* Bot Section - only show when editing existing tenant */}
            {editTenantId && (
              <BotSection
                tenantId={editTenantId}
                tenantBots={tenantBots}
                availableFlows={availableFlows}
                loading={botsLoading}
                onToggleBot={handleToggleBot}
                onAddBot={handleAddBot}
                onRemoveBot={handleRemoveBot}
                onUpdateBotConfig={handleUpdateBotConfig}
              />
            )}
          </>
        )}
      </main>
    </div >
  );
}

export default SuperAdminView;

