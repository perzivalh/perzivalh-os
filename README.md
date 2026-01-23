# Podopie OS - WhatsApp Cloud API + Odoo + Inbox

Podopie OS incluye el webhook de WhatsApp Cloud API integrado a Odoo y una bandeja web multiusuario con conversaciones, tags y handoff bot/humano.

## Estructura (monorepo)

```
/apps
  /api        Backend Node + Express + Socket.io
  /web        Vite + React
/prisma
  /control    Control Plane (multi-tenant)
  /tenant     Tenant DB (chat/inbox)
/infra        Infraestructura (placeholder)
/scripts      Scripts operativos (placeholder)
```

## Requisitos

- Node.js 18+
- Postgres (local o Railway)
- Cuenta y app en Meta WhatsApp Cloud API
- Instancia Odoo accesible (por ejemplo via ngrok)

## Variables de entorno

Copia `.env.example` a `.env` en la raiz y completa los valores. Para el frontend crea `apps/web/.env` con `VITE_API_BASE`.

### WhatsApp Cloud API

- `WHATSAPP_TOKEN`: token de acceso de la app.
- `PHONE_NUMBER_ID`: ID del numero de telefono.
- `VERIFY_TOKEN`: token para verificacion del webhook.
- `WHATSAPP_APP_SECRET`: secreto para validar firma (opcional).
- `WHATSAPP_BUSINESS_ACCOUNT_ID`: WABA para sincronizar templates.
- `ADMIN_PHONE_E164`: telefono admin (comandos BOT/CERRAR).

### Odoo JSON-RPC

- `ODOO_BASE_URL`: base URL de Odoo (ej: `https://podopie.ngrok.io`).
- `ODOO_DB`
- `ODOO_USERNAME`
- `ODOO_PASSWORD`

Compatibilidad (legacy): `ODOO_URL`, `ODOO_USER`, `ODOO_PASS`.

### Base de datos / Auth

- `DATABASE_URL` (Postgres, legacy)
- `CONTROL_DB_URL` (Control Plane Postgres)
- `TENANT_DB_URL` (solo CLI: migraciones/seed del tenant)
- `MASTER_KEY` (AES-256-GCM, 32 bytes base64 o hex)
- `JWT_SECRET`
- `ADMIN_EMAIL` (seed admin)
- `ADMIN_PASSWORD` (seed admin)
- `ADMIN_NAME` (opcional)
- `ADMIN_ROLE` (opcional, default `admin`)
- `SUPERADMIN_EMAIL` (seed control plane)
- `SUPERADMIN_PASSWORD` (seed control plane)

### App

- `PORT` (default 3000)
- `FRONTEND_ORIGIN` (CORS, ej: `http://localhost:5173`)
- `NODE_ENV` (default `production`)
- `SQLITE_PATH` (si queres persistir sesiones en SQLite)
- `LOCATION_LAT`, `LOCATION_LNG`, `LOCATION_NAME`, `LOCATION_ADDRESS` (ubicacion del bot)
- `CAMPAIGN_BATCH_SIZE` (default 8)
- `CAMPAIGN_INTERVAL_MS` (default 1500)
- `DEBUG_KEY` (legacy)

### Frontend

En `apps/web/.env`:

- `VITE_API_BASE` (ej: `http://localhost:3000`)

## Instalar y correr

En la raiz:

```bash
npm install
npm run dev
```

Solo API:

```bash
npm run dev:api
```

Solo Web:

```bash
npm run dev:web
```

## Prisma

Local:

```bash
npm run prisma:migrate
npm run seed:admin
node scripts/seed-control-superadmin.js
```

Produccion:

```bash
npm run prisma:deploy
npm run seed:admin
node scripts/seed-control-superadmin.js
```

Seed incluye catalogo base (sucursales + servicios).
Se registra Prospect si el paciente no existe en Odoo.

Control plane:

```bash
npm run prisma:control:deploy
```

Provisionar un tenant DB:

```bash
node scripts/provision-tenant-db.js <TENANT_DB_URL>
```

## Multi-tenant (DB por tenant)

- Si se resuelve tenant por `phone_number_id`, se usa su DB propia.
- Si no se resuelve tenant, el webhook se ignora (modo estricto, sin fallback).
- Tokens de canal y DB URLs se guardan cifrados con `MASTER_KEY`.
- Un tenant puede tener multiples lineas: registra varios Channels con el mismo `tenant_id`.
- Las conversaciones se separan por linea: `wa_id + phone_number_id`.

## Webhook

