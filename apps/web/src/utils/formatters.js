/**
 * Utilidades de formato - fechas, duraciones, etc.
 */

export function formatDate(value) {
    if (!value) {
        return "-";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "-";
    }
    return date.toLocaleString();
}

export function formatCompactDate(value) {
    if (!value) {
        return "-";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "-";
    }
    return date.toLocaleDateString();
}

export function formatListTime(value) {
    if (!value) {
        return "-";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "-";
    }
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((today - target) / 86400000);
    if (diffDays === 0) {
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (diffDays === 1) {
        return "Ayer";
    }
    const dayNames = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
    return dayNames[date.getDay()];
}

export function formatMessageDayLabel(value) {
    if (!value) {
        return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((today - target) / 86400000);
    if (diffDays === 0) {
        return "Hoy";
    }
    if (diffDays === 1) {
        return "Ayer";
    }
    const months = [
        "Ene",
        "Feb",
        "Mar",
        "Abr",
        "May",
        "Jun",
        "Jul",
        "Ago",
        "Sep",
        "Oct",
        "Nov",
        "Dic",
    ];
    const label = `${date.getDate()} ${months[date.getMonth()]}`;
    if (date.getFullYear() !== now.getFullYear()) {
        return `${label} ${date.getFullYear()}`;
    }
    return label;
}

export function formatDuration(seconds) {
    if (seconds === null || seconds === undefined) {
        return "-";
    }
    const minutes = Math.round(Number(seconds) / 60);
    if (!Number.isFinite(minutes)) {
        return "-";
    }
    return `${minutes} min`;
}

export function normalizeError(error) {
    if (!error) {
        return "Error inesperado";
    }
    if (typeof error === "string") {
        return error;
    }
    return error.message || "Error inesperado";
}
