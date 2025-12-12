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
- [ ] Validar con la landing el endpoint (`/auth/refresh` o equivalente), métodos permitidos, cabeceras de autorización y códigos de estado (200 = cookie renovada, 204 = no-op, 401 = sesión inválida, etc.).
- [ ] Definir variables de entorno/CloudSettings: `sessionRefreshUrl`, intervalo por defecto (p.ej. 10 min) y timeout máximo.
- [ ] Documentar requisitos de CORS (Allow-Origin `https://to3.atropello-games.es`, `credentials: include`, anti-CSRF header). Guardar el acuerdo en `/documentation/landing-requests/`.

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
