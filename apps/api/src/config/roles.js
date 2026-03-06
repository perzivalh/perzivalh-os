/**
 * Configuracion de roles y permisos por defecto
 */

const ROLE_OPTIONS = ["admin", "recepcion", "caja", "marketing", "doctor"];
const RESERVED_ROLE_OPTIONS = ["superadmin"];
const MODULE_PERMISSION_KEYS = ["chat", "dashboard", "campaigns", "settings"];
const SETTINGS_PERMISSION_KEYS = [
    "general",
    "users",
    "bot",
    "company",
    "templates",
    "audit",
    "odoo",
];

const DEFAULT_ROLE_PERMISSIONS = {
    admin: {
        modules: {
            chat: { read: true, write: true },
            dashboard: { read: true, write: true },
            campaigns: { read: true, write: true },
            settings: { read: true, write: true },
        },
        settings: {
            general: { read: true, write: true },
            users: { read: true, write: true },
            bot: { read: true, write: true },
            company: { read: true, write: true },
            templates: { read: true, write: true },
            audit: { read: true, write: true },
            odoo: { read: true, write: true },
        },
    },
    recepcion: {
        modules: {
            chat: { read: true, write: true },
            dashboard: { read: true, write: false },
            campaigns: { read: false, write: false },
            settings: { read: false, write: false },
        },
        settings: {
            general: { read: false, write: false },
            users: { read: false, write: false },
            bot: { read: false, write: false },
            company: { read: false, write: false },
            templates: { read: false, write: false },
            audit: { read: false, write: false },
            odoo: { read: false, write: false },
        },
    },
    caja: {
        modules: {
            chat: { read: true, write: false },
            dashboard: { read: true, write: false },
            campaigns: { read: false, write: false },
            settings: { read: false, write: false },
        },
        settings: {
            general: { read: false, write: false },
            users: { read: false, write: false },
            bot: { read: false, write: false },
            company: { read: false, write: false },
            templates: { read: false, write: false },
            audit: { read: false, write: false },
            odoo: { read: false, write: false },
        },
    },
    marketing: {
        modules: {
            chat: { read: false, write: false },
            dashboard: { read: true, write: false },
            campaigns: { read: true, write: true },
            settings: { read: true, write: false },
        },
        settings: {
            general: { read: true, write: false },
            users: { read: false, write: false },
            bot: { read: false, write: false },
            company: { read: true, write: true },
            templates: { read: true, write: true },
            audit: { read: false, write: false },
            odoo: { read: false, write: false },
        },
    },
    doctor: {
        modules: {
            chat: { read: true, write: false },
            dashboard: { read: false, write: false },
            campaigns: { read: false, write: false },
            settings: { read: false, write: false },
        },
        settings: {
            general: { read: false, write: false },
            users: { read: false, write: false },
            bot: { read: false, write: false },
            company: { read: false, write: false },
            templates: { read: false, write: false },
            audit: { read: false, write: false },
            odoo: { read: false, write: false },
        },
    },
};

function createEmptyPermissions() {
    return {
        modules: Object.fromEntries(
            MODULE_PERMISSION_KEYS.map((key) => [key, { read: false, write: false }])
        ),
        settings: Object.fromEntries(
            SETTINGS_PERMISSION_KEYS.map((key) => [key, { read: false, write: false }])
        ),
    };
}

function normalizeRoleKey(role) {
    return String(role || "").trim();
}

function isReservedRole(role) {
    return RESERVED_ROLE_OPTIONS.includes(normalizeRoleKey(role));
}

function isBaseRole(role) {
    return ROLE_OPTIONS.includes(normalizeRoleKey(role));
}

function normalizePermissionEntry(value) {
    const write = Boolean(value?.write);
    const read = Boolean(value?.read) || write;
    return { read, write };
}

function mergePermissionGroup(baseGroup, inputGroup, keys) {
    return keys.reduce((acc, key) => {
        acc[key] = normalizePermissionEntry(inputGroup?.[key] ?? baseGroup?.[key]);
        return acc;
    }, {});
}

function clonePermissions(permissions) {
    return {
        modules: { ...(permissions?.modules || {}) },
        settings: { ...(permissions?.settings || {}) },
    };
}

function getDefaultPermissionsForRole(role) {
    const normalizedRole = normalizeRoleKey(role);
    const base = DEFAULT_ROLE_PERMISSIONS[normalizedRole] || createEmptyPermissions();
    return {
        modules: mergePermissionGroup(base.modules, base.modules, MODULE_PERMISSION_KEYS),
        settings: mergePermissionGroup(base.settings, base.settings, SETTINGS_PERMISSION_KEYS),
    };
}

function normalizeRolePermissions(input, role) {
    const base = getDefaultPermissionsForRole(role);
    if (!input || typeof input !== "object") {
        return clonePermissions(base);
    }
    return {
        modules: mergePermissionGroup(base.modules, input.modules, MODULE_PERMISSION_KEYS),
        settings: mergePermissionGroup(base.settings, input.settings, SETTINGS_PERMISSION_KEYS),
    };
}

function hasPermission(permissions, group, key, action = "read") {
    return Boolean(permissions?.[group]?.[key]?.[action]);
}

module.exports = {
    ROLE_OPTIONS,
    RESERVED_ROLE_OPTIONS,
    MODULE_PERMISSION_KEYS,
    SETTINGS_PERMISSION_KEYS,
    DEFAULT_ROLE_PERMISSIONS,
    createEmptyPermissions,
    normalizeRoleKey,
    isReservedRole,
    isBaseRole,
    normalizeRolePermissions,
    getDefaultPermissionsForRole,
    hasPermission,
};
