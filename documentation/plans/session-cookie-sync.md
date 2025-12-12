# Plan: Restaurar sesión compartida vía cookie

## Contexto
- El equipo de la landing retiró el handshake `session:payload`; el popup ahora sólo sirve para callbacks tradicionales.
- TO³ debe volver a depender del flujo `AuthService.loginWithRedirect()` + cookie `atropello-session` compartida para hidratar la sesión.
- La documentación pública (cloud-saves + prompts) debe dejar claro que el handshake ya no está disponible y que la firma HMAC de la cookie es opcional.

## Objetivos
1. Eliminar por completo `SessionHandshakeService` y cualquier configuración asociada.
2. Reinstaurar `AuthService.loginWithRedirect()` como simple wrapper del redirect clásico.
3. Actualizar documentación (cloud-saves, wiki, resumen y nuevo prompt) para describir el flujo basado en cookie.
4. Mantener build verde y documentar pruebas manuales pendientes (`npm run test:e2e` cuando haya credenciales).

## Fases

### Fase 1 · Código
- [x] Quitar `SessionHandshakeService` y referencias (providers, settings, imports).
- [x] Simplificar `AuthService` para usar únicamente `AuthIntegrationService.loginWithRedirect()` / `logoutWithRedirect()`.

### Fase 2 · Configuración
- [x] Limpiar `CloudSettings` (campos de handshake) y cualquier consumidor indirecto.

### Fase 3 · Documentación
- [x] Actualizar `documentation/cloud-saves-sdk.md` con nota explícita “handshake retirado” y aclarar que la firma HMAC es opcional.
- [x] Escribir `documentation/to3-login-prompt.md` con pasos para `loginWithRedirect`, `logoutWithRedirect` y la lectura de la cookie.
- [x] Sincronizar `documentation/Resumen_Proyecto_y_Progreso.md`, `documentation/Wiki_System.md` y `/wiki/cloud-saves` con el nuevo flujo.
- [x] Marcar el antiguo plan de handshake como “cancelado”.

### Fase 4 · QA
- [x] Ejecutar `npm run build`.
- [ ] Registrar que falta correr `npm run test:e2e` (Playwright) una vez que tengamos credenciales.

> Seguimiento manual: pruebas en producción (`/auth/launch?return=...`) serán hechas por el usuario tras sincronizar.

### Fase 5 · Compatibilidad cookie firmada
- [x] Ajustar `SessionCookieService` para aceptar el formato `payload.signature` de la cookie y mapear `profile → identity`.
- [x] Actualizar la wiki (`/wiki/cloud-saves`) y `documentation/Resumen_Proyecto_y_Progreso.md` con la nueva compatibilidad.
- [x] Verificar el flujo completo en local (`npm run build`) y dejar registro del resultado antes de solicitar QA en producción.

### Fase 6 · Endurecer login/logout
- [x] Normalizar `authLauncherUrl` para que siempre apunte a `/auth/launch` incluso si la configuración sólo provee el dominio base.
- [x] Mantener `logoutWithRedirect()` apuntando directamente al Hosted UI `/logout` de Cognito con `logout_uri` saneado.
- [x] Sincronizar documentación (prompt, wiki y resumen) con la aclaración de que ambos botones dependen de `AuthService` local.
- [x] Validar con `npm run build`.

### Fase 7 · Allowlist de logout
- [x] Ajustar `defaultLogoutUri` y la lista de destinos permitidos para reflejar lo que Cognito acepta (`https://www.atropello-games.es/`).
- [x] Modificar `AuthIntegrationService.logoutWithRedirect()` para que únicamente utilice URLs incluidas en el allowlist de logout.
- [x] Actualizar la documentación (prompt, wiki, resumen y SDK) explicando que tras el logout siempre se vuelve a la landing.
- [x] Ejecutar `npm run build`.

### Fase 8 · Delegar logout en la landing *(revertido 11-dic-2025)*
- [x] Reintroducir `logoutLauncherUrl` normalizado a `/auth/logout` dentro de `CloudSettings` y de la configuración DI. *(Revertido: ver plan `logout-hosted-ui.md`)*
- [x] Actualizar `AuthIntegrationService.logoutWithRedirect()` para redirigir primero a la landing (`logoutLauncherUrl?return=...`) y dejar que ella contacte con Cognito, manteniendo el fallback directo sólo por seguridad. *(Revertido: `AuthIntegrationService` vuelve a usar el Hosted UI directo porque `/auth/logout` no existe en la landing.)*
- [x] Sincronizar documentación (prompt, wiki, resumen, SDK) para reflejar que el logout ahora viaja por la landing y puede quedarse allí. *(Documentación actualizada de nuevo al flujo directo el 11-dic-2025.)*
- [x] Ejecutar `npm run build`.

> **Nota 11-dic-2025 (noche)**: La landing ya publica `/auth/logout` (AuthLogoutComponent). El plan [`logout-launcher-return.md`](logout-launcher-return.md) documenta la reinstalación del launcher y la sincronización final de la documentación. Actualmente TO³ vuelve a apuntar al launcher con fallback al Hosted UI sólo si la URL no está disponible.
