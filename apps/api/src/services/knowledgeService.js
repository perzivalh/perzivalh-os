/**
 * knowledgeService — Construye el knowledge base desde la DB y lo cachea en Redis.
 *
 * Reemplaza el archivo hardcodeado podopie.knowledge.js como fuente de verdad.
 * Fallback al archivo JS si la DB no tiene datos configurados.
 */
const prisma = require("../db");
const { getTenantContext } = require("../tenancy/tenantContext");
const { rGet, rSet, rDel } = require("../lib/redis");
const logger = require("../lib/logger");

const KNOWLEDGE_TTL_SECONDS = 10 * 60; // 10 minutos

function getCacheKey(tenantId) {
  return `knowledge:${tenantId || "legacy"}`;
}

/**
 * Construye el objeto knowledge desde los datos del DB del tenant actual.
 * Si la DB no tiene datos de empresa configurados, retorna null (el caller usa fallback).
 */
async function buildKnowledgeFromDb() {
  const [settings, branches, services] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    prisma.branch.findMany({
      where: { is_active: true },
      orderBy: { name: "asc" },
    }),
    prisma.service.findMany({
      where: { is_active: true },
      include: {
        branches: {
          where: { is_available: true },
          include: { branch: true },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const company = settings?.company_json || null;
  const botIdentity = settings?.bot_identity_json || null;

  // Si no hay datos de empresa configurados, no podemos construir un knowledge útil
  if (!company && !botIdentity && branches.length === 0 && services.length === 0) {
    return null;
  }

  const ubicaciones = {};
  for (const b of branches) {
    ubicaciones[b.code] = {
      nombre: b.name,
      direccion: b.address,
      horario: b.hours_text,
      telefono: b.phone || null,
      maps_url: b.maps_url || null,
      lat: b.lat,
      lng: b.lng,
    };
  }

  const serviciosObj = {};
  for (const s of services) {
    serviciosObj[s.code] = {
      nombre: s.name,
      descripcion: s.description,
      keywords: s.keywords || null,
      precio: s.price_bob ? `Bs. ${s.price_bob}` : null,
      duracion: s.duration_min ? `${s.duration_min} min` : null,
    };
  }

  return {
    clinica: {
      nombre: company?.name || "Mi Empresa",
      slogan: company?.slogan || "",
      ciudad: company?.city || "",
      especialidad: company?.specialty || "",
      no_hacemos: Array.isArray(company?.restrictions) ? company.restrictions : [],
    },
    ubicaciones,
    servicios: serviciosObj,
    personalidad: {
      nombre: botIdentity?.name || "Asistente",
      emoji: botIdentity?.emoji || "🤖",
      tono: botIdentity?.tone || "amable, profesional",
      idioma: botIdentity?.language || "español",
      maximo_oraciones: botIdentity?.max_sentences || 2,
      emojis_frecuentes: Array.isArray(botIdentity?.emojis) ? botIdentity.emojis : [],
    },
  };
}

/**
 * Obtiene el knowledge para el tenant actual.
 * Orden: Redis cache → DB → fallback al archivo JS.
 */
async function getKnowledge(flowId) {
  const { tenantId } = getTenantContext();
  const cacheKey = getCacheKey(tenantId);

  // 1. Intentar desde Redis
  const cached = await rGet(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // cache corrupto, continuar
    }
  }

  // 2. Construir desde DB
  let knowledge = null;
  try {
    knowledge = await buildKnowledgeFromDb();
  } catch (err) {
    logger.warn("knowledge_service.db_error", { message: err.message });
  }

  // 3. Fallback al archivo JS si DB no tiene datos
  if (!knowledge) {
    knowledge = loadKnowledgeFromFile(flowId);
  }

  // 4. Guardar en Redis si tenemos algo
  if (knowledge) {
    await rSet(cacheKey, JSON.stringify(knowledge), KNOWLEDGE_TTL_SECONDS);
  }

  return knowledge;
}

/**
 * Invalida el cache de knowledge para el tenant actual.
 * Llamar después de modificar company profile, sucursales o servicios.
 */
async function invalidateKnowledgeCache() {
  const { tenantId } = getTenantContext();
  const cacheKey = getCacheKey(tenantId);
  await rDel(cacheKey);
  logger.info("knowledge_service.cache_invalidated", { tenantId });
}

/**
 * Carga el knowledge desde el archivo JS (fallback legacy).
 */
function loadKnowledgeFromFile(flowId) {
  try {
    const slug = flowId ? flowId.replace("botpodito", "podopie") : "podopie";
    return require(`../../flows/knowledge/${slug}.knowledge.js`);
  } catch {
    try {
      return require("../../flows/knowledge/podopie.knowledge.js");
    } catch {
      return null;
    }
  }
}

module.exports = { getKnowledge, invalidateKnowledgeCache };
