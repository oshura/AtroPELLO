# Plan: Guardado completo + integración Cloud Saves

> Basado en `Respawn_Sigillum_y_SaveSystem.md` y `Respawn_Sistema.md`. Todos los cambios siguen las pautas de `CleanCode_Arquitectura.md` y deben ejecutarse con build verde (`npm run build`).

## Contexto
- TO³ ya expone login/logout reales y un panel de cloud saves que opera contra la API REST, pero el payload aún es un mock.
- El pipeline de respawn (Sigillum) serializa snapshots de sistemas solares, anchors y estado del jugador, y `GameStateStore` centraliza la mayoría de colecciones necesarias para un guardado real.
- El header actual muestra un chip con el alias y un botón "Cerrar sesión"; necesitamos reemplazarlo por un CTA “Guardar partida” (sólo cuando hay sesión) y usar el alias como label del botón de logout.
- Debemos garantizar que el JSON producido pueda rehidratar el juego más tarde (vía panel o futuros atajos) reutilizando los servicios existentes (`UniverseStateSnapshotService`, `RespawnService`, `GameEngine.restartWithContext`).

## Objetivos
1. Diseñar e implementar un `GamePersistenceService` capaz de capturar el estado completo del juego (player + universo + metadatos) y rehidratarlo.
2. Integrar ese payload con `CloudSavesService` para que `putSave()` envíe partidas reales y `loadSlot()` pueda restaurarlas sin usar mocks.
3. Actualizar el header para ofrecer un botón “Guardar partida” (visible sólo con sesión) y mostrar el alias en el botón de logout.
4. Documentar el flujo (doc técnico + wiki) y describir cómo se retoman partidas guardadas.

## Suposiciones y dependencias
- El backend de cloud saves acepta payloads arbitrarios (`savegame: unknown`), por lo que no hay límite de esquema siempre que enviemos JSON válido.
- `UniverseStateSnapshotService`, `PortalPersistenceService` y `GameStateStore` ya proveen métodos para capturar/aplicar snapshots; podemos extenderlos sin reescribir el motor.
- La serialización debe ignorar referencias WebGL / objetos DOM; siempre reconstruimos a partir de snapshots.
- Para reanudar el juego tras login (futuro), reutilizaremos el serializer definido aquí.

## Fases

### Fase 0 · Investigación y contratos
- [x] Auditar qué datos están disponibles hoy en `GameStateStore`, `PortalPersistenceService`, `RespawnService` y `Spaceship` para confirmarlos como fuentes del serializer. → Ver `documentation/savegame-fase0-investigacion.md`.
- [x] Definir `SaveGamePayload` v1 (interfaces TS) con secciones `metadata`, `player`, `universe`, `gameState`, `audio/ui` (aunque algunas puedan quedar opcionales en la primera iteración). → Archivo `src/app/game/types/save-game.types.ts` (`SAVEGAME_SCHEMA_VERSION = 1`).
- [x] Alinear con backend/cloud-saves sobre tamaño esperado y metadata mínima (ej. `savedAt`, `systemName`, `anchorLabel`). → Contrato documentado en `documentation/savegame-fase0-investigacion.md` (límites de 500 KB y metadata obligatoria para listados).

### Fase 1 · Captura (`GamePersistenceService.saveGame`)
- [x] Introducir `GamePersistenceService` (providedIn root) que pausa el loop (`RespawnService` helpers), invoca adapters y resume en `finally`.
- [x] Implementar adapters:
  - `PlayerStateSerializer`: nave (posición, velocidad, orientación), vitals, void energy, inventario, ritos activos.
  - `GameStateSnapshotAdapter`: colecciones del `GameStateStore` (planetas, portales, anchors, intel, timers, RNG seeds).
  - `UniverseStateSnapshotAdapter`: reutiliza `UniverseStateSnapshotService` para capturar snapshot + metadatos del sistema activo (`snapshotLabel`, `proceduralSystemId`, lesser beings, portales cruzados).
  - `SystemsSerializer`: timers globales, eventos de HUD, `PanelEventCoordinator` state (para restaurar UI).
  - `MetadataProvider`: `schemaVersion`, `build`, `elapsedPlayTimeMs`, `sigillumId`.
- [x] Serializar a JSON puro, registrar logs (`LogCategory.SAVE_SYSTEM`) y propagar errores al caller.

