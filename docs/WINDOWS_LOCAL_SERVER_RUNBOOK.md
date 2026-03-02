# Windows Local Server Runbook

Esta guia deja este proyecto corriendo en una PC con Windows 10 Pro usando:

- Postgres local (control plane + tenant DBs)
- Redis local
- PM2
- Cloudflare Tunnel
- GitHub Actions con runner self-hosted en Windows

## 1) Preparar el servidor

- Instala Node.js 18 o superior.
- Instala PostgreSQL y deja disponible pgAdmin.
- Instala Git.
- Instala PM2 globalmente:

```powershell
npm install -g pm2
```

- Instala Cloudflared en Windows y autentica el tunnel.
- Para Redis en Windows, lo mas estable es correrlo en Docker Desktop o en WSL2. Si ya usas otro servicio Redis en esa PC, solo apunta `REDIS_URL` a ese host.

## 2) Clonar el repo

En el servidor, deja el proyecto en una carpeta fija. Ejemplo:

```powershell
cd C:\
git clone <TU-REPO> C:\deploy\perzivalh
cd C:\deploy\perzivalh
```

Esa misma ruta es la que debes cargar luego en la variable `WINDOWS_DEPLOY_PATH` del repo en GitHub si vas a usar el workflow incluido.

## 3) Crear bases en pgAdmin

Abre pgAdmin y ejecuta esto en la base `postgres`:

```sql
CREATE DATABASE perzivalh_control;
CREATE DATABASE perzivalh_tenant_default;
```

Si vas a manejar mas empresas, crea una base tenant por cada una:

```sql
CREATE DATABASE perzivalh_tenant_acme;
CREATE DATABASE perzivalh_tenant_demo;
```

## 4) Configurar variables de entorno

1. Copia `.env.example` a `.env`.
2. Ajusta al menos estas variables:

```dotenv
CONTROL_DB_URL=postgresql://postgres:TU_PASSWORD@localhost:5432/perzivalh_control?schema=public
TENANT_DB_URL=postgresql://postgres:TU_PASSWORD@localhost:5432/perzivalh_tenant_default?schema=public
REDIS_URL=redis://localhost:6379
MASTER_KEY=TU_LLAVE_32_BYTES_BASE64_O_HEX
JWT_SECRET=TU_JWT_SECRET
VERIFY_TOKEN=TU_VERIFY_TOKEN
FRONTEND_ORIGIN=https://app.tudominio.com
SUPERADMIN_EMAIL=superadmin@tudominio.com
SUPERADMIN_PASSWORD=CAMBIA_ESTE_PASSWORD
ADMIN_EMAIL=admin@tudominio.com
ADMIN_PASSWORD=CAMBIA_ESTE_PASSWORD
PORT=3000
NODE_ENV=production
```

Notas:

- `CONTROL_DB_URL` es la base central.
- `TENANT_DB_URL` se usa para migrar/seed del primer tenant.
- Las demas bases tenant se crean igual, pero se aprovisionan una por una y luego se registran desde SuperAdmin.
- Si vas a servir frontend y backend desde el mismo dominio, no necesitas fijar `VITE_API_BASE`; la web ahora usa el mismo origen por defecto.

## 5) Levantar Redis local

Si usas Docker Desktop:

```powershell
docker run -d --name perzivalh-redis --restart unless-stopped -p 6379:6379 redis:7-alpine
```

Verificacion rapida:

```powershell
docker exec perzivalh-redis redis-cli ping
```

Debes recibir `PONG`.

## 6) Migrar y sembrar datos

Primera instalacion manual:

```powershell
npm install
npm run build
npm run provision:control
npm run provision:tenant
npm run seed:superadmin
npm run seed:admin
```

Los scripts `provision:*` no crean la base por ti. Si detectan `localhost`, te muestran el SQL exacto para crearla en pgAdmin y luego aplican las migraciones.

Para cualquier tenant nuevo:

```powershell
node .\scripts\provision-tenant-db.js "postgresql://postgres:TU_PASSWORD@localhost:5432/perzivalh_tenant_acme?schema=public"
```

Luego registras esa URL desde el panel SuperAdmin en `Tenants`.

## 7) Correr con PM2

Este repo ya incluye `ecosystem.config.js`.

```powershell
pm2 start ecosystem.config.js
pm2 save
```

La aplicacion corre en `http://localhost:3000`.
En produccion, el backend sirve tambien `apps/web/dist`, asi que un solo proceso cubre API + frontend + Socket.IO.

## 8) Publicar con Cloudflare Tunnel

Ejemplo de `C:\Users\Administrator\.cloudflared\config.yml`:

```yaml
tunnel: TU_TUNNEL_ID
credentials-file: C:\Users\Administrator\.cloudflared\TU_TUNNEL_ID.json

ingress:
  - hostname: app.tudominio.com
    service: http://localhost:3000
  - service: http_status:404
```

Luego:

```powershell
cloudflared tunnel run TU_TUNNEL_NOMBRE
```

Cuando ya confirmes que responde bien, dejalo persistente como servicio:

```powershell
cloudflared service install
```

Si ya tienes un tunnel creado para otro proyecto, solo agrega este hostname apuntando a `http://localhost:3000`.

## 9) Auto deploy con GitHub runner

Este repo incluye `.github/workflows/deploy-self-hosted-windows.yml`.

Para usarlo:

1. Instala el runner self-hosted de GitHub en el mismo servidor Windows.
2. Registra el runner como servicio.
3. En GitHub, crea la variable del repositorio `WINDOWS_DEPLOY_PATH` con la ruta real del clon, por ejemplo `C:\deploy\perzivalh`.
4. Asegura que el repo en esa ruta este limpio y en la rama correcta.

Desde ese momento, cada `push` a `main` o `master` ejecuta:

- `git pull --ff-only`
- `powershell -ExecutionPolicy Bypass -File .\scripts\deploy-windows.ps1 -SkipPull`

## 10) Deploy manual o desde workflow

Deploy manual completo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-windows.ps1
```

Deploy manual sin volver a hacer `git pull`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-windows.ps1 -SkipPull
```

Ese script hace:

- carga `.env`
- instala dependencias
- compila frontend
- aplica migraciones del control plane
- aplica migraciones del tenant inicial si `TENANT_DB_URL` existe
- ejecuta seeds idempotentes
- recarga PM2

## 11) Checklist final

- `pm2 list` muestra `perzivalh-os` online
- `http://localhost:3000/health` responde `ok`
- `http://localhost:3000` carga el inbox
- Redis responde `PONG`
- Cloudflare Tunnel expone el dominio correcto
- El webhook de Meta apunta a `https://app.tudominio.com/webhook`
