# Plan: Restablecer logout directo con Hosted UI

## Contexto
- El botón "Cerrar sesión" actualmente redirige a `https://www.atropello-games.es/auth/logout?return=...`, pero la landing no tiene ruta ni componente en `/auth/logout`.
- CloudFront sirve `index.html`, pero no se ejecuta ninguna lógica que contacte con Cognito, por lo que la cookie compartida se vuelve a escribir y el usuario sigue autenticado.
- La landing confirmó que su propio `AuthService.logoutWithRedirect()` llama a Cognito Hosted UI `/logout` después de limpiar la cookie local. TO³ debe replicar ese flujo directamente hasta que exista un launcher dedicado.

## Objetivos
1. Actualizar `AuthIntegrationService` para apuntar nuevamente al endpoint `/logout` del Hosted UI, garantizando que Cognito cierre la sesión.
2. Eliminar la dependencia de `logoutLauncherUrl` en settings y limpiar los artefactos asociados para evitar documentación engañosa.
3. Sincronizar documentación (SDK, prompt, resumen, wiki) con el comportamiento real y registrar el incidente detectado vía HAR.
4. Mantener compilación verde tras cada fase.

## Fases

### Fase 1 · Código
- [x] Simplificar `AuthIntegrationService.logoutWithRedirect()` para que llame exclusivamente al Hosted UI `/logout` con `logout_uri` validado.
- [x] Limpiar `CloudSettings`/`app.config` quitando `logoutLauncherUrl` y cualquier uso asociado.
- [x] Verificar que `AuthService.logoutWithRedirect()` sigue limpiando cookie + estado y documentar el cambio en comentarios si aplica.
- [x] Ejecutar `npm run build` para validar la fase (`npm run build` @ 11-dic-2025 20:10 UTC-3, exitoso).

### Fase 2 · Documentación y Wiki
- [x] Actualizar `documentation/cloud-saves-sdk.md`, `documentation/to3-login-prompt.md`, `documentation/Resumen_Proyecto_y_Progreso.md` y la página `/wiki/cloud-saves` con el nuevo flujo de logout.
- [x] Registrar en `documentation/plans/session-cookie-sync.md` (o resumen correspondiente) que el launcher de logout quedó descartado y se vuelve al Hosted UI directo.
- [x] Ejecutar `npm run build` para validar la fase (aunque sólo haya cambios de documentación) y cerrar el plan (`npm run build` @ 11-dic-2025 20:11 UTC-3, exitoso).
