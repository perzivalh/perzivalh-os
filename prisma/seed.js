const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client-tenant");

require("dotenv").config();

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.TENANT_DB_URL ||
        process.env.DATABASE_URL ||
        "",
    },
  },
});

const DEFAULT_BRANCHES = [
  {
    code: "central",
    name: "Sucursal Centro",
    address: "Av. Principal 123, Centro",
    lat: -16.5,
    lng: -68.15,
    hours_text: "Lunes a Viernes 09:00 a 19:00\nSabados 09:00 a 13:00",
    phone: null,
  },
  {
    code: "sur",
    name: "Sucursal Sur",
    address: "Calle Secundaria 456, Zona Sur",
    lat: -16.53,
    lng: -68.09,
    hours_text: "Lunes a Viernes 09:00 a 19:00\nSabados 09:00 a 13:00",
    phone: null,
  },
];

const DEFAULT_SERVICES = [
  {
    code: "hongos_onicomicosis",
    name: "Hongos / Onicomicosis",
    subtitle: "Tratamiento especializado",
    description:
      "Evaluacion y tratamiento profesional para hongos en uñas y piel.",
    price_bob: 250,
    duration_min: 45,
    image_url: "https://via.placeholder.com/800x600.png?text=Podopie",
    is_featured: true,
  },
  {
    code: "pie_de_atleta",
    name: "Pie de atleta",
    subtitle: "Cuidado y seguimiento",
    description: "Tratamiento integral para infecciones y cuidado preventivo.",
    price_bob: 180,
    duration_min: 40,
    image_url: "https://via.placeholder.com/800x600.png?text=Podopie",
    is_featured: true,
  },
  {
    code: "verruga_plantar",
    name: "Verruga plantar",
    subtitle: "Sesiones especializadas",
    description: "Eliminacion y seguimiento de verrugas plantares.",
    price_bob: 220,
    duration_min: 45,
    image_url: "https://via.placeholder.com/800x600.png?text=Podopie",
    is_featured: true,
  },
  {
    code: "heloma_ojo_pollo",
    name: "Heloma / Ojo de pollo",
    subtitle: "Alivio inmediato",
    description: "Tratamiento para dolor y molestias por helomas.",
    price_bob: 200,
    duration_min: 35,
    image_url: "https://via.placeholder.com/800x600.png?text=Podopie",
    is_featured: true,
  },
  {
    code: "fisuras_plantares",
    name: "Fisuras plantares",
    subtitle: "Recuperacion de la piel",
    description: "Cuidado podologico para fisuras y resequedad.",
    price_bob: 160,
    duration_min: 30,
    image_url: "https://via.placeholder.com/800x600.png?text=Podopie",
    is_featured: true,
  },
  {
    code: "callosidad",
    name: "Callosidad",
    subtitle: "Limpieza profunda",
    description: "Tratamiento para callosidades y durezas.",
    price_bob: 150,
    duration_min: 30,
    image_url: "https://via.placeholder.com/800x600.png?text=Podopie",
    is_featured: true,
  },
  {
    code: "paciente_diabetico",
    name: "Paciente diabetico",
    subtitle: "Cuidado especializado",
    description: "Atencion y seguimiento seguro para pie diabetico.",
    price_bob: 280,
    duration_min: 50,
    image_url: "https://via.placeholder.com/800x600.png?text=Podopie",
    is_featured: true,
  },
];

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || "Admin";
  const role = process.env.ADMIN_ROLE || "admin";

  if (!email || !password) {
    throw new Error("Missing ADMIN_EMAIL or ADMIN_PASSWORD");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: {
        name,
        role,
        is_active: true,
        password_hash: passwordHash,
      },
    });
    console.log(`Admin updated: ${email}`);
    return;
  }

  await prisma.user.create({
    data: {
      name,
      email,
      password_hash: passwordHash,
      role,
      is_active: true,
    },
  });
  console.log(`Admin created: ${email}`);
}

async function seedCatalog() {
  for (const branch of DEFAULT_BRANCHES) {
    await prisma.branch.upsert({
      where: { code: branch.code },
      update: {
        name: branch.name,
        address: branch.address,
        lat: branch.lat,
        lng: branch.lng,
        hours_text: branch.hours_text,
        phone: branch.phone,
        is_active: true,
      },
      create: branch,
    });
  }

  for (const service of DEFAULT_SERVICES) {
    await prisma.service.upsert({
      where: { code: service.code },
      update: {
        name: service.name,
        subtitle: service.subtitle,
        description: service.description,
        price_bob: service.price_bob,
        duration_min: service.duration_min,
        image_url: service.image_url,
        is_featured: service.is_featured,
        is_active: true,
      },
      create: service,
    });
  }
}

seedAdmin()
  .then(seedCatalog)
  .catch((error) => {
    console.error("Seed error", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
