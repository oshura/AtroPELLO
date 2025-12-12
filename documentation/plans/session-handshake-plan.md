# Plan: Reemplazar bridge iframe por handshake Landing → TO³

> ⚠️ **Estado**: Cancelado. La landing retiró el handshake `session:payload` el 11-Dic-2025; ver `plans/session-cookie-sync.md` para el plan vigente basado en la cookie `atropello-session`.

## Contexto
- Los navegadores han endurecido el acceso a cookies de terceros; Firefox 146 bloquea `atropello-session` al cargar `bridge.html` dentro de TO³. Ver análisis en [logs/to3.atropello-games.es_Archive [25-12-11 14-51-17].har](../logs/to3.atropello-games.es_Archive%20%5B25-12-11%2014-51-17%5D.har).
- `Resumen_Proyecto_y_Progreso.md` describe el flujo vigente: la landing escribe la cookie y TO³ la consume vía iframe + `SessionBridgeService`.
- Objetivo: eliminar la dependencia de cookies cross-site haciendo que la landing envíe el token directamente a TO³ tras login (mid-term recommendation).

## Objetivos
1. TO³ debe recibir `{token, profile, expiresAt}` sin leer cookies de terceros.
2. Mantener la delegación del login en `https://www.atropello-games.es/auth/launch`.
3. Evitar fugas de tokens en URL y validar orígenes en ambos sentidos.
4. Conservar documentación/wikis alineadas (ver `documentation/Wiki_System.md`).

## Riesgos y decisiones abiertas
- Cómo identificar al consumidor (tab de TO³) cuando se abren varias ventanas.
- Elección del canal: `postMessage` con `window.opener` vs `BroadcastChannel`.
- Necesidad de `Storage Access API` como fallback si el navegador bloquea `window.opener` (Safari).
- Impacto en usuarios que abren TO³ directamente sin pasar por la landing; debemos mantener opción de login manual.

## Fases del trabajo

### Fase 1 · Diseño del protocolo (ingeniería compartida)
- [ ] Definir handshake `session-handshake` con los siguientes elementos:
  - `handshakeId` aleatorio generado por TO³ al lanzar la landing.
  - Lista de orígenes permitidos (`https://www.atropello-games.es`, `https://to3.atropello-games.es`).
  - Mensajes: `handshake:init`, `handshake:ready`, `session:payload`, `session:ack`.
- [ ] Documentar en `cloud-saves-sdk.md` y nueva sección breve en `Wiki`.
- [ ] Decidir canal primario (`postMessage` via `window.open`) y fallback (`BroadcastChannel`).

### Fase 2 · Cambios en TO³ (este repo)
- [x] Crear `SessionHandshakeService` que:
  - Genere `handshakeId`, abra la landing (`window.open`) con parámetros `handshakeId` y `returnTo`.
  - Escuche `message` del `window` global, filtre por `origin` y `handshakeId`.
  - Convierta el payload en `PersistedAuthSession` y llame a `AuthService.syncExternalSession()`.
  - Emita `session:ack` para que la landing pueda cerrar la ventana.
  - **Estado**: implementado en `src/app/services/session-handshake.service.ts` con validaciones de origin, timeout configurable y `session:ack`.
- [x] Actualizar `HeaderComponent` / `AuthService.loginWithRedirect()` para usar el nuevo flujo cuando el navegador bloquea la cookie bridge (detectar mediante `SessionBridgeService` fallback flag).
  - **Decisión**: el handshake se intentará siempre como flujo primario; si el popup falla o expira se cae al redirect clásico (`AuthIntegrationService.login`).
- [x] Mantener compatibilidad con el iframe actual como fallback temporal (flag en `CloudSettings`).
  - **Estado**: compat desactivada; decidimos retirar el flag y apostar todo al handshake luego de validar QA en Firefox/Chrome.
- [x] Ajustar `SessionBridgeService` para dejar de montar iframe si `handshake` está habilitado.
  - **Estado**: servicio eliminado y `app.config.ts` ya no lo registra; el popup es el único camino soportado.

### Fase 3 · Cambios en la landing (otro repo)
*(Solicitar a equipo landing via prompt indicado más abajo)*
- [ ] Tras recibir el callback de Cognito y tener la cookie/tokens, verificar si se abrió con `window.opener` y `handshakeId`.
- [ ] Si existe, enviar `handshake:ready`, luego `session:payload` con `{handshakeId, token, accessToken, profile, issuedAt, expiresAt}` usando `postMessage` al `opener`.
- [ ] Esperar `session:ack` para cerrar la ventana y limpiar `handshakeId`.
- [ ] Si no hay `opener`, comportarse como hasta ahora (mostrar “Entrar a TO³”).
- [ ] Loggear eventos y errores para facilitar QA.

### Fase 4 · Seguridad y resiliencia
- [ ] Introducir `handshakeNonce` y timestamp para expirar mensajes (>60s).
- [ ] Validar estructura del payload antes de hidratar sesión.
- [ ] Evitar que TO³ procese múltiples payloads (usar `handshakeId` y `once`).
- [ ] Añadir telemetry/logging para debug.

### Fase 5 · QA, documentación y decomm del iframe
- [ ] Actualizar `documentation/Wiki_System.md` y página `/wiki/cloud-saves` con el nuevo flujo.
- [ ] Ejecutar pruebas en: Firefox (ETP), Chrome (3PC restricted), Safari.
- [x] Cuando el handshake sea estable, retirar `SessionBridgeService` y `bridge.html` del roadmap (plan separado).
  - **Estado**: `SessionBridgeService` eliminado de TO³; bridge.html deja de ser requisito para el cliente. Documentar al equipo landing para limpiar su hosting.

## Prompt sugerido para el equipo de la landing
> “Necesitamos que la landing escriba la sesión de Cognito directamente en TO³ después del login, sin depender de cookies third‑party. TO³ abrirá `https://www.atropello-games.es/auth/launch?handshakeId=XYZ` en un popup. Cuando Cognito devuelva los tokens, la landing debe llamar `window.opener.postMessage({ type: 'session:payload', handshakeId: 'XYZ', token, accessToken, profile, issuedAt, expiresAt }, 'https://to3.atropello-games.es')`, esperar un `session:ack` y cerrar la ventana. ¿Puedes implementar este handshake verificando el origin del opener y asegurando que los tokens nunca aparezcan en la URL? Documenta la secuencia y expón cualquier restricción que debamos considerar.”
