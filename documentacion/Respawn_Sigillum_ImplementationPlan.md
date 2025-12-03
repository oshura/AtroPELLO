# Plan de Implementación: Respawn Sigillum Persistente

## 1. Objetivos y Condicionantes
- **Persistir el mundo**: Tras cualquier muerte (nave destruida o avatar con salud/cordura < 1) el estado completo de sistemas solares, portales, asteroides, NPCs, clusters, etc. debe permanecer exactamente como estaba antes del respawn. Solo se reinician la nave/jugador (posición, salud, void energy) y se restaura a `1` la estadística (salud o cordura) que provocó la muerte.
- **Respawn anclado**: La reaparición debe ocurrir en el sistema solar, posición y orientación capturados por el Respawn Sigillum, independientemente de dónde ocurra la muerte.
- **Reutilización futura**: La solución debe escalar para cargar partidas serializadas completas ("Game Save Load"), donde el arranque no reinicia nada sino que reconstruye exactamente el estado persistido.
- **Clean Code**: Mantener los principios documentados en `CleanCode_Arquitectura.md` (enums fuertes, servicios especializados, cero strings mágicos, separación por responsabilidades).

## 2. Estado Actual (resumen)
- `GameEngine.respawnGame()` (ver `Generacion_Sistemas_Solares.md` §4) limpia colecciones, regenera el sistema humano y reubica la nave al inicio del trail → **rompe el requisito de persistencia**.
- El `GameStateStore` ya centraliza colecciones y flags (`Analisis_GameStateStore.md`), pero no expone aún snapshots listos para reaplicar ni operaciones para congelar/descongelar mundos.
- El Respawn Sigillum guarda metadatos de posición/sistema en el store, pero no captura snapshots completos ni existe un servicio que los aplique durante el respawn.

### 2.1 Reutilización del pipeline de portales
Cuando la nave atraviesa un portal (Gate Rite o portal persistente) el juego **ya** dispone de un flujo sólido:
1. `PortalPersistenceService` / `SolarSystemService` localizan o generan el snapshot del sistema destino.
2. Se pausa el loop, se aplican los datos del sistema destino directamente sobre el `GameStateStore` y servicios satélite (clusters, target catalog) reutilizan los objetos vivos.
3. La nave existente se reubica frente al portal de salida y se reanuda el loop.

Este pipeline evita copiar colecciones si el sistema sigue en memoria y sólo recurre a snapshots al cambiar de sistema. La nueva arquitectura debe **encapsular** este mismo mecanismo para respawn/carga de partidas en lugar de reconstruirlo desde cero.

## 3. Arquitectura Propuesta
### 3.1 Capas y Servicios
1. **`UniverseStateSnapshotService`** (nuevo)
  - Envuelve el pipeline actual de portales y expone dos modos:
    - **Live reuse**: si el sistema del anchor es el mismo que ya está cargado, simplemente exporta una vista del `GameStateStore` sin clonar colecciones.
    - **Snapshot restore**: si el sistema es distinto, delega en `PortalPersistenceService` / `SolarSystemService` para cargar el snapshot y aplicarlo al store, igual que hace hoy el salto por portal.
  - Provee operaciones incrementales (`captureRuntimeState()`, `applyRuntimeState()`, `ensureSystemLoaded()`) pero evitando duplicar objetos cuando no es necesario.

2. **`GameRestartService`** (nuevo)
   - Responsabilidad: preparar un `GameStartContext` dado (sistema, snapshot a aplicar, posición/orientación inicial, resets de energía) y coordinar con `GameEngine` para pausar, limpiar solo lo mínimo y reanudar el loop.
   - Expondrá `restartWithContext(context: GameStartContext)` usado tanto por respawn como por carga de partidas.

3. **`RespawnService`** (nuevo, orquestador)
   - Orquesta la secuencia de respawn:
     1. Congela loop (`GameEngine.pauseLoop()` o flag).
     2. Obtiene anchor activo (`RespawnAnchorMetadata`).
     3. Solicita al `UniverseStateSnapshotService` el snapshot correspondiente al sistema del anchor (si no está en memoria, lo carga del almacén/snapshot).
     4. Calcula `PlayerResetState` (posición del anchor, velocidad cero, salud/cordura/void reestablecidos, clamps a 1) y `EnvironmentalResets` (limpiar proyectiles, efectos temporales).
     5. Llama a `GameRestartService.restartWithContext()`.
     6. Reanuda loop y dispara eventos HUD (mensajes, animaciones).
   - Expone variantes: `respawnFromDeath(reason: DeathReason)` y `respawnAtAnchor(anchorId)`.

