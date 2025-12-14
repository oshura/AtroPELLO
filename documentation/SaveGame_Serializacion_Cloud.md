# Arquitectura de Serialización y Cloud Saves

> Documento de referencia para entender cómo capturamos el estado del juego, lo serializamos en un `SaveGamePayload` v1, lo subimos al servicio REST de Cloud Saves y cómo se rehidrata para continuar la partida sin romper el bucle principal.

## Resumen ejecutivo

- Las fuentes críticas (`GameStateStore`, `PortalPersistenceService`, `RespawnService` y `Spaceship`) ya exponen snapshots listos para clonar sin depender de WebGL/DOM.
- `GamePersistenceService` actúa como orquestador único: pausa el loop, captura player/gameState/universe/UI/audio y entrega un `SaveGamePayload` consistente sin side effects.
- El payload real se mantiene por debajo de 400 KB si evitamos buffers binarios y registramos el tamaño en `LogCategory.SAVE_SYSTEM`. Seguimos alertando si un payload supera los 500 KB (soft limit acordado con backend).
- El backend acepta `savegame: unknown`, por lo que incluimos metadata explícita (fecha, sistema, anchor, duración, build, usuario y versión de esquema) para listados rápidos y migraciones futuras.

## Fuentes auditadas para la captura

### `GameStateStore` (`src/app/services/game/game-state.store.ts`)

- Colecciones vivas: asteroides, planetas, portales, debris y Lesser Beings indexados por sistema.
- Entidades clave (`spaceship`, `sun`, `camera`, `respawnAnchor`, `activeLandingPlanet`, etc.) listas para clonado profundo a través de helpers `getAllObjects()`, `getPlanetIntelSnapshot()`, `getActiveMissionsSnapshot()`, `getGrimoireGlyphLayoutSnapshot()` y derivados.
- También concentra estado narrativo/UI (misiones, paneles, timers y flags como `gameRunning`/`frameCount`), lo que alimenta las secciones `player`, `gameState` y parte de `universe`.

### `PortalPersistenceService` (`src/app/game/services/game/portal-persistence.service.ts`)

- Guarda snapshots etiquetados con `snapshotLabel`, `persistentSystemId` y `proceduralSystemId`.
- Expone `apply`, `list` y `findByPortalId()` para rehidratar portales y enriquecer `metadata.systemName`/`anchorLabel` cuando hay viajes previos.
- Mantiene los índices `portalIndex`/`systemIndex`, evitando referencias rotas durante `loadGame()`.

### `RespawnService` (`src/app/game/services/state/respawn.service.ts`)

- Ya pausan/resumen el loop y construyen `PlayerResetState` (posición, velocidad, stats de piloto, energía del vacío) desde el anchor vigente.
- Sus helpers (`getEffectiveRespawnAnchor`, `resolveCharacterStats`) se reutilizan dentro de `GamePersistenceService` tanto para `saveGame()` como para `loadGame()`.

### `Spaceship` (`src/app/game/game-objects/Spaceship.ts`)

- Exponen orientación en quaternion/matriz, estado físico completo, energía del vacío, controles y carga.
- Getter/setter de salud y callbacks permiten capturar `healthCurrent/Max` sin tocar WebGL.
- Se serializa un snapshot compacto (posición, velocidad, orientación, energía, carga, thrusters) dentro de `player.ship`.

## Riesgos y gaps controlados

- **Orientación nave**: `GameStateStore` no guarda la orientación, por lo que `PlayerStateSerializer` lee directamente del `Spaceship` activo.
- **Timers UI**: `mapReopenAllowedAtMs` y similares se guardan en `gameState.timers`; podemos resetearlos si el payload viene corrupto.
- **Audio**: solamente serializamos `audio.currentScene`; el resto de capas sigue fuera de alcance y se marca como `TODO` dentro del payload.
- **Tamaño de payload**: `GamePersistenceService` registra `JSON.stringify(payload).length` (comprimido/not-comprimido) y levanta alerta si excede 500 KB; Cloud Saves notificará si se acerca a 1 MB.

## Componentes principales

| Elemento | Archivo | Rol en la arquitectura |
| --- | --- | --- |
| `GamePersistenceService` | `src/app/services/game/game-persistence.service.ts` | Captura y carga el `SaveGamePayload`. Gestiona pausas del loop, serialización de jugador/universo/UI/audio y reinicio del engine. |
| `CloudSavesService` | `src/app/libs/cloud-saves/cloud-saves.service.ts` | Orquesta la comunicación con la API REST (list/get/put/delete), mantiene señales (slots, loading, saving, error) y ofrece helpers `saveCurrentGame()` / `loadGameFromSlot()`. |
| `CloudSavesClient` | `src/app/libs/cloud-saves/cloud-saves.client.ts` | Cliente HTTP que firma peticiones con el ID Token y normaliza URLs / headers. |
| `CloudSavesSessionBridgeService` | `src/app/libs/cloud-saves/cloud-saves-session-bridge.service.ts` | Proxy entre `AuthService` y Cloud Saves. Expone token y callbacks para refrescar sesión. |
| `CloudSavesPanelComponent` | `src/app/libs/cloud-saves/cloud-saves-panel.component.ts` | UI principal dentro del diálogo de Opciones → “Partidas”. Consume las señales de `CloudSavesService`. |
| Header CTA | `src/app/components/header/header.ts` | Botón "Guardar partida" que dispara el mismo pipeline que el panel cuando sólo hay un slot asignado. Si el piloto tiene varios slots, abre directamente el diálogo de Opciones en la pestaña "Partidas" para forzar la selección manual antes de guardar. |
| Wiki `/wiki/cloud-saves` | `src/app/wiki/pages/cloud-saves/cloud-saves.ts` | Documentación in-game del flujo completo y checklist de QA. |

