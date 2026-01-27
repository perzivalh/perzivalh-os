/**
 * Configuración centralizada de la aplicación
 * Todas las variables de entorno y configuración global se definen aquí
 */
const path = require("path");

// Cargar variables de entorno
require("dotenv").config({ path: path.resolve(__dirname, "../../../../.env") });

// Configuración de servidor
const PORT = process.env.PORT || 3000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

// Normalizar origin (remover comillas y trailing slashes)
function normalizeOrigin(value) {
  if (!value) return "";
  let trimmed = String(value).trim();
  if (!trimmed) return "";
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

const FRONTEND_ORIGINS = FRONTEND_ORIGIN.split(",")
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

// Verificar si un origin está permitido
function isAllowedOrigin(origin) {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (FRONTEND_ORIGINS.includes("*")) return true;
  return FRONTEND_ORIGINS.includes(normalized);
}

// Configuración de WhatsApp
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const ADMIN_PHONE_E164 = process.env.ADMIN_PHONE_E164;
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || "";

// Configuración de campañas
const CAMPAIGN_BATCH_SIZE = Number(process.env.CAMPAIGN_BATCH_SIZE || 8);
const CAMPAIGN_INTERVAL_MS = Number(process.env.CAMPAIGN_INTERVAL_MS || 1500);

// Configuración de rate limiting
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 30 * 1000;

// Configuración de cache
const SETTINGS_CACHE_MS = 10 * 1000;

// Estados permitidos para conversaciones
const ALLOWED_STATUS = new Set(["open", "pending", "closed"]);

module.exports = {
  // Servidor
  PORT,
  FRONTEND_ORIGIN,
  FRONTEND_ORIGINS,
  normalizeOrigin,
  isAllowedOrigin,
  
  // WhatsApp
  VERIFY_TOKEN,
  ADMIN_PHONE_E164,
  WHATSAPP_APP_SECRET,
  
  // Campañas
  CAMPAIGN_BATCH_SIZE,
  CAMPAIGN_INTERVAL_MS,
  
  // Rate limiting
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  
  // Cache
  SETTINGS_CACHE_MS,
  
  // Estados
  ALLOWED_STATUS,
};
