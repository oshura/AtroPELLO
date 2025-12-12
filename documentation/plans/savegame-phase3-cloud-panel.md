# Plan · Fase 3 — Integración real con Cloud Saves

> Referencias: `documentation/plans/savegame-cloud-integration.md` (Fase 3 y 4), `documentation/Wiki_System.md`, `documentation/Resumen_Proyecto_y_Progreso.md`, `src/app/libs/cloud-saves/*`, `src/app/components/header/*`, `src/app/services/game-persistence.service.ts`.

## Contexto y hallazgos
- `CloudSavesService` ya habla con la API (list/get/put/delete) pero aún trabaja con payloads mock y no coordina con `GamePersistenceService`.
- `CloudSavesPanelComponent` expone acciones básicas (sync/load/save demo/delete) y mantiene un JSON raw para depurar, pero no dispara la rehidratación real ni muestra metadata útil.
- El header sigue mostrando un chip `user-badge` y un botón "Cerrar sesión" genérico; todavía no existe el CTA "Guardar partida" requerido por el plan maestro.
- `CloudSavesSessionBridgeService` refleja token/identidad del `AuthService`, por lo que ya contamos con señales para actualizar UI al vuelo.

## Objetivo
Conectar el pipeline real de guardado/carga al servicio y al UI para que:
1. `CloudSavesService` capture y envíe `SaveGamePayload` v1 real (metadatos incluidos) y pueda restaurar un slot invocando `GamePersistenceService.loadGame()`.
2. El panel de cloud saves permita guardar/cargar slots reales con feedback claro, manejo de errores y logging.
3. El header exponga un CTA "Guardar partida" (cuando haya sesión) y use el alias como etiqueta del botón de logout, eliminando el chip intermedio.

## Suposiciones / limitaciones
- Seguimos usando la API REST real; no añadiremos mocks nuevos.
- Las pruebas manuales end-to-end se ejecutarán al cerrar todo el plan maestro (ver acuerdo 12/12/2025). Dejaremos hooks/telemetría listos para esa sesión.
- Mantener logs coherentes en `LogCategory.SAVE_SYSTEM` y `LogCategory.INPUT` para cada acción de guardado/carga.

## Entregables
- Actualizaciones en `CloudSavesService`, `CloudSavesPanelComponent`, `GamePersistenceService` (si necesita helpers públicos), `Header` component y cualquier módulo/config asociado.
- Documentación sincronizada (Resumen, Wiki, Wiki_System) describiendo el flujo real.
- Registro de `npm run build` al cerrar la fase.

## Checklist de trabajo

1. **Servicio Cloud Saves + GamePersistence**
   - [x] Inyectar `GamePersistenceService` y exponer métodos `saveCurrentGame(index, metadata?)` y `loadGameFromSlot(index)` que llamen a `saveGame()/loadGame()` con el payload real.
   - [x] Incorporar metadata útil al `putSave()` (ej. `systemId`, `anchorLabel`, `playTimeMs`, `savedAt` ya calculado).
   - [x] Propagar errores específicos (`SaveGamePayloadInvalidError`, migraciones) hacia el panel con mensajes claros.

2. **Panel "Partidas"**
   - [x] Reemplazar "Save demo slot" por botones reales: guardar slot 0 (MVP) y confirmar cargas antes de invocar `GamePersistenceService.loadGame()`.
   - [x] Mostrar metadata básica de cada slot (fecha, anchor/system) y el resultado de la última carga (HUD message/log link).
   - [x] Disparar logs/telemetría al cargar/guardar y reflejar estados `loading/error` en la UI.

3. **Header y CTA**
   - [x] Sustituir el chip `user-badge` por el alias directamente en el botón de logout.
   - [x] Añadir botón "Guardar partida" visible sólo con sesión; debe deshabilitarse mientras `CloudSavesService` esté guardando.
   - [x] El CTA invoca `saveCurrentGame(defaultSlot)` y muestra feedback (toast/banner/log) en caso de éxito o fracaso.

4. **Manejo de errores y resiliencia**
   - [x] Mapear códigos de error comunes (token expirado, schema inválido, migración fallida) a mensajes del panel y del header CTA.
   - [x] Garantizar que la app vuelve a su estado previo si una carga falla (no dejar loop pausado ni datos parciales).

5. **Documentación y QA diferido**
   - [x] Actualizar `Resumen_Proyecto_y_Progreso`, `Wiki_System`, `/wiki/cloud-saves` y notas del plan maestro con el nuevo comportamiento.
   - [x] Registrar `npm run build` tras aplicar los cambios.
   - [x] Anotar en la bitácora de QA global los escenarios que se cubrirán en la sesión final (incluye los de Fase 2 + nuevos casos Cloud Saves).

---
Este plan se considera completado tras integrar el pipeline real, actualizar la documentación y dejar lista la batería de QA diferida para el cierre del plan general.