## Pipeline de guardado

1. **Entrada del jugador**
   - CTA del header o botón `Save slot` del panel.
   - Ambos revisan `auth.authenticated()` y el flag `saves.saving()` para evitar capturas concurrentes.
   - El CTA detecta si el piloto tiene múltiples slots (`CloudSavesService.hasMultipleSlots()`); en ese caso abre el diálogo de Opciones (tab "Partidas") en lugar de guardar automáticamente.

2. **Captura con `GamePersistenceService.saveGame()`**
   - El servicio resuelve opciones (`reason`, `includeUiState`, `skipPause`).
   - Ejecuta `withLoopPaused()` para congelar el `GameEngine`: pausa física/render, captura el frame actual y evita side effects.
   - Serializa:
     - `PlayerStateSerializer.capture()` → inventario, anclas de respawn, spells, etc.
     - `GameStateSnapshotAdapter.capture()` → `GameStateStore` (misiones, cooldowns, lesser beings).
     - `UniverseStateSnapshotAdapter.capture()` → runtime del sistema (objetos, portales, dioses asignados).
     - UI/audio opcional según flags.

3. **Metadata de savegame**
   - `buildMetadata()` compone:
     - `savedAt` (epoch ms) y `elapsedPlayTimeMs` (estimación por `frameCount`).
     - `systemId`/`systemName`, `anchorLabel`, `anchorPlanetName`, `respawnAnchorId`.
     - `buildLabel`, `userId`, `backendSlot` (placeholder).
   - Todo queda dentro de `SaveGamePayload.metadata`.

### Contrato con Cloud Saves

- `metadata.schemaVersion` entero (arranca en `1`) para permitir migraciones automáticas.
- Campos obligatorios: `savedAt`, `elapsedPlayTimeMs`, `systemId`, `systemName`, `anchorLabel`, `anchorPlanetName`, `buildLabel`, `userId`.
- `CloudSavesService` adjunta `CloudSaveSlotMetadata` replicando esos campos y agregando timestamps adicionales para listados.
- Errores de backend se traducen a `SaveGameSchemaVersionMismatchError`, `SaveGamePayloadInvalidError`, `payloadTooLarge` o `deserializationFailed` antes de propagarse a la UI.

4. **Entrega a `CloudSavesService.saveCurrentGame()`**
   - Recibe el payload y genera metadata específica del slot (`CloudSaveSlotMetadata`) reutilizando los campos anteriores.
   - Llama a `putSave()` → `CloudSavesClient.putSave()` hace `PUT /slots/{index}` con body `{ gameId, savegame, metadata }`.
   - Tras éxito, `syncSlots()` refresca el listado para UI.

5. **Feedback al jugador**
   - Header CTA pinta `saveFeedback` (`Guardado {systemName} (HH:MM:SS)`).
   - Panel deshabilita botones con `isBusy()` y, al terminar, permite otra acción.

## Transporte y sesión

- `CloudSavesClient` firma cada petición con `Authorization: Bearer <ID Token>`.
- `CloudSavesSessionBridgeService` escucha cambios en `AuthService` y actualiza la señal `tokenState` para `CloudSavesService`.
- Si la cookie `atropello-session` caduca, la próxima acción lanzará `describeError('token')` → mensaje "Necesitas iniciar sesión..." compartido por panel y CTA.

## Pipeline de carga y reanudación

1. **Selección del slot**
   - Panel: tarjetas que muestran los slots asignados al piloto; el botón “Ver todas las partidas” expone el master data y bloquea la acción de guardado para evitar sobrescrituras accidentales.
   - El panel auto-selecciona el único slot cuando sólo existe uno. Si hay varios, los botones Load/Delete requieren selección manual.
   - Servicio: `loadGameFromSlot(index)` obtiene el slot (`getSlot`) y valida el payload con `ensurePayload()`.

2. **Migración y validaciones**
   - `GamePersistenceService.loadGame()` invoca `SaveGameMigrationService.migrate()` para verificar `schemaVersion`.
   - Se verifica que el payload contiene secciones obligatorias (player/gameState/universe). Errores lanzan `SaveGamePayloadInvalidError` → se mapean a copy amigable.

