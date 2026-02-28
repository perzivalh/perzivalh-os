const { PrismaClient } = require("@prisma/client-tenant");

const knowledge = require("../apps/api/flows/knowledge/podopie.knowledge.js");

const PRICE_MAP = {
  hongos: 250,
  pie_atleta: 180,
  verrugas_plantares: 220,
  callosidades: 150,
  pie_diabetico: 280,
};

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function buildKeywords(service, code) {
  const values = [
    code,
    service.nombre,
    service.descripcion,
    ...(Array.isArray(service.sintomas) ? service.sintomas : []),
    ...(Array.isArray(service.tipos) ? service.tipos : []),
    ...(Array.isArray(service.tratamientos) ? service.tratamientos : []),
    ...(Array.isArray(service.servicios) ? service.servicios : []),
    ...(Array.isArray(service.incluye) ? service.incluye : []),
    ...(Array.isArray(service.problemas_comunes) ? service.problemas_comunes : []),
  ];

  if (Array.isArray(service.opciones)) {
    for (const option of service.opciones) {
      values.push(option?.nombre, option?.descripcion);
    }
  }

  return unique(values).join(", ");
}

function buildSubtitle(service) {
  if (Array.isArray(service.opciones) && service.opciones.length) {
    return service.opciones.slice(0, 2).map((option) => option.nombre).filter(Boolean).join(" / ");
  }
  if (service.importancia) return service.importancia;
  if (service.edades) return `Enfoque ${service.edades}`;
  return null;
}

function buildCatalog() {
  return Object.entries(knowledge?.servicios || {}).map(([code, service], index) => ({
    code,
    name: service.nombre || code,
    subtitle: buildSubtitle(service),
    description: service.descripcion || "Servicio podologico",
    keywords: buildKeywords(service, code),
    price_bob: PRICE_MAP[code] || 0,
    is_featured: index < 4,
    is_active: true,
  }));
}

async function main() {
  const databaseUrl = process.env.TENANT_DB_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Missing TENANT_DB_URL or DATABASE_URL");
  }

  const prisma = new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  });

  const catalog = buildCatalog();

  try {
    for (const item of catalog) {
      await prisma.service.upsert({
        where: { code: item.code },
        update: item,
        create: item,
      });
    }
    console.log(`Imported ${catalog.length} services into tenant catalog.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
