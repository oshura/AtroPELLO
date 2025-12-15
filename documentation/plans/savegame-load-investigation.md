# Plan: Investigación profunda del flujo Save/Load y rehidratación de sistemas

## Contexto
El jugador sigue reapareciendo en el sistema humano tras cargar una partida que fue guardada en otro sistema (Gate Rite + Sigillum). Necesitamos observar qué datos serializamos, cómo se etiquetan los snapshots y en qué punto del pipeline la rehidratación pierde el contexto correcto.

## Objetivos
1. Identificar las trazas necesarias en el Debug Overlay ("overlay de la ñ") para capturar HARs útiles.
2. Revisar la arquitectura de guardado/carga y del respawn Sigillum para comparar comportamientos.
3. Validar si los datos serializados (payload + metadata + snapshots) contienen todo lo necesario para cargar un sistema remoto.
4. Evaluar la viabilidad de un test (o harness) que simule dos sistemas, guarde en el segundo y vuelva a cargarlo.

## Checklist de trabajo
## Plan para rehidratación total y cobertura de regresión
- [x] **Definir estrategia de rehidratación**: Documentar cómo `applyLoadedPayload()` descartará el runtime activo y aplicará el payload serializado (qué servicios intervienen y cómo sincronizar `PortalPersistenceService`).
	- `UniverseStateSnapshotService` expondrá un nuevo helper `replaceRuntimeWithPayload({ systemId, payload, metadata })` que:
		- Limpia `GameStateStore` (objetos, portales, clusters, lesser beings) y registra el `targetSystemId` como activo.
		- Alimenta `PortalPersistenceService` con un snapshot sintético etiquetado usando `metadata.snapshotLabel || metadata.systemName || metadata.systemId` para que futuras búsquedas tengan una referencia válida incluso si la etiqueta original fue evictada por viaje/respawn.
		- Restaura portales, lesser beings y `environment` replicando la lógica de `captureRuntimeState()` en sentido inverso.
	- `GamePersistenceService.applyLoadedPayload()` utilizará siempre `replaceRuntimeWithPayload()` antes de invocar `restartWithContext()`. Si existe snapshot válido se seguirá usando `ensureSystemState`; si no, el payload rehidrata todo pero, en ambos casos, el runtime activo se descarta primero para evitar fugas del sistema humano.
	- `PortalPersistenceService` incorporará un registro de "snapshots fijados" para que las etiquetas usadas por saves/respawns (`respawn-anchor-latest`, `system-*`, etc.) no se eliminen automáticamente cuando se guarden snapshots del mismo `systemKey`. `GamePersistenceService` fijará/desfijará estas etiquetas durante `saveGame()` / `loadGame()` para mantener paridad con Cloud Saves.
- [x] **Implementar rehidratación completa**:
	- [x] Añadir utilidades a `UniverseStateSnapshotService` para limpiar el estado activo y aplicar un payload completo (incluyendo portales y lesser beings) cuando falte snapshot.
	- [x] Actualizar `GamePersistenceService` para usar la ruta nueva siempre que se cargue una partida (fallback o modo preferido según flags) y garantizar que el engine recibe el sistema correcto.
- [x] **Salvar snapshots protegidos**: Evaluar si es necesario marcar etiquetas persistentes para slots activos y, de ser así, extender `PortalPersistenceService` con un mecanismo de "pin" que evite la evicción automática tras un salto o respawn.
- [x] **Cobertura de regresión**: Ampliar `savegame-harness` con un caso multi-sistema que (1) genera un segundo sistema, (2) guarda, (3) invalida los snapshots del `PortalPersistenceService`, (4) llama a `loadGame()` y verifica que el `targetSystemId` final coincide con el payload.
- [x] **Documentación y build**: Actualizar la wiki/`SaveGame_Serializacion_Cloud.md` con el nuevo flujo, correr `npm run build` para certificar la fase.
