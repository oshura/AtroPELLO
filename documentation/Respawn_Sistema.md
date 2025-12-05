# Sistema de Respawn Sigillum

> Última actualización: diciembre 2025 · Responsable: Game Systems Team.

Este documento describe el comportamiento actual del sistema de respawn, desde el grabado del Sigillum hasta los flujos de reaparición con y sin ancla personalizada. También detalla las responsabilidades de cada servicio y los puntos de extensión que se reutilizarán cuando se active el plan de guardado/carga descrito en `Respawn_Sigillum_y_SaveSystem.md`.

## 1. Objetivos y Condicionantes
- **Persistir el mundo**: tras una muerte, el estado de los sistemas solares, portales, NPCs, clusters y registros debe quedar intacto; únicamente la nave y el piloto se reinician.
- **Respawn anclado**: si existe un Sigillum, la reaparición ocurre exactamente en el `systemId`, posición y orientación capturados durante el grabado.
- **Respawn seguro sin Sigillum**: cuando no hay anclas personalizadas, el juego debe reaparecer al jugador en el inicio del trail terrestre del sistema humano, nunca en las cercanías del sol ni en sistemas procedurales.
- **Compatibilidad futura**: la arquitectura debe ser reutilizable por el sistema de guardado/carga completo sin duplicar lógica.
- **Clean Code**: cumplir las pautas de `CleanCode_Arquitectura.md` (enums fuertes, servicios especializados, cero strings mágicos, logging consistente).

## 2. Componentes Clave
| Componente | Responsabilidad |
| --- | --- |
| `GameEngine` | Coordina gameplay y render, expone `castRespawnSigillum()`, `restartWithContext()` y utilidades para pausar/reanudar el loop.
| `GameStateStore` | Mantiene el estado del juego, incluyendo dos anclas: `respawnAnchor` (activo) y `defaultRespawnAnchor` (seed inicial del trail humano).
| `RespawnService` | Orquesta el flujo completo de respawn: pausa el loop, obtiene el ancla efectiva, construye el `GameStartContext` y llama a `GameEngine.restartWithContext()`.
| `UniverseStateSnapshotService` | Abstrae la aplicación de snapshots de sistemas solares (reuse/live vs snapshot restore) y construye el contexto de reinicio.
| `GameRestartService` (implícito en `GameEngine.restartWithContext`) | Aplica `PlayerResetState`, limpia efectos efímeros y reanuda el loop/audio.
| `HumanSolarSystemService` | Genera el snapshot canónico del sistema humano y los clusters del trail; sus datos se usan para seedear el ancla por defecto.
| `PortalPersistenceService` | Guarda snapshots etiquetados (p. ej. `respawn-anchor-latest`) que permiten rehidratar cualquier sistema enlazado a un Sigillum.

## 3. Modelos de Datos
### 3.1 `RespawnAnchorMetadata`
Campos relevantes:
- `anchorId`, `systemId`, `snapshotId`, `snapshotLabel`.
- `shipPosition`, `shipVelocity`, `shipForward`, `shipOrientation` (`OrientationSnapshot` con quaternion/matriz/forward/up).
- `landingSite` (`surfacePoint`, `surfaceNormal`, `radius`) cuando el sello se graba durante un aterrizaje.
- `planetId`, `planetName`, `notes`, `createdAt`, `airborneCapture`.
- `label` utilizado por HUD y wiki.

### 3.2 `PlayerResetState`
```ts
interface PlayerResetState {
  position: Vector3;
  velocity: Vector3;
  orientation: OrientationSnapshot | null;
  shipHealth: { current: number; max: number };
  voidEnergy: number;
  sanity: number;
  vitality: number;
  restoredStat: 'health' | 'sanity' | 'void' | null;
}
```
- Se calcula en `RespawnService.buildPlayerResetState()`. Si la muerte fue por `ZERO_HEALTH` o `ZERO_SANITY`, la estadística implicada se clampa a `1` y se registra en `restoredStat` para mostrar mensajes en HUD.

### 3.3 `GameStartContext`
```ts
interface GameStartContext {
  targetSystemId: string;
  runtimeState: RuntimeSolarSystemState;
  respawnAnchor?: RespawnAnchorMetadata;
  playerState: PlayerResetState;
  restartReason: 'RESPAWN' | 'LOAD_GAME' | 'DEBUG';
}
```
- `runtimeState` es provisto por `UniverseStateSnapshotService` y determina si se reutiliza el sistema vivo o se aplica un snapshot.

### 3.4 Void Energy tras el respawn
- `RespawnService.resolveVoidEnergy()` siempre toma `voidEnergyMax` del fuselaje y cae con log WARN a `voidEnergyCurrent`/100 cuando el valor máximo falta en snapshots viejos. Esto garantiza que los nuevos respawns parten con la reserva completa, independientemente del estado en el momento de la muerte.
- `GameEngine.applyPlayerResetState()` delega en `Spaceship.applyRespawnVoidEnergy(maxValue, RESPAWN_VOID_ENERGY_PAUSE_MS)` para rellenar la barra y pausar el consumo durante 1.2s, evitando drenajes espurios mientras el loop reposiciona la nave.
- Se registra un log INFO (`Respawn void energy restored`) con el valor aplicado, el máximo y el `restoredStat` (para correlacionar muertes por cordura, salud o vacío) sin generar mensajes adicionales en HUD/Marquee.

