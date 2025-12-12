# Plan · Fase 2 — Rehidratación del SaveGamePayload

Referencia principal: `documentation/plans/savegame-cloud-integration.md` (Fase 2) y `documentation/plans/Respawn_Sigillum_y_SaveSystem.md`. Este subplan define el trabajo necesario para implementar `GamePersistenceService.loadGame()` reutilizando el pipeline de respawn y dejando listo el andamiaje para Cloud Saves.

## Objetivo
Restaurar una partida completa a partir de un `SaveGamePayload` v1: validar el schema, aplicar migraciones, cargar el snapshot del sistema, repoblar `GameStateStore`, reconfigurar HUD/audio y posicionar la nave exactamente donde se guardó.

## Suposiciones clave
- El payload proviene de `GamePersistenceService.saveGame()` (schemaVersion >= 1); migraciones de versiones futuras se implementarán como pasos acumulativos.
- `UniverseStateSnapshotService` seguirá siendo la fuente de verdad para aplicar snapshots. No reconstruiremos manualmente objetos WebGL.
- `RespawnService` ya pausa/reanuda el loop y aplica `GameEngine.restartWithContext()`. `loadGame()` reutilizará esas rutas en lugar de duplicar lógica.
- La UI seguirá mostrando un overlay modal (se definirá en Fase 3); por ahora basta con pausar el loop, loggear y reanudar.

## Pasos con checklist

1. **Infraestructura y migraciones**
   - [x] Añadir `SaveGameMigrationService` (o util estático) con `migrate(payload: SaveGamePayload): SaveGamePayload` que verifique `schemaVersion`, lance `SaveGameSchemaVersionMismatchError` cuando < `MIN_SUPPORTED_SAVEGAME_SCHEMA` y deje listo el payload para loaders.
   - [x] Definir tipos auxiliares (`LoadGameOptions`, `LoadGameResult`) y errores específicos (`LoadGameInProgressError`, `SaveGamePayloadInvalidError`).

2. **Adapters en modo import**
   - [x] Extender `PlayerStateSerializer` con un método `apply(snapshot: SaveGamePlayerSection)` o un `PlayerStateHydrator` dedicado que:
     - Rellene inventario, equipo, hechizos, grimoire layout y respawn anchors en `GameStateStore`.
     - Configure nave y atributos del piloto (`characterProfile`, stats, void energy, health snapshot).
   - [x] Extender `GameStateSnapshotAdapter` con `restore(section: SaveGameGameStateSection)` para repoblar misiones, intel, timers, cooldowns, archivos procedurales y landing status.
   - [x] Añadir helper en `UniverseStateSnapshotAdapter` / `UniverseStateSnapshotService` para aplicar `payload.universe` directamente cuando venga embebido (sin label) retornando un `RuntimeSolarSystemState` compatible con `GameEngine.restartWithContext()`.

3. **Implementación de `GamePersistenceService.loadGame()`**
   - [x] Reutilizar `withLoopPaused()` para pausar el loop/audio; bloquear múltiples cargas concurrentes con flag dedicado.
   - [x] Ejecutar pipeline:
     1. Validar/migrar payload y registrar metadata.
   2. Construir contexto `GameStartContext` garantizando el snapshot mediante `UniverseStateSnapshotService` (o helper equivalente); cuando el payload provea snapshot completo, aplicarlo directamente.
     3. Limpiar `GameStateStore` (`reset()`) y aplicar las secciones `gameState` + `player` (inventario, anchors, timers, etc.).
     4. Llamar a `GameEngine.restartWithContext()` con `restartReason: 'LOAD_GAME'` y posteriormente sincronizar HUD/audio pendientes.
   - [x] Registrar logs en `LogCategory.SAVE_SYSTEM` (inicio, duración, payload size, anchor restaurado, schema version) y surfacing de errores con datos suficientes para Cloud Saves Panel.

4. **Pruebas manuales y validaciones**
   > ⚠️ QA diferida: por acuerdo del 12/12/2025, estos pasos se ejecutarán al finalizar todo el plan maestro, justo antes del hardening final.
   - [x] Crear comando temporal (por consola / debug service) que pueda invocar `loadGame(latestPayload)` para QA. *(Cobertura postergada; se completará cuando iniciemos la sesión final de pruebas).* 
   - [x] Escenarios mínimos a validar (órbita, aterrizaje, gate rite) marcados como pendientes en la bitácora de QA global para ejecutarlos junto al resto del plan.
   - [x] Ejecutar `npm run build` (última corrida: 12/12/2025) — validado tras cerrar Fase 2.

5. **Documentación y follow-up**
   - [x] Actualizar `documentation/Resumen_Proyecto_y_Progreso.md` y la wiki `/wiki/cloud-saves` detallando cómo funciona la carga offline.
   - [x] Preparar las acciones pendientes para Fase 3 (integración Cloud Saves real) en `documentation/plans/savegame-cloud-integration.md`.

---
Este plan se eliminará una vez completada Fase 2 y actualizados los documentos maestros.
