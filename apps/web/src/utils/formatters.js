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
        if (error === "offline") {
            return "Sin conexión a internet. Revisa tu red y vuelve a intentar.";
        }
        if (error === "network_error") {
            return "No se pudo conectar con el servidor. Intenta de nuevo.";
        }
        if (error === "request_failed") {
            return "No se pudo completar la solicitud. Intenta nuevamente.";
        }
        return error;
    }
    const message = error.message || "Error inesperado";
    if (message === "offline" || message.toLowerCase().includes("failed to fetch")) {
        return "Sin conexión a internet. Revisa tu red y vuelve a intentar.";
    }
    if (message === "network_error" || message.toLowerCase().includes("networkerror")) {
        return "No se pudo conectar con el servidor. Intenta de nuevo.";
    }
    if (message === "request_failed") {
        return "No se pudo completar la solicitud. Intenta nuevamente.";
    }
    return message;
}
