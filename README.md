# Podopie OS - WhatsApp Cloud API + Odoo + Inbox

Podopie OS incluye el webhook de WhatsApp Cloud API integrado a Odoo y una bandeja web multiusuario con conversaciones, tags y handoff bot/humano.

## Requisitos

- Node.js 18+
- Postgres (local o Railway)
- Cuenta y app en Meta WhatsApp Cloud API
- Instancia Odoo accesible (por ejemplo via ngrok)

## Variables de entorno

### WhatsApp Cloud API

- `WHATSAPP_TOKEN`
- `PHONE_NUMBER_ID`
- `VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET` (opcional, valida firma webhook)
- `ADMIN_PHONE_E164` (opcional, comandos BOT/CERRAR por WhatsApp)

### Odoo JSON-RPC

- `ODOO_URL` (ej: `https://podopie.ngrok.io`)
- `ODOO_DB`
- `ODOO_USER`
- `ODOO_PASS`

### Base de datos / Auth

- `DATABASE_URL` (Postgres)
- `JWT_SECRET`
- `ADMIN_EMAIL` (seed admin)
- `ADMIN_PASSWORD` (seed admin)
- `ADMIN_NAME` (opcional)
- `ADMIN_ROLE` (opcional, default `admin`)

### Frontend

- `FRONTEND_ORIGIN` (ej: `http://localhost:5173`)
- `VITE_API_BASE` (en `web/.env`, ej: `http://localhost:3000`)

### Opcional

- `PORT` (por defecto 3000)
- `NODE_ENV` (por defecto `production`)
- `SQLITE_PATH` (si queres persistir sesiones en SQLite)
- `LOCATION_LAT`, `LOCATION_LNG`, `LOCATION_NAME`, `LOCATION_ADDRESS` (para enviar ubicacion)

## Instalar y correr

Backend:

```bash
npm install
npm run dev
```

Frontend (Vite):

```bash
cd web
npm install
npm run dev
```

## Webhook

- `GET /webhook` verifica el webhook en Meta (hub.challenge).
- `POST /webhook` procesa mensajes de texto o interactivos, ignora statuses y echo del propio bot.
  - Si `status=pending`, el bot guarda el mensaje pero no responde.
  - Si `status=closed`, el bot responde con: `Conversa cerrada, escriba MENU para reabrir`.

## Endpoints

- `GET /health` => `ok`
- `GET /debug/last-webhook` => ultimo body recibido
- `GET /debug/session/:wa` => sesion por wa_id
- `POST /api/auth/login` => login JWT
- `GET /api/conversations` => inbox
- `GET /api/conversations/:id` => detalle + mensajes
- `POST /api/conversations/:id/messages` => enviar o nota
- `POST /api/conversations/:id/status` => open/pending/closed
- `POST /api/conversations/:id/assign` => asignar al usuario actual
- `POST /api/conversations/:id/tags` => add/remove tags

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
- Handoff: `asesor`/`recepcion`/`humano` => status `pending` + tag `pendiente_atencion`.
- Admin por WhatsApp (si `ADMIN_PHONE_E164` coincide):
  - `BOT` => status `open` + remove `pendiente_atencion`
  - `CERRAR` => status `closed`

## Prisma

```bash
npx prisma migrate dev --name init
npm run seed:admin
```

Para prod:

```bash
npx prisma migrate deploy
npm run seed:admin
```

## Railway deploy

1. Crea un proyecto en Railway y conecta este repo.
2. Agrega un servicio Postgres y copia `DATABASE_URL`.
3. Configura las variables de entorno listadas arriba.
4. Ejecuta `npx prisma migrate deploy` y `npm run seed:admin`.
5. Despliega el servicio.
6. Usa esta URL de webhook en Meta:
   - `https://<railway-domain>/webhook`

Nota: tu WABA debe estar en `subscribed_apps` para recibir eventos.

## Servidor fisico (pm2 + nginx)

1. `npm install` (backend) y `cd web && npm install` (frontend).
2. Construye el frontend: `cd web && npm run build`.
3. Levanta backend con pm2: `pm2 start server.js --name podopie-os`.
4. Configura nginx:
   - Proxy `/api` y `/webhook` a `http://127.0.0.1:3000`.
   - Sirve `web/dist` como sitio estatico.
