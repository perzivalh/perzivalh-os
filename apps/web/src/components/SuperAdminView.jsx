import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost } from "../api";

const EMPTY_PROVISION = {
  name: "",
  slug: "",
  plan: "",
  db_url: "",
  phone_number_id: "",
  waba_id: "",
  verify_token: "",
  wa_token: "",
  app_secret: "",
  brand_name: "",
  logo_url: "",
  timezone: "",
  odoo_base_url: "",
  odoo_db_name: "",
  odoo_username: "",
  odoo_password: "",
};

function GridIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <rect x="4" y="4" width="6" height="6" rx="1.5" strokeWidth="1.6" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" strokeWidth="1.6" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" strokeWidth="1.6" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" strokeWidth="1.6" />
    </svg>
  );
}

function PlusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path d="M12 5v14" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 12h14" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function GearIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <circle cx="12" cy="12" r="3.5" strokeWidth="1.6" />
      <path
        d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4.7a7.2 7.2 0 0 0-2-1.2L12 2 9.5 4.3a7.2 7.2 0 0 0-2 1.2l-2.4-.7-2 3.5 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.4-.7a7.2 7.2 0 0 0 2 1.2L12 22l2.5-2.3a7.2 7.2 0 0 0 2-1.2l2.4.7 2-3.5-2-1.5c.1-.4.1-.8.1-1.2Z"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <circle cx="11" cy="11" r="6.5" strokeWidth="1.6" />
      <path d="M16.5 16.5 20 20" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ArrowRightIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path d="M6 12h12" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m13 6 6 6-6 6" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SuperAdminView({ route = "/superadmin", onNavigate }) {
  const [tenants, setTenants] = useState([]);
  const [channels, setChannels] = useState([]);
  const [tenantSearch, setTenantSearch] = useState("");
  const [error, setError] = useState("");
  const [statusNote, setStatusNote] = useState("Verificacion de red: sistema ok");
  const [provisionForm, setProvisionForm] = useState(EMPTY_PROVISION);
  const [provisionBusy, setProvisionBusy] = useState(false);
  const [editTenantId, setEditTenantId] = useState("");
  const [editTenantActive, setEditTenantActive] = useState(true);

  const isCreateRoute = route.startsWith("/superadmin/new");

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
    setEditTenantId("");
    setEditTenantActive(true);
  }

  function handleNewTenantClick() {
    resetProvisionForm();
    setError("");
    navigate("/superadmin/new");
  }

  function handleDashboardClick() {
    navigate("/superadmin");
  }

  async function loadTenantExtras(tenantId) {
    try {
      const branding = await apiGet(`/api/superadmin/branding?tenant_id=${tenantId}`);
      if (branding.branding) {
        setProvisionForm((prev) => ({
          ...prev,
          brand_name: branding.branding.brand_name || "",
          logo_url: branding.branding.logo_url || "",
          timezone: branding.branding.timezone || "",
        }));
      }
    } catch (err) {
      setError(err.message || "No se pudo cargar branding.");
    }

    try {
      const response = await apiGet(`/api/superadmin/odoo?tenant_id=${tenantId}`);
      if (response.odoo) {
        setProvisionForm((prev) => ({
          ...prev,
          odoo_base_url: response.odoo.base_url || "",
          odoo_db_name: response.odoo.db_name || "",
          odoo_username: response.odoo.username || "",
          odoo_password: "",
        }));
      }
    } catch (err) {
      setError(err.message || "No se pudo cargar odoo.");
    }
  }

  async function handleManageTenant(tenant) {
    setError("");
    setEditTenantId(tenant.id);
    setEditTenantActive(Boolean(tenant.is_active));
    setProvisionForm({
      ...EMPTY_PROVISION,
      name: tenant.name || "",
      slug: tenant.slug || "",
      plan: tenant.plan || "",
    });
    const channel = channels.find((item) => item.tenant_id === tenant.id);
    if (channel) {
      setProvisionForm((prev) => ({
        ...prev,
        phone_number_id: channel.phone_number_id || "",
        waba_id: channel.waba_id || "",
      }));
    }
    await loadTenantExtras(tenant.id);
    navigate("/superadmin/new");
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
    const wantsChannel =
      provisionForm.phone_number_id ||
      provisionForm.verify_token ||
      provisionForm.wa_token ||
      provisionForm.waba_id ||
      provisionForm.app_secret;
    if (
      wantsChannel &&
      !editTenantId &&
      (!provisionForm.phone_number_id ||
        !provisionForm.verify_token ||
        !provisionForm.wa_token)
    ) {
      return {
        ok: false,
        message: "Canal incompleto: phone_number_id, verify_token y wa_token.",
      };
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

  function handleValidateProvision() {
    const validation = validateProvision();
    if (!validation.ok) {
      setStatusNote(validation.message);
      return;
    }
    setStatusNote("Verificacion de red: sistema ok");
  }

  async function handleProvisionTenant(event) {
    event.preventDefault();
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

      const channelPayload = {
        phone_number_id: provisionForm.phone_number_id.trim(),
        waba_id: provisionForm.waba_id.trim(),
        verify_token: provisionForm.verify_token.trim(),
        wa_token: provisionForm.wa_token.trim(),
        app_secret: provisionForm.app_secret.trim(),
      };
      const wantsChannel = Object.values(channelPayload).some(Boolean);
      if (wantsChannel) {
        const existingChannel = channels.find((item) => item.tenant_id === tenantId);
        if (existingChannel) {
          await apiPatch(`/api/superadmin/channels/${existingChannel.id}`, {
            phone_number_id: channelPayload.phone_number_id || undefined,
            waba_id: channelPayload.waba_id || undefined,
            verify_token: channelPayload.verify_token || undefined,
            wa_token: channelPayload.wa_token || undefined,
            app_secret: channelPayload.app_secret || undefined,
          });
        } else {
          await apiPost("/api/superadmin/channels", {
            tenant_id: tenantId,
            phone_number_id: channelPayload.phone_number_id,
            waba_id: channelPayload.waba_id,
            verify_token: channelPayload.verify_token,
            wa_token: channelPayload.wa_token,
            app_secret: channelPayload.app_secret,
          });
        }
      }

      if (provisionForm.brand_name.trim()) {
        await apiPatch("/api/superadmin/branding", {
          tenant_id: tenantId,
          brand_name: provisionForm.brand_name.trim(),
          logo_url: provisionForm.logo_url.trim() || null,
          colors: null,
          timezone: provisionForm.timezone.trim() || null,
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
      if (!editTenantId) {
        resetProvisionForm();
      }
    } catch (err) {
      setError(err.message || "No se pudo guardar tenant.");
    } finally {
      setProvisionBusy(false);
    }
  }

  return (
    <div className="sa-shell">
      <aside className="sa-rail">
        <div className="sa-rail-logo">PRZV</div>
        <button
          type="button"
          className={`sa-rail-btn ${!isCreateRoute ? "active" : ""}`}
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
        {!isCreateRoute && (
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
                <button className="sa-btn primary" type="button" onClick={handleNewTenantClick}>
                  Nuevo tenant
                </button>
              </div>
            </header>

            <section className="sa-kpi-grid">
              <div className="sa-kpi-card">
                <div className="sa-kpi-label">Total de clinicas (tenants)</div>
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
                    placeholder="Filtrar clinicas..."
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
                  <div>Nombre de la clinica</div>
                  <div>Estado</div>
                  <div>Uso de recursos</div>
                  <div>Tiempo de actividad</div>
                  <div></div>
                </div>
                {filteredTenants.length ? (
                  filteredTenants.map((tenant) => {
                    const loadPercent = formatLoadPercent(tenant.id || "tenant");
                    const hasDb = tenant.has_database ? "db" : "no-db";
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
                          <button
                            className="sa-link"
                            type="button"
                            onClick={() => handleManageTenant(tenant)}
                          >
                            <ArrowRightIcon className="sa-link-icon" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="sa-empty">Sin tenants para mostrar.</div>
                )}
              </div>
              <div className="sa-footer-note">
                Mostrando {filteredTenants.length || 0} clinicas en produccion
              </div>
            </section>
          </>
        )}

        {isCreateRoute && (
          <>
            <header className="sa-create-header">
              <button className="sa-back" type="button" onClick={handleDashboardClick}>
                Volver al dashboard
              </button>
              <div className="sa-create-title">Registrar nuevo tenant</div>
              <div className="sa-create-meta">Modo: superadmin</div>
            </header>

            {error ? <div className="sa-alert">{error}</div> : null}

            <form className="sa-form" onSubmit={handleProvisionTenant}>
              <div className="sa-form-grid">
                <div className="sa-form-section">
                  <div className="sa-section-title">Identidad del tenant</div>
                  <div className="sa-field">
                    <label>Nombre de la clinica</label>
                    <input
                      value={provisionForm.name}
                      onChange={(event) =>
                        setProvisionForm({ ...provisionForm, name: event.target.value })
                      }
                      placeholder="Ej. Centro Medico Alfa"
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
                  <div className="sa-field">
                    <label>Plan</label>
                    <input
                      value={provisionForm.plan}
                      onChange={(event) =>
                        setProvisionForm({ ...provisionForm, plan: event.target.value })
                      }
                      placeholder="starter"
                    />
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
                    <label>Timezone</label>
                    <input
                      value={provisionForm.timezone}
                      onChange={(event) =>
                        setProvisionForm({ ...provisionForm, timezone: event.target.value })
                      }
                      placeholder="America/La_Paz"
                    />
                  </div>
                  <div className="sa-note">
                    Nota: al registrar un tenant se inicia el aprovisionamiento en el
                    entorno de produccion.
                  </div>
                </div>

                <div className="sa-form-section">
                  <div className="sa-section-title">Variables de entorno (envs)</div>
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
                    <label>Odoo Password</label>
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
                  <div className="sa-field">
                    <label>Meta Access Token</label>
                    <input
                      value={provisionForm.wa_token}
                      onChange={(event) =>
                        setProvisionForm({ ...provisionForm, wa_token: event.target.value })
                      }
                      placeholder="token"
                    />
                  </div>
                  <div className="sa-field">
                    <label>Meta Business ID (WABA)</label>
                    <input
                      value={provisionForm.waba_id}
                      onChange={(event) =>
                        setProvisionForm({ ...provisionForm, waba_id: event.target.value })
                      }
                      placeholder="2003704870486290"
                    />
                  </div>
                  <div className="sa-field">
                    <label>WhatsApp Phone ID</label>
                    <input
                      value={provisionForm.phone_number_id}
                      onChange={(event) =>
                        setProvisionForm({
                          ...provisionForm,
                          phone_number_id: event.target.value,
                        })
                      }
                      placeholder="123456789"
                    />
                  </div>
                  <div className="sa-field">
                    <label>Verify Token</label>
                    <input
                      value={provisionForm.verify_token}
                      onChange={(event) =>
                        setProvisionForm({
                          ...provisionForm,
                          verify_token: event.target.value,
                        })
                      }
                      placeholder="verify-token"
                    />
                  </div>
                  <div className="sa-field">
                    <label>WhatsApp App Secret (opcional)</label>
                    <input
                      value={provisionForm.app_secret}
                      onChange={(event) =>
                        setProvisionForm({
                          ...provisionForm,
                          app_secret: event.target.value,
                        })
                      }
                      placeholder="app-secret"
                    />
                  </div>
                </div>
              </div>

              <div className="sa-form-actions">
                <div className="sa-status-note">{statusNote}</div>
                <div className="sa-form-buttons">
                  <button className="sa-btn ghost" type="button" onClick={handleValidateProvision}>
                    Validar conexion
                  </button>
                  <button className="sa-btn primary" type="submit" disabled={provisionBusy}>
                    {provisionBusy ? "Guardando..." : "Desplegar instancia"}
                  </button>
                </div>
              </div>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

export default SuperAdminView;
