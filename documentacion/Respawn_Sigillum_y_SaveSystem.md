# Respawn Sigillum y Plan de Guardado/Carga

> Documento actualizado: diciembre 2025.
>
> Responsable actual: Game Systems Team (GameEngine + GameStateStore).

Este documento consolida el estado del sistema de respawn/sello y describe el plan para acoplar el futuro sistema de guardado/carga basado en serialización completa del `GameStateStore` y servicios asociados. Sirve como guía para continuar el trabajo sin perder la visión de diseño.

## 1. Estado actual del Respawn Sigillum

- **Grabado del sello**
  - `GameEngine.castRespawnSigillum()` captura contexto de aterrizaje, posición/orientación de la nave y metadatos del planeta.
  - Cada ancla almacena `systemId`, `snapshotId`, `snapshotLabel`, `shipPosition`, `shipOrientation`, `landingSite`, notas para UI y un identificador único.
  - El snapshot activo se clona y se guarda en `PortalPersistenceService` con la etiqueta `respawn-anchor-latest`, dejando evidencia explícita de qué sistema debe restaurarse.

- **Persistencia del ancla**
  - `GameStateStore.setRespawnAnchor()` mantiene una copia inmutable del ancla vigente y registra auditoría básica (systemId, planeta, timestamp).
  - Al ejecutar un respawn completo (botón "Start New Game"), `GameEngine.respawnGame()` limpia el anchor (`clearRespawnAnchor('full-respawn')`) para evitar heredar sellos de sesiones anteriores.

- **Flujo de respawn sigillum**
  1. `RespawnService.respawnFromDeath()` pausa loop/audio y busca el ancla vigente. Si no existe, crea un fallback seguro orbitando el sol del sistema humano.
  - Desde enero 2026 el fallback fuerza `systemId = human-system`, genera el snapshot del sistema humano vía `HumanSolarSystemService` y lo pasa como `snapshotOptions.snapshot`, garantizando que sin sigillum siempre regresarás al sistema humano.
  2. Se construye un `GameStartContext` vía `UniverseStateSnapshotService.buildRestartContext()`, indicando `targetSystemId` + `snapshotOptions` (id y label del sello).
  3. `GameEngine.restartWithContext()` detiene animaciones activas, aplica el estado del jugador (`applyPlayerResetState`), sincroniza vitals, emite HUD toast y relanza el loop con audio de exploración.
  4. Si la API moderna falla, se cae al `respawnGame()` legacy para garantizar continuidad.

- **Puentes ya preparados para guardado/carga**
  - Clonación de snapshots de sistemas solares reutilizable (JSON plano compatible con `PortalPersistenceService`).
  - `UniverseStateSnapshotService.ensureSystemState()` puede cargar un snapshot por `snapshotId` o `snapshotLabel`, exactamente lo que necesita el lector de partidas.
  - `RespawnService` y `GameEngine` ya tienen rutas explícitas para pausar/reanudar el loop y notificar HUD/audio, lo que facilita intercalar un flujo de guardado/carga consistente.

- **Actualizaciones diciembre 2025**
  - `GameEngine.handlePortalTraversal()` vuelve a serializar el sistema origen con `SolarSystemRuntimeSerializerService.saveWithLabel(labelActual)` antes de aplicar el destino, de modo que cada label almacenado en `PortalPersistenceService` se mantiene al día (planetas destruidos, portales sellados, etc.).
  - `persistRespawnSnapshot()` reutiliza labels ya registrados: `PORTAL_SNAPSHOT_LABELS.HUMAN_DEFAULT` para el ancla sin Sigillum y `PORTAL_SNAPSHOT_LABELS.RESPAWN_ANCHOR_LATEST` para el sello activo. Si el sistema en runtime aún no tiene label, `ensureCurrentSnapshotLabel()` deriva uno (`system-<id>`) y lo persiste automáticamente antes de guardar el sello.
  - `persistActiveSystemSnapshot()` detecta cuando el sistema activo es `human-system` y, además de refrescar el label en uso, vuelve a guardar el snapshot bajo `PORTAL_SNAPSHOT_LABELS.HUMAN_DEFAULT`. Así el ancla inicial siempre apunta al estado más reciente del sistema humano aunque actualmente estemos en otro sistema.
  - `PortalPersistenceService` guarda y entrega clones profundos de cada snapshot, eliminando referencias compartidas que podían “resucitar” planetas o portales destruidos tras respawn.
  - `UniverseStateSnapshotService.ensureSystemState()` intenta refrescar el label solicitado via runtime serializer si la etiqueta coincide con el sistema activo pero la persistencia aún no la tenía.
  - `UniverseStateSnapshotService.ensureSystemState()` ahora da prioridad a cualquier `snapshotLabel` recibido: busca ese label en `PortalPersistenceService` y aplica el snapshot incluso cuando el sistema solicitado ya está cargado en memoria, garantizando que los respawns nunca reutilicen el estado LIVE si existe una etiqueta persistida.

