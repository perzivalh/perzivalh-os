import React, { useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost } from "../api";

function SuperAdminView() {
  const [tenants, setTenants] = useState([]);
  const [channels, setChannels] = useState([]);
  const [error, setError] = useState("");
  const [tenantForm, setTenantForm] = useState({
    name: "",
    slug: "",
    plan: "",
  });
  const [tenantUpdateForm, setTenantUpdateForm] = useState({
    tenant_id: "",
    name: "",
    slug: "",
    plan: "",
    is_active: true,
  });
  const [dbForm, setDbForm] = useState({
    tenant_id: "",
    db_url: "",
  });
  const [channelForm, setChannelForm] = useState({
    tenant_id: "",
    phone_number_id: "",
    verify_token: "",
    wa_token: "",
  });
  const [channelUpdateForm, setChannelUpdateForm] = useState({
    channel_id: "",
    phone_number_id: "",
    verify_token: "",
    wa_token: "",
  });
  const [brandingForm, setBrandingForm] = useState({
    tenant_id: "",
    brand_name: "",
    logo_url: "",
    colors: "",
    timezone: "",
  });

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

  async function handleCreateTenant(event) {
    event.preventDefault();
    try {
      await apiPost("/api/superadmin/tenants", tenantForm);
      setTenantForm({ name: "", slug: "", plan: "" });
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo crear tenant.");
    }
  }

  function handleTenantSelect(value) {
    const selected = tenants.find((tenant) => tenant.id === value);
    if (!selected) {
      setTenantUpdateForm({
        tenant_id: "",
        name: "",
        slug: "",
        plan: "",
        is_active: true,
      });
      return;
    }
    setTenantUpdateForm({
      tenant_id: selected.id,
      name: selected.name || "",
      slug: selected.slug || "",
      plan: selected.plan || "",
      is_active: selected.is_active,
    });
  }

  async function handleUpdateTenant(event) {
    event.preventDefault();
    if (!tenantUpdateForm.tenant_id) {
      setError("Selecciona un tenant.");
      return;
    }
    try {
      await apiPatch(`/api/superadmin/tenants/${tenantUpdateForm.tenant_id}`, {
        name: tenantUpdateForm.name,
        slug: tenantUpdateForm.slug,
        plan: tenantUpdateForm.plan,
        is_active: tenantUpdateForm.is_active,
      });
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo actualizar tenant.");
    }
  }

  async function handleSetDb(event) {
    event.preventDefault();
    if (!dbForm.tenant_id) {
      setError("Selecciona un tenant.");
      return;
    }
    try {
      await apiPost(`/api/superadmin/tenants/${dbForm.tenant_id}/database`, {
        db_url: dbForm.db_url,
      });
      setDbForm({ tenant_id: dbForm.tenant_id, db_url: "" });
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo guardar DB.");
    }
  }

  async function handleCreateChannel(event) {
    event.preventDefault();
    try {
      await apiPost("/api/superadmin/channels", channelForm);
      setChannelForm({
        tenant_id: channelForm.tenant_id,
        phone_number_id: "",
        verify_token: "",
        wa_token: "",
      });
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo crear canal.");
    }
  }

  function handleChannelSelect(value) {
    const selected = channels.find((channel) => channel.id === value);
    if (!selected) {
      setChannelUpdateForm({
        channel_id: "",
        phone_number_id: "",
        verify_token: "",
        wa_token: "",
      });
      return;
    }
    setChannelUpdateForm({
      channel_id: selected.id,
      phone_number_id: selected.phone_number_id || "",
      verify_token: "",
      wa_token: "",
    });
  }

  async function handleUpdateChannel(event) {
    event.preventDefault();
    if (!channelUpdateForm.channel_id) {
      setError("Selecciona un canal.");
      return;
    }
    try {
      await apiPatch(`/api/superadmin/channels/${channelUpdateForm.channel_id}`, {
        phone_number_id: channelUpdateForm.phone_number_id,
        verify_token: channelUpdateForm.verify_token || undefined,
        wa_token: channelUpdateForm.wa_token || undefined,
      });
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo actualizar canal.");
    }
  }

  async function handleSaveBranding(event) {
    event.preventDefault();
    if (!brandingForm.tenant_id) {
      setError("Selecciona un tenant.");
      return;
    }
    let colors = null;
    if (brandingForm.colors) {
      try {
        colors = JSON.parse(brandingForm.colors);
      } catch (err) {
        setError("Colors debe ser JSON valido.");
        return;
      }
    }
    try {
      await apiPatch("/api/superadmin/branding", {
        tenant_id: brandingForm.tenant_id,
        brand_name: brandingForm.brand_name,
        logo_url: brandingForm.logo_url || null,
        colors,
        timezone: brandingForm.timezone || null,
      });
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo guardar branding.");
    }
  }

  return (
    <div className="page">
      <div className="users-header">
        <div className="users-title-row">
          <div className="users-kicker" />
          <div>
            <div className="users-title">SuperAdmin</div>
            <div className="users-subtitle">
              Gestion multi-tenant y canales WhatsApp.
            </div>
          </div>
        </div>
        <button className="settings-primary" type="button" onClick={loadData}>
          Recargar
        </button>
      </div>
      {error ? <div className="note-card">{error}</div> : null}

      <div className="dash-card">
        <div className="dash-card-header">
          <div>
            <div className="dash-card-title">Tenants</div>
            <div className="dash-card-subtitle">Crear y listar</div>
          </div>
        </div>
        <form className="settings-form" onSubmit={handleCreateTenant}>
          <div className="settings-field">
            <label>Nombre</label>
            <input
              value={tenantForm.name}
              onChange={(event) =>
                setTenantForm({ ...tenantForm, name: event.target.value })
              }
              placeholder="Podopie Clinic"
            />
          </div>
          <div className="settings-field">
            <label>Slug</label>
            <input
              value={tenantForm.slug}
              onChange={(event) =>
                setTenantForm({ ...tenantForm, slug: event.target.value })
              }
              placeholder="podopie"
            />
          </div>
          <div className="settings-field">
            <label>Plan</label>
            <input
              value={tenantForm.plan}
              onChange={(event) =>
                setTenantForm({ ...tenantForm, plan: event.target.value })
              }
              placeholder="starter"
            />
          </div>
          <button className="settings-primary" type="submit">
            Crear tenant
          </button>
        </form>
        <div className="settings-list">
          {tenants.map((tenant) => (
            <div key={tenant.id} className="settings-row">
              <div>
                <strong>{tenant.name}</strong> ({tenant.slug})
                <div className="settings-meta">ID: {tenant.id}</div>
              </div>
              <div>
                DB: {tenant.has_database ? "ok" : "pendiente"} ·{" "}
                {tenant.is_active ? "activo" : "inactivo"}
              </div>
            </div>
          ))}
        </div>
        <form className="settings-form" onSubmit={handleUpdateTenant}>
          <div className="settings-field">
            <label>Editar tenant</label>
            <select
              value={tenantUpdateForm.tenant_id}
              onChange={(event) => handleTenantSelect(event.target.value)}
            >
              <option value="">Seleccionar</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-field">
            <label>Nombre</label>
            <input
              value={tenantUpdateForm.name}
              onChange={(event) =>
                setTenantUpdateForm({
                  ...tenantUpdateForm,
                  name: event.target.value,
                })
              }
            />
          </div>
          <div className="settings-field">
            <label>Slug</label>
            <input
              value={tenantUpdateForm.slug}
              onChange={(event) =>
                setTenantUpdateForm({
                  ...tenantUpdateForm,
                  slug: event.target.value,
                })
              }
            />
          </div>
          <div className="settings-field">
            <label>Plan</label>
            <input
              value={tenantUpdateForm.plan}
              onChange={(event) =>
                setTenantUpdateForm({
                  ...tenantUpdateForm,
                  plan: event.target.value,
                })
              }
            />
          </div>
          <div className="settings-field">
            <label>Activo</label>
            <select
              value={tenantUpdateForm.is_active ? "true" : "false"}
              onChange={(event) =>
                setTenantUpdateForm({
                  ...tenantUpdateForm,
                  is_active: event.target.value === "true",
                })
              }
            >
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </div>
          <button className="settings-primary" type="submit">
            Guardar cambios
          </button>
        </form>
      </div>

      <div className="dash-card">
        <div className="dash-card-header">
          <div>
            <div className="dash-card-title">Tenant DB</div>
            <div className="dash-card-subtitle">URL por tenant</div>
          </div>
        </div>
        <form className="settings-form" onSubmit={handleSetDb}>
          <div className="settings-field">
            <label>Tenant</label>
            <select
              value={dbForm.tenant_id}
              onChange={(event) =>
                setDbForm({ ...dbForm, tenant_id: event.target.value })
              }
            >
              <option value="">Seleccionar</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-field">
            <label>Database URL</label>
            <input
              value={dbForm.db_url}
              onChange={(event) =>
                setDbForm({ ...dbForm, db_url: event.target.value })
              }
              placeholder="postgresql://..."
            />
          </div>
          <button className="settings-primary" type="submit">
            Guardar DB
          </button>
        </form>
      </div>

      <div className="dash-card">
        <div className="dash-card-header">
          <div>
            <div className="dash-card-title">Channels</div>
            <div className="dash-card-subtitle">WhatsApp Cloud</div>
          </div>
        </div>
        <form className="settings-form" onSubmit={handleCreateChannel}>
          <div className="settings-field">
            <label>Tenant</label>
            <select
              value={channelForm.tenant_id}
              onChange={(event) =>
                setChannelForm({ ...channelForm, tenant_id: event.target.value })
              }
            >
              <option value="">Seleccionar</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-field">
            <label>Phone Number ID</label>
            <input
              value={channelForm.phone_number_id}
              onChange={(event) =>
                setChannelForm({
                  ...channelForm,
                  phone_number_id: event.target.value,
                })
              }
              placeholder="123456789"
            />
          </div>
          <div className="settings-field">
            <label>Verify Token</label>
            <input
              value={channelForm.verify_token}
              onChange={(event) =>
                setChannelForm({
                  ...channelForm,
                  verify_token: event.target.value,
                })
              }
              placeholder="verify-token"
            />
          </div>
          <div className="settings-field">
            <label>WA Token</label>
            <input
              value={channelForm.wa_token}
              onChange={(event) =>
                setChannelForm({
                  ...channelForm,
                  wa_token: event.target.value,
                })
              }
              placeholder="token"
            />
          </div>
          <button className="settings-primary" type="submit">
            Crear canal
          </button>
        </form>
        <div className="settings-list">
          {channels.map((channel) => (
            <div key={channel.id} className="settings-row">
              <div>
                <strong>{channel.phone_number_id}</strong>
                <div className="settings-meta">ID: {channel.id}</div>
              </div>
              <div>{channel.provider}</div>
            </div>
          ))}
        </div>
        <form className="settings-form" onSubmit={handleUpdateChannel}>
          <div className="settings-field">
            <label>Editar canal</label>
            <select
              value={channelUpdateForm.channel_id}
              onChange={(event) => handleChannelSelect(event.target.value)}
            >
              <option value="">Seleccionar</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.phone_number_id}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-field">
            <label>Phone Number ID</label>
            <input
              value={channelUpdateForm.phone_number_id}
              onChange={(event) =>
                setChannelUpdateForm({
                  ...channelUpdateForm,
                  phone_number_id: event.target.value,
                })
              }
            />
          </div>
          <div className="settings-field">
            <label>Verify Token (nuevo)</label>
            <input
              value={channelUpdateForm.verify_token}
              onChange={(event) =>
                setChannelUpdateForm({
                  ...channelUpdateForm,
                  verify_token: event.target.value,
                })
              }
            />
          </div>
          <div className="settings-field">
            <label>WA Token (nuevo)</label>
            <input
              value={channelUpdateForm.wa_token}
              onChange={(event) =>
                setChannelUpdateForm({
                  ...channelUpdateForm,
                  wa_token: event.target.value,
                })
              }
            />
          </div>
          <button className="settings-primary" type="submit">
            Actualizar canal
          </button>
        </form>
      </div>

      <div className="dash-card">
        <div className="dash-card-header">
          <div>
            <div className="dash-card-title">Branding</div>
            <div className="dash-card-subtitle">Nombre y logo</div>
          </div>
        </div>
        <form className="settings-form" onSubmit={handleSaveBranding}>
          <div className="settings-field">
            <label>Tenant</label>
            <select
              value={brandingForm.tenant_id}
              onChange={(event) =>
                setBrandingForm({
                  ...brandingForm,
                  tenant_id: event.target.value,
                })
              }
            >
              <option value="">Seleccionar</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-field">
            <label>Brand name</label>
            <input
              value={brandingForm.brand_name}
              onChange={(event) =>
                setBrandingForm({
                  ...brandingForm,
                  brand_name: event.target.value,
                })
              }
              placeholder="Podopie"
            />
          </div>
          <div className="settings-field">
            <label>Logo URL</label>
            <input
              value={brandingForm.logo_url}
              onChange={(event) =>
                setBrandingForm({
                  ...brandingForm,
                  logo_url: event.target.value,
                })
              }
              placeholder="https://..."
            />
          </div>
          <div className="settings-field">
            <label>Colors (JSON)</label>
            <input
              value={brandingForm.colors}
              onChange={(event) =>
                setBrandingForm({
                  ...brandingForm,
                  colors: event.target.value,
                })
              }
              placeholder='{"primary":"#1e3a8a"}'
            />
          </div>
          <div className="settings-field">
            <label>Timezone</label>
            <input
              value={brandingForm.timezone}
              onChange={(event) =>
                setBrandingForm({
                  ...brandingForm,
                  timezone: event.target.value,
                })
              }
              placeholder="America/La_Paz"
            />
          </div>
          <button className="settings-primary" type="submit">
            Guardar branding
          </button>
        </form>
      </div>
    </div>
  );
}

export default SuperAdminView;
