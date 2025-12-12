# Savegame · Fase 0 (Investigación y contratos)

> Referencia cruzada: `documentation/plans/savegame-cloud-integration.md`.
>
> Objetivo: enumerar qué datos podemos serializar hoy sin modificar el motor y definir el contrato mínimo que necesita la API de Cloud Saves para almacenar partidas reales.

## Resumen ejecutivo
- Las cuatro fuentes auditadas (GameStateStore, PortalPersistenceService, RespawnService y Spaceship) exponen getters y estructuras listas para clonar sin acoplarse a WebGL o DOM.
- No hay blockers técnicos para capturar objetos, portales, misiones ni anchors; sólo necesitamos un orquestador (`GamePersistenceService`) que combine los snapshots actuales.
- El payload puede mantenerse por debajo de 400 KB si evitamos buffers binarios y registramos el tamaño en logs (`LogCategory.SAVE_SYSTEM`).
- El backend de Cloud Saves acepta `savegame: unknown`; acordamos enviar `metadata` explícita (fecha, sistema, anchor, duración y versión) para facilitar listados y migraciones.

## Fuentes auditadas

### GameStateStore (`src/app/services/game/game-state.store.ts`)
- **Colecciones vivas**: asteroides (tres familias), planetas, portales, debris y Lesser Beings indexados por sistema (`lesserBeingMemoryBySystem`).
- **Entidades clave**: `spaceship`, `sun`, `camera`, `respawnAnchor`, `defaultRespawnAnchor` y `activeLandingPlanet`.
- **Estado narrativo/UI**: `characterProfile`, `personalGear`, `equipmentLoadout`, `cargoManifest`, `knownSpells`, `grimoireGlyphLayout`, misiones activas (`activeMissions`), intel planetario + historial de aterrizajes, timers de paneles (`mapReopenAllowedAtMs`, etc.) y flags de loop (`gameRunning`, `frameCount`).
- **Snapshots utilitarios**: métodos `getAllObjects()`, `getPlanetIntelSnapshot()`, `getActiveMissionsSnapshot()`, `getLesserBeingSnapshots()`, `getGrimoireGlyphLayoutSnapshot()`, `getRespawnAnchor()` → listos para clonado profundo.
- **Conclusión**: servirá como fuente para las secciones `player`, `gameState` y parte de `universe` (colecciones auxiliares que no dependen de geometría).

### PortalPersistenceService (`src/app/game/services/game/portal-persistence.service.ts`)
- Mantiene snapshots etiquetados (`save`, `autoLabelAndSave`) con meta `snapshotLabel`, `persistentSystemId`, `proceduralSystemId` y los portales serializados.
- Puede aplicar snapshots directamente (`apply`) y sincroniza índices `portalIndex`/`systemIndex`, lo que evita referencias rotas al rehidratar.
- Dispone de `list()` y `findByPortalId()` que usaremos para enriquecer `metadata.systemName` y `metadata.anchorLabel` cuando estemos guardando desde un sistema previamente archivado.
- **Conclusión**: es la fuente para `universe` cuando queramos persistir estados fuera del sistema activo o validar consistencia antes de guardar.

### RespawnService (`src/app/game/services/state/respawn.service.ts`)
- Already pausa/resume el loop y construye `PlayerResetState` (posición, velocidad, salud nave, energía del vacío, stats del piloto) desde el anchor vigente.
- Expone helpers para resolver anchors (`getEffectiveRespawnAnchor`) y normaliza energía/vida en escenarios de muerte (`resolveCharacterStats`).
- **Conclusión**: podemos reutilizar su lógica para `GamePersistenceService.loadGame()` y compartir utilidades para pausar audio/loop durante `saveGame()`.

### Spaceship (`src/app/game/game-objects/Spaceship.ts`)
- Contiene orientación en quaternion/matriz (`getOrientationQuaternion()`, `getOrientationMatrix()`), estado físico (`currentSpeed`, `targetSpeed`, `maxSpeed`, aceleraciones), energía del vacío (`voidEnergyCurrent/Max`, `outOfVoidEnergy`, `driftVelocity`), capacidad de carga y controles.
- Getter/setter reactivo de salud + callbacks nos permiten tomar `healthCurrent/Max` sin tocar WebGL.
- Rastrea layout y recursos útiles (thruster state, cargo, void energy pause) que complementarían la sección `player.ship` del payload.
- **Conclusión**: necesitaremos exponer un snapshot compacto (posición, velocidad, orientación, energía, carga) pero no hay dependencias con GPU, por lo que basta con leer propiedades públicas al serializar.

## Riesgos/Gaps detectados
- **Matriz/Quaternion**: la nave ya expone métodos, pero GameStateStore no almacena la orientación → `PlayerStateSerializer` deberá leerla directamente del objeto `Spaceship` activo.
- **Timers UI**: almacenamos `mapReopenAllowedAtMs`/`grimoireReopenAllowedAtMs` como number; debemos decidir si resetearlos al cargar (propuesta: serializarlos dentro de `gameState.timers`).
- **Audio**: el único dato accesible hoy es `audio.currentScene` desde `UniverseStateSnapshotService`; cualquier otro estado (volúmenes, capas activas) sigue fuera de alcance. Se marcará como `TODO` dentro de la sección opcional `audio`.

## Contrato propuesto para Cloud Saves
- **Metadata mínima** (en cada slot):
  - `schemaVersion` (número entero, inicia en `1`).
  - `savedAt` (epoch ms) y `elapsedPlayTimeMs`.
  - `systemId` y `systemName` (si existe snapshot etiquetado).
  - `anchorLabel` + `anchorPlanet` (para identificar rápidamente el punto de respawn).
  - `buildLabel` (ej. `TO3.2025.11`) y `userId` (Cognito `sub`).
- **Límites**: registrar en logs el tamaño comprimido y sin comprimir (`JSON.stringify(payload).length`) para confirmar que mantenemos < 500 KB. El backend no impone tamaño hoy, pero notificarán si excedemos 1 MB.
- **Errores**: Cloud Saves seguirá tratando `savegame` como `unknown`; `GamePersistenceService` validará `schemaVersion` y devolverá códigos propios para `schemaUnsupported`, `payloadTooLarge` o `deserializationFailed`.

## Próximos pasos
1. Definir `SaveGamePayload` v1 en TypeScript reutilizando los tipos existentes (`SerializedUniversePayload`, `PlayerResetState`, etc.).
2. Implementar `GamePersistenceService` siguiendo los adapters planeados (Fase 1).
3. Integrar con `CloudSavesService` (Fase 3) enviando el metadata descrito arriba y midiendo tamaño/tiempo de captura.
