# Plan: Persistencia del dios primigenio por sistema

## Objetivo
Garantizar que cada sistema solar (especialmente el sistema humano) conserva un único dios primigenio desde su generación hasta cualquier snapshot o partida guardada/cargada, de modo que Void Jump y los portales invocan criaturas coherentes y no se alterna la deidad entre usos.

## Pasos
- [x] Auditar la asignación original en `SystemGeneratorService`/`GameEngine` (incluyendo el humano) para saber cuándo se define `meta.elderGod` y si se rehace al recargar snapshots.
- [x] Confirmar que `SolarSystemRuntimeSerializer`, `PortalPersistenceService`, `UniverseStateSnapshotService` y `GamePersistenceService` serializan/deserializan `meta.elderGod` sin sobrescribirlo; añadir clamps/tests donde falte.
- [x] Revisar `VoidJumpAnimation`, `LesserBeingSpawner` y cualquier cola de encuentros para forzar el uso del elder god vigente (`GameEngine.getCurrentSystemElderGod()`), eliminando rerolls o “alternancia por salto”.
- [x] Documentar la regla en la wiki/reglas (sección de Void Jump/Lesser Beings) indicando que el sistema humano fija su dios y que determina los encuentros posteriores.
- [x] Ejecutar `npm run build` para validar el conjunto tras los cambios.
