# Plan: Reintegrar logout vía launcher de la landing

## Contexto
- La landing añadió `/auth/logout` (AuthLogoutComponent) que ejecuta `AuthService.logoutWithRedirect()` y limpia la cookie antes de devolver el foco al `return` permitido.
- TO³ volvió temporalmente al logout directo contra el Hosted UI porque la ruta no existía; ahora debemos reenganchar el botón al launcher para mantener el flujo coherente con www.
- La documentación (SDK, prompt, wiki, resumen) y `CloudSettings` fueron actualizados para reflejar el fallback directo, por lo que también hay que revertir esas menciones.

## Objetivos
1. Restaurar `logoutLauncherUrl` en `CloudSettings`/`app.config` y asegurar que `AuthIntegrationService.logoutWithRedirect()` priorice el launcher (`https://www.atropello-games.es/auth/logout?return=...`) con fallback al Hosted UI sólo si falla la configuración.
2. Confirmar que `AuthService.logoutWithRedirect()` sigue limpiando estado local antes de redirigir y no requiere cambios.
3. Sincronizar documentación (SDK, prompt, resumen, wiki y plan histórico) para explicar la nueva pantalla `/auth/logout` y el flujo actualizado.
4. Ejecutar `npm run build` después de la fase de código y nuevamente tras la documentación para dejar constancia.

## Fases

### Fase 1 · Código
- [x] Reintroducir `logoutLauncherUrl` en `CloudSettings` (fábrica + defaults) y en `app.config.ts` para permitir overrides.
- [x] Actualizar `AuthIntegrationService.logoutWithRedirect()` para construir `logoutLauncherUrl?return=` cuando esté disponible y caer al Hosted UI `/logout` sólo como respaldo.
- [x] Revalidar `AuthService.logoutWithRedirect()` (sigue limpiando cookie + signals) y confirmar que no necesita cambios adicionales.
- [x] Ejecutar `npm run build` (`npm run build` @ 21:10:57 UTC-3).

### Fase 2 · Documentación
- [x] Actualizar `documentation/cloud-saves-sdk.md`, `documentation/to3-login-prompt.md`, `documentation/Resumen_Proyecto_y_Progreso.md`, `/wiki/cloud-saves` y `documentation/plans/session-cookie-sync.md` para describir el nuevo componente `/auth/logout` y el comportamiento del launcher.
- [x] Documentar en este plan el enlace al HAR inicial y el motivo del cambio (ruta ya implementada). Referencia: `logs/www.atropello-games.es_Archive [25-12-11 20-57-04].har` (mencionado por la landing para demostrar el bug original); el fix se habilita tras desplegar AuthLogoutComponent.
- [x] Ejecutar `npm run build` y cerrar el plan (`npm run build` @ 21:12:05 UTC-3).