4. **`GameStateSerializer`** (extensión futura)
   - Serializa/deserializa `GameSaveSnapshot` (todo el runtime), reutilizando las piezas anteriores. Permite implementar "Load Game" sin duplicar lógica.

### 3.2 Modelos de Datos Clave
- `RespawnAnchorMetadata` (ya existe) → ampliar para incluir `systemId`, `solarSnapshotId`, `playerOrientation`, `shipVelocity`, `timestamp`.
- `RuntimeSolarSystemState`
  ```ts
  interface RuntimeSolarSystemState {
    systemId: string;
    snapshotId: string; // referencia original (humano, procedural, portal)
    objects: SerializedGameObject[]; // planetas, asteroides, lesser beings, portales, clusters, debris
    environmentalFx: EnvironmentalState;
    lastUpdatedAt: number;
  }
  ```
- `GameStartContext`
  ```ts
  interface GameStartContext {
    targetSystemId: string;
    runtimeState: RuntimeSolarSystemState;
    respawnAnchor?: RespawnAnchorMetadata;
    playerState: PlayerResetState;
    restartReason: 'RESPAWN' | 'LOAD_GAME' | 'DEBUG';
  }
  ```
- `PlayerResetState`
  ```ts
  interface PlayerResetState {
    position: Vector3;
    orientation: Quaternion | Matrix4;
    velocity: Vector3;
    shipHealth: { current: number; max: number };
    voidEnergy: number;
    sanity: number;
    vitality: number;
    restoredStat: 'health' | 'sanity' | 'void' | null; // clamp a 1
  }
  ```

## 4. Flujos Propuestos
### 4.1 Respawn Completo
1. **Detección de muerte** (`GameEngine.checkPlayerState()`): determina `deathCause` (`SHIP_DESTROYED`, `ZERO_HEALTH`, `ZERO_SANITY`).
2. **RespawnService.respawnFromDeath(cause)**:
   - Congela loop + audio (reutiliza `setAudioPausedForGame(true)`).
   - Lee anchor activo. Si no existe, usa fallback (sistema actual + posición segura).
   - Pide a `UniverseStateSnapshotService` (internamente reutiliza la ruta de portales):
     ```ts
     const runtime = worldState.ensureSystemState(anchor.systemId);
     ```
   - Construye `PlayerResetState` (restaurando la estadística que llegó < 1 a valor `1`).
   - Solicita `GameRestartService.restartWithContext({ targetSystemId, runtimeState: runtime, respawnAnchor: anchor, playerState, restartReason: 'RESPAWN' })`.
   - Reinicia HUD overlays (impactos, warning) y reanuda loop.
   - Publica evento `gameEvents.emit('respawn-complete', context)` para HUD/panels.

3. **GameRestartService** realiza:
   - `gameEngine.prepareForRestart()` → limpia timers efímeros, colas de audio, listeners, pero **NO** destruye colecciones persistentes del store.
   - `worldState.applyRuntimeState(context.runtimeState)` → rehidrata objetos en store (o confirma que ya están presentes y actualiza diffs).
   - `playerStateService.applyPlayerReset(context.playerState)` → mueve nave, resetea salud/void/cápsulas, limpia fuerzas.
   - `gameEngine.resumeLoop()`.

### 4.2 Carga de Partida Serializada (futura)
- Flujo idéntico excepto que `GameStateSerializer.load(snapshotId)` provee `GameStartContext` completo (no se tocan stats).
- `RespawnService` no participa; `GameLoadService` invoca directamente `GameRestartService` con `restartReason: 'LOAD_GAME'`.

