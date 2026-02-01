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
        { label: "HORARIOS Y UBICACION", next: "HORARIOS_INFO" },
        { label: "PRECIOS", next: "PRECIOS_INFO" },
        { label: "SERVICIOS", next: "SERVICIOS_MENU" },
        { label: "ATENCION PERSONALIZADA", next: "CONTACT_METHOD" },
      ],
    },

    {
      id: "HORARIOS_INFO",
      type: "text",
      text: "INFORMACIÓN DE HORARIOS Y UBICACION DE LA CENTRAL Y SUCURSAL",
      buttons: [
        { label: "VOLVER AL MENU", next: "MAIN_MENU" },
        { label: "FINALIZAR", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },

    {
      id: "PRECIOS_INFO",
      type: "text",
      text: "ENVIAR INFORMACIÓN DE PRECIOS GENERAL\nPREGUNTAR SI REQUIERE UN SERVICIO",
      buttons: [
        { label: "ATENCION PERSONALIZADA", next: "CONTACT_METHOD" },
        { label: "NO", next: "PRECIOS_MAS" },
        { label: "SI", next: "SERVICIOS_MENU" },
      ],
    },
    {
      id: "PRECIOS_MAS",
      type: "text",
      text: "SI REQUIERE ALGO MÁS DARLE OPCIÓN DEL VOLVER AL MENU O FINALIZAR",
      buttons: [
        { label: "VOLVER AL MENU", next: "MAIN_MENU" },
        { label: "FINALIZAR", next: "CIERRE_PRECIOS_SERVICIOS" },
      ],
    },

    {
      id: "SERVICIOS_MENU",
      type: "text",
      text: "SELECCIONA EL SERVICIO QUE NECESITES",
      buttons: [
        { label: "UÑERO", next: "UNERO_TIPO_TRAT" },
        { label: "HONGOS", next: "HONGOS_TIPO_TRAT" },
        { label: "PEDICURE", next: "SVC_PEDICURE_INFO" },
        { label: "PODOPEDIATRIA", next: "SVC_PODOPEDIATRIA_INFO" },
        { label: "PODOGERIATRIA", next: "SVC_PODOGERIATRIA_INFO" },
        { label: "OTROS", next: "OTROS_MENU" },
      ],
    },

    {
      id: "UNERO_TIPO_TRAT",
      type: "text",
      text: "INFORMACION DEL SERVICIO\nTIPO DE TRATAMIENTO",
      buttons: [
        { label: "MATRICECTOMIA", next: "TRAT_MATRICECTOMIA_INFO" },
        { label: "ORTESIS", next: "TRAT_ORTESIS_INFO" },
      ],
    },
    {
      id: "HONGOS_TIPO_TRAT",
      type: "text",
      text: "INFORMACION DEL SERVICIO\nTIPO DE TRATAMIENTO",
      buttons: [
        { label: "TOPICO", next: "TRAT_TOPICO_INFO" },
        { label: "LASER", next: "TRAT_LASER_INFO" },
        { label: "SISTEMICO", next: "TRAT_SISTEMICO_INFO" },
      ],
    },

    {
      id: "TRAT_MATRICECTOMIA_INFO",
      type: "text",
      text: "INFORMACION DEL TRATAMIENTO",
      buttons: [
        { label: "ATENCION PERSONALIZADA", next: "CONTACT_METHOD" },
        { label: "volver al menu", next: "MAIN_MENU" },
        { label: "volver al menu de servicios", next: "SERVICIOS_MENU" },
        { label: "FINALIZAR", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "TRAT_ORTESIS_INFO",
      type: "text",
      text: "INFORMACION DEL TRATAMIENTO",
      buttons: [
        { label: "ATENCION PERSONALIZADA", next: "CONTACT_METHOD" },
        { label: "volver al menu", next: "MAIN_MENU" },
        { label: "volver al menu de servicios", next: "SERVICIOS_MENU" },
        { label: "FINALIZAR", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "TRAT_TOPICO_INFO",
      type: "text",
      text: "INFORMACION DEL TRATAMIENTO",
      buttons: [
        { label: "ATENCION PERSONALIZADA", next: "CONTACT_METHOD" },
        { label: "volver al menu", next: "MAIN_MENU" },
        { label: "volver al menu de servicios", next: "SERVICIOS_MENU" },
        { label: "FINALIZAR", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "TRAT_LASER_INFO",
      type: "text",
      text: "INFORMACION DEL TRATAMIENTO",
      buttons: [
        { label: "ATENCION PERSONALIZADA", next: "CONTACT_METHOD" },
        { label: "volver al menu", next: "MAIN_MENU" },
        { label: "volver al menu de servicios", next: "SERVICIOS_MENU" },
        { label: "FINALIZAR", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "TRAT_SISTEMICO_INFO",
      type: "text",
      text: "INFORMACION DEL TRATAMIENTO",
      buttons: [
        { label: "ATENCION PERSONALIZADA", next: "CONTACT_METHOD" },
        { label: "volver al menu", next: "MAIN_MENU" },
        { label: "volver al menu de servicios", next: "SERVICIOS_MENU" },
        { label: "FINALIZAR", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },

    {
      id: "SVC_PEDICURE_INFO",
      type: "text",
      text: "INFORMACION DEL SERVICIO",
      buttons: [
        { label: "ATENCION PERSONALIZADA", next: "CONTACT_METHOD" },
        { label: "volver al menu", next: "MAIN_MENU" },
        { label: "volver al menu de servicios", next: "SERVICIOS_MENU" },
        { label: "FINALIZAR", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "SVC_PODOPEDIATRIA_INFO",
      type: "text",
      text: "INFORMACION DEL SERVICIO",
      buttons: [
        { label: "ATENCION PERSONALIZADA", next: "CONTACT_METHOD" },
        { label: "volver al menu", next: "MAIN_MENU" },
        { label: "volver al menu de servicios", next: "SERVICIOS_MENU" },
        { label: "FINALIZAR", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "SVC_PODOGERIATRIA_INFO",
      type: "text",
      text: "INFORMACION DEL SERVICIO",
      buttons: [
        { label: "ATENCION PERSONALIZADA", next: "CONTACT_METHOD" },
        { label: "volver al menu", next: "MAIN_MENU" },
        { label: "volver al menu de servicios", next: "SERVICIOS_MENU" },
        { label: "FINALIZAR", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },

    {
      id: "OTROS_MENU",
      type: "text",
      text: "SELECCIONA EL SERVICIO QUE NECESITES",
      buttons: [
        { label: "CALLOSIDAD", next: "OTR_CALLOSIDAD_INFO" },
        { label: "VERRUGA PLANTAR", next: "OTR_VERRUGA_PLANTAR_INFO" },
        { label: "HELOMA", next: "OTR_HELOMA_INFO" },
        { label: "EXTRACCION DE UÑA", next: "OTR_EXTRACCION_UNA_INFO" },
        { label: "PIE DE ATLETA", next: "OTR_PIE_ATLETA_INFO" },
        { label: "PIE DIABETICO", next: "OTR_PIE_DIABETICO_INFO" },
        { label: "ATENCION PERSONALIZADA", next: "CONTACT_METHOD" },
      ],
    },

    {
      id: "OTR_CALLOSIDAD_INFO",
      type: "text",
      text: "INFORMACION DEL SERVICIO + podopaquete",
      buttons: [
        { label: "ATENCION PERSONALIZADA", next: "CONTACT_METHOD" },
        { label: "volver al menu", next: "MAIN_MENU" },
        { label: "volver al menu de servicios", next: "OTROS_MENU" },
        { label: "FINALIZAR", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "OTR_VERRUGA_PLANTAR_INFO",
      type: "text",
      text: "INFORMACION DEL SERVICIO",
      buttons: [
        { label: "ATENCION PERSONALIZADA", next: "CONTACT_METHOD" },
        { label: "volver al menu", next: "MAIN_MENU" },
        { label: "volver al menu de servicios", next: "OTROS_MENU" },
        { label: "FINALIZAR", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "OTR_HELOMA_INFO",
      type: "text",
      text: "INFORMACION DEL SERVICIO",
      buttons: [
        { label: "ATENCION PERSONALIZADA", next: "CONTACT_METHOD" },
        { label: "volver al menu", next: "MAIN_MENU" },
        { label: "volver al menu de servicios", next: "OTROS_MENU" },
        { label: "FINALIZAR", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "OTR_EXTRACCION_UNA_INFO",
      type: "text",
      text: "INFORMACION DEL SERVICIO",
      buttons: [
        { label: "ATENCION PERSONALIZADA", next: "CONTACT_METHOD" },
        { label: "volver al menu", next: "MAIN_MENU" },
        { label: "volver al menu de servicios", next: "OTROS_MENU" },
        { label: "FINALIZAR", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "OTR_PIE_ATLETA_INFO",
      type: "text",
      text: "INFORMACION DEL SERVICIO",
      buttons: [
        { label: "ATENCION PERSONALIZADA", next: "CONTACT_METHOD" },
        { label: "volver al menu", next: "MAIN_MENU" },
        { label: "volver al menu de servicios", next: "OTROS_MENU" },
        { label: "FINALIZAR", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },
    {
      id: "OTR_PIE_DIABETICO_INFO",
      type: "text",
      text: "INFORMACION DEL SERVICIO + podopaquete",
      buttons: [
        { label: "ATENCION PERSONALIZADA", next: "CONTACT_METHOD" },
        { label: "volver al menu", next: "MAIN_MENU" },
        { label: "volver al menu de servicios", next: "OTROS_MENU" },
        { label: "FINALIZAR", next: "CIERRE_HORARIO_UBICACION" },
      ],
    },

    {
      id: "CONTACT_METHOD",
      type: "text",
      text: "Seleccion de forma de atencion",
      buttons: [
        { label: "Llamada", next: "ACTION_CALL" },
        { label: "mensaje", next: "ACTION_MESSAGE" },
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
