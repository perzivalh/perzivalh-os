/**
 * PODOPIE Knowledge Base for AI
 * Esta base de conocimiento se inyecta al prompt de la IA
 * para que tenga contexto completo sobre la clínica.
 * 
 * MODULAR: Cada flow puede tener su propio knowledge base
 */
module.exports = {
    // Información de la clínica
    clinica: {
        nombre: "PODOPIE",
        slogan: "Especialistas en salud podológica",
        ciudad: "Santa Cruz, Bolivia",
        especialidad: "Podología - SOLO trabajamos con pies",
        no_hacemos: ["manos", "uñas de manos", "manicure", "belleza", "estética facial"],
    },

    // Ubicaciones y horarios
    ubicaciones: {
        central: {
            nombre: "PODOPIE Central",
            direccion: "Ver mapa en Google Maps",
            maps_url: "https://maps.app.goo.gl/eXTejzQhp8zm3EmT8",
            horario: "Lunes a Viernes: 8:00 - 20:00, Sábados: 8:00 - 14:00",
            lineas_micro: ["74", "38", "7", "60", "51", "36", "37", "89", "Trufi"],
        },
        sucursal: {
            nombre: "PODOPIE Sucursal",
            direccion: "Ver mapa en Google Maps",
            maps_url: "https://maps.app.goo.gl/iCHR7dBb4W8wVWSM6",
            horario: "Lunes a Viernes: 9:00 - 19:00, Sábados: 9:00 - 13:00",
            lineas_micro: ["17", "72", "Trufi Plan 3000"],
        },
    },

    // Servicios detallados
    servicios: {
        uneros: {
            nombre: "Tratamiento de Uñeros",
            descripcion: "Uña encarnada que causa dolor e inflamación",
            sintomas: ["dolor", "inflamación", "enrojecimiento", "pus"],
            opciones: [
                { nombre: "Extracción simple", descripcion: "Corte de la espícula", sesiones: 1 },
                { nombre: "Matricectomía", descripcion: "Eliminación permanente del borde", sesiones: 1 },
                { nombre: "Ortesis", descripcion: "Corrector de uña sin cirugía", sesiones: "varias" },
            ],
            precio_desde: 80,
            moneda: "Bs",
            urgente: true,
        },
        hongos: {
            nombre: "Hongos en Uñas (Onicomicosis)",
            descripcion: "Infección por hongos que afecta las uñas del pie",
            sintomas: ["uña amarilla", "uña gruesa", "uña quebradiza", "mal olor"],
            opciones: [
                { nombre: "Tratamiento Tópico", descripcion: "Antimicótico en crema/esmalte", sesiones: "continuo" },
                { nombre: "Láser", descripcion: "Eliminación por láser", sesiones: "3-6" },
                { nombre: "Sistémico", descripcion: "Medicamento oral", sesiones: "según médico" },
            ],
            precio_desde: 100,
            moneda: "Bs",
            urgente: false,
        },
        pedicure_clinico: {
            nombre: "Pedicure Clínico",
            descripcion: "Limpieza profesional y cuidado de los pies",
            incluye: ["corte de uñas", "limpieza de cutículas", "hidratación", "eliminación de callosidades leves"],
            precio_desde: 60,
            moneda: "Bs",
            urgente: false,
        },
        podopediatria: {
            nombre: "Podopediatría",
            descripcion: "Cuidado podológico para niños y bebés",
            edades: "0-12 años",
            problemas_comunes: ["uñas encarnadas en niños", "verrugas plantares", "pie plano"],
            precio_desde: 70,
            moneda: "Bs",
            urgente: false,
        },
        podogeriatria: {
            nombre: "Podogeriatría",
            descripcion: "Cuidado especializado para adultos mayores",
            edades: "60+ años",
            consideraciones: ["movilidad reducida", "diabetes", "circulación"],
            precio_desde: 70,
            moneda: "Bs",
            urgente: false,
        },
        pie_diabetico: {
            nombre: "Pie Diabético",
            descripcion: "Cuidado preventivo y curativo para pacientes diabéticos",
            importancia: "CRÍTICO - requiere valoración médica",
            servicios: ["evaluación", "curación de heridas", "prevención"],
            precio_desde: 100,
            moneda: "Bs",
            urgente: true,
        },
        pie_atleta: {
            nombre: "Pie de Atleta",
            descripcion: "Infección por hongos entre los dedos",
            sintomas: ["picazón", "descamación", "mal olor", "grietas"],
            precio_desde: 80,
            moneda: "Bs",
            urgente: false,
        },
        callosidades: {
            nombre: "Callosidades y Helomas",
            descripcion: "Engrosamiento de la piel por fricción o presión",
            tipos: ["callo simple", "heloma (ojo de gallo)", "heloma interdigital"],
            precio_desde: 50,
            moneda: "Bs",
            urgente: false,
        },
        verrugas_plantares: {
            nombre: "Verrugas Plantares",
            descripcion: "Lesiones causadas por VPH en la planta del pie",
            tratamientos: ["crioterapia", "ácidos", "curetaje"],
            precio_desde: 80,
            moneda: "Bs",
            urgente: false,
        },
        extraccion_una: {
            nombre: "Extracción de Uña",
            descripcion: "Remoción quirúrgica de la uña afectada",
            indicaciones: ["trauma severo", "infección grave", "uña encarnada crónica"],
            precio_desde: 120,
            moneda: "Bs",
            urgente: true,
        },
    },

    // Señales de urgencia que requieren handoff
    urgencias: {
        palabras_clave: [
            "dolor intenso", "dolor fuerte", "mucho dolor",
            "sangrado", "sangra mucho",
            "pus", "supura", "infectado",
            "fiebre", "calentura",
            "hinchado", "muy inflamado",
            "no puedo caminar", "me cuesta caminar",
            "diabético", "diabetes",
            "úlcera", "herida abierta",
        ],
        accion: "handoff",
        mensaje: "Por lo que describes, lo mejor es que te valore un especialista. Te conecto con nuestro equipo.",
    },

    // Personalidad del bot
    personalidad: {
        nombre: "PODITO",
        emoji: "🤖",
        tono: "amable, cálido, profesional",
        idioma: "español boliviano casual",
        expresiones: ["pue", "nomás", "dale"],
        emojis_frecuentes: ["🦶", "✨", "👋", "💪", "😊"],
        maximo_oraciones: 2,
    },
};
