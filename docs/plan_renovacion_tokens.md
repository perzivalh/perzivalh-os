# Plan de Renovación Automática de Tokens de WhatsApp

## Contexto
Los tokens de acceso de usuario obtenidos mediante Embedded Signup tienen una validez de **60 días**. Si caducan, la integración deja de funcionar (el backend no podrá enviar mensajes ni gestionar la cuenta). Para evitar interrupciones, se debe implementar un sistema de renovación automática.

## Estrategia

### 1. Endpoint de Intercambio de Token (Backend)
Meta proporciona un endpoint para canjear un token válido por otro nuevo (extendiendo su vida).

**Endpoint de Meta:**
`GET /oauth/access_token`
Params:
- `grant_type`: `fb_exchange_token`
- `client_id`: App ID
- `client_secret`: App Secret
- `fb_exchange_token`: El token actual (que aún no ha expirado)

**Acción Requerida:**
Agregar una función en `metaClient.js`:
```javascript
async refreshUserToken(currentToken) {
    // Call Meta API to exchange token
}
```

### 2. Job Recurrente (Cron)
Implementar un "Worker" o "Cron Job" que corra cada 24 horas.

**Lógica del Job:**
1. Buscar en la base de datos (`Channel`) todos los canales de tipo `whatsapp` donde `wa_token` no sea nulo.
2. Para cada canal:
   - Verificar la fecha de creación/actualización del token (o decodificarlo para ver `exp`). *Nota: Meta no siempre da `exp` claro en el token string, mejor llevar control de fecha en DB.*
   - Si el token tiene > 45 días de antigüedad (o faltan < 15 días para expirar):
     - Ejecutar `metaClient.refreshUserToken(token_actual)`.
     - Si es exitoso:
       - Actualizar `wa_token_encrypted` en la DB.
       - Actualizar timestamp de renovación.
       - Log de auditoría: "Token refreshed automatically".
     - Si falla:
       - Marcar canal con estado de "Alerta" (warning).
       - Enviar notificación al Superadmin (Email/Slack/Dashboard) para renovación manual.

### 3. Modificaciones en Base de Datos
Se recomienda agregar campos a la tabla `Channel` para facilitar el control:
- `token_expires_at`: DateTime (Calculado al momento del canje: `now() + 60 days`).
- `last_token_refresh_at`: DateTime.

### 4. Interfaz de Usuario
- En `WhatsAppLinesSection.jsx`, mostrar una alerta si el token está próximo a vencer.
- El botón "Conectar WhatsApp" ya sirve para "Renovar manualmente" (simplemente se vuelve a hacer el flujo y se actualiza el token).

## Pasos para Implementar
1.  [Backend] Actualizar `schema.prisma` agregando `token_expires_at` a `Channel`.
2.  [Backend] Crear script `scripts/refresh_tokens.js` o servicio `services/tokenRefresher.js`.
3.  [Infra] Configurar Cron (ej: GitHub Actions, Railway Cron, o `node-cron` dentro de la app) para ejecutar el script diariamente.
