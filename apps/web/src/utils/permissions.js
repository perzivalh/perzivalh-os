/**
 * Utilidades de permisos y roles
 */

import { DEFAULT_ROLE_PERMISSIONS } from "../constants";

export function hasRole(user, roles) {
    if (!user) {
        return false;
    }
    return roles.includes(user.role);
}

export function mergeRolePermissions(saved) {
    if (!saved || typeof saved !== "object") {
        return { ...DEFAULT_ROLE_PERMISSIONS };
    }
    const merged = { ...DEFAULT_ROLE_PERMISSIONS };
    Object.entries(saved).forEach(([role, value]) => {
        if (!value || typeof value !== "object") {
            return;
        }
        merged[role] = {
            modules: {
                ...DEFAULT_ROLE_PERMISSIONS[role]?.modules,
                ...value.modules,
            },
            settings: {
                ...DEFAULT_ROLE_PERMISSIONS[role]?.settings,
                ...value.settings,
            },
        };
    });
    return merged;
}

export function hasPermission(rolePermissions, group, key, action = "read") {
    const entry = rolePermissions?.[group]?.[key];
    if (!entry) {
        return false;
    }
    return Boolean(entry[action]);
}
