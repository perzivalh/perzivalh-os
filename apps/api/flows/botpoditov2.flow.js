/**
 * Flow: Botpodito V2
 * Flujograma v2 con contacto por llamada o mensaje
 */
module.exports = {
  id: "botpoditov2",
  name: "Botpodito V2",
  description: "Flujograma V2 con menu principal y contacto personalizado.",
  version: "1.0.0",
  icon: "🦶",
  category: "salud",

  flow_name: "flujogramaV2",
  canva_design_id: "DAHAG6gmuBg",
  start_node_id: "WELCOME",

  nodes: [
    {
      id: "WELCOME",
      type: "text",
      text: "PRIMER MENSAJE DE BIENVENIDA",
      next: "MAIN_MENU",
    },
    {
      id: "MAIN_MENU",
      type: "text",
      text: "MENU Y ETIQUETA DEL MES ACTUAL",
      buttons: [
        { label: "🕒 Horarios y ubicacion", next: "HORARIOS_INFO" },
        { label: "💰 Precios", next: "PRECIOS_INFO" },
        { label: "🧼 Servicios", next: "SERVICIOS_MENU" },
        { label: "👨‍💻 Atencion personal", next: "CONTACT_METHOD" },
      ],
    },

    {
      id: "HORARIOS_INFO",
      type: "text",
      text: "INFORMACIÓN DE HORARIOS Y UBICACION DE LA CENTRAL Y SUCURSAL",
      buttons: [
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },

    {
      id: "PRECIOS_INFO",
      type: "text",
      text: "ENVIAR INFORMACIÓN DE PRECIOS GENERAL\nPREGUNTAR SI REQUIERE UN SERVICIO",
      buttons: [
        { label: "👨‍💻 Atencion personal", next: "CONTACT_METHOD" },
        { label: "❌ No", next: "PRECIOS_MAS" },
        { label: "✅ Si", next: "SERVICIOS_MENU" },
      ],
    },
    {
      id: "PRECIOS_MAS",
      type: "text",
      text: "SI REQUIERE ALGO MÁS DARLE OPCIÓN DEL VOLVER AL MENU O FINALIZAR",
      buttons: [
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_PRECIOS_SERVICIOS" },
      ],
    },

    {
      id: "SERVICIOS_MENU",
      type: "text",
      text: "SELECCIONA EL SERVICIO QUE NECESITES",
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
      text: "INFORMACION DEL SERVICIO\nTIPO DE TRATAMIENTO",
      buttons: [
        { label: "✂️ Matricectomia", next: "TRAT_MATRICECTOMIA_INFO" },
        { label: "🦴 Ortesis", next: "TRAT_ORTESIS_INFO" },
      ],
    },
    {
      id: "HONGOS_TIPO_TRAT",
      type: "text",
      text: "INFORMACION DEL SERVICIO\nTIPO DE TRATAMIENTO",
      buttons: [
        { label: "🧴 Topico", next: "TRAT_TOPICO_INFO" },
        { label: "🔦 Laser", next: "TRAT_LASER_INFO" },
        { label: "💊 Sistemico", next: "TRAT_SISTEMICO_INFO" },
      ],
    },

    {
      id: "TRAT_MATRICECTOMIA_INFO",
      type: "text",
      text: "INFORMACION DEL TRATAMIENTO",
      buttons: [
        { label: "👨‍💻 Atencion personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧼 Volver a servicios", next: "SERVICIOS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "TRAT_ORTESIS_INFO",
      type: "text",
      text: "INFORMACION DEL TRATAMIENTO",
      buttons: [
        { label: "👨‍💻 Atencion personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧼 Volver a servicios", next: "SERVICIOS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "TRAT_TOPICO_INFO",
      type: "text",
      text: "INFORMACION DEL TRATAMIENTO",
      buttons: [
        { label: "👨‍💻 Atencion personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧼 Volver a servicios", next: "SERVICIOS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "TRAT_LASER_INFO",
      type: "text",
      text: "INFORMACION DEL TRATAMIENTO",
      buttons: [
        { label: "👨‍💻 Atencion personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧼 Volver a servicios", next: "SERVICIOS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "TRAT_SISTEMICO_INFO",
      type: "text",
      text: "INFORMACION DEL TRATAMIENTO",
      buttons: [
        { label: "👨‍💻 Atencion personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧼 Volver a servicios", next: "SERVICIOS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },

    {
      id: "SVC_PEDICURE_INFO",
      type: "text",
      text: "INFORMACION DEL SERVICIO",
      buttons: [
        { label: "👨‍💻 Atencion personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧼 Volver a servicios", next: "SERVICIOS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "SVC_PODOPEDIATRIA_INFO",
      type: "text",
      text: "INFORMACION DEL SERVICIO",
      buttons: [
        { label: "👨‍💻 Atencion personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧼 Volver a servicios", next: "SERVICIOS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "SVC_PODOGERIATRIA_INFO",
      type: "text",
      text: "INFORMACION DEL SERVICIO",
      buttons: [
        { label: "👨‍💻 Atencion personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧼 Volver a servicios", next: "SERVICIOS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },

    {
      id: "OTROS_MENU",
      type: "text",
      text: "SELECCIONA EL SERVICIO QUE NECESITES",
      buttons: [
        { label: "🦶 Callosidad", next: "OTR_CALLOSIDAD_INFO" },
        { label: "🦠 Verruga plantar", next: "OTR_VERRUGA_PLANTAR_INFO" },
        { label: "💧 Heloma", next: "OTR_HELOMA_INFO" },
        { label: "✂️ Extraccion de uña", next: "OTR_EXTRACCION_UNA_INFO" },
        { label: "🏃 Pie de atleta", next: "OTR_PIE_ATLETA_INFO" },
        { label: "🧪 Pie diabetico", next: "OTR_PIE_DIABETICO_INFO" },
        { label: "👨‍💻 Atencion personal", next: "CONTACT_METHOD" },
      ],
    },

    {
      id: "OTR_CALLOSIDAD_INFO",
      type: "text",
      text: "INFORMACION DEL SERVICIO + podopaquete",
      buttons: [
        { label: "👨‍💻 Atencion personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧰 Volver a servicios", next: "OTROS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "OTR_VERRUGA_PLANTAR_INFO",
      type: "text",
      text: "INFORMACION DEL SERVICIO",
      buttons: [
        { label: "👨‍💻 Atencion personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧰 Volver a servicios", next: "OTROS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "OTR_HELOMA_INFO",
      type: "text",
      text: "INFORMACION DEL SERVICIO",
      buttons: [
        { label: "👨‍💻 Atencion personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧰 Volver a servicios", next: "OTROS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "OTR_EXTRACCION_UNA_INFO",
      type: "text",
      text: "INFORMACION DEL SERVICIO",
      buttons: [
        { label: "👨‍💻 Atencion personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧰 Volver a servicios", next: "OTROS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "OTR_PIE_ATLETA_INFO",
      type: "text",
      text: "INFORMACION DEL SERVICIO",
      buttons: [
        { label: "👨‍💻 Atencion personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧰 Volver a servicios", next: "OTROS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "OTR_PIE_DIABETICO_INFO",
      type: "text",
      text: "INFORMACION DEL SERVICIO + podopaquete",
      buttons: [
        { label: "👨‍💻 Atencion personal", next: "CONTACT_METHOD" },
        { label: "⬅️ Volver al menu", next: "MAIN_MENU" },
        { label: "🧰 Volver a servicios", next: "OTROS_MENU" },
        { label: "✅ Finalizar", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },

    {
      id: "CONTACT_METHOD",
      type: "text",
      text: "Seleccion de forma de atencion",
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
      terminal: true,
    },
    {
      id: "CIERRE_HORARIO_UBICACION",
      type: "text",
      text: "MENSAJE DE CIERRE\nhorario\nubicacion",
      terminal: true,
    },
  ],

  useLegacyHandler: false,
};
