/**
 * Constantes del sistema - Frontend
 */

export const STATUS_OPTIONS = ["open", "pending", "assigned"];

export const BASE_ROLE_OPTIONS = ["admin", "recepcion", "caja", "marketing", "doctor"];

export const DEFAULT_ROLE_PERMISSIONS = {
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
            templates: { read: false, write: false },
            audit: { read: false, write: false },
            odoo: { read: false, write: false },
        },
    },
};