-### Fase 2 · Rehidratación (`GamePersistenceService.loadGame`)
- [x] Añadir `loadGame(payload: SaveGamePayload)` que reutilice el mismo pipeline que `RespawnService` (loop pausado, snapshot aplicado, `GameStateStore`/jugador/ritos rehidratados).
- [x] Validar `schemaVersion` con `SaveGameMigrationService.ensureLatestSchema()` y registrar errores específicos cuando el payload sea incompatible.
- [x] Hooks de verificación y logging en `LogCategory.SAVE_SYSTEM` listos; la verificación manual in-game se pospone al hardening final del plan maestro.

### Fase 3 · Integración con Cloud Saves API
- [ ] Extender `CloudSavesService` con métodos `saveCurrentGame(index, metadata?)` y `loadGameFromSlot(index)` que usen `GamePersistenceService` en lugar del mock actual.
- [ ] Incluir metadatos útiles al enviar (`systemName`, `anchorLabel`, `playTime`).
- [ ] Ajustar `CloudSavesPanelComponent` para mostrar/descargar JSON real: al cargar, invocar `GamePersistenceService.loadGame(payload.savegame)`.
- [ ] Añadir handling de errores específicos (schema inválido, migración fallida) con mensajes claros en el panel.

### Fase 4 · Header y UX inmediata
- [ ] Actualizar `Header`:
  - Eliminar el chip `user-badge`.
  - Mostrar el alias directamente en el botón de logout (`<button>{{ auth.displayName() || 'Cerrar sesión' }}</button>`).
  - Añadir botón "Guardar partida" visible sólo cuando `auth.authenticated()` sea `true`; si no hay sesión, se muestra el botón "Iniciar sesión" como hasta ahora.
  - El botón "Guardar partida" debe llamar a `GamePersistenceService.saveGame()` y luego a `CloudSavesService.saveCurrentGame(defaultSlot)` o abrir un diálogo de confirmación (MVP: guardar en slot 0 y mostrar toast/errores).
- [ ] Registrar eventos de logging/telemetría para ese CTA (éxito/fracaso, duración de la captura).

### Fase 5 · Documentación y QA
- > Incluye la batería de pruebas diferida de la Fase 2 (órbita, aterrizaje, gate rite) junto con los escenarios nuevos de Cloud Saves cuando cerremos todo el plan.
- [ ] Actualizar `documentation/Respawn_Sigillum_y_SaveSystem.md`, `Respawn_Sistema.md`, `cloud-saves-sdk.md`, `Wiki_System.md`, `/wiki/cloud-saves` y `Resumen_Proyecto_y_Progreso.md` con el nuevo flujo.
- [ ] Añadir guía de troubleshooting (qué hacer si la carga falla, cómo interpretar metadatos del slot).
- [ ] Ejecutar `npm run build` y registrar resultado al final del trabajo.
- [ ] Checklist QA manual:
  - Guardar en medio de una misión, matar a la nave, cargar y verificar que `respawnAnchor`, misiones, portales y lesser beings se mantienen.
  - Guardar durante aterrizaje / en vuelo para asegurar que la orientación y landingSite se restauran.
  - Cargar desde un slot sin sesión -> forzar login, reintentar, verificar messaging.

## Entregables
- Código en `src/app/services/game-persistence.service.ts` (y adapters asociados) con pruebas básicas.
- Header actualizado (`src/app/components/header/*`).
- Cloud saves panel/services usando payload real.
- Documentación sincronizada + registro de builds.

## Riesgos
- **Tamaño del JSON**: primero medir y registrar el tamaño real de cada save (log + métricas). Si resulta excesivo, evaluar compresión o streaming; hasta entonces sólo observamos.
- **Versionado**: desde `schemaVersion = 1` debemos incluir migradores encadenados (`1→2`, `2→3`, …). Si un cambio hace imposible migrar, documentaremos la ruptura y rechazaremos versiones anteriores a la nueva `MIN_SUPPORTED_SCHEMA`.
- **Tiempo de captura**: el juego se pausa explícitamente durante la serialización y se muestra un banner/overlay “Guardando…”. Asumimos el costo para garantizar consistencia.
- **Consistencia**: con la pausa activa no debería variar el estado; igualmente validar que ningún servicio muta `GameStateStore` durante la captura antes de reanudar.

---
Este plan sustituye el mock del panel y nos acerca al objetivo descrito en `Respawn_Sigillum_y_SaveSystem.md`: partidas reales que se pueden pausar, guardar en la nube y reanudar exactamente desde el mismo estado.
