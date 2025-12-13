# Plan · Restaurar partidas en el sistema correcto tras Gate Rite

> Referencias clave: `documentation/Wiki_System.md`, `documentation/SaveGame_Serializacion_Cloud.md`, `src/app/services/game/game-persistence.service.ts`, `src/app/services/game/persistence/game-state.snapshot-adapter.ts`, `src/app/game/services/state/universe-state-snapshot.service.ts`, `src/app/services/game/testing/savegame-harness.ts`.

## Contexto
- Después de saltar con Gate Rite y guardar en el sistema destino, al cargar la partida el jugador reaparece cerca del portal de origen en el sistema original.
- El payload serializado contiene el estado del sistema destino, pero `GamePersistenceService.loadGame()` prioriza la metadata del respawn anchor (que sigue apuntando al sistema original) para decidir qué snapshot/restaurar.
- `buildSnapshotOptions()` sólo considera labels de anclas previas, por lo que ignora `metadata.systemName/systemId` capturados durante el guardado, forzando a UniverseStateSnapshotService a reconstruir el sistema incorrecto.

## Objetivo
Asegurar que la lógica de restauración reconoce el sistema activo del snapshot guardado aunque el respawn anchor pertenezca a otro sistema, manteniendo coherencia tras viajes por portal y otras transiciones.

## Checklist
1. **Análisis y trazas**
   - [x] Reproducir el escenario con el harness (o mediante logs) creando un payload cuyo `metadata.systemId` difiere de `respawn.activeAnchor.systemId` para validar que hoy selecciona el id erróneo. _(Nuevo helper `createGateRiteMismatchHarnessOptions()` + spec `prioritizes payload metadata…`)_
   - [x] Documentar qué campos del payload contienen el identificador correcto (e.g. `metadata.systemId`, `metadata.systemName`, `universe.payload`). _(Se anotó en la propia spec y en la doc de serialización)._ 

2. **Resolver sistema objetivo**
   - [x] Actualizar `resolveTargetSystemId()` en `GamePersistenceService` para priorizar `payload.metadata.systemId` (limpio) antes de caer en anchors/estado activo.
   - [x] Devolver el anchor sólo como fallback cuando el payload carece de metadatos.

3. **Snapshot options enriquecidas**
   - [x] Extender `buildSnapshotOptions()` para incluir `payload.metadata.systemName` y `payload.metadata.systemId` como candidatos a `snapshotLabel` / `snapshotId`.
   - [x] Documentar en comentarios que estos valores provienen del snapshot capturado durante el guardado.

4. **Cobertura automatizada**
   - [x] Añadir un caso en `savegame-harness` que permita configurar payloads con `metadata.systemId` ≠ `activeAnchor.systemId`.
   - [x] Incorporar un test Jasmine en `game-persistence.service.spec.ts` que verifique que `loadGame()` invoca `universeState.ensureSystemState()` con el sistema correcto cuando las anclas apuntan a otro sistema.

5. **Documentación y wiki**
   - [x] Actualizar `documentation/SaveGame_Serializacion_Cloud.md` (y la wiki `/wiki/cloud-saves`) para dejar claro que desde ahora las cargas priorizan el sistema del snapshot guardado.

6. **Validación**
   - [x] Ejecutar `npm run test -- --watch=false --include src/app/services/game/game-persistence.service.spec.ts`.
   - [x] Ejecutar `npm run build` según la guía.

> El plan concluye cuando la carga tras Gate Rite restaura el sistema destino consistente con la metadata del snapshot y las pruebas/builds pasan.
