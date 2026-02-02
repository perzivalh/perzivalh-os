/**
 * Utilidades generales - helpers
 */

export function sortConversations(list) {
    const rank = (item) => {
        if (item.status === "pending" && !item.assigned_user_id) return 0;
        if (item.status === "pending" && item.assigned_user_id) return 1;
        if (item.status === "assigned") return 2;
        return 3;
    };
    return [...list].sort((a, b) => {
        const aRank = rank(a);
        const bRank = rank(b);
        if (aRank !== bRank) {
            return aRank - bRank;
        }
        const aTime = new Date(a.last_message_at || a.created_at || 0).getTime();
        const bTime = new Date(b.last_message_at || b.created_at || 0).getTime();
        return bTime - aTime;
    });
}

export function buildQuery(params) {
    const search = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") {
            return;
        }
        search.append(key, value);
    });
    const query = search.toString();
    return query ? `?${query}` : "";
}

export function getInitial(value) {
    if (!value) {
        return "?";
    }
    const trimmed = value.trim();
    return trimmed ? trimmed[0].toUpperCase() : "?";
}

// Utilidades de color para branding
export function hexToRgb(input) {
    const hex = String(input || "").replace("#", "").trim();
    if (hex.length !== 6) {
        return null;
    }
    const num = Number.parseInt(hex, 16);
    if (Number.isNaN(num)) {
        return null;
    }
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255,
    };
}

export function clamp(value, min = 0, max = 255) {
    return Math.min(max, Math.max(min, value));
}

export function rgba(color, alpha) {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

export function darken(color, amount = 0.18) {
    return {
        r: clamp(Math.round(color.r * (1 - amount))),
        g: clamp(Math.round(color.g * (1 - amount))),
        b: clamp(Math.round(color.b * (1 - amount))),
    };
}

export function applyBrandingToCss(nextBranding) {
    if (typeof document === "undefined") {
        return;
    }
    const style = document.documentElement.style;
    // Temporarily disable per-tenant color personalization (use defaults).
    style.removeProperty("--accent");
    style.removeProperty("--accent-strong");
    style.removeProperty("--accent-soft");
    style.removeProperty("--accent-soft-2");
    style.removeProperty("--scroll-thumb");
    style.removeProperty("--scroll-thumb-hover");
}
