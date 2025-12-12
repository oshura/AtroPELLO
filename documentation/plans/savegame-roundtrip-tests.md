# Plan · Harness y Tests de Roundtrip para SaveGame

> Referencias: `documentation/SaveGame_Serializacion_Cloud.md`, `src/app/services/game/game-persistence.service.ts`, `src/app/services/game/persistence/*`, `src/app/libs/cloud-saves/cloud-saves.service.ts`, `documentation/CleanCode_Arquitectura.md`.

## Contexto y hallazgos
- Actualmente no existen pruebas automatizadas que verifiquen la integridad del pipeline `saveGame()` → `loadGame()` → `saveGame()` dentro de `GamePersistenceService`.
- El servicio depende de múltiples colaboradores (serializers, snapshot adapters, GameEngine) difíciles de instanciar en un test Angular estándar sin un harness dedicado.
- La regresión más temida es que, después de cargar un payload, la siguiente captura produzca un estado distinto (o pierda secciones), lo que haría imposible validar Cloud Saves sin jugar manualmente.
- También necesitamos una forma rápida de detectar cuándo los serializadores introducen campos no deterministas o faltantes.

## Objetivo
Construir un harness de pruebas que:
1. Permita instanciar `GamePersistenceService` con dobles ligeros (stubs) para sus dependencias críticas.
2. Genere un payload determinista a partir de datos fixture, lo cargue y vuelva a capturarlo.
3. Compare ambos snapshots tras normalizar campos volátiles (`savedAt`, `elapsedPlayTimeMs`, etc.) y falle si existen diferencias estructurales.
4. Cubra escenarios futuros (p. ej. mutaciones parciales, metadata inconsistente) sin requerir el loop real del GameEngine.

## Entregables
- Harness/utilidad en `src/app/services/game/testing/savegame-harness.ts` (o similar) con stubs para `GameInitializer`, `PlayerStateSerializer`, `GameStateSnapshotAdapter`, `UniverseStateSnapshotAdapter`, `CloudSavesSessionBridgeService`, etc.
- Especificación Jasmine `game-persistence.service.spec.ts` con al menos:
  - Test de roundtrip (`save → load → save`) que compara payload normalizado.
  - Test de resiliencia (e.g. verifica que `loadGame` llama a `restartWithContext` con el runtime esperado o que `metadata.userId` se conserva).
- Utilidad de normalización (`normalizePayloadForComparison(payload)`) compartida por los tests para ignorar campos temporales.
- Documentación breve en el propio plan (y, si aplica, anotación en `SaveGame_Serializacion_Cloud.md`) indicando cómo correr las pruebas.

## Checklist de trabajo

1. **Definición del harness**
   - [x] Crear stubs para dependencias de `GamePersistenceService` (GameEngine, GameInitializer, Loggers, Serializers, Snapshot Adapters, SessionBridge, MigrationService).
   - [x] Inyectar datos fixture (player, gameState, universe) con valores fáciles de comparar.
   - [x] Exponer helpers para recuperar el último contexto de reinicio y los estados serializados.

2. **Utilidades de normalización**
   - [x] Implementar función que clone un `SaveGamePayload` y anule campos volátiles (`savedAt`, `elapsedPlayTimeMs`, `buildLabel`, etc.).
   - [x] Añadir filtros opcionales para ordenar colecciones si fuese necesario (ej. objetos, inventario).

3. **Especificaciones de roundtrip**
   - [x] `it('round-trips payloads without structural diffs')`: guarda un snapshot, ejecuta `loadGame(payload)` y vuelve a guardar; compara payloads normalizados.
   - [x] `it('restores runtime via restartWithContext')`: asegura que el stub de GameEngine recibe un contexto con el mismo `systemId`, `playerState` y `respawnAnchor` que el payload cargado.

4. **Coberturas adicionales y documentación**
   - [x] Asegurar que los tests cubren tanto `includeUiState/audio=false` como la rama con flags en `saveGame` (aunque devuelvan `null`).
   - [x] Documentar en este plan (o en `SaveGame_Serializacion_Cloud.md`) cómo ejecutar los tests (`npm run test -- game-persistence.service.spec.ts`).
   - [x] Registrar cualquier gap detectado (por ejemplo, campos que siempre cambian) para iniciar una investigación si la comparación falla.

   > No se detectaron campos inconsistentes tras normalizar los payloads de roundtrip.

5. **Escenarios avanzados multicomponente**
   - [x] Extender el harness con un generador de fixtures "ricos" que incluya múltiples sistemas (procedural archive), portales entrelazados, lesser beings y objetos especiales (doble sol, planeta anillado, planeta tipo Tierra, asteroides con rastro y clusters).
   - [x] Ampliar los fixtures de jugador/estado para representar inventarios mixtos (cargos metálicos, orgánicos, void), módulos que habilitan slots auxiliares y loadouts con equipos activos.
   - [x] Añadir snapshots de intel planetario en distintos estados de descubrimiento y misiones en fases variadas para ejercitar `GameStateSnapshotAdapter`.
   - [x] Escribir pruebas que validen: (a) el payload complejo se mantiene idéntico tras `save → load → save`; (b) al cargar se preservan las referencias de portales/sistemas y `restartWithContext` recibe el anchor correcto.
   - [x] Documentar cualquier limitación detectada (por ejemplo, colecciones que todavía dependan del orden de inserción) y registrar follow-ups si aparecen.

   > No se observaron nuevas limitaciones: los portales y el procedural archive mantienen claves deterministas después de la normalización.

   > Ejecución: `npm run test -- --watch=false --include src/app/services/game/game-persistence.service.spec.ts`

---
El plan se considera completado cuando las pruebas de roundtrip se ejecuten en CI/local sin dependencias del loop real y sirvan como red de seguridad para cambios futuros en Cloud Saves.
