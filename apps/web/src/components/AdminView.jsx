import React, { useMemo, useState } from "react";

const ROLE_LABELS = {
  admin: { title: "Administrador", subtitle: "Acceso total", tone: "alert" },
  recepcion: { title: "Operador", subtitle: "Atencion al cliente", tone: "info" },
  caja: { title: "Supervisor", subtitle: "Auditoria y gestion", tone: "dark" },
  marketing: { title: "Marketing", subtitle: "Crecimiento y campanas", tone: "info" },
  doctor: { title: "Doctor", subtitle: "Atencion al cliente", tone: "dark" },
};

const MAIN_MODULES = [
  { id: "chat", label: "Chat" },
  { id: "dashboard", label: "Dashboard" },
  { id: "campaigns", label: "Campanas" },
];

const SETTINGS_MODULES = [
  { id: "general", label: "General" },
  { id: "users", label: "Gestion de Usuarios" },
  { id: "bot", label: "Configuracion de Bot" },
  { id: "templates", label: "Plantillas de Meta" },
  { id: "audit", label: "Registros / Auditoria" },
  { id: "odoo", label: "Integracion Odoo" },
];

function getRoleMeta(role) {
  return ROLE_LABELS[role] || {
    title: role,
    subtitle: "Acceso personalizado",
    tone: "info",
  };
}

