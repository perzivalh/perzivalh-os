/**
 * UsersSection - Gestión de usuarios y roles
 */
import React, { useMemo, useState } from "react";
import { MAIN_MODULES, SETTINGS_MODULES, getRoleMeta } from "./constants";

function UsersSection({
    settingsTab,
    setSettingsTab,
    rolePermissions,
    setRolePermissions,
    isAdmin,
    adminUsers,
    userForm,
    setUserForm,
    roleOptions,
    handleUserSubmit,
    handleUserDelete,
    defaultRolePermissions,
    handleRoleDelete,
}) {
    const [userSearch, setUserSearch] = useState("");
    const [showUserForm, setShowUserForm] = useState(false);
    const [activeUserMenu, setActiveUserMenu] = useState("");
    const [userToDelete, setUserToDelete] = useState(null);
    const [roleModalOpen, setRoleModalOpen] = useState(false);
    const [roleModalMode, setRoleModalMode] = useState("create");
    const [roleFormRole, setRoleFormRole] = useState("recepcion");
    const [roleDraft, setRoleDraft] = useState({ modules: {}, settings: {} });

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

    function normalizePermissions(roleKey) {
        const base =
            rolePermissions?.[roleKey] ||
            defaultRolePermissions?.[roleKey] || { modules: {}, settings: {} };
        return {
            modules: { ...(base.modules || {}) },
            settings: { ...(base.settings || {}) },
        };
    }

    function handleOpenRoleModal(roleKey, mode = "edit") {
        setRoleModalMode(mode);
        setRoleFormRole(roleKey);
        setRoleDraft(normalizePermissions(roleKey));
        setRoleModalOpen(true);
    }

    function handleRoleDraftToggle(group, key, action) {
        setRoleDraft((prev) => {
            const next = { ...prev };
            const groupEntry = { ...(next[group] || {}) };
            const current = { ...(groupEntry[key] || {}) };
            const nextValue = !current[action];
            current[action] = nextValue;
            if (action === "write" && nextValue) {
                current.read = true;
            }
            if (action === "read" && !nextValue) {
                current.write = false;
            }
            groupEntry[key] = current;
            next[group] = groupEntry;
            return next;
        });
    }

    function handleSaveRoleDraft() {
        if (!roleFormRole) {
            return;
        }
        setRolePermissions((prev) => ({
            ...prev,
            [roleFormRole]: roleDraft,
        }));
        setRoleModalOpen(false);
    }

    function handleDeleteRoleDraft() {
        if (roleFormRole && handleRoleDelete) {
            handleRoleDelete(roleFormRole);
        }
        setRoleModalOpen(false);
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

    return (
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
                        <button
                            className="settings-primary"
                            type="button"
                            onClick={() => handleOpenRoleModal("recepcion", "create")}
                        >
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
                                    className={`status-pill ${user.is_active ? "active" : "inactive"
                                        }`}
                                >
                                    {user.is_active ? "Activo" : "Inactivo"}
                                </span>
                            </div>
                            <div className="users-cell">
                                <div className="users-actions-menu">
                                    <button
                                        className="users-action"
                                        type="button"
                                        onClick={() =>
                                            setActiveUserMenu((prev) =>
                                                prev === user.id ? "" : user.id
                                            )
                                        }
                                    >
                                        ...
                                    </button>
                                    {activeUserMenu === user.id && (
                                        <div className="users-menu">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setActiveUserMenu("");
                                                    handleEditUser(user);
                                                }}
                                            >
                                                Editar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setActiveUserMenu("");
                                                    setUserToDelete(user);
                                                }}
                                            >
                                                Eliminar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    {!filteredUsers.length && (
                        <div className="empty-state">Sin usuarios para mostrar</div>
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
                                    <button
                                        className="role-edit"
                                        type="button"
                                        onClick={() => handleOpenRoleModal(role, "edit")}
                                    >
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

            {/* User Form Modal */}
            {showUserForm && (
                <div className="modal-overlay">
                    <div className="modal-card">
                        <div className="modal-header">
                            <div className="modal-title">
                                {userForm.id ? "Editar usuario" : "Crear usuario"}
                            </div>
                            <button
                                className="modal-close"
                                type="button"
                                onClick={() => setShowUserForm(false)}
                            >
                                x
                            </button>
                        </div>
                        <form
                            className="form-grid"
                            onSubmit={async (event) => {
                                await handleUserSubmit(event);
                                setShowUserForm(false);
                            }}
                        >
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
                </div>
            )}

            {/* Delete User Modal */}
            {userToDelete && (
                <div className="modal-overlay">
                    <div className="modal-card">
                        <div className="modal-header">
                            <div className="modal-title">Eliminar usuario</div>
                            <button
                                className="modal-close"
                                type="button"
                                onClick={() => setUserToDelete(null)}
                            >
                                x
                            </button>
                        </div>
                        <p className="modal-text">
                            Vas a desactivar a <strong>{userToDelete.email}</strong>. ¿Continuar?
                        </p>
                        <div className="form-actions">
                            <button
                                className="danger"
                                type="button"
                                onClick={() => {
                                    handleUserDelete?.(userToDelete.id);
                                    setUserToDelete(null);
                                }}
                            >
                                Eliminar
                            </button>
                            <button
                                className="ghost"
                                type="button"
                                onClick={() => setUserToDelete(null)}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Role Modal */}
            {roleModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-card modal-lg">
                        <div className="modal-header">
                            <div className="modal-title">
                                {roleModalMode === "create" ? "Nuevo rol" : "Editar rol"}
                            </div>
                            <button
                                className="modal-close"
                                type="button"
                                onClick={() => setRoleModalOpen(false)}
                            >
                                x
                            </button>
                        </div>
                        <div className="form-grid">
                            <label className="field">
                                <span>Rol</span>
                                {roleModalMode === "edit" ? (
                                    <select value={roleFormRole} disabled>
                                        {roleOptions.map((role) => (
                                            <option value={role} key={role}>
                                                {role}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <>
                                        <input
                                            type="text"
                                            list="role-options"
                                            placeholder="nuevo-rol"
                                            value={roleFormRole}
                                            onChange={(event) => setRoleFormRole(event.target.value)}
                                        />
                                        <datalist id="role-options">
                                            {roleOptions.map((role) => (
                                                <option value={role} key={role} />
                                            ))}
                                        </datalist>
                                    </>
                                )}
                            </label>
                            <div className="role-permissions">
                                <div className="perm-head">
                                    <span>Modulos</span>
                                    <span>Lectura</span>
                                    <span>Escritura</span>
                                </div>
                                {MAIN_MODULES.map((module) => (
                                    <div className="perm-row" key={module.id}>
                                        <span>{module.label}</span>
                                        <label className="perm-toggle">
                                            <input
                                                type="checkbox"
                                                checked={roleDraft?.modules?.[module.id]?.read || false}
                                                onChange={() =>
                                                    handleRoleDraftToggle("modules", module.id, "read")
                                                }
                                            />
                                            <span />
                                        </label>
                                        <label className="perm-toggle">
                                            <input
                                                type="checkbox"
                                                checked={roleDraft?.modules?.[module.id]?.write || false}
                                                onChange={() =>
                                                    handleRoleDraftToggle("modules", module.id, "write")
                                                }
                                            />
                                            <span />
                                        </label>
                                    </div>
                                ))}
                            </div>
                            <div className="role-settings">
                                <div className="perm-head">
                                    <span>Configuracion</span>
                                    <span>Lectura</span>
                                    <span>Escritura</span>
                                </div>
                                {SETTINGS_MODULES.map((module) => (
                                    <div className="perm-row" key={module.id}>
                                        <span>{module.label}</span>
                                        <label className="perm-toggle">
                                            <input
                                                type="checkbox"
                                                checked={roleDraft?.settings?.[module.id]?.read || false}
                                                onChange={() =>
                                                    handleRoleDraftToggle("settings", module.id, "read")
                                                }
                                            />
                                            <span />
                                        </label>
                                        <label className="perm-toggle">
                                            <input
                                                type="checkbox"
                                                checked={roleDraft?.settings?.[module.id]?.write || false}
                                                onChange={() =>
                                                    handleRoleDraftToggle("settings", module.id, "write")
                                                }
                                            />
                                            <span />
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="form-actions">
                            {roleModalMode === "edit" && (
                                <button className="danger" type="button" onClick={handleDeleteRoleDraft}>
                                    Eliminar rol
                                </button>
                            )}
                            <button
                                className="primary"
                                type="button"
                                onClick={handleSaveRoleDraft}
                                disabled={!roleFormRole}
                            >
                                Guardar
                            </button>
                            <button
                                className="ghost"
                                type="button"
                                onClick={() => setRoleModalOpen(false)}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default UsersSection;