- `GET /webhook` verifica el webhook en Meta (hub.challenge).
- `POST /webhook` procesa mensajes de texto o interactivos, ignora statuses y echo del propio bot.
  - Si `status=pending`, el bot guarda el mensaje pero no responde.
  - Si `status=closed`, el bot responde con: `Conversa cerrada, escriba MENU para reabrir`.

## Endpoints

- `GET /health` => `ok`
- `GET /privacy` => politica de privacidad (HTML)
- `GET /terms` => terminos y condiciones (HTML)
- `GET /data-deletion` => instrucciones de eliminacion de datos (HTML)
- `GET /debug/last-webhook` => ultimo body recibido
- `GET /debug/session/:wa` => sesion por wa_id
- `POST /api/auth/login` => login JWT
- `GET /api/conversations` => inbox
- `GET /api/conversations/:id` => detalle + mensajes
- `POST /api/conversations/:id/messages` => enviar o nota
- `POST /api/conversations/:id/status` => open/pending/closed
- `POST /api/conversations/:id/assign` => asignar al usuario actual
- `POST /api/conversations/:id/tags` => add/remove tags
- `GET /api/dashboard/metrics` => cards + tablas SLA
- `GET /api/admin/users` / `POST /api/admin/users` / `PATCH /api/admin/users/:id`
- `GET /api/admin/settings` / `PATCH /api/admin/settings`
- `GET /api/admin/branches` / `POST /api/admin/branches` / `PATCH /api/admin/branches/:id` / `DELETE /api/admin/branches/:id`
- `GET /api/admin/services` / `POST /api/admin/services` / `PATCH /api/admin/services/:id` / `DELETE /api/admin/services/:id`
- `POST /api/admin/services/:id/branches` => relacion servicio/sucursal
- `GET /api/admin/templates` / `POST /api/admin/templates` / `PATCH /api/admin/templates/:id`
- `POST /api/admin/templates/sync` => sync WhatsApp templates
- `GET /api/admin/campaigns` / `POST /api/admin/campaigns` / `POST /api/admin/campaigns/:id/send`
- `GET /api/admin/campaigns/:id/messages`
- `GET /api/admin/audit`
- `GET /api/superadmin/tenants` / `POST /api/superadmin/tenants` / `PATCH /api/superadmin/tenants/:id`
- `POST /api/superadmin/tenants/:id/database`
- `GET /api/superadmin/channels` / `POST /api/superadmin/channels` / `PATCH /api/superadmin/channels/:id`
- `GET /api/superadmin/branding` / `PATCH /api/superadmin/branding`

## Paginas publicas para Meta

Pega estas URLs en Meta:

- `https://botsito-podopie-production.up.railway.app/privacy`
- `https://botsito-podopie-production.up.railway.app/terms`
- `https://botsito-podopie-production.up.railway.app/data-deletion`

## Flujo del bot

- Siempre muestra menu principal al inicio y cuando escriben `menu`/`inicio`/`volver`.
- Menu principal:
  - Consultar precios/servicios
  - Ubicacion y sucursales
  - Horarios
  - Soy paciente (ver pagos / historial)
  - Hablar con recepcion
- Verificacion por telefono/CI solo se dispara en "Soy paciente".
- Comandos: `menu` vuelve al menu, `salir` borra la sesion.
- Handoff: `asesor`/`recepcion`/`humano` => status `pending` + tag `pendiente_atencion`.
- Admin por WhatsApp (si `ADMIN_PHONE_E164` coincide):
  - `BOT` => status `open` + remove `pendiente_atencion`
  - `CERRAR` => status `closed`

## Railway deploy

1. Crea un proyecto en Railway y conecta este repo.
2. Agrega 2 Postgres: uno para Control Plane y otro para el tenant.
3. Configura `CONTROL_DB_URL` y `TENANT_DB_URL` (este ultimo solo para migrar/seed).
4. Ejecuta `npm run prisma:control:deploy` y `node scripts/provision-tenant-db.js <TENANT_DB_URL>`.
5. Ejecuta `npm run seed:superadmin` y `npm run seed:admin`.
6. Despliega el servicio.
7. Usa esta URL de webhook en Meta:
   - `https://<railway-domain>/webhook`

Nota: tu WABA debe estar en `subscribed_apps` para recibir eventos.

## data.db (legacy)

El archivo `data.db` queda como legado. Solo se usa si defines `SQLITE_PATH` apuntando a ese archivo. Caso contrario, el runtime usa memoria.

## Servidor fisico (pm2 + nginx)

1. `npm install`.
2. Construye el frontend: `npm run build`.
3. Levanta backend con pm2: `pm2 start server.js --name podopie-os`.
4. Configura nginx:
   - Proxy `/api` y `/webhook` a `http://127.0.0.1:3000`.
   - Sirve `apps/web/dist` como sitio estatico.
