/**
 * Constantes usadas en AdminView
 */

export const ROLE_LABELS = {
    admin: { title: "Administrador", subtitle: "Acceso total", tone: "alert" },
    recepcion: { title: "Operador", subtitle: "Atencion al cliente", tone: "info" },
    caja: { title: "Supervisor", subtitle: "Auditoria y gestion", tone: "dark" },
    marketing: { title: "Marketing", subtitle: "Crecimiento y campanas", tone: "info" },
    doctor: { title: "Doctor", subtitle: "Atencion al cliente", tone: "dark" },
};

export const MAIN_MODULES = [
    { id: "chat", label: "Chat" },
    { id: "dashboard", label: "Dashboard" },
    { id: "campaigns", label: "Campanas" },
];

export const SETTINGS_MODULES = [
    { id: "general", label: "Lineas" },
    { id: "users", label: "Gestion de Usuarios" },
    { id: "bot", label: "Configuracion de Bot" },
    { id: "templates", label: "Plantillas de Meta" },
    { id: "audit", label: "Registros / Auditoria" },
    { id: "odoo", label: "Integracion Odoo" },
];

export function getRoleMeta(role) {
    return ROLE_LABELS[role] || {
        title: role,
        subtitle: "Acceso personalizado",
        tone: "info",
    };
}