## 2. Objetivo del sistema de guardado/carga

- **Serialización completa** del estado de juego en un único JSON (tamaño irrelevante, consistencia prioritaria).
- **Rehidratación determinista**: deserializar el JSON y reconstruir escena, entidades y estado del jugador sin divergencias.
- **Capas adaptadoras** para aislar responsabilidades: `GameStateStore`, `GameEngine`, recursos procedurales, audio, HUD.
- **Compatibilidad incremental**: formato versionado para permitir migraciones futuras.

## 3. Arquitectura propuesta

```
[GamePersistenceService]
   ├─ GameStateSnapshotAdapter (GameStateStore ⇄ DTO)
   ├─ RuntimeUniverseAdapter (UniverseStateSnapshotService + snapshots)
   ├─ PlayerStateSerializer (ship + character profile + inventory)
   ├─ SystemsSerializer (portales, lesser beings, eventos)
   └─ MetadataProvider (build info, versión, checksum)
```

1. **GamePersistenceService**: fachada pública (`saveGame()`, `loadGame(saveId)`). Pausa el loop, orquesta las demás capas y reanuda.
2. **Adapters/Serializers**:
   - *GameStateSnapshotAdapter*: expone `export()` / `import()` para colecciones del `GameStateStore` (planetas, portales, inventario, intel, anchors, etc.).
   - *RuntimeUniverseAdapter*: reutiliza la lógica actual de `UniverseStateSnapshotService` para capturar o aplicar `SolarSystemSnapshot` según corresponda.
   - *PlayerStateSerializer*: combina datos del `Spaceship`, `characterProfileService` y stats derivados (sanity, survivability, spells cooldowns).
   - *SystemsSerializer*: agrupa elementos no cubiertos (lesser beings activos, efectos temporales, timers, música actual, flags de rito).
   - *MetadataProvider*: añade `schemaVersion`, `timestamp`, `playtime`, checksums básicos.

3. **Formato JSON** (boceto):

```json
{
  "version": 1,
  "timestamp": 1733220000000,
  "player": {
    "ship": { "position": {"x":0,...}, "velocity": {...}, "orientation": {...} },
    "vitals": { "sanity": 72, "health": 180 },
    "voidEnergy": 95,
    "inventory": { ... },
    "activeRites": ["speed_rite"]
  },
  "universe": {
    "systemSnapshot": { ... },
    "lesserBeings": [ ... ],
    "portals": [ ... ]
  },
  "gameState": {
    "intel": { ... },
    "missions": { ... },
    "respawnAnchor": { ... },
    "rngSeeds": { ... },
    "timers": { ... }
  },
  "audio": {
    "musicScene": "exploration",
    "loops": ["ambient_main"]
  }
}
```

## 4. Flujo de guardado propuesto

1. **Gatekeeping**: verificar que el juego está en estado `RUNNING` o `PAUSED` (no durante animaciones críticas) y que no hay diálogos modales bloqueantes.
2. **Pausa segura**: reutilizar `RespawnService.pauseLoop()` para congelar update/audio.
3. **Captura**:
   - `PlayerStateSerializer.capture(GameEngine)` → snapshot de nave + stats.
   - `GameStateSnapshotAdapter.export(GameStateStore)` → colecciones internas serializadas.
   - `RuntimeUniverseAdapter.captureCurrent()` → `SolarSystemSnapshot` + portales asociados + lesser beings volátiles.
   - `Audio/Music` → escena y loops activos (opcional, versión inicial puede omitir).