function AdminView({
  settingsSection,
  setSettingsSection,
  settingsTab,
  setSettingsTab,
  rolePermissions,
  setRolePermissions,
  currentRole,
  isAdmin,
  adminUsers,
  userForm,
  setUserForm,
  roleOptions,
  handleUserSubmit,
  settings,
  setSettings,
  handleSaveSettings,
  branches,
  services,
  branchForm,
  setBranchForm,
  handleBranchSubmit,
  handleBranchDisable,
  serviceForm,
  setServiceForm,
  handleServiceSubmit,
  handleServiceDisable,
  handleServiceBranchToggle,
  templates,
  templateForm,
  setTemplateForm,
  handleTemplateSubmit,
  handleSyncTemplates,
  auditLogs,
  formatDate,
  useShellLayout = false,
  pageError,
}) {
  const [userSearch, setUserSearch] = useState("");
  const [showUserForm, setShowUserForm] = useState(false);

  const roleAccess = rolePermissions?.[currentRole];
  const settingsMenu = [
    {
      title: "Principal",
      items: [
        { id: "general", label: "General" },
        { id: "users", label: "Gestion de Usuarios" },
        { id: "bot", label: "Configuracion de Bot" },
      ],
    },
    {
      title: "Canales e Integraciones",
      items: [
        { id: "templates", label: "Plantillas de Meta" },
        { id: "audit", label: "Registros / Auditoria" },
        { id: "odoo", label: "Integracion Odoo" },
      ],
    },
  ];

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) {
      return adminUsers;
    }
    return adminUsers.filter((user) => {
      const name = user.name?.toLowerCase() || "";
      const email = user.email?.toLowerCase() || "";
      return name.includes(query) || email.includes(query);
    });
  }, [adminUsers, userSearch]);

  function hasSettingsAccess(section) {
    return Boolean(roleAccess?.settings?.[section]?.read);
  }

  function handleSectionClick(section) {
    if (!hasSettingsAccess(section)) {
      return;
    }
    setSettingsSection(section);
  }

  function handlePermissionToggle(role, group, key, action) {
    if (!isAdmin) {
      return;
    }
    setRolePermissions((prev) => {
      const next = { ...prev };
      const roleEntry = {
        modules: { ...next[role]?.modules },
        settings: { ...next[role]?.settings },
      };
      const groupEntry = { ...roleEntry[group] };
      const current = { ...groupEntry[key] };
      const nextValue = !current[action];
      current[action] = nextValue;
      if (action === "write" && nextValue) {
        current.read = true;
      }
      if (action === "read" && !nextValue) {
        current.write = false;
      }
      groupEntry[key] = current;
      roleEntry[group] = groupEntry;
      next[role] = roleEntry;
      return next;
    });
  }

  function formatUserRole(role) {
    const meta = getRoleMeta(role);
    return meta.title.toUpperCase();
  }

  function formatUserId(user, index) {
    if (user?.id) {
      return `OP-${user.id.slice(-4).toUpperCase()}`;
    }
    return `OP-${String(index + 1).padStart(4, "0")}`;
  }

  function handleEditUser(user) {
    setUserForm({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      password: "",
      is_active: user.is_active,
    });
    setShowUserForm(true);
  }

  function handleNewUser() {
    setUserForm({
      id: "",
      name: "",
      email: "",
      role: "recepcion",
      password: "",
      is_active: true,
    });
    setShowUserForm(true);
  }

  const content = (
    <>
      <aside className="settings-sidebar">
        <div className="settings-header">
          <div className="settings-title">CONFIGURACION</div>
          <div className="settings-version">PODOPIE OS V2.0</div>
        </div>
        {settingsMenu.map((group) => (
          <div className="settings-group" key={group.title}>
            <div className="settings-group-title">{group.title}</div>
            <div className="settings-group-list">
              {group.items.map((item) => {
                const disabled = !hasSettingsAccess(item.id);
                return (
                  <button
                    key={item.id}
                    className={`settings-item ${
                      settingsSection === item.id ? "active" : ""
                    }`}
                    type="button"
                    onClick={() => handleSectionClick(item.id)}
                    disabled={disabled}
                  >
                    <span className="settings-icon" aria-hidden="true" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div className="settings-plan">
          <div className="settings-plan-label">Plan actual</div>
          <div className="settings-plan-name">Enterprise CRM</div>
        </div>
      </aside>
      <div className="settings-content">
        {settingsSection === "users" && (
          <div className="users-page">
            <header className="users-header">
              <div className="users-title-row">
                <span className="users-kicker" />
                <div>
                  <div className="users-title">Gestion de Usuarios</div>
                  <div className="users-subtitle">
                    Administra los accesos y roles de los operadores de tu empresa.
                  </div>
                </div>
              </div>
              <div className="users-actions">
                {settingsTab === "list" && (
                  <>
                    <div className="users-search">
                      <span className="users-search-icon" aria-hidden="true" />
                      <input
                        type="text"
                        placeholder="Buscar usuario..."
                        value={userSearch}
                        onChange={(event) => setUserSearch(event.target.value)}
                      />
                    </div>
                    <button
                      className="settings-primary"
                      type="button"
                      onClick={handleNewUser}
                    >
                      Nuevo Usuario
                    </button>
                  </>
                )}
                {settingsTab === "roles" && (
                  <button className="settings-primary" type="button">
                    + Nuevo Rol
                  </button>
                )}
              </div>
            </header>

            <div className="users-tabs">
              <button
                className={`users-tab ${settingsTab === "list" ? "active" : ""}`}
                type="button"
                onClick={() => setSettingsTab("list")}
              >
                Lista de Usuarios
              </button>
              <button
                className={`users-tab ${settingsTab === "roles" ? "active" : ""}`}
                type="button"
                onClick={() => setSettingsTab("roles")}
              >
                Roles y Permisos
              </button>
            </div>

            {settingsTab === "list" && (
              <div className="users-table">
                <div className="users-table-head">
                  <span>Nombre / Usuario</span>
                  <span>Email</span>
                  <span>Rol</span>
                  <span>Estado</span>
                  <span>Acciones</span>
                </div>
                {filteredUsers.map((user, index) => (
                  <div className="users-row" key={user.id}>
                    <div className="users-cell user-name">
                      <div className="user-avatar">{user.name?.[0] || "?"}</div>
                      <div>
                        <div className="user-title">{user.name}</div>
                        <div className="user-id">{formatUserId(user, index)}</div>
                      </div>
                    </div>
                    <div className="users-cell">{user.email}</div>
                    <div className="users-cell">
                      <span className={`role-pill ${user.role}`}>
                        {formatUserRole(user.role)}
                      </span>
                    </div>
                    <div className="users-cell">
                      <span
                        className={`status-pill ${
                          user.is_active ? "active" : "inactive"
                        }`}
                      >
                        {user.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                    <div className="users-cell">
                      <button
                        className="users-action"
                        type="button"
                        onClick={() => handleEditUser(user)}
                      >
                        ...
                      </button>
                    </div>
                  </div>
                ))}
                {!filteredUsers.length && (
                  <div className="empty-state">Sin usuarios para mostrar</div>
                )}
                {showUserForm && (
                  <div className="users-form">
                    <div className="panel-title">
                      {userForm.id ? "Editar usuario" : "Crear usuario"}
                    </div>
                    <form className="form-grid" onSubmit={handleUserSubmit}>
                      <label className="field">
                        <span>Nombre</span>
                        <input
                          type="text"
                          value={userForm.name}
                          onChange={(event) =>
                            setUserForm((prev) => ({
                              ...prev,
                              name: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Email</span>
                        <input
                          type="email"
                          value={userForm.email}
                          onChange={(event) =>
                            setUserForm((prev) => ({
                              ...prev,
                              email: event.target.value,
                            }))
                          }
                          disabled={Boolean(userForm.id)}
                        />
                      </label>
                      <label className="field">
                        <span>Rol</span>
                        <select
                          value={userForm.role}
                          onChange={(event) =>
                            setUserForm((prev) => ({
                              ...prev,
                              role: event.target.value,
                            }))
                          }
                        >
                          {roleOptions.map((role) => (
                            <option value={role} key={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Password</span>
                        <input
                          type="password"
                          value={userForm.password}
                          onChange={(event) =>
                            setUserForm((prev) => ({
                              ...prev,
                              password: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={userForm.is_active}
                          onChange={(event) =>
                            setUserForm((prev) => ({
                              ...prev,
                              is_active: event.target.checked,
                            }))
                          }
                        />
                        Activo
                      </label>
                      <div className="form-actions">
                        <button className="primary" type="submit">
                          {userForm.id ? "Guardar cambios" : "Crear"}
                        </button>
                        <button
                          className="ghost"
                          type="button"
                          onClick={() => setShowUserForm(false)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            )}

            {settingsTab === "roles" && (
              <div className="roles-grid">
                {roleOptions.map((role) => {
                  const meta = getRoleMeta(role);
                  const permissions = rolePermissions?.[role];
                  return (
                    <div className="role-card" key={role}>
                      <div className="role-header">
                        <div>
                          <div className="role-title">{meta.title}</div>
                          <div className={`role-subtitle ${meta.tone}`}>
                            {meta.subtitle}
                          </div>
                        </div>
                        <button className="role-edit" type="button">
                          edit
                        </button>
                      </div>
                      <div className="role-permissions">
                        <div className="perm-head">
                          <span />
                          <span>Lectura</span>
                          <span>Escritura</span>
                        </div>
                        {MAIN_MODULES.map((module) => (
                          <div className="perm-row" key={module.id}>
                            <span>{module.label}</span>
                            <label className="perm-toggle">
                              <input
                                type="checkbox"
                                checked={
                                  permissions?.modules?.[module.id]?.read || false
                                }
                                disabled={!isAdmin}
                                onChange={() =>
                                  handlePermissionToggle(
                                    role,
                                    "modules",
                                    module.id,
                                    "read"
                                  )
                                }
                              />
                              <span />
                            </label>
                            <label className="perm-toggle">
                              <input
                                type="checkbox"
                                checked={
                                  permissions?.modules?.[module.id]?.write || false
                                }
                                disabled={!isAdmin}
                                onChange={() =>
                                  handlePermissionToggle(
                                    role,
                                    "modules",
                                    module.id,
                                    "write"
                                  )
                                }
                              />
                              <span />
                            </label>
                          </div>
                        ))}
                      </div>
                      <div className="role-settings">
                        <div className="role-settings-title">Configuracion</div>
                        {SETTINGS_MODULES.map((module) => (
                          <div className="perm-row" key={module.id}>
                            <span>{module.label}</span>
                            <label className="perm-toggle">
                              <input
                                type="checkbox"
                                checked={
                                  permissions?.settings?.[module.id]?.read || false
                                }
                                disabled={!isAdmin}
                                onChange={() =>
                                  handlePermissionToggle(
                                    role,
                                    "settings",
                                    module.id,
                                    "read"
                                  )
                                }
                              />
                              <span />
                            </label>
                            <label className="perm-toggle">
                              <input
                                type="checkbox"
                                checked={
                                  permissions?.settings?.[module.id]?.write || false
                                }
                                disabled={!isAdmin}
                                onChange={() =>
                                  handlePermissionToggle(
                                    role,
                                    "settings",
                                    module.id,
                                    "write"
                                  )
                                }
                              />
                              <span />
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {settingsSection === "general" && (
          <div className="page-grid">
            <div className="panel">
              <div className="panel-title">Sucursales</div>
              <div className="table">
                <div className="table-head">
                  <span>Nombre</span>
                  <span>Codigo</span>
                  <span>Estado</span>
                  <span>Accion</span>
                </div>
                {branches.map((branch) => (
                  <div className="table-row" key={branch.id}>
                    <span>{branch.name}</span>
                    <span>{branch.code}</span>
                    <span>{branch.is_active ? "Activa" : "Inactiva"}</span>
                    <div className="row-actions">
                      <button
                        className="ghost"
                        onClick={() =>
                          setBranchForm({
                            id: branch.id,
                            code: branch.code,
                            name: branch.name,
                            address: branch.address,
                            lat: branch.lat,
                            lng: branch.lng,
                            hours_text: branch.hours_text,
                            phone: branch.phone || "",
                            is_active: branch.is_active,
                          })
                        }
                      >
                        Editar
                      </button>
                      <button
                        className="danger"
                        onClick={() => handleBranchDisable(branch.id)}
                      >
                        Desactivar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="panel-title">
                {branchForm.id ? "Editar sucursal" : "Crear sucursal"}
              </div>
              <form className="form-grid" onSubmit={handleBranchSubmit}>
                <label className="field">
                  <span>Codigo</span>
                  <input
                    type="text"
                    value={branchForm.code}
                    onChange={(event) =>
                      setBranchForm((prev) => ({
                        ...prev,
                        code: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Nombre</span>
                  <input
                    type="text"
                    value={branchForm.name}
                    onChange={(event) =>
                      setBranchForm((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Direccion</span>
                  <input
                    type="text"
                    value={branchForm.address}
                    onChange={(event) =>
                      setBranchForm((prev) => ({
                        ...prev,
                        address: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Lat</span>
                  <input
                    type="number"
                    value={branchForm.lat}
                    onChange={(event) =>
                      setBranchForm((prev) => ({
                        ...prev,
                        lat: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Lng</span>
                  <input
                    type="number"
                    value={branchForm.lng}
                    onChange={(event) =>
                      setBranchForm((prev) => ({
                        ...prev,
                        lng: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Telefono</span>
                  <input
                    type="text"
                    value={branchForm.phone}
                    onChange={(event) =>
                      setBranchForm((prev) => ({
                        ...prev,
                        phone: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Horarios</span>
                  <textarea
                    rows="3"
                    value={branchForm.hours_text}
                    onChange={(event) =>
                      setBranchForm((prev) => ({
                        ...prev,
                        hours_text: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={branchForm.is_active}
                    onChange={(event) =>
                      setBranchForm((prev) => ({
                        ...prev,
                        is_active: event.target.checked,
                      }))
                    }
                  />
                  Activa
                </label>
                <div className="form-actions">
                  <button className="primary" type="submit">
                    Guardar
                  </button>
                </div>
              </form>
            </div>
            <div className="panel">
              <div className="panel-title">Servicios</div>
              <div className="table">
                <div className="table-head">
                  <span>Servicio</span>
                  <span>Precio</span>
                  <span>Estado</span>
                  <span>Accion</span>
                </div>
                {services.map((service) => (
                  <div className="table-row" key={service.id}>
                    <span>{service.name}</span>
                    <span>Bs {service.price_bob}</span>
                    <span>{service.is_active ? "Activo" : "Inactivo"}</span>
                    <div className="row-actions">
                      <button
                        className="ghost"
                        onClick={() =>
                          setServiceForm({
                            id: service.id,
                            code: service.code,
                            name: service.name,
                            subtitle: service.subtitle || "",
                            description: service.description,
                            price_bob: service.price_bob,
                            duration_min: service.duration_min || "",
                            image_url: service.image_url || "",
                            is_featured: service.is_featured,
                            is_active: service.is_active,
                          })
                        }
                      >
                        Editar
                      </button>
                      <button
                        className="danger"
                        onClick={() => handleServiceDisable(service.id)}
                      >
                        Desactivar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="panel-title">
                {serviceForm.id ? "Editar servicio" : "Crear servicio"}
              </div>
              <form className="form-grid" onSubmit={handleServiceSubmit}>
                <label className="field">
                  <span>Codigo</span>
                  <input
                    type="text"
                    value={serviceForm.code}
                    onChange={(event) =>
                      setServiceForm((prev) => ({
                        ...prev,
                        code: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Nombre</span>
                  <input
                    type="text"
                    value={serviceForm.name}
                    onChange={(event) =>
                      setServiceForm((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Subtitulo</span>
                  <input
                    type="text"
                    value={serviceForm.subtitle}
                    onChange={(event) =>
                      setServiceForm((prev) => ({
                        ...prev,
                        subtitle: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Descripcion</span>
                  <textarea
                    rows="3"
                    value={serviceForm.description}
                    onChange={(event) =>
                      setServiceForm((prev) => ({
                        ...prev,
                        description: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Precio (Bs)</span>
                  <input
                    type="number"
                    value={serviceForm.price_bob}
                    onChange={(event) =>
                      setServiceForm((prev) => ({
                        ...prev,
                        price_bob: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Duracion (min)</span>
                  <input
                    type="number"
                    value={serviceForm.duration_min}
                    onChange={(event) =>
                      setServiceForm((prev) => ({
                        ...prev,
                        duration_min: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Imagen URL</span>
                  <input
                    type="text"
                    value={serviceForm.image_url}
                    onChange={(event) =>
                      setServiceForm((prev) => ({
                        ...prev,
                        image_url: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={serviceForm.is_featured}
                    onChange={(event) =>
                      setServiceForm((prev) => ({
                        ...prev,
                        is_featured: event.target.checked,
                      }))
                    }
                  />
                  Destacado
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={serviceForm.is_active}
                    onChange={(event) =>
                      setServiceForm((prev) => ({
                        ...prev,
                        is_active: event.target.checked,
                      }))
                    }
                  />
                  Activo
                </label>
                {serviceForm.id && (
                  <div className="field">
                    <span>Disponibilidad por sucursal</span>
                    <div className="chip-grid">
                      {branches.map((branch) => {
                        const mapping = services
                          .find((item) => item.id === serviceForm.id)
                          ?.branches?.find((entry) => {
                            const branchId = entry.branch?.id || entry.branch_id;
                            return branchId === branch.id;
                          });
                        const available = mapping?.is_available || false;
                        return (
                          <label className="chip" key={branch.id}>
                            <input
                              type="checkbox"
                              checked={available}
                              onChange={(event) =>
                                handleServiceBranchToggle(
                                  services.find((item) => item.id === serviceForm.id),
                                  branch.id,
                                  event.target.checked
                                )
                              }
                            />
                            {branch.name}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="form-actions">
                  <button className="primary" type="submit">
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {settingsSection === "bot" && (
          <div className="panel">
            <div className="panel-title">Configuracion de Bot</div>
            {settings ? (
              <>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.bot_enabled}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        bot_enabled: event.target.checked,
                      }))
                    }
                  />
                  Bot enabled
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.auto_reply_enabled}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        auto_reply_enabled: event.target.checked,
                      }))
                    }
                  />
                  Auto reply enabled
                </label>
                <button className="primary" onClick={handleSaveSettings}>
                  Guardar settings
                </button>
              </>
            ) : (
              <div className="empty-state">Cargando settings...</div>
            )}
          </div>
        )}
        {settingsSection === "templates" && (
          <div className="page-grid">
            <div className="panel">
              <div className="panel-title">Templates</div>
              <button className="ghost" onClick={handleSyncTemplates}>
                Sincronizar WhatsApp
              </button>
              <div className="table">
                <div className="table-head">
                  <span>Nombre</span>
                  <span>Lang</span>
                  <span>Estado</span>
                  <span>Accion</span>
                </div>
                {templates.map((template) => (
                  <div className="table-row" key={template.id}>
                    <span>{template.name}</span>
                    <span>{template.language}</span>
                    <span>{template.is_active ? "Activo" : "Inactivo"}</span>
                    <button
                      className="ghost"
                      onClick={() =>
                        setTemplateForm({
                          id: template.id,
                          name: template.name,
                          language: template.language,
                          category: template.category || "",
                          body_preview: template.body_preview,
                          is_active: template.is_active,
                        })
                      }
                    >
                      Editar
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel">
              <div className="panel-title">
                {templateForm.id ? "Editar template" : "Crear template"}
              </div>
              <form className="form-grid" onSubmit={handleTemplateSubmit}>
                <label className="field">
                  <span>Nombre</span>
                  <input
                    type="text"
                    value={templateForm.name}
                    onChange={(event) =>
                      setTemplateForm((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Idioma</span>
                  <input
                    type="text"
                    value={templateForm.language}
                    onChange={(event) =>
                      setTemplateForm((prev) => ({
                        ...prev,
                        language: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Categoria</span>
                  <input
                    type="text"
                    value={templateForm.category}
                    onChange={(event) =>
                      setTemplateForm((prev) => ({
                        ...prev,
                        category: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Preview</span>
                  <textarea
                    rows="4"
                    value={templateForm.body_preview}
                    onChange={(event) =>
                      setTemplateForm((prev) => ({
                        ...prev,
                        body_preview: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={templateForm.is_active}
                    onChange={(event) =>
                      setTemplateForm((prev) => ({
                        ...prev,
                        is_active: event.target.checked,
                      }))
                    }
                  />
                  Activo
                </label>
                <div className="form-actions">
                  <button className="primary" type="submit">
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {settingsSection === "audit" && (
          <div className="panel">
            <div className="panel-title">Audit logs</div>
            <div className="table">
              <div className="table-head">
                <span>Accion</span>
                <span>Fecha</span>
                <span>Data</span>
              </div>
              {auditLogs.map((log) => (
                <div className="table-row" key={log.id}>
                  <span>{log.action}</span>
                  <span>{formatDate(log.created_at)}</span>
                  <span className="muted">
                    {JSON.stringify(log.data_json || {})}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {settingsSection === "odoo" && (
          <div className="panel">
            <div className="panel-title">Integracion Odoo</div>
            <div className="empty-state">Seccion en construccion</div>
          </div>
        )}
        {pageError && <div className="error-banner">{pageError}</div>}
      </div>
    </>
  );

  if (useShellLayout) {
    return content;
  }

  return <section className="settings-layout">{content}</section>;
}

export default AdminView;