## 5. Fases de Implementación
| Fase | Descripción | Artefactos/Notas |
| ---- | ----------- | ---------------- |
| 0. Auditoría | Inventariar qué colecciones del `GameStateStore` necesitan serialización completa (clusters, debris, HUD state, NPCs). Añadir métricas para saber cuándo cambian. | Logging + doc.|
| 1. Modelado de estado | Definir interfaces `RuntimeSolarSystemState`, `PlayerResetState`, `GameStartContext` y ampliar `RespawnAnchorMetadata`. Crear mapeos enum-friendly siguiendo `CleanCode_Arquitectura`. | Nuevos `.types.ts` |
| 2. UniverseStateSnapshotService | Encapsular el pipeline actual de portales (`PortalPersistenceService` + `SolarSystemService`) para exponer `ensureSystemState` (reuse/snapshot) y `captureRuntimeState`. | Servicio nuevo en `game/services/state/` |
| 3. GameRestartService + RespawnService | Refactorizar `GameEngine.respawnGame()` para delegar en servicios, implementar lógica de restauración de stats y clamps. Integrar con UniverseStateSnapshotService en modo reuse/snapshot. | Nuevos servicios + tests |
| 4. Integración Spell | Actualizar Respawn Sigillum para guardar snapshotId/systemId y disparar `UniverseStateSnapshotService` cuando se inscribe el glifo. | Spell + store |
| 5. QA y Telemetría | Añadir hooks de verificación (p.ej. comparar hashes de objetos antes/después) y comandos debug (`/respawn-now`, `/load-anchor`). | Debug panel |
| 6. Ready for Save/Load | Exponer `GameRestartService` públicamente y bosquejar `GameStateSerializer` para partidas guardadas. | Diseño extendido |

## 6. Checklist de Seguimiento
- [ ] Inventario de colecciones y dependencias del `GameStateStore` completado.
- [ ] Nuevos tipos (`RuntimeSolarSystemState`, `GameStartContext`, `PlayerResetState`) definidos y exportados.
- [ ] `UniverseStateSnapshotService` implementado con pruebas unitarias mínimas (snapshot ↔ apply).
- [ ] `RespawnAnchorMetadata` ampliado con referencia a snapshot/system.
- [ ] `RespawnService` creado y `GameEngine.respawnGame()` delega en él.
- [ ] `GameRestartService` realiza restart sin recrear el sistema humano.
- [ ] Reglas de restauración de salud/cordura/void aplicadas (clamp a 1).
- [ ] Respawn Sigillum dispara captura/actualización de snapshots.
- [ ] Documentación de flujo actualizada (`documentacion/Generacion_Sistemas_Solares.md` y wiki HUD/HUD overlay si aplica).
- [ ] Hooks preparados para `GameStateSerializer` (fase futura save/load).

## 7. Riesgos y Mitigaciones
- **Desincronización de buffers WebGL**: Reutilizar objetos existentes sin llamar a `initBuffers` puede dejar VBOs invalidados. Mitigación: `UniverseStateSnapshotService.applyRuntimeState` debe decidir si clona objetos o rehidrata datos y vuelve a llamar a `initBuffers` cuando `vertexBuffer` sea nulo.
- **Memoria**: Mantener estado completo de múltiples sistemas simultáneamente puede ser costoso. Estrategia: snapshot diferido + delta compression (guardar solo objetos tocados desde snapshot base) y liberar sistemas no anclados.
- **Condiciones de carrera**: Pausar/resumir el loop en mitad de una actualización podría causar inconsistencias. Solución: `GameRestartService` debe sincronizar con el `gameLoop` (flag + `requestAnimationFrame` cancel) antes de aplicar snapshots.
- **Compatibilidad futura de guardados**: Versionar los modelos (`schemaVersion`) dentro de cada snapshot para soportar migraciones.

## 8. Próximos Pasos Inmediatos
1. Escribir especificaciones detalladas de `RuntimeSolarSystemState` enumerando qué propiedades de cada objeto requieren persistencia (health, posición orbital, timers).
2. Refactorizar `GameEngine.respawnGame()` para que únicamente coordine con `RespawnService`, el cual llamará al mismo flujo que hoy usa un salto de portal antes de reposicionar la nave.
3. Prototipar `UniverseStateSnapshotService.ensureSystemState()` reutilizando `PortalPersistenceService`/`SolarSystemService`; `captureRuntimeState()` sólo debe clonar cuando se vaya a persistir o cargar otro sistema.

Con este plan podremos garantizar que el Respawn Sigillum cumpla los requisitos de persistencia y además establecer las bases para el sistema de partidas guardadas.

