# Plan: Mantener la sesión de TO³ viva mediante refrescos delegados en la landing

## Contexto
- Actualmente TO³ sólo consume la cookie `atropello-session` (ID + Access tokens). Cuando Cognito expira (~60 min) debemos reenviar al jugador al flujo `/auth/launch` aunque esté en medio del juego.
- La landing ya expone `/auth/logout` y controla la sesión con Amplify. El siguiente paso es publicar un endpoint cross-site (p.ej. `/auth/refresh`) que renueve tokens y reescriba la cookie para cualquier subdominio.
- Necesitamos preparar el trabajo en TO³ para invocar dicho endpoint en intervalos seguros, manejar estados de error y documentar el comportamiento.

## Objetivos
1. Diseñar un servicio en TO³ que, mientras la SPA esté activa, invoque periódicamente el endpoint de refresco y rehidrate `AuthService` sin mostrar popups.
2. Garantizar que los timers respeten `document.visibilityState`, eviten ataques CSRF y no saturen el endpoint.
3. Actualizar documentación (SDK, wiki, resumen) y la wiki del sistema para reflejar la renovación automática delegada en la landing.
4. Coordinar con el equipo de la landing los contratos (URL, respuesta, CORS, errores) antes de tocar código.

## Alcance
- Sólo se implementará el cliente en TO³ una vez confirmado que la landing expone el endpoint con CORS para `https://to3.atropello-games.es`.
- No se almacena el refresh token localmente; todo el intercambio sigue ocurriendo en la landing.
- Este plan no cubre la futura “pausa durante login”; se limitará a mantener la sesión viva.

## Fases

### Fase 1 · Contrato y configuración
- [ ] Incorporar el contrato confirmado con la landing:
  - Ruta: `GET /auth/refresh` (con `OPTIONS /auth/refresh` para preflight). Futuro `POST` opcional.
  - CORS headers: `Access-Control-Allow-Origin` con allowlist (`https://to3.atropello-games.es`, `https://www.atropello-games.es` para QA), `Access-Control-Allow-Credentials: true`, `Access-Control-Allow-Headers: Content-Type, X-CSRF-Token`, `Access-Control-Allow-Methods: GET, OPTIONS`.
  - CSRF: validar `Origin` contra la allowlist y loggear `X-CSRF-Token` (rechazar vacío si así se define).
  - Respuestas: `200 { status: 'refreshed', expiresAt }`, `204 No Content`, `401/440` sin sesión, `429` con `Retry-After`.
  - Logging/Métricas: registrar `origin`, estado devuelto y errores (`LogCategory.SECURITY/CONFIGURATION`) y dejar hooks para contadores.
- [ ] Definir variables de entorno/CloudSettings: `sessionRefreshUrl`, intervalo por defecto (p.ej. 10 min) y timeout máximo.
- [ ] Documentar los requisitos de CORS/CSRF y el contrato HTTP completo en `/documentation/landing-requests/`.

### Fase 2 · Implementación en TO³
- [ ] Crear `SessionRefreshService` (standalone, providedIn root) que:
  - Escuche `visibilitychange` y `pagehide` para pausar/reanudar timers.
  - Programe `setInterval` (configurable) sólo cuando `auth.authenticated()` sea verdadero.
  - Ejecute `fetch(sessionRefreshUrl, { method: 'POST' o 'GET', credentials: 'include', headers: { 'X-CSRF': ... } })`.
  - Al recibir 200/204, vuelva a leer la cookie vía `SessionCookieService.read()` y sincronice `AuthService` si cambió `expiresAt`.
  - Ante 401/440, limpie la sesión local y emita un estado para mostrar CTA de login.
  - Registre métricas/logs en `LoggingService` para depuración (éxito, expiración, errores de red).
- [ ] Integrar el servicio en `app.config.ts` (APP_INITIALIZER o construcción lazy) para que se active al boot de la SPA.
- [ ] Añadir pruebas unitarias básicas (p.ej. con fake timers) para validar pausado/reanudación.

### Fase 3 · Documentación y QA
- [ ] Actualizar `documentation/cloud-saves-sdk.md`, `documentation/to3-login-prompt.md`, `documentation/Wiki_System.md`, `/wiki/cloud-saves` y `Resumen_Proyecto_y_Progreso.md` con el flujo de refresh.
- [ ] Añadir FAQ en el wiki explicando el intervalo y cómo detectar expiraciones.
- [ ] Ejecutar `npm run build` y registrar el resultado.
- [ ] Preparar checklist manual: abrir TO³ + landing, dejar el juego activo >60 min, verificar que el token no expira mientras el endpoint devuelve 200; forzar 401 para chequear que se muestra el CTA de relogin.
