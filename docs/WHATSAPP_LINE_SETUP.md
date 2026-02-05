# Guia detallada: crear app en Meta y obtener una nueva linea de prueba

Este documento sirve como paso a paso y glosario para crear una nueva app en Meta Developers, obtener una linea de prueba de WhatsApp Cloud API y registrarla en tu sistema.

---

## 1) Requisitos previos

- Cuenta de Meta (Facebook) con acceso a Meta Developers.
- Un Business Portfolio (Business Manager) creado.
- Un numero de telefono propio para recibir mensajes de prueba (no el numero de prueba de Meta).
- Acceso al panel Superadmin de tu sistema.

---

## 2) Crear una nueva app en Meta Developers (desde cero)

1. Entra al panel de apps y crea una nueva app.
2. Cuando elijas el tipo de app, selecciona la opcion orientada a negocios (si ves "Business", elige esa).
3. Completa el formulario basico (nombre de app, email de contacto).
4. Una vez creada, entra al dashboard de la app.

Resultado esperado: app creada y visible en el dashboard.

---

## 3) Agregar el producto WhatsApp a la app

1. En el dashboard de la app, busca "Add Product" o "Agregar producto".
2. Elige "WhatsApp" y agregalo.
3. En el menu lateral de WhatsApp, entra a "Getting Started" (o "Inicio rapido / Prueba de API").

Resultado esperado: veras el panel de pruebas con token temporal, numero de prueba y pasos de envio.

---

## 4) Crear la linea de prueba (test line) en el panel de WhatsApp

En la seccion de pruebas (Getting Started / Prueba de API):

1. Genera un token temporal (solo para pruebas). Este token expira.
2. En "Desde" (From), selecciona el numero de prueba que te da Meta.
3. Copia el **Phone Number ID** que aparece debajo del selector.
4. Copia el **WABA ID** (WhatsApp Business Account ID) que aparece en la misma seccion.
5. En "Agregar numero de destinatario", agrega tu numero real.
6. Confirma el codigo que te envia WhatsApp.
7. Usa el cURL de ejemplo para enviar un mensaje de prueba.

Resultado esperado: llega un mensaje al numero que agregaste.

---

## 5) Configurar Webhook (para recibir mensajes)

1. En el menu de WhatsApp de tu app, busca la seccion de Webhooks.
2. Configura el **Callback URL** apuntando a tu servidor:
   - Ejemplo: `https://tu-dominio.com/webhook`
3. Define un **Verify Token** (puede ser cualquier string que guardes en tu sistema).
4. Verifica el webhook (Meta hace un GET con `hub.verify_token`).
5. (Opcional) Configura el **App Secret** en tu sistema para validar firma.

Resultado esperado: el webhook queda "verificado" y recibiras eventos.

---

## 6) (Opcional) Crear un Access Token permanente

Para uso estable (no recomendado usar token temporal):

1. Entra a Meta Business Suite.
2. Ve a Business Settings > Users > System Users.
3. Crea un System User con rol Admin.
4. Asigna la app como Asset (Apps -> Full Control).
5. Asigna el WhatsApp Account al System User (WhatsApp Accounts -> Add People -> Full Control).
6. Genera el token del System User.
7. Selecciona permisos:
   - whatsapp_business_messaging
   - whatsapp_business_management
   - (recomendado) business_management
8. Copia el token y guardalo.

Resultado esperado: token permanente disponible para produccion.

---

## 7) Registrar la linea en tu sistema (Superadmin)

En el panel Superadmin > Lineas de WhatsApp Cloud:

Campos obligatorios:
- **Phone Number ID**
- **Verify Token**
- **Permanent Access Token**

Campos opcionales:
- **Nombre para mostrar**
- **WABA ID**
- **App Secret**

Recomendacion:
- Marca **Linea Activa**.
- Marca **Linea Principal** solo si quieres que sea la default.

---

## 8) Checklist rapido de credenciales

- Phone Number ID: ______________________
- WABA ID: ______________________________
- Verify Token (Webhook): _______________
- Permanent Access Token: _______________
- App Secret: ___________________________
- Callback URL: _________________________

---

## 9) Glosario rapido

- **Phone Number ID**: ID interno del numero que usa la API.
- **WABA ID**: ID de la cuenta de WhatsApp Business.
- **Verify Token**: string que Meta usa para verificar tu webhook.
- **Access Token**: token para autenticar llamadas a la API.
- **App Secret**: clave secreta de la app (firma de webhooks).
- **Callback URL**: URL publica donde llegan los webhooks.

---

## 10) Variables env legacy (solo si no usas multi-tenant)

Si tu instancia usa las envs en lugar de canales por tenant:

- `PHONE_NUMBER_ID`
- `WHATSAPP_TOKEN`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`

---

## 11) Referencias utiles

- Meta WhatsApp Cloud API Overview:
  https://meta-preview.mintlify.io/docs/whatsapp/cloud-api/overview
- Coleccion oficial (Meta) en Postman:
  https://www.postman.com/meta/whatsapp-business-platform/collection/13382743-2fd9b32d-f63c-4056-873e-4c398dde9d6d

