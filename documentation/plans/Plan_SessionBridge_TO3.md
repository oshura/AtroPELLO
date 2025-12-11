# Plan: Sincronizar sesión Landing ↔ TO³ y validar Cloud Saves

## Contexto
- El prompt requiere asegurar que TO³ reutilice el flujo `/auth/launch`, inserte el iframe `bridge.html` y comparta la sesión Cognito con el juego.
- Parte del stack (AuthService, SessionCookieService, CloudSavesService, panel "Partidas") ya existe, pero debemos verificar si cumple el contrato y ajustar los huecos detectados.
- La tarea también exige documentar el flujo en `documentation/cloud-saves-sdk.md`/wiki y garantizar compilación con `npm run build`.

## Objetivo
Confirmar punto por punto que el login/logout, el bridge de sesión y el wiring con Cloud Saves funcionan tras delegar el login en la landing, implementando las piezas faltantes o refinando las existentes.

## Pasos
- [ ] **Auditoría de flujo actual**: Revisar `documentation/cloud-saves-sdk.md`, servicios de auth (`AuthService`, `AuthIntegrationService`, `AuthReturnService`, `SessionCookieService`), configuración (`cloud-settings.ts`) y `CloudSavesSessionBridgeService` para mapear qué partes del prompt ya están implementadas y dónde falta comportamiento (especialmente iframe `bridge.html` y `postMessage`).
- [ ] **Verificar UI de login/logout**: Inspeccionar `Header` (plantilla + TS) y cualquier otro punto de entrada para asegurar que el botón "Iniciar Sesión" usa `https://www.atropello-games.es/auth/launch?return=...` y que `logoutWithRedirect` conserva el flujo esperado; ajustar según hallazgos.
- [ ] **Implementar/validar session bridge**: Confirmar si el iframe oculto `bridge.html` se incrusta y, si no, crear un servicio/lightweight bootstrap que lo cargue, escuche `session:data` via `postMessage` y sincronice `AuthService` / `SessionCookieService`. Documentar el mensaje y el origen permitido.
- [ ] **Conectar CloudSavesService**: Revisar el tab "Partidas" y asegurarse de que `CloudSavesService` consume los tokens del bridge actualizado (listeners + `getToken`). Ajustar panel/botones según sea necesario para operar `sync`, `load`, `save`, `delete`.
- [ ] **Actualizar documentación**: Reflejar el nuevo flujo en `documentation/Resumen_Proyecto_y_Progreso.md`, `documentation/cloud-saves-sdk.md` (si aplica) y la entrada `/wiki/cloud-saves`. Explicar cómo TO³ rehidrata la sesión desde la landing.
- [ ] **Validación final**: Ejecutar `npm run build` y anotar el resultado. Si aparecen errores, iterar hasta obtener compilación exitosa.
