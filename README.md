# Bot Podopie - WhatsApp Cloud API

Servidor Node.js + Express listo para recibir webhooks y responder mensajes de texto.

## Requisitos

- Node.js 18+
- Cuenta y app en Meta WhatsApp Cloud API

## Variables de entorno

- `WHATSAPP_TOKEN` - Token de acceso de WhatsApp Cloud API
- `PHONE_NUMBER_ID` - ID del numero de telefono de WhatsApp
- `VERIFY_TOKEN` - Token de verificacion para el webhook de Meta
- `PORT` - Puerto HTTP (por defecto 3000)

## Railway deploy

1. Crea un nuevo proyecto en Railway y conecta este repo.
2. Configura las variables de entorno listadas arriba.
3. Despliega el servicio.
4. Usa esta URL de webhook en Meta:
   - `https://<railway-domain>/webhook`

### Verificacion en Meta

1. En tu app de Meta, ve a WhatsApp > Configuration > Webhooks.
2. Callback URL: `https://<railway-domain>/webhook`
3. Verify token: el mismo valor que `VERIFY_TOKEN`
4. Suscribete al evento `messages`.

## Health check

- `GET /health` devuelve `ok`.