3. **Pausa y restauración**
   - `withLoopPaused()` vuelve a detener el loop para aplicar el snapshot.
   - `gameState.reset()` + `GameStateSnapshotAdapter.restore()` sustituyen colecciones.
   - `PlayerStateSerializer.apply()` coloca al piloto/inventario en memoria.
   - `GamePersistenceService.resolveTargetSystemId()` ahora prioriza `payload.metadata.systemId` (derivado del snapshot capturado) antes de recurrir al anchor activo o al sistema en vivo; así Gate Rite y otros viajes por portal vuelven exactamente al sistema donde se guardó.
   - `UniverseStateSnapshotAdapter.ensureRuntimeState()` reconstruye el sistema destino usando snapshot IDs/anclas, y `buildSnapshotOptions()` también incluye `metadata.systemName/systemId` como candidatos para `snapshotLabel`/`snapshotId`.
   - `GameEngine.restartWithContext()` inicia el loop en modo `LOAD_GAME`, posiciona nave/anchor y reanuda la simulación.

4. **Reanudación y métricas**
   - Se registra `durationMs` desde que se solicitó la carga hasta que finaliza la rehidratación.
   - El panel muestra ese `durationMs` y la metadata asociada al slot cargado.

## Manejo de pausa y consistencia

- Tanto `saveGame()` como `loadGame()` pasan por `withLoopPaused(reason, skipPause)`.
- El método se encarga de:
  1. Guardar el estado del loop (`gameRunning`).
  2. Pausar actualizaciones/render.
  3. Ejecutar el callback de captura/restauración.
  4. Reanudar el loop automáticamente incluso si ocurre un error (bloque `finally`).
- Esto garantiza que al salir de una carga fallida el jugador sigue controlando la nave exactamente como antes de la acción.

## Señales y UI reactivas

- `slots`: lista ordenada de `CloudSaveSlotRef` (usada por el panel para renderizar filas y `trackBy`).
- `loading` / `saving`: combinaciones que deshabilitan botones en panel y CTA.
- `error`: mensaje amigable surfaceado bajo el panel y, si el CTA fue quien disparó la acción, también en el header.
- `lastLoadedSlot` (sólo UI): el panel guarda la última respuesta para mostrar metadata y el JSON crudo.

## Capa de errores (`describeError`)

Mapa aproximado:

| Error | Mensaje expuesto |
| --- | --- |
| `SaveGameSchemaVersionMismatchError` | "La partida usa un esquema incompatible..." |
| `SaveGamePayloadInvalidError` | "El slot seleccionado está dañado..." |
| `SaveGameInProgressError` / `LoadGameInProgressError` | "Ya hay un guardado/carga en curso..." |
| `SaveGameEngineUnavailableError` | "El motor del juego aún no está listo..." |
| `SaveGameCaptureError` | Copia específica según contexto (`save`/`load`). |
| 401 / token expirado | "La sesión de autenticación expiró..." |
| Problemas de red (`TypeError`, timeout) | "No se pudo contactar con el servicio de guardado..." |

- La función asigna mensajes en castellano y actualiza la señal `errorState`.
- El header CTA reusa `describeError(error, 'save')` para pintar el banner rojo bajo los botones.

## Secuencia resumida (guardar)

```
Header CTA / Panel → CloudSavesService.saveCurrentGame()
  → GamePersistenceService.saveGame()
    → withLoopPaused() detiene loop
    → Serializadores capturan player/gameState/universe/UI/audio
    → buildMetadata()
  ← payload listo
  → buildSlotMetadata() + CloudSavesClient.putSave()
  → syncSlots()
UI ← señales actualizadas (slots, saving=false, feedback)
```

## Secuencia resumida (cargar)

```
Panel (Load latest/slot) → CloudSavesService.loadGameFromSlot()
  → getSlot() + ensurePayload()
  → GamePersistenceService.loadGame()
    → migrate()
    → withLoopPaused()
    → applyLoadedPayload()
      → reset GameStateStore / Player / Universe
      → GameEngine.restartWithContext()
  ← LoadGameResult (metadata + durationMs)
UI ← actualiza bloque "Last load" + JSON mostrado
```

## Referencias adicionales

- Wiki in-game: `/wiki/cloud-saves`.
- Resumen general: `documentacion/Resumen_Proyecto_y_Progreso.md` (sección "Autenticación y Cloud Saves").

## Checklist histórico (Fase 0)

1. Definir `SaveGamePayload` v1 reutilizando tipos existentes. ✅
2. Implementar `GamePersistenceService` con adapters (`PlayerStateSerializer`, `GameStateSnapshotAdapter`, `UniverseStateSnapshotAdapter`). ✅
3. Integrar con `CloudSavesService`, enviar metadata completa y medir tamaño/tiempo de captura. ✅

Este checklist se conserva para contexto histórico de la investigación inicial; todas las acciones están completadas y sirven como validación de la arquitectura actual.
