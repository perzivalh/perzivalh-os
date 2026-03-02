function normalizeBaseUrl(value) {
  if (!value) {
    return "";
  }
  return String(value).trim().replace(/\/+$/, "");
}

export function getApiBase() {
  const configuredBase = normalizeBaseUrl(import.meta.env.VITE_API_BASE);
  if (configuredBase) {
    return configuredBase;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return normalizeBaseUrl(window.location.origin);
  }
  return "http://localhost:3000";
}

export const API_BASE = getApiBase();
