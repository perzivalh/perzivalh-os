/**
 * Constantes de SuperAdminView
 */

export const EMPTY_PROVISION = {
    name: "",
    slug: "",
    plan: "",
    db_url: "",
    phone_number_id: "",
    line_name: "",
    waba_id: "",
    verify_token: "",
    wa_token: "",
    app_secret: "",
    brand_name: "",
    logo_url: "",
    brand_primary: "#22d3ee",
    brand_accent: "#38bdf8",
    brand_bg: "#0b0f16",
    timezone: "",
    odoo_base_url: "",
    odoo_db_name: "",
    odoo_username: "",
    odoo_password: "",
};

export const PLAN_OPTIONS = [
    { value: "starter", label: "Starter" },
    { value: "growth", label: "Growth" },
    { value: "scale", label: "Scale" },
    { value: "enterprise", label: "Enterprise" },
];

export const TIMEZONE_OPTIONS = [
    "UTC",
    "America/La_Paz",
    "America/Lima",
    "America/Bogota",
    "America/Santiago",
    "America/Argentina/Buenos_Aires",
    "America/Mexico_City",
    "America/New_York",
    "America/Los_Angeles",
    "Europe/Madrid",
    "Europe/London",
    "Europe/Berlin",
    "Asia/Tokyo",
    "Asia/Singapore",
    "Australia/Sydney",
];
