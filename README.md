# Bot Podopie - WhatsApp Cloud API + Odoo

Webhook de WhatsApp Cloud API integrado a Odoo para identificar pacientes, consultar pagos, compras POS y datos basicos.

## Requisitos

- Node.js 18+
- Cuenta y app en Meta WhatsApp Cloud API
- Instancia Odoo accesible (por ejemplo via ngrok)

## Variables de entorno

### WhatsApp Cloud API

- `WHATSAPP_TOKEN`
- `PHONE_NUMBER_ID`
- `VERIFY_TOKEN`

### Odoo JSON-RPC

- `ODOO_URL` (ej: `https://podopie.ngrok.io`)
- `ODOO_DB`
- `ODOO_USER`
- `ODOO_PASS`

### Opcional

- `PORT` (por defecto 3000)
- `NODE_ENV` (por defecto `production`)
- `SQLITE_PATH` (si queres persistir sesiones en SQLite)
- `LOCATION_LAT`, `LOCATION_LNG`, `LOCATION_NAME`, `LOCATION_ADDRESS` (para enviar ubicacion)

## Instalar y correr

```bash
npm install
npm run dev
```

Para prod:

```bash
npm start
```

## Webhook

- `GET /webhook` verifica el webhook en Meta (hub.challenge).
- `POST /webhook` procesa mensajes de texto o interactivos, ignora statuses y echo del propio bot.

## Endpoints

- `GET /health` => `ok`
- `GET /debug/last-webhook` => ultimo body recibido
- `GET /debug/session/:wa` => sesion por wa_id

## Flujo del bot

- Identifica por telefono en Odoo.
- Si no identifica, pide CI (solo numeros).
- Menu principal con:
  - Pagos pendientes
  - Ultimas compras POS
  - Mis datos
  - Ubicacion
  - Horarios
- Comandos: `menu` vuelve al menu, `salir` borra la sesion.

## Railway deploy

1. Crea un proyecto en Railway y conecta este repo.
2. Configura las variables de entorno listadas arriba.
3. Despliega el servicio.
4. Usa esta URL de webhook en Meta:
   - `https://<railway-domain>/webhook`

Nota: tu WABA debe estar en `subscribed_apps` para recibir eventos.