## 9. Inventario GameStateStore (Fase 0)
Resumen de todo lo que el futuro `UniverseStateSnapshotService` debe contemplar al capturar/restaurar estado. Sirve como checklist granular antes de escribir código.

| Dominio | Propiedades / Servicios | ¿Debe persistir para respawn? | Notas para snapshot |
| --- | --- | --- | --- |
| **GameObjects** | `independentAsteroids`, `superAsteroids`, `megaAsteroids`, `planets`, `portals`, `planetDebris` | Sí (crítico) | Guardar posición, rotación, escala, salud restante, flags (visited, inhabitants, links de portal, debris mapping). Rehidratar respetando IDs para no invalidar referencias externas. |
| **Entidades únicas** | `spaceship`, `sun`, `camera` | Parcial | Nave se resetea con `PlayerResetState`, pero su modelo base debe quedar intacto. Sol/cámara deben conservar orientación y settings (rendereos). |
| **Lesser Beings** | `lesserBeingMemoryBySystem` | Sí | Mantiene comportamiento/NPC state incluso fuera del sistema activo. Requiere merge por `systemId`. |
| **Intel planetario** | `planetIntelById`, `landingStatus`, `landingThreat`, `landing log` helpers | Sí | Respawn no debe borrar descubrimientos, misiones ni historiales. Snapshot debe clonar estructuras profundas (resource stock, landing logs). |
| **Misiones** | `activeMissions` | Sí | Debe conservar progreso/logs para no romper quest chains. Usar `cloneMissionState`. |
| **Archivo procedimental** | `proceduralSystemArchive` (historial Gate Rite) | Sí (persistencia cross-system) | Necesario para volver a cargar sistemas procesales ya visitados. Limitarse a `PROCEDURAL_ARCHIVE_LIMIT`. |
| **Anchor / spell metadata** | `respawnAnchor`, `knownSpells`, `grimoireGlyphLayout` | Sí | Anchor es base del respawn. Layout/spell set afectan HUD → conservarlos. |
| **Inventario y personaje** | `characterProfile`, `memoryPercent`, `personalGear`, `equipmentLoadout`, `cargoManifest` | Sí | Respawn solo ajusta salud/sanidad y void energy; el resto debe permanecer como se dejó. |
| **Cooldowns / Flags** | `gameRunning`, `lastFrameTime`, `frameCount`, `map/grimoire/inventory reopen`, `collisionCooldowns`, `dopplerCues`, `mapIdToTarget` | Selectivo | Loop metadata se recalcula al reiniciar, pero cooldowns/targets afectan UX (p.ej. no reaparecer con HUD spameable). Decidir qué se recalcula vs. persiste; por defecto conservar y limpiar solo donde haya side-effects indeseados. |
| **Servicios Satélite** | `AsteroidClusterService.getClusters()`, `PortalPersistenceService` snapshots, `TargetCatalogService` | Coordinación | No viven en el store, pero UniverseStateSnapshotService debe orquestar su captura/aplicación (clusters "+ offsets" y portales enlazados). |

### Observaciones del inventario
- Mayoría de colecciones expuestas por `GameStateStore` ya tienen helpers de clonación → podemos reutilizarlos en el snapshot service (p.ej. `getPlanetIntelSnapshot`, `cloneMissionState`).
- Elementos que SÍ pueden resetearse durante respawn: buffers WebGL efímeros, colas de audio, timers internos del `GameEngine`. No pertenecen al store y los cubrirá `GameRestartService.prepareForRestart()`.
- Pendiente analizar dónde reside el estado de `AsteroidClusterService` (IDs de clusters, proxies LOD) para decidir si el snapshot debe persistir miembros individuales o reconstruirlos a partir de los asteroides listados en el store.

**Resultado Fase 0**: inventario completado; se usará como referencia para los tipos (`RuntimeSolarSystemState`, `PlayerResetState`, etc.) y para la API del `UniverseStateSnapshotService` en las siguientes fases.

## 10. Diseño RespawnService + GameRestartService (Fase 1.5)