## 4. Flujo de Respawn
### 4.1 Grabado del Sigillum
1. El jugador activa `GameEngine.castRespawnSigillum()` (requiere nave disponible).
2. Se obtiene `LandingApproachContext` si existe (planeta, normal, datos de vida). Caso contrario, se marca como `airborneCapture`.
3. `buildRespawnAnchorMetadata()` captura posición/orientación de la nave, genera un `anchorId` y llama a `persistRespawnSnapshot()` para etiquetar el snapshot activo en `PortalPersistenceService`.
4. `GameStateStore.setRespawnAnchor()` almacena una copia inmutable y se emiten mensajes HUD/audio (`Respawn Sigillum · <label>`).

### 4.2 Seed del ancla por defecto
- Durante la generación del sistema humano (`bootstrapDefaultRespawnAnchor()`), el motor construye un anchor sin contexto de aterrizaje y lo guarda mediante `GameStateStore.setDefaultRespawnAnchor(anchor, { activateWhenMissing: true })`.
- Este anchor representa la entrada del trail terrestre (posición segura, orientación perpendicular a la Tierra) y queda disponible incluso después de limpiar un Sigillum.

### 4.3 Respawn estándar (con Sigillum)
1. `RespawnService.respawnFromDeath(cause)` pausa loop/audio.
2. `resolveEffectiveAnchor()` obtiene el ancla forzada (debug) o la activa (`GameStateStore.getEffectiveRespawnAnchor()`), nunca `null`.
3. Se construye `PlayerResetState` con stats ajustadas según la causa de muerte.
4. `UniverseStateSnapshotService.buildRestartContext()` recibe:
   - `targetSystemId = anchor.systemId`.
   - `snapshotOptions` con `snapshotId`/`snapshotLabel` para rehidratar el sistema correcto.
5. `GameEngine.restartWithContext(context)` detiene animaciones, llama a `applyPlayerResetState()`, sincroniza vitals y reanuda el loop con `startLoopAfterRestart()`.
6. HUD muestra mensajes (`Respawn: <label>`, `Cordura estabilizada...`) y sensores quedan limpios.

### 4.4 Respawn sin Sigillum
- Si el jugador no tiene anclas personalizadas, `GameStateStore.getEffectiveRespawnAnchor()` devuelve el `defaultRespawnAnchor` seedeado en el trail humano.
- El respawn ocurre siempre en `systemId = human-system`, con snapshot generado por `HumanSolarSystemService`. Ya no existe el fallback que reposicionaba cerca del sol.
- El `respawnAnchor` activo puede seguir `null`; el default se usa únicamente como fuente para la reaparición.

### 4.5 Debug / comandos
- `RespawnService.respawnAtAnchor(anchorId)` permite forzar anclas existentes (activas o default). Si el ID no coincide, el método devuelve `null` y no se intenta respawn.

## 5. Observabilidad y Logs
- Cada operación relevante se registra con `LogCategory.GAME_LOOP`:
  - Seed del anchor por defecto.
  - Grabado de Sigillum (`anchorId`, `systemId`, `planetName`).
  - Contexto aplicado en `restartWithContext()` (`reason`, `runtimeSource`, `restoredStat`).
  - Errores durante pausa/reanudación del loop o sincronía de vitals.
- Telemetría mínima pendiente: duración del respawn, ancla utilizada, causa de muerte y número de intentos (para tuning de balance).

## 6. Integración con el Plan de Guardado/Carga
- `Respawn_Sigillum_y_SaveSystem.md` define `GamePersistenceService` y el payload JSON que serializará `respawnAnchorId`, snapshots y `PlayerResetState`.
- Los servicios descritos aquí ya realizan:
  - Pausa/reanudación segura del loop/audio.
  - Aplicación de snapshots (`UniverseStateSnapshotService`).
  - Rehidratación de stats y HUD (`GameEngine.restartWithContext`).
- Al cargar una partida se reutilizará exactamente el mismo pipeline, cambiando únicamente la fuente de datos (`GamePersistenceService.load()` en lugar de `RespawnService`).

## 7. Checklist Operativo
- [ ] Seed del `defaultRespawnAnchor` ejecutado tras generar el sistema humano (ver logs `Default respawn anchor stored`).
- [ ] `RespawnService` resuelve siempre un ancla efectiva antes de construir el contexto.
- [ ] `GameEngine.restartWithContext()` llamado en todas las rutas (cero llamadas a `respawnGame()` salvo debugging legacy).
- [ ] Eventos HUD emitidos tras cada respawn (`Respawn:`, mensajes de stat restaurada).
- [ ] `npm run build` obligatorio tras modificar código del pipeline (para verificar que SSR/zoneless build se mantiene).

## 8. Riesgos y Próximos Pasos
- **Desincronización WebGL**: `UniverseStateSnapshotService` debe decidir cuándo clonar objetos y reejecutar `initBuffers` si encuentra `vertexBuffer` nulo.
- **Memoria**: mantener múltiples snapshots simultáneos puede crecer rápidamente; liberar snapshots antiguos o comprimir delta.
- **Condiciones de carrera**: pausar en mitad de animaciones intensivas puede dejar colas de audio colgando. `GameEngine` ya fuerza `animationManager.forceTerminateCurrentAnimation()` antes de reanudar; mantenerlo actualizado.
- **Guardado/Carga**: cuando se active `GamePersistenceService`, este documento permanece como referencia funcional y se enlazará desde la wiki junto al plan de save/load.

---

Con esta arquitectura, cualquier muerte garantiza un retorno coherente: preferentemente al Sigillum activo y, en su defecto, al ancla inicial del trail terrestre. El flujo comparte exactamente los mismos puntos de extensión que usará el futuro sistema de guardado/carga, evitando implementar dos pipelines distintos.
