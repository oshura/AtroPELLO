# Solicitud para el equipo de la landing — Endpoint `/auth/refresh`

Hola equipo 👋

Necesitamos habilitar la renovación silenciosa de tokens para TO³ (y otros subdominios) sin sacar al jugador del juego. Resumen de lo que requerimos de vuestra parte:

1. **Endpoint**
   - Ruta sugerida: `GET /auth/refresh` (abierto sólo a `*.atropello-games.es`).
   - Debe ejecutarse desde Angular/SSR sin depender de estado UI (puede vivir junto a `AuthLogoutComponent`).
   - Requiere `credentials: include`; por tanto, la cookie `atropello-session` debe mantener `SameSite=None; Secure`.

2. **Lógica interna**
   - Leer el `return` opcional o la URL de origen sólo para logging; no necesita redirecciones.
   - Usar el mismo `AuthService` que ya tienen para invocar `fetchAuthSession()` / `Auth.currentSession()` y forzar una renovación mediante el refresh token que Amplify guarda en `sessionStorage`.
   - Tras obtener tokens nuevos, reescribir la cookie compartida (`SessionCookieService.writeTokens(...)`) con el mismo formato `payload.signature`.

3. **Respuesta HTTP**
   - `200 OK`: tokens renovados y cookie reescrita. Cuerpo JSON sugerido `{ "status": "refreshed", "expiresAt": 1701234567890 }` (opcional).
   - `204 No Content`: la sesión ya estaba fresca; no se modificó la cookie.
   - `401 Unauthorized` / `440 Login Timeout`: no existe sesión o el refresh token falló. TO³ usará esto para limpiar estado y mostrar “Iniciar sesión”.
   - `429 Too Many Requests`: si necesitáis rate limiting, devolvedlo con `Retry-After`.

4. **CORS / CSRF**
   - `Access-Control-Allow-Origin: https://to3.atropello-games.es` (y otros subdominios que necesiten la feature).
   - `Access-Control-Allow-Credentials: true`.
   - Permitid `GET` (o `POST` si preferís) y cabeceras `Content-Type`, `X-CSRF-Token`. Nosotros enviaremos un token CSRF derivado del `return` o de un valor compartido; avisad si ya tenéis header estándar.

5. **Observabilidad**
   - Logs básicos: origen, estado devuelto, motivo de error.
   - Métricas de éxito/fracaso para saber si el endpoint se está usando desde TO³.

Con esto implementado, nuestra SPA podrá lanzar un `fetch('https://www.atropello-games.es/auth/refresh', { credentials: 'include' })` cada ~10 minutos cuando la pestaña esté activa, y simplemente volver a leer la cookie si la respuesta es 200/204.

Gracias 🙌 Si necesitáis más detalles o un contrato OpenAPI, avisad y lo preparamos.