### 10.1 Responsabilidades claves
- **RespawnService** (orquestador)
  - `respawnFromDeath(cause: DeathReason)`
  - `respawnAtAnchor(anchorId?: string)` (para pruebas / comandos debug)
  - `respawnToDefault()` (fallback cuando no hay sigillum)
  - Pasos internos:
    1. `pauseLoopAndAudio()` → utiliza `GameEngine.stopTick()` (o flag) + `setAudioPausedForGame(true)`.
    2. Obtener anchor (`GameStateStore.getRespawnAnchor()`); si es `null`, resolver fallback (`HumanSolarSystemService` snapshot inicial, etiqueta `startup`).
    3. Invocar `UniverseStateSnapshotService.ensureSystemState(anchor.systemId)`; si el sistema ya está cargado, modo LIVE; si no, pipeline de portales/snapshots.
    4. Construir `PlayerResetState`:
       - Posición = `anchor.shipPosition` o default trail spawn.
       - Orientación = `anchor.shipOrientation` → se reinyecta en la nave si existe.
       - Velocidad = clamp a 0 salvo que `airborneCapture` requiera conservar momentum.
       - Salud/Sanidad/Void: restaurar a máximos, pero si la muerte fue por `ZERO_SANITY` o `ZERO_HEALTH`, clamp la estadística causante a `1` y el resto a valores previos.
    5. Llamar a `GameRestartService.restartWithContext(context)`.
    6. Reanudar loop/audio, emitir eventos (`hudEvents.emit('respawn-complete')`), limpiar overlays y logs.

- **GameRestartService** (reinicio parametrizable)
  - API principal: `restartWithContext(ctx: GameStartContext)`.
  - Pasos internos:
    1. `gameEngine.prepareForRestart()` → cancela `requestAnimationFrame`, detiene colisiones temporales, purga timers efímeros, reinicia cooldowns voluntarios.
    2. `universeState.applyRuntimeState(ctx.runtimeState)`:
       - Si `source === LIVE`, no hace nada (estado ya cargado).
       - Si `source === SNAPSHOT|ARCHIVE`, ya se aplicó por `ensureSystemState`; sólo garantiza que clusters/portales y caches estén sincronizados.
    3. `playerStateService.applyPlayerReset(ctx.playerState)` → reubica nave, resetea fuerzas, setea salud/sanidad/void.
    4. `gameEngine.resumeLoop()` + `setAudioPausedForGame(false)`.
    5. Actualiza HUD (void energy meter, health bars, sanity) y re-sincroniza paneles.

### 10.2 Dependencias y colaboraciones
| Servicio | Uso específico |
| --- | --- |
| `GameEngine` | Pausa/reanudación del loop, acceso a nave, HUD managers y audio. |
| `GameStateStore` | Obtener anchor, estadísticas del piloto, caches (missions, portals). |
| `UniverseStateSnapshotService` | Reutiliza pipeline de portales; produce `RuntimeSolarSystemState`. |
| `GameRestartService` | Aplicar el contexto final sin duplicar lógica en `RespawnService`. |
| `HumanSolarSystemService` | Proveer fallback snapshot inicial cuando no hay sigillum. |
| `PortalPersistenceService` | Resolución de snapshots etiquetados (p. ej. `gate-origin-linked`). |
| `LoggingService` | Trazabilidad del respawn (desde causa de muerte hasta systemId cargado). |
| `HUDManager` / `AnimationManager` | Reiniciar overlays (impact, death fade) y reproducir animaciones de reaparición. |

### 10.3 Flujos resumidos
1. **Respawn con ancla válida**: `RespawnService` toma anchor → `UniverseStateSnapshotService.ensureSystemState(anchor.systemId)` → `GameRestartService.restartWithContext()`.
2. **Respawn sin ancla**: `RespawnService` crea pseudo-anchor usando snapshot inicial humano (posición trail + orientación por defecto) → resto igual.
3. **Compatibilidad futuras partidas guardadas**: `GameLoadService` saltará `RespawnService` y llamará directamente a `GameRestartService` con un `GameStartContext` construido por `GameStateSerializer`.

### 10.4 Entregables Fase 1.5
- Interfaces públicas:
  - `RespawnService.respawnFromDeath(cause: DeathCause)`
  - `RespawnService.respawnAtAnchor(anchorId?: string)`
  - `GameRestartService.restartWithContext(ctx: GameStartContext)`
- Helpers internos: `buildPlayerResetState(anchor, cause)` reutilizable para debug respawns.
- Documentación añadida al plan y wiki (este bloque + futuras notas en `Generacion_Sistemas_Solares.md`).
