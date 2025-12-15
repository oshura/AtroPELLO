# Plan: Diagnóstico y refuerzo de rehidratación de universo en cargas

## Contexto
- El jugador carga una partida reciente (vía diálogo de muerte o panel) y reaparece en la posición correcta pero dentro del sistema humano vacío (sin sol ni objetos). 
- También al cargar manualmente desde el panel, sólo aparecen restos del sistema humano.
- Sospechas: snapshots de universo no se etiquetan/persisten correctamente tras Gate Rite u otros viajes, y la restauración cae en labels por defecto o en payloads incompletos.

## Alcance
1. Auditar captura/persistencia de snapshots para viajes intersistema.
2. Ajustar metadata/tagging para que cada guardado incluya identificadores válidos.
3. Endurecer la rehidratación al cargar, reutilizando payload embebido cuando la snapshot no existe y asegurando que el `GameEngine` aplica ese estado antes de reanudar el loop.

## Checklist de trabajo
- [ ] **Auditoría de captura**: Revisar `GameEngine.persistActiveSystemState()`, `PortalPersistenceService.save()`, `UniverseStateSnapshotService.captureRuntimeState()` y `GamePersistenceService.buildMetadata()` para verificar que cada salto/guardado actualiza snapshotId/systemId/snapshotLabel coherentes.
- [ ] **Etiquetado consistente**: Si se detectan gaps, actualizar la lógica que resuelve `systemId`/`snapshotLabel`/`respawnAnchorId` para que Gate Rite y Sigillum remoto registren el sistema correcto en metadata y en PortalPersistenceService.
- [ ] **Rehidratación robusta**: Asegurar que `GamePersistenceService.applyLoadedPayload()` y el `GameEngine` reciben un `RuntimeSolarSystemState` con payload listo; si sólo existe el payload embebido, registrarlo temporalmente dentro de `PortalPersistenceService` (con label sintético) o aplicarlo inmediatamente antes del `restartWithContext`.
- [ ] **QA rápido**: Reproducir flujo (Gate Rite → guardar → morir → cargar) y validar que el sistema remoto conserva portales, sol y planetas; ejecutar `npm run build` para confirmar compilación.

> Nota: Actualizar la wiki (`/wiki/game-rules` o `/wiki/cloud-saves`) si se modifica el comportamiento observable del guardado/carga.
