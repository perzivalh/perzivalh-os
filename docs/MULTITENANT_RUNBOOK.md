# Multi-tenant Runbook (modo estricto, DB por tenant)

Esta guia explica, paso a paso, como dejar el sistema listo para operar en modo multi-tenant sin fallback. Si no se resuelve un tenant, el webhook se ignora.

## 1) Conceptos clave

- **Control Plane DB**: base central donde el SuperAdmin registra tenants, canales y branding.
- **Tenant DB**: una base por cliente. Aqui viven chats, mensajes, usuarios y settings.
- **Resolver**: el sistema identifica el tenant por `phone_number_id` (WhatsApp Cloud).
- **Modo estricto**: si el `phone_number_id` no esta registrado, no se procesa el mensaje.

## 2) Variables de entorno en Railway (API)

Obligatorias en runtime:

- `CONTROL_DB_URL` = Postgres del Control Plane.
- `MASTER_KEY` = llave AES-256-GCM (32 bytes base64).
- `JWT_SECRET`
- `VERIFY_TOKEN` = token global para verificar webhook (Meta).
- `FRONTEND_ORIGIN` = URL de la web (Vercel).

Recomendadas/globales:

- `WHATSAPP_APP_SECRET` = para validar firma del webhook (opcional).
- `WHATSAPP_BUSINESS_ACCOUNT_ID` = WABA para sincronizar templates.
- `WHATSAPP_TOKEN` = token global solo para sincronizar templates.
- `PHONE_NUMBER_ID` = opcional, solo para sincronizar templates.
- `ADMIN_PHONE_E164` = telefono admin para comandos bot (BOT/CERRAR).
- `ODOO_BASE_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD` (o legacy `ODOO_URL`, `ODOO_USER`, `ODOO_PASS`).
- `DEBUG_KEY`, `PORT`, `NODE_ENV`, `CAMPAIGN_BATCH_SIZE`, `CAMPAIGN_INTERVAL_MS`.

Solo para CLI (no es necesario en runtime):

- `TENANT_DB_URL` = se usa para migraciones y seed de una DB tenant.

Nota: `VERIFY_TOKEN` es global. Hoy no hay verify token por tenant.

## 3) Variables en Vercel (web)

- `VITE_API_BASE` = URL publica de la API en Railway.

## 4) Crear bases de datos

### A) Control Plane (una sola base)

1. Crea un Postgres en Railway.
2. Copia su `DATABASE_URL` y guardala como `CONTROL_DB_URL`.
3. Ejecuta migraciones:

```bash
npm run prisma:control:deploy
```

### B) Tenant DB (una base por cliente)

Para cada cliente:

1. Crea un Postgres (Railway o externo).
2. Usa su URL como `TENANT_DB_URL` solo para migrar y seed.
3. Corre migraciones:

```bash
node scripts/provision-tenant-db.js <TENANT_DB_URL>
```

4. Crea el admin inicial del tenant:

```bash
TENANT_DB_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed:admin
```

## 5) Crear SuperAdmin

Configura en tu entorno:

- `CONTROL_DB_URL`
- `SUPERADMIN_EMAIL`
- `SUPERADMIN_PASSWORD`

Luego ejecuta:

```bash
npm run seed:superadmin
```

## 6) Panel SuperAdmin (crear tenants)

1. Inicia sesion con el SuperAdmin.
2. Crea un tenant (name + slug).
3. Configura la DB del tenant (pega su URL en el panel).
4. Crea el Channel:
   - `phone_number_id`
   - `verify_token` (usa el mismo que `VERIFY_TOKEN`)
   - `wa_token` (token que tenga acceso a ese numero)
5. Branding basico (nombre/logo).

Sin Channel registrado, el webhook se ignora.

Si el tenant tiene multiples lineas, crea multiples Channels con el mismo tenant.

## 7) Meta Developers (por cliente)

Hay dos opciones:

- **Opcion A**: Un solo Meta App/WABA con varios numeros.
- **Opcion B**: Un Meta App/WABA por cliente.

En ambos casos, por cada numero debes:

1. Agregar el producto **WhatsApp**.
2. Configurar el webhook:
   - Callback URL: `https://TU-API-RAILWAY/webhook`
   - Verify Token: el mismo `VERIFY_TOKEN` global.
3. Suscribirte a `messages` y `message_template_status_update`.
4. Obtener el `phone_number_id` del numero.
5. Generar un token con acceso a ese numero (System User).
6. Cargar ese `phone_number_id` y token en el Channel del tenant.

Limitacion actual:
- El verify token es global.
- La sincronizacion de templates usa `WHATSAPP_TOKEN` y `WHATSAPP_BUSINESS_ACCOUNT_ID` globales.

## 8) Vercel (web)

Recomendado:

1. Root Directory: `apps/web`
2. Build Command: `npm run build`
3. Output: `dist`
4. Env: `VITE_API_BASE=https://TU-API-RAILWAY`

## 9) Flujo del webhook (simple)

1. Llega webhook a `/webhook`.
2. Se lee `phone_number_id`.
3. Se busca el tenant en Control Plane (Channel).
4. Si existe, se usa su DB y token.
5. Si no existe, el mensaje se ignora.

Para multiples lineas, cada conversacion queda ligada a su `phone_number_id` y los mensajes salientes salen por esa linea. Si el mismo usuario escribe a dos lineas, veras dos conversaciones separadas.

## 10) Checklist rapido

- [ ] `CONTROL_DB_URL` y `MASTER_KEY` en Railway.
- [ ] Migraciones del Control Plane aplicadas.
- [ ] SuperAdmin creado.
- [ ] DB tenant creada y migrada.
- [ ] Admin del tenant creado.
- [ ] Tenant + Channel registrados en el panel.
- [ ] Webhook verificado en Meta.
- [ ] Vercel apunta a la API.

## 11) Errores comunes

- **Webhook llega pero no responde**: falta Channel con `phone_number_id`.
- **Login falla**: usuario no existe en Control Plane o tenant.
- **Mensajes salientes fallan**: `wa_token` no tiene acceso al numero.
