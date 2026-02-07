/**
 * Flow: Botpodito V3 (IA Router)
 * Flujograma v3 con enrutador IA + contacto por llamada o mensaje
 */
module.exports = {
  id: "botpoditov3",
  name: "Botpodito V3",
  description: "Flujograma V3 con enrutador IA y contacto personalizado.",
  version: "1.0.0",
  icon: "🦶",
  category: "salud",
  requires_ai: true,
  ai: {
    enabled: true,
    mode: "router",
    max_turns: 2,
    allow_fallback: false,
    handoff_node_id: "AI_HANDOFF_OFFER",
    services_node_id: "SERVICIOS_MENU",
  },

  flow_name: "flujogramaV3",
  canva_design_id: "DAHAG6gmuBg",
  start_node_id: "WELCOME",

  nodes: [
    {
      id: "WELCOME",
      type: "text",
      text: "¡Hola! 👋 Bienvenido a PODOPIE.",
      next: "MAIN_MENU",
    },
    {
      id: "MAIN_MENU",
      type: "text",
      text: "Soy PODITO 🤖, tu asistente virtual de PODOPIE 🦶✨ ¿En qué puedo ayudarte?",
      delayMs: 1500,
      buttons: [
        { label: "🕒 Horarios y ubicacion", next: "HORARIOS_INFO" },
        { label: "💰 Precios", next: "PRECIOS_INFO" },
        { label: "🧼 Servicios", next: "SERVICIOS_MENU" },
        { label: "👨‍💻 Atención personal", next: "CONTACT_METHOD" },
      ],
    },
    {
      id: "AI_HANDOFF_OFFER",
      type: "text",
      text:
        "Por lo que comentas, lo ideal es una valoración médica gratuita en la clínica. ¿Quieres que te derivemos con un operador?",
      delayMs: 1500,
      buttons: [
        { label: "👨‍💻 Sí, hablar con operador", next: "CONTACT_METHOD" },
        { label: "📋 Ver menú", next: "MAIN_MENU" },
      ],
    },

    {
      id: "HORARIOS_INFO",
      type: "text",
      text: "CENTRAL",
      next: "HORARIOS_CENTRAL_HORARIO_IMG",
    },
    {
      id: "HORARIOS_CENTRAL_HORARIO_IMG",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/centralHorario.jpg",
      text: "ATENCIÓN CENTRAL\nPuede venir en estos horarios ?",
      next: "HORARIOS_CENTRAL_UBICACION_IMG",
    },
    {
      id: "HORARIOS_CENTRAL_UBICACION_IMG",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/centralUbicacion.jpg",
      text: "Haz clic aquí para ver nuestra ubicación en Google Maps:\nhttps://maps.app.goo.gl/eXTejzQhp8zm3EmT8",
      next: "HORARIOS_CENTRAL_LINEAS_IMG",
    },
    {
      id: "HORARIOS_CENTRAL_LINEAS_IMG",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/centralLineas.jpg",
      text: "🚌 Líneas que pasan: 74, 38, 7, 60, 51, 36, 37, 89, Trufi",
      next: "HORARIOS_CENTRAL_VIDEO",
    },
    {
      id: "HORARIOS_CENTRAL_VIDEO",
      type: "video",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/centralComoLlegar.mp4",
      text: "Mediante este video puedes encontrar la central de PODOPIE 📌⬆️",
      next: "HORARIOS_SUCURSAL_TITLE",
    },
    {
      id: "HORARIOS_SUCURSAL_TITLE",
      type: "text",
      text: "SUCURSAL",
      delayMs: 1500,
      next: "HORARIOS_SUCURSAL_HORARIO_IMG",
    },
    {
      id: "HORARIOS_SUCURSAL_HORARIO_IMG",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/sucursalHorario.jpg",
      text: "ATENCIÓN SUCURSAL\nPuede venir en estos horarios ?",
      next: "HORARIOS_SUCURSAL_UBICACION_IMG",
    },
    {
      id: "HORARIOS_SUCURSAL_UBICACION_IMG",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/sucursalUbicacion.jpg",
      text: "Haz clic aquí para ver nuestra ubicación en Google Maps:\nhttps://maps.app.goo.gl/eXTejzQhp8zm3EmT8",
      next: "HORARIOS_SUCURSAL_LINEAS_IMG",
    },
    {
      id: "HORARIOS_SUCURSAL_LINEAS_IMG",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/sucursalLineas.jpg",
      text: "🚌 Líneas que pasan: 8, 10, 11, 30, 33, 54, 55, 56, 57, 58, 68, 78, 86, 104, 72, 73, Trufi",
      next: "HORARIOS_SUCURSAL_VIDEO",
    },
    {
      id: "HORARIOS_SUCURSAL_VIDEO",
      type: "video",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/sucursalComoLlegar.mp4",
      text: "Mediante este video puedes encontrar la sucursal de PODOPIE 📌⬆️",
      next: "HORARIOS_NAV",
    },
    {
      id: "HORARIOS_NAV",
      type: "text",
      text: "¿Necesitas algo más?",
      delayMs: 1500,
      buttons: [
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },

    {
      id: "PRECIOS_INFO",
      type: "text",
      text:
        "💰 Precios PODOPIE\n\nTe comparto nuestro tarifario general.\n\n¿Quieres que te ayude a elegir el servicio adecuado?",
      next: "PRECIOS_IMG_1",
    },
    {
      id: "PRECIOS_IMG_1",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/precios1.jpg",
      text: " ",
      next: "PRECIOS_IMG_2",
    },
    {
      id: "PRECIOS_IMG_2",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/precios2.jpg",
      text: " ",
      next: "PRECIOS_IMG_3",
    },
    {
      id: "PRECIOS_IMG_3",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/precios3.jpg",
      text: " ",
      next: "PRECIOS_ACTIONS",
    },
    {
      id: "PRECIOS_ACTIONS",
      type: "text",
      text: "¿Necesitas un servicio en específico?",
      delayMs: 1500,
      buttons: [
        { label: "👨‍💻 Atención personal", next: "CONTACT_METHOD" },
        { label: "? No", next: "PRECIOS_MAS" },
        { label: "? Si", next: "SERVICIOS_MENU" },
      ],
    },
    {
      id: "PRECIOS_MAS",
      type: "text",
      text: "¿Necesitas algo más? Si quieres volver al menú principal o terminar la conversación, elige una opción.",
      delayMs: 1500,
      buttons: [
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_PRECIOS_SERVICIOS" },
      ],
    },

    {
      id: "SERVICIOS_MENU",
      type: "text",
      text: "SELECCIONA EL SERVICIO QUE NECESITES",
      delayMs: 1500,
      buttons: [
        { label: "🦶 Uñero", next: "UNERO_TIPO_TRAT" },
        { label: "🦠 Hongos", next: "HONGOS_TIPO_TRAT" },
        { label: "💅 Pedicure", next: "SVC_PEDICURE_INFO" },
        { label: "🧒 Podopediatria", next: "SVC_PODOPEDIATRIA_INFO" },
        { label: "🧓 Podogeriatria", next: "SVC_PODOGERIATRIA_INFO" },
        { label: "🧰 Otros", next: "OTROS_MENU" },
      ],
    },

    {
      id: "UNERO_TIPO_TRAT",
      type: "text",
      text: "Información de Uñero",
      next: "UNERO_INFO_1",
    },
    {
      id: "UNERO_INFO_1",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/U%C3%B1ero/1.jpg",
      text:
        "Uñero es una inflamación que se produce cuando una uña crece de forma anormal y se clava en la piel que la rodea, causando dolor, enrojecimiento e hinchazón.",
      next: "UNERO_INFO_2",
    },
    {
      id: "UNERO_INFO_2",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/U%C3%B1ero/2.jpg",
      text:
        "El servicio de extracción de UNO O VARIOS UÑEROS EN UN PIE tiene un costo de 200 BS 💰.",
      next: "UNERO_INFO_3",
    },
    {
      id: "UNERO_INFO_3",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/U%C3%B1ero/3.jpg",
      text:
        "Si desea la extracción de UÑEROS EN AMBOS PIES, el costo es de 300 BS por todos los uñeros en ambos pies. 💵",
      next: "UNERO_INFO_4",
    },
    {
      id: "UNERO_INFO_4",
      type: "text",
      text:
        "Con una correcta extracción del uñero, puedes disfrutar de una rutina diaria más tranquila y cómoda 💆‍♂️💆‍♀️\nOlvídate del dolor, la inflamación y las molestias, y vuelve a caminar con total bienestar 👣😊",
      next: "UNERO_INFO_5",
    },
    {
      id: "UNERO_INFO_5",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/U%C3%B1ero/podomix.jpg",
      text:
        "Si necesita un paquete completo 🦶✨ tiene una opción accesible y detallada por realizarse, PODOMIX incluye una valoración profesional 👨‍⚕️📋, extracción de uñeros ✂️🦶 y pedicure clínico 🧼💅, todo por un costo de 300 Bs 💰.\nEste paquete se realiza únicamente bajo recomendación del especialista 🩺, ya que durante la valoración 🔍 se determinará si el paciente necesita o no dicho tratamiento ✅❌.",
      next: "UNERO_TIPO_TRAT_OPTIONS",
    },
    {
      id: "UNERO_TIPO_TRAT_OPTIONS",
      type: "text",
      text:
        "🦶✨ Nuestro servicio de uñero cuenta con dos tipos de procedimientos\nElige la opción que mejor se adapte a tu caso y conoce todos los detalles 👇😊",
      delayMs: 1500,
      buttons: [
        { label: "✂️ Matricectomia", next: "TRAT_MATRICECTOMIA_INFO" },
        { label: "🦴 Ortesis", next: "TRAT_ORTESIS_INFO" },
      ],
    },
    {
      id: "HONGOS_TIPO_TRAT",
      type: "text",
      text: "Información de Hongos",
      next: "HONGOS_INFO_1",
    },
    {
      id: "HONGOS_INFO_1",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Hongo/1.jpg",
      text:
        "En nuestro centro, ofrecemos una variedad de tratamientos para hongos en las uñas, incluyendo opciones TÓPICAS, SISTÉMICO, LÁSER, OZONO y ALTA FRECUENCIA. Los tratamientos más solicitados son el TÓPICO y el tratamiento LÁSER, cada uno con sus propias características y beneficios. 🦶",
      next: "HONGOS_PACKS_TITLE",
    },
    {
      id: "HONGOS_PACKS_TITLE",
      type: "text",
      text: "NUESTROS PAQUETES",
      next: "HONGOS_PACK_1",
    },
    {
      id: "HONGOS_PACK_1",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Hongo/2.jpeg",
      text: " ",
      next: "HONGOS_PACK_2",
    },
    {
      id: "HONGOS_PACK_2",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Hongo/3.jpeg",
      text: " ",
      next: "HONGOS_PACK_3",
    },
    {
      id: "HONGOS_PACK_3",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Hongo/4.jpeg",
      text: " ",
      next: "HONGOS_PACK_4",
    },
    {
      id: "HONGOS_PACK_4",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Hongo/5.jpeg",
      text: " ",
      next: "HONGOS_PACK_NOTE",
    },
    {
      id: "HONGOS_PACK_NOTE",
      type: "text",
      text:
        "Estos paquetes se realizan únicamente bajo recomendación del especialista 🩺, ya que durante la valoración 🔍 se determinará si el paciente necesita o no dicho tratamiento ✅❌.",
      next: "HONGOS_TIPO_TRAT_OPTIONS",
    },
    {
      id: "HONGOS_TIPO_TRAT_OPTIONS",
      type: "text",
      text:
        "🦶✨ Nuestro servicio de hongos (onicomicosis) cuenta con tres tipos de procedimientos\nElige la opción que mejor se adapte a tu caso y conoce todos los detalles 👇😊",
      delayMs: 1500,
      buttons: [
        { label: "🧴 Tópico", next: "TRAT_Tópico_INFO" },
        { label: "🔦 Láser", next: "TRAT_Láser_INFO" },
        { label: "💊 Sistémico", next: "TRAT_Sistémico_INFO" },
      ],
    },

    {
      id: "TRAT_MATRICECTOMIA_INFO",
      type: "text",
      text: "Información de tratamiento: Matricectomía",
      next: "TRAT_MATRICECTOMIA_STEP_1",
    },
    {
      id: "TRAT_MATRICECTOMIA_STEP_1",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/U%C3%B1ero/Matricectomia/1.jpg",
      text:
        "PROTOCOLO PRE-QUIRUGICO. 🩺\n- El paciente debe asistir a la microcirugía con chinelas o calzado abierto y ropa cómoda, evitando zapatos cerrados y en el caso de mujeres, faldas o vestidos.\n- Es obligatorio firmar el consentimiento informado antes del procedimiento.\n- Si el caso lo requiere, el profesional de salud podrá solicitar pruebas especiales previas a la cirugía.",
      next: "TRAT_MATRICECTOMIA_STEP_2",
    },
    {
      id: "TRAT_MATRICECTOMIA_STEP_2",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/U%C3%B1ero/Matricectomia/2.jpg",
      text:
        "Tarifas según el tipo de procedimiento:\n• Unilateral (un solo lado) en un dedo de un pie: 800 Bs.\n• Bilateral (ambos lados) en un dedo de un pie: 1.000 Bs.\n• Unilateral en ambos pies (un lado de un dedo en cada pie): 1.600 Bs.\n• Bilateral en ambos pies (ambos lados de un dedo en cada pie): 2.000 Bs.\n• Combinado: unilateral en un pie y bilateral en el otro: 1.800 Bs.\nCuraciones: 🩹\n• Primer curativo (obligatorio): gratuito, dentro de las primeras 48 horas.\n• Curativos posteriores: 50 Bs por sesión.",
      next: "TRAT_MATRICECTOMIA_STEP_3",
    },
    {
      id: "TRAT_MATRICECTOMIA_STEP_3",
      type: "text",
      text:
        "Valoración prequirúrgica:\nLa decisión de realizar la matricectomía dependerá de una evaluación individual por parte de un podólogo o médico cirujano especialista, considerando la gravedad del caso y la historia clínica del paciente.",
      next: "TRAT_MATRICECTOMIA_STEP_4",
    },
    {
      id: "TRAT_MATRICECTOMIA_STEP_4",
      type: "text",
      text:
        "Para cualquier dato adicional, no dude en contactarnos por este medio, a nuestro WhatsApp o llamando al 62100083.",
      next: "TRAT_MATRICECTOMIA_ACTIONS",
    },
    {
      id: "TRAT_MATRICECTOMIA_ACTIONS",
      type: "text",
      text: "¿Tienes alguna otra duda?",
      delayMs: 1500,
      buttons: [
        { label: "👨‍💻 Atención personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧼 Volver a servicios", next: "SERVICIOS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "TRAT_ORTESIS_INFO",
      type: "text",
      text: "Información de tratamiento: Ortesis",
      next: "TRAT_ORTESIS_STEP_1",
    },
    {
      id: "TRAT_ORTESIS_STEP_1",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/U%C3%B1ero/Ortesis/IMAGEN%201.jpg",
      text:
        "🦶✨ La ortesis ungueal es un tratamiento que corrige la forma de la uña del pie, ayudando a que crezca correctamente y evitando que se encarne 💅😊",
      next: "TRAT_ORTESIS_STEP_2",
    },
    {
      id: "TRAT_ORTESIS_STEP_2",
      type: "text",
      text:
        "✨🦶 La ortesis ungueal ayuda a levantar la uña y evitar que se encarne, siendo un tratamiento eficaz para prevenir el uñero y aliviar molestias de forma segura 💅💙",
      next: "TRAT_ORTESIS_ACTIONS",
    },
    {
      id: "TRAT_ORTESIS_ACTIONS",
      type: "text",
      text: "¿Tienes alguna otra duda?",
      delayMs: 1500,
      buttons: [
        { label: "👨‍💻 Atención personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧼 Volver a servicios", next: "SERVICIOS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "TRAT_Tópico_INFO",
      type: "text",
      text: "Información de tratamiento: Tópico",
      next: "TRAT_Tópico_STEP_1",
    },
    {
      id: "TRAT_Tópico_STEP_1",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Hongo/T%C3%B3pico/IMAGEN%202.jpg",
      text:
        "TRATAMIENTO TÓPICO:\n* Costo: 150 Bs (Incluye diagnóstico, revisión y limpieza).\n* Este tratamiento se sugiere realizarlo con una LACA ANTIMICÓTICA cuyo costo varía según la laca. Es importante seguir las indicaciones para obtener los mejores resultados, el costo de la laca antimicótica es aparte. 💧",
      next: "TRAT_Tópico_STEP_2",
    },
    {
      id: "TRAT_Tópico_STEP_2",
      type: "text",
      text:
        "Para cualquier dato adicional, no dude en contactarnos por este medio, a nuestro WhatsApp o llamando a la línea de atención al cliente 62100083. 📱",
      next: "TRAT_Tópico_ACTIONS",
    },
    {
      id: "TRAT_Tópico_ACTIONS",
      type: "text",
      text: "¿Tienes alguna otra duda?",
      delayMs: 1500,
      buttons: [
        { label: "👨‍💻 Atención personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧼 Volver a servicios", next: "SERVICIOS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "TRAT_Láser_INFO",
      type: "text",
      text: "Información de tratamiento: Láser",
      next: "TRAT_Láser_STEP_1",
    },
    {
      id: "TRAT_Láser_STEP_1",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Hongo/L%C3%A1ser/1.jpg",
      text:
        "El TRATAMIENTO LÁSER es una opción eficaz y moderna para eliminar los hongos en las uñas. Utilizamos equipos podológicos con LUZ LÁSER INDOLORA, garantizando que no existan efectos secundarios, con resultados que no dañan la uña en su crecimiento, en algunos casos sin necesidad de medicación oral. 🩹",
      next: "TRAT_Láser_STEP_2",
    },
    {
      id: "TRAT_Láser_STEP_2",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Hongo/L%C3%A1ser/2.jpg",
      text:
        "TRATAMIENTO LÁSER: ⚡\n⚡🦶 Tratamiento rápido y efectivo, con resultados visibles en menos tiempo.\nLas sesiones se programan según tu disponibilidad semanal 📅\nAmbas opciones son efectivas, pero el láser actúa más rápido 🛑✨",
      next: "TRAT_Láser_STEP_3",
    },
    {
      id: "TRAT_Láser_STEP_3",
      type: "text",
      text:
        "Recuerda que cada caso es único, por eso te invitamos a una evaluación personalizada con nuestros especialistas 🎯👩‍⚕️👨‍⚕️",
      next: "TRAT_Láser_STEP_4",
    },
    {
      id: "TRAT_Láser_STEP_4",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Hongo/L%C3%A1ser/3.jpg",
      text:
        "¿CUÁNTAS SESIONES LÁSER NECESITO? 🤔\nEl podólogo EVALÚA TU CASO y te recomienda un ESTIMADO DE SESIONES, las mismas pueden son programadas de manera semanal o con intervalos de 5 a 7 días. Con este tratamiento Láser en 10, 20, 30 SESIÓNES o más según sea tu caso específico SE VERÁN LOS RESULTADOS, el tiempo PUEDE VARIAR SEGÚN EL ESTADO DE LAS UÑAS DE TUS PIES, esto se ajusta a tu disponibilidad económica y tu tiempo, asegurando que recibas el tratamiento que mejor se adapte a tus necesidades. 🥼",
      next: "TRAT_Láser_STEP_5",
    },
    {
      id: "TRAT_Láser_STEP_5",
      type: "text",
      text:
        "Para cualquier dato adicional, no dude en contactarnos por este medio, a nuestro WhatsApp o llamando a la línea de atención al cliente 62100083. 📱",
      next: "TRAT_Láser_ACTIONS",
    },
    {
      id: "TRAT_Láser_ACTIONS",
      type: "text",
      text: "¿Tienes alguna otra duda?",
      delayMs: 1500,
      buttons: [
        { label: "👨‍💻 Atención personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧼 Volver a servicios", next: "SERVICIOS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "TRAT_Sistémico_INFO",
      type: "text",
      text: "Información de tratamiento: Sistémico",
      next: "TRAT_Sistémico_STEP_1",
    },
    {
      id: "TRAT_Sistémico_STEP_1",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Hongo/Sist%C3%A9mico/1.jpg",
      text:
        "También te ofrecemos un TRATAMIENTO SISTÉMICO eficaz para combatir los hongos desde la raíz. 🔝",
      next: "TRAT_Sistémico_STEP_2",
    },
    {
      id: "TRAT_Sistémico_STEP_2",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Hongo/Sist%C3%A9mico/2.jpg",
      text:
        "Nuestro enfoque combina tecnología podológica avanzada, diagnóstico preciso y seguimiento profesional para lograr resultados visibles y duraderos. 💪\n- Evaluación personalizada.\n- Tratamiento médico supervisado.\n- Resultados progresivos y seguros",
      next: "TRAT_Sistémico_ACTIONS",
    },
    {
      id: "TRAT_Sistémico_ACTIONS",
      type: "text",
      text: "¿Tienes alguna otra duda?",
      delayMs: 1500,
      buttons: [
        { label: "👨‍💻 Atención personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧼 Volver a servicios", next: "SERVICIOS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },

    {
      id: "SVC_PEDICURE_INFO",
      type: "text",
      text: "Información de Pedicura Clínica",
      next: "SVC_PEDICURE_STEP_1",
    },
    {
      id: "SVC_PEDICURE_STEP_1",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Pedicure%20Cl%C3%ADnico/1.jpg",
      text:
        "La PEDICURA CLÍNICA es un servicio especializado que es diferente a la pedicura tradicional estética. Se realiza por nuestros podólogos y se enfoca en TRATAR AFECCIONES DE LOS PIES Y EN LA PREVENCIÓN DE PROBLEMAS FUTUROS. 🦶 🛡",
      next: "SVC_PEDICURE_STEP_2",
    },
    {
      id: "SVC_PEDICURE_STEP_2",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Pedicure%20Cl%C3%ADnico/2.jpg",
      text:
        "Costo de la PEDICURA CLÍNICA es de 100 Bs. Este servicio incluye limpieza, corte correcto de uñas, eliminación de callosidades leves y recomendaciones personalizadas para el cuidado de tus pies. 💵\nNuestros podólogos te darán ASESORAMIENTO PERSONALIZADO para la salud de tus pies, incluyendo el uso del calzado adecuado y consejos en la higiene de tus pies. 🧼",
      next: "SVC_PEDICURE_STEP_3",
    },
    {
      id: "SVC_PEDICURE_STEP_3",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Pedicure%20Cl%C3%ADnico/3.jpg",
      text:
        "Si en la consulta se detecta la necesidad de tratar UÑEROS, FISURAS, VERRUGAS, HONGOS E HIPERQUERATOSIS el precio variará según el servicio a realizar, así usted decide si desea el SERVICIO ADICIONAL en ese momento. 👣🚶‍♂️🚶‍♀️",
      next: "SVC_PEDICURE_STEP_4",
    },
    {
      id: "SVC_PEDICURE_STEP_4",
      type: "text",
      text:
        "Estamos ubicados en Santa Cruz de la Sierra, tercer Anillo interno y rotonda Av. Alemana.\nPara cualquier dato adicional, no dude en contactarnos por este medio, a nuestro WhatsApp o llamando a la línea de atención al cliente 62100083. 📱",
      next: "SVC_PEDICURE_STEP_5",
    },
    {
      id: "SVC_PEDICURE_STEP_5",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Pedicure%20Cl%C3%ADnico/5.jpeg",
      text: " ",
      next: "SVC_PEDICURE_STEP_6",
    },
    {
      id: "SVC_PEDICURE_STEP_6",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Pedicure%20Cl%C3%ADnico/6.jpeg",
      text:
        "Estos paquetes se realizan únicamente bajo recomendación del especialista 🩺, ya que durante la valoración 🔍 se determinará si el paciente necesita o no dicho tratamiento ✅❌.",
      next: "SVC_PEDICURE_ACTIONS",
    },
    {
      id: "SVC_PEDICURE_ACTIONS",
      type: "text",
      text: "¿Tienes alguna otra duda?",
      delayMs: 1500,
      buttons: [
        { label: "👨‍💻 Atención personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧼 Volver a servicios", next: "SERVICIOS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "SVC_PODOPEDIATRIA_INFO",
      type: "text",
      text: "Información de Podopediatría",
      next: "SVC_PODOPEDIATRIA_STEP_1",
    },
    {
      id: "SVC_PODOPEDIATRIA_STEP_1",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Podopediatr%C3%ADa/1.jpg",
      text:
        "La PODOPEDIATRÍA se enfoca en el diagnóstico, tratamiento y prevención de las afecciones podológicas de los niños desde su nacimiento hasta la adolescencia, ASEGURANDO UN CORRECTO DESARROLLO y evitando problemas futuros en sus pies. 👶🏽\n¡Los pies de tus pequeños necesitan un cuidado especializado! 🧑‍⚕️👩‍⚕️",
      next: "SVC_PODOPEDIATRIA_STEP_2",
    },
    {
      id: "SVC_PODOPEDIATRIA_STEP_2",
      type: "text",
      text:
        "En la especialidad de PODOPEDIATRÍA adaptamos el tratamiento a cada niño mediante una evaluación integral. 🤱🏽\n- Analizamos el desarrollo, antecedentes y estructura del pie.\n- Detectamos deformidades o lesiones.\n- Trabajamos con los padres, orientando sobre cuidado y calzado.\nEl progreso depende de la edad, la afección y el seguimiento del tratamiento recomendado. 🕒",
      next: "SVC_PODOPEDIATRIA_STEP_3",
    },
    {
      id: "SVC_PODOPEDIATRIA_STEP_3",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Podopediatr%C3%ADa/2.jpg",
      text:
        "Costo de la PEDICURA CLÍNICA es de 100 Bs. Este servicio incluye limpieza, corte correcto de uñas, eliminación de callosidades leves y recomendaciones personalizadas para el cuidado de tus pies. 💵\nNuestros podólogos te darán ASESORAMIENTO PERSONALIZADO para la salud de tus pies, incluyendo el uso del calzado adecuado y consejos en la higiene de tus pies. 🧼",
      next: "SVC_PODOPEDIATRIA_STEP_4",
    },
    {
      id: "SVC_PODOPEDIATRIA_STEP_4",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Podopediatr%C3%ADa/3.jpg",
      text:
        "Si en la consulta se detecta la necesidad de tratar UÑEROS, FISURAS, VERRUGAS, HONGOS E HIPERQUERATOSIS el precio variará según el servicio a realizar, así usted decide si desea el SERVICIO ADICIONAL en ese momento. 👣🚶‍♂️🚶‍♀️",
      next: "SVC_PODOPEDIATRIA_STEP_5",
    },
    {
      id: "SVC_PODOPEDIATRIA_STEP_5",
      type: "text",
      text:
        "Estamos ubicados en Santa Cruz de la Sierra, tercer Anillo interno y rotonda Av. Alemana.\nPara cualquier dato adicional, no dude en contactarnos por este medio, a nuestro WhatsApp o llamando a la línea de atención al cliente 62100083. 📱",
      next: "SVC_PODOPEDIATRIA_ACTIONS",
    },
    {
      id: "SVC_PODOPEDIATRIA_ACTIONS",
      type: "text",
      text: "¿Tienes alguna otra duda?",
      delayMs: 1500,
      buttons: [
        { label: "👨‍💻 Atención personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧼 Volver a servicios", next: "SERVICIOS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "SVC_PODOGERIATRIA_INFO",
      type: "text",
      text: "Información de Podogeriatría",
      next: "SVC_PODOGERIATRIA_STEP_1",
    },
    {
      id: "SVC_PODOGERIATRIA_STEP_1",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Podogeriatria/1.jpg",
      text:
        "Tratamos afecciones comunes como UÑAS ENGROSADAS, CALLOS, DUREZAS Y DEFORMIDADES. Prevenimos úlceras en pacientes con diabetes, orientamos sobre calzado adecuado y PROMOVEMOS EL AUTOCUIDADO para mantener la movilidad, aliviar el dolor y mejorar la calidad de vida para las personas de la tercera edad. 🩹🩺",
      next: "SVC_PODOGERIATRIA_STEP_2",
    },
    {
      id: "SVC_PODOGERIATRIA_STEP_2",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Podogeriatria/2.jpg",
      text:
        "El servicio de PODOGERIATRÍA tiene un costo de 200 Bs. 💵\nRealizamos cortes de uñas cuidadosos, revisamos lesiones, tratamos durezas y controlamos cualquier condición que pueda afectar la salud de sus pies.\nNuestro objetivo es brindar comodidad, prevenir complicaciones y mejorar su calidad de vida.",
      next: "SVC_PODOGERIATRIA_STEP_3",
    },
    {
      id: "SVC_PODOGERIATRIA_STEP_3",
      type: "text",
      text:
        "Este servicio podológico está enfocado en los pies de los adultos mayores, con pies más sensibles, enfermedades crónicas como la diabetes y problemas circulatorios hacen que los pies sean más vulnerables a diversas afecciones, como piel frágil, mala circulación, uñas engrosadas o deformidades. 🤶🏽",
      next: "SVC_PODOGERIATRIA_ACTIONS",
    },
    {
      id: "SVC_PODOGERIATRIA_ACTIONS",
      type: "text",
      text: "¿Tienes alguna otra duda?",
      delayMs: 1500,
      buttons: [
        { label: "👨‍💻 Atención personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧼 Volver a servicios", next: "SERVICIOS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },

    {
      id: "OTROS_MENU",
      type: "text",
      text: "Selecciona la patología que presentas 🩺 para enviarte la información correcta 📋📨",
      delayMs: 1500,
      buttons: [
        { label: "🦶 Callosidad", next: "OTR_CALLOSIDAD_INFO" },
        { label: "🦠 Verruga plantar", next: "OTR_VERRUGA_PLANTAR_INFO" },
        { label: "💧 Heloma", next: "OTR_HELOMA_INFO" },
        { label: "✂️ Extraccion de uña", next: "OTR_EXTRACCION_UNA_INFO" },
        { label: "🏃 Pie de atleta", next: "OTR_PIE_ATLETA_INFO" },
        { label: "🧪 Pie diabetico", next: "OTR_PIE_DIABETICO_INFO" },
        { label: "👨‍💻 Atención personal", next: "CONTACT_METHOD" },
      ],
    },

    {
      id: "OTR_CALLOSIDAD_INFO",
      type: "text",
      text: "Información de Callosidad",
      next: "OTR_CALLOSIDAD_STEP_1",
    },
    {
      id: "OTR_CALLOSIDAD_STEP_1",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Otros/1.%20Callosidades/1.jpg",
      text:
        "En PODOPIE, comprendemos lo importante que es mantener tus pies saludables y sin molestias. ?\nPor eso, ofrecemos un tratamiento especializado para la ELIMINACIÓN DE CALLOSIDADES, realizado por profesionales podólogos capacitados, que utilizan técnicas seguras y completamente indoloras. 🩹",
      next: "OTR_CALLOSIDAD_STEP_2",
    },
    {
      id: "OTR_CALLOSIDAD_STEP_2",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Otros/1.%20Callosidades/2.jpg",
      text:
        "- El podólogo analiza las callosidades, identificando sus causas (fricción, calzado inadecuado o alteraciones biomecánicas).\n- Con instrumentos esterilizados, retira la piel engrosada usando bisturí o limas, preservando la piel sana.\n- Programa visitas periódicas de seguimiento para controlar diariamente las callosidades y ajustar el tratamiento según las necesidades específicas del paciente.\n- Este servicio tiene un costo de 150 Bs y nos enfocamos solamente en eliminar la mayor cantidad de hiperqueratosis en las zonas afectadas. 💵",
      next: "OTR_CALLOSIDAD_STEP_3",
    },
    {
      id: "OTR_CALLOSIDAD_STEP_3",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Otros/1.%20Callosidades/235a0c02-2a0e-4d93-a3b1-031880e3a7d3.jpg",
      text:
        "Si necesita un paquete completo 🦶✨ tiene una opción accesible y detallada por realizarse, PODOCALLOS incluye una valoración profesional 👨‍⚕️📋, pedicure clínico 🧼💅, tratamiento y limpieza de callosidades, todo por un costo de 200 Bs 💰.\nEste paquete se realiza únicamente bajo recomendación del especialista 🩺, ya que durante la valoración 🔍 se determinará si el paciente necesita o no dicho tratamiento ✅❌.",
      next: "OTR_CALLOSIDAD_ACTIONS",
    },
    {
      id: "OTR_CALLOSIDAD_ACTIONS",
      type: "text",
      text: "¿Tienes alguna otra duda?",
      delayMs: 1500,
      buttons: [
        { label: "👨‍💻 Atención personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧼 Volver a servicios", next: "OTROS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "OTR_VERRUGA_PLANTAR_INFO",
      type: "text",
      text: "Información de Verruga Plantar",
      next: "OTR_VERRUGA_STEP_1",
    },
    {
      id: "OTR_VERRUGA_STEP_1",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Otros/2.%20Verruga%20plantar/1.jpg",
      text:
        "El VPH son lesiones duras y rugosas causadas por el Virus del Papiloma Humano. Se transmiten principalmente en lugares públicos húmedos, como piscinas o duchas. 🦶\n¿Te duelen esas molestas verrugas en la planta del pie? 🤕\n¡En PODOPIE tenemos la solución!",
      next: "OTR_VERRUGA_STEP_2",
    },
    {
      id: "OTR_VERRUGA_STEP_2",
      type: "text",
      text:
        "El podólogo examina las verrugas y selecciona el tratamiento adecuado, que puede incluir cremas, cauterización o eliminación quirúrgica en casos graves.🔎\nSe asesora al paciente sobre cómo evitar la expansión del VPH y se programan seguimientos para garantizar la curación.",
      next: "OTR_VERRUGA_STEP_3",
    },
    {
      id: "OTR_VERRUGA_STEP_3",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Otros/2.%20Verruga%20plantar/2.jpg",
      text:
        "Precio del servicio. 💵\n- Verrugas simple, 200 Bs.\n- Verrugas dobles, 400 Bs.\n- Verrugas múltiples, 800 Bs",
      next: "OTR_VERRUGA_STEP_4",
    },
    {
      id: "OTR_VERRUGA_STEP_4",
      type: "text",
      text:
        "Nuestro tratamiento especializado es eficaz, seguro y no invasivo, diseñado para eliminar las verrugas plantares y aliviar el dolor que causan. 🛑",
      next: "OTR_VERRUGA_ACTIONS",
    },
    {
      id: "OTR_VERRUGA_ACTIONS",
      type: "text",
      text: "¿Tienes alguna otra duda?",
      delayMs: 1500,
      buttons: [
        { label: "👨‍💻 Atención personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧼 Volver a servicios", next: "OTROS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "OTR_HELOMA_INFO",
      type: "text",
      text: "Información de Heloma",
      next: "OTR_HELOMA_STEP_1",
    },
    {
      id: "OTR_HELOMA_STEP_1",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Otros/3.%20Heloma/f12c6c99-9fbd-4e0a-8ee2-d36909000335.jpg",
      text:
        "Un heloma es una lesión en la piel del pie 🦶, conocida comúnmente como callo, que se forma por presión o fricción constante 👟🔁. Se caracteriza por un engrosamiento de la piel 🧱 y puede causar dolor 😖, especialmente al caminar 🚶‍♂️ o al usar calzado ajustado 👞. Suele aparecer en la planta del pie 👣 o en los dedos 🦶✨.\nEl tratamiento de heloma consiste en la eliminación segura del callo, alivio del dolor, y recomendaciones personalizadas para evitar que reaparezca 👣✨\nEl consto del tratamiento tiene un valor de 100 Bs.",
      next: "OTR_HELOMA_ACTIONS",
    },
    {
      id: "OTR_HELOMA_ACTIONS",
      type: "text",
      text: "¿Tienes alguna otra duda?",
      delayMs: 1500,
      buttons: [
        { label: "👨‍💻 Atención personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧼 Volver a servicios", next: "OTROS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "OTR_EXTRACCION_UNA_INFO",
      type: "text",
      text: "Información de Extracción de Uña",
      next: "OTR_EXTRACCION_STEP_1",
    },
    {
      id: "OTR_EXTRACCION_STEP_1",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Otros/4.%20Extracci%C3%B3n%20de%20u%C3%B1a/IMAGEN%201.jpg",
      text:
        "En PODOPIE realizamos la extracción profesional de uñas de forma segura, limpia y sin dolor, utilizando anestesia local y técnicas especializadas.",
      next: "OTR_EXTRACCION_STEP_2",
    },
    {
      id: "OTR_EXTRACCION_STEP_2",
      type: "text",
      text:
        "🔍 ¿En qué casos se recomienda la extracción?\n• Golpes fuertes que provocan hematomas o desprendimiento\n• Uñas parcialmente sueltas o fracturadas\n• Infecciones severas con riesgo de complicación",
      next: "OTR_EXTRACCION_STEP_3",
    },
    {
      id: "OTR_EXTRACCION_STEP_3",
      type: "text",
      text:
        "IMPORTANTE: ⚠️\nNo siempre es necesario quitar la uña. En PODOPIE solo realizamos la extracción si es clínicamente justificado, ya que quitar la uña no elimina los hongos ni cura los uñeros por sí solo. Por eso, cada caso es evaluado individualmente",
      next: "OTR_EXTRACCION_STEP_4",
    },
    {
      id: "OTR_EXTRACCION_STEP_4",
      type: "text",
      text:
        "✅ ¿Qué incluye el procedimiento?\n• Evaluación podológica completa\n• Extracción con anestesia local (sin dolor)\n• Limpieza y cuidado del lecho ungueal\n• Recomendaciones post-procedimiento\n💰 Costo: 200 Bs por uña",
      next: "OTR_EXTRACCION_ACTIONS",
    },
    {
      id: "OTR_EXTRACCION_ACTIONS",
      type: "text",
      text: "¿Tienes alguna otra duda?",
      delayMs: 1500,
      buttons: [
        { label: "👨‍💻 Atención personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧼 Volver a servicios", next: "OTROS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "OTR_PIE_ATLETA_INFO",
      type: "text",
      text: "Información de Pie de Atleta",
      next: "OTR_PIE_ATLETA_STEP_1",
    },
    {
      id: "OTR_PIE_ATLETA_STEP_1",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Otros/5.%20Pie%20de%20atleta/1.jpg",
      text:
        "El pie de atleta es una infección causada por hongos que afecta principalmente la piel de los pies, sobre todo entre los dedos. Es una afección bastante común y contagiosa, que suele aparecer cuando los pies permanecen húmedos y calientes por mucho tiempo, como al usar zapatos cerrados durante horas.",
      next: "OTR_PIE_ATLETA_STEP_2",
    },
    {
      id: "OTR_PIE_ATLETA_STEP_2",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Otros/5.%20Pie%20de%20atleta/2.jpg",
      text:
        "🛡️ Prevención\nPara evitar el pie de atleta se recomienda:\n• Secar bien los pies, especialmente entre los dedos\n• Usar calcetines limpios y transpirables\n• Evitar caminar descalzo en lugares públicos\n• No compartir objetos personales\n💰 Costo: 100 Bs",
      next: "OTR_PIE_ATLETA_ACTIONS",
    },
    {
      id: "OTR_PIE_ATLETA_ACTIONS",
      type: "text",
      text: "¿Tienes alguna otra duda?",
      delayMs: 1500,
      buttons: [
        { label: "👨‍💻 Atención personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧼 Volver a servicios", next: "OTROS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "OTR_PIE_DIABETICO_INFO",
      type: "text",
      text: "Información de Pie Diabético",
      next: "OTR_PIE_DIABETICO_STEP_1",
    },
    {
      id: "OTR_PIE_DIABETICO_STEP_1",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Otros/6.%20Paciente%20Diab%C3%A9tico/1.jpg",
      text:
        "En PODOPIE contamos con un servicio especializado en podología para pacientes diabéticos, enfocado en la prevención de complicaciones como úlceras, infecciones y lesiones que pueden poner en riesgo la salud del pie. 🩸 👣\n¿POR QUÉ ES IMPORTANTE? 🤷🏽‍♂️\nLas personas con diabetes pueden tener daño en los nervios (neuropatía) o problemas de circulación, lo que hace que un mal corte de uñas o UNA PEQUEÑA LESIÓN pueda CONVERTIRSE EN UNA COMPLICACIÓN SERIA. ⚕",
      next: "OTR_PIE_DIABETICO_STEP_2",
    },
    {
      id: "OTR_PIE_DIABETICO_STEP_2",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Otros/6.%20Paciente%20Diab%C3%A9tico/2.jpg",
      text:
        "Ofrecemos atención podológica especializada para pacientes diabéticos, que incluye evaluación de la sensibilidad y circulación, corte seguro de uñas, prevención de úlceras, control de infecciones si existieran, desbridamiento si es necesario, asesoría sobre el uso de calzado adecuado y educación para el autocuidado. 🦶",
      next: "OTR_PIE_DIABETICO_STEP_3",
    },
    {
      id: "OTR_PIE_DIABETICO_STEP_3",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/Servicios/Otros/6.%20Paciente%20Diab%C3%A9tico/58369928-c3fd-4e9b-a79b-992a866b37d6.jpg",
      text:
        "Si necesita un paquete completo 🦶🩵 tiene una opción accesible y detallada por realizarse, PODODIABETIK incluye un chequeo médico 🩺📋, revisión podal 👣🔍, profilaxis podal 🧼🦶 e hidratación podal 💧✨, todo por un costo de 150 Bs 💵.\nEste paquete se realiza únicamente bajo recomendación del especialista 🩺, ya que durante la valoración 🔍 se determinará si el paciente necesita o no dicho tratamiento ✅❌.",
      next: "OTR_PIE_DIABETICO_ACTIONS",
    },
    {
      id: "OTR_PIE_DIABETICO_ACTIONS",
      type: "text",
      text: "¿Tienes alguna otra duda?",
      delayMs: 1500,
      buttons: [
        { label: "👨‍💻 Atención personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧼 Volver a servicios", next: "OTROS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },

    {
      id: "CONTACT_METHOD",
      type: "text",
      text: "Selección de forma de atención",
      delayMs: 1500,
      buttons: [
        { label: "📞 Llamada", next: "ACTION_CALL" },
        { label: "💬 Mensaje", next: "ACTION_MESSAGE" },
      ],
    },
    {
      id: "ACTION_CALL",
      type: "action",
      action: "atencion_personalizada_llamada",
      terminal: true,
    },
    {
      id: "ACTION_MESSAGE",
      type: "action",
      action: "atencion_personalizada_mensaje",
      terminal: true,
    },

    {
      id: "CIERRE_PRECIOS_SERVICIOS",
      type: "text",
      text: "MENSAJE DE CIERRE\nPRECIOS\nY SERVICIOS",
      next: "CIERRE_PRECIOS_IMG_1",
    },
    {
      id: "CIERRE_PRECIOS_IMG_1",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/precios1.jpg",
      text: " ",
      next: "CIERRE_PRECIOS_IMG_2",
    },
    {
      id: "CIERRE_PRECIOS_IMG_2",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/precios2.jpg",
      text: " ",
      next: "CIERRE_PRECIOS_IMG_3",
    },
    {
      id: "CIERRE_PRECIOS_IMG_3",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/precios3.jpg",
      text: " ",
      next: "CIERRE_PRECIOS_FINAL",
    },
    {
      id: "CIERRE_PRECIOS_FINAL",
      type: "text",
      text:
        "Agradecemos sinceramente su confianza 🤝. Quedamos a su disposición para atender cualquier necesidad o inconveniente podológico que pudiera presentarse 🦶✨. Saludos.",
      terminal: true,
    },
    {
      id: "CIERRE_HORARIO_UBICACION",
      type: "text",
      text: "ATENCIÓN CENTRAL",
      next: "CIERRE_HORARIO_CENTRAL_1",
    },
    {
      id: "CIERRE_HORARIO_CENTRAL_1",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/centralHorario.jpg",
      text: "Puede venir en estos horarios ?",
      next: "CIERRE_HORARIO_CENTRAL_2",
    },
    {
      id: "CIERRE_HORARIO_CENTRAL_2",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/centralUbicacion.jpg",
      text: "Haz clic aquí para ver nuestra ubicación en Google Maps:\nhttps://maps.app.goo.gl/eXTejzQhp8zm3EmT8",
      next: "CIERRE_HORARIO_CENTRAL_3",
    },
    {
      id: "CIERRE_HORARIO_CENTRAL_3",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/centralLineas.jpg",
      text: "🚌 Líneas que pasan: 74, 38, 7, 60, 51, 36, 37, 89, Trufi",
      next: "CIERRE_HORARIO_SUCURSAL_TITLE",
    },
    {
      id: "CIERRE_HORARIO_SUCURSAL_TITLE",
      type: "text",
      text: "ATENCIÓN SUCURSAL",
      next: "CIERRE_HORARIO_SUCURSAL_1",
    },
    {
      id: "CIERRE_HORARIO_SUCURSAL_1",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/sucursalHorario.jpg",
      text: "Puede venir en estos horarios ?",
      next: "CIERRE_HORARIO_SUCURSAL_2",
    },
    {
      id: "CIERRE_HORARIO_SUCURSAL_2",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/sucursalUbicacion.jpg",
      text: "Haz clic aquí para ver nuestra ubicación en Google Maps:\nhttps://maps.app.goo.gl/eXTejzQhp8zm3EmT8",
      next: "CIERRE_HORARIO_SUCURSAL_3",
    },
    {
      id: "CIERRE_HORARIO_SUCURSAL_3",
      type: "image",
      url: "https://pub-d02cc32ec9504df3a4d645e1520c6f43.r2.dev/media/sucursalLineas.jpg",
      text: "🚌 Líneas que pasan: 8, 10, 11, 30, 33, 54, 55, 56, 57, 58, 68, 78, 86, 104, 72, 73, Trufi",
      terminal: true,
    },
  ],

  useLegacyHandler: false,
};