4. **Agregado/Versionado**: construir objeto JSON, incluir `schemaVersion`, `buildCommit`, `playTimeMs`, `respawnAnchorId`.
5. **Persistencia**: escribir JSON en storage escogido (filesystem, IndexedDB, backend). No hay restricciones de tamaño.
6. **Reanudación**: `resumeLoop()` y restaurar música.

## 5. Flujo de carga propuesto

1. **Selección y validación**: elegir save, validar `schemaVersion` y checksum.
2. **Preparación**: `pauseLoop()` y mostrar overlay/placeholder (similar al fade de `restartWithContext`).
3. **Rehidratación por capas**:
   - `RuntimeUniverseAdapter.apply(snapshot)` → usa `UniverseStateSnapshotService.applySnapshot` para reconstruir sol, planetas, portales, clusters. Aprovecha la infraestructura ya usada por respawn.
   - `GameStateSnapshotAdapter.import(dto)` → restablece colecciones y caches (planet intel, misiones, anchors, logs).
   - `PlayerStateSerializer.apply()` → posiciona nave, salud, void energy, orientation (idéntico a `applyPlayerResetState` con extras).
   - `SystemsSerializer.apply()` → timers, lesser beings persistidos, flags de ritos, audio.
4. **HUD/UI**: notificar a `HUDManager` y `UIManager` para refrescar overlays, misiones y tooltips.
5. **Reinicio del loop**: `resumeLoop()` + `MusicDirector.setScene(savedScene)`.
6. **Post-verificación**: sanity check (p. ej. colisiones reactivas limpias, anchors presentes, misiones consistentes).

## 6. Plan de trabajo incremental

1. **Fase A – Documentación y contratos**
   - Definir `SaveGamePayload` TypeScript con todos los campos necesarios.
   - Añadir métodos `exportSnapshot()` / `importSnapshot()` en `GameStateStore` (limitados a datos inmutables, sin referencias WebGL).

2. **Fase B – Serialización mínima jugable**
   - Implementar `GamePersistenceService` con guardado/carga básico (nave + sistema actual + inventario + anchor).
   - Punto de entrada temporal vía consola o comando rápido.

3. **Fase C – Cobertura total**
   - Añadir soporte para lesser beings, portales enlazados, misiones, logs, timers, ritos activos.
   - Incluir estado de audio/música y UI (paneles activos, wiki, debug overlay).

4. **Fase D – Calidad y UX**
   - UI de selección de partidas, previsualización (sistema, fecha, anchor).
   - Autosave opcional (al aterrizar, al grabar sello, antes/después de gate rite).
   - Tests de regresión (cargar un save en un build nuevo).

## 7. Riesgos y mitigaciones

- **Consistencia referencial**: Los IDs de planetas/portales deben sobrevivir entre guardado y carga. Se mitigará usando snapshots completos del sistema en lugar de regeneración procedural.
- **Evolución del schema**: Toda carga debe pasar por un adaptador `migrateSave(payload)` que actualice versiones antiguas.
- **Tamaño del JSON**: no crítico, pero conviene comprimir/streaming cuando se envíe a backend.
- **Dependencias WebGL**: No serializar objetos WebGL ni referencias a `GameObject` vivos; siempre reconstruir a partir de snapshots.

## 8. Cómo encaja con el Respawn Sigillum

- Las mejoras recientes (snapshot del sello + limpieza al reiniciar) garantizan que siempre existe un snapshot consistente para al menos un punto de retorno.
- El pipeline de `restartWithContext` será el mismo utilizado por `GamePersistenceService.loadGame()`, con parámetros adicionales para inventario y stats.
- Guardar justo después de grabar un sello permitirá que el jugador reanude exactamente en esa condición, ya que ambos sistemas comparten metadatos (`respawnAnchorId`, `snapshotLabel`).

---

Con este plan, el trabajo de respawn deja explícitos los hooks necesarios (pausa/resume, snapshots, metadata) y establece las bases para serializar/deserializar el estado completo del juego sin reescribir el motor. El siguiente paso es materializar los adapters y acordar el contrato JSON (`SaveGamePayload`).
