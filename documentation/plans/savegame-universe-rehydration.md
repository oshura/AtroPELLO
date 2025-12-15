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
- [x] **Auditoría de captura**: Revisar logs recientes (`/logs/logs.txt`) y el pipeline de guardado/carga para confirmar que el payload embebido sólo contiene `SerializedGameObjectState` minimalistas (sin órbitas ni metadata de planetas/sol), provocando sistemas rehidratados incompletos.
- [x] **Captura enriquecida**: Extender `UniverseStateSnapshotService.captureRuntimeState()`/`serializeGameObject()` para inyectar en `payload.objects[].custom` los campos relevantes por tipo (sol, planetas, portales: órbitas, radio, colores, inhabitantes, estado de sello, etc.) aprovechando las propiedades de `Planet`, `Sun`, `Portal`.
- [x] **Reconstrucción fiel**: Actualizar `buildSnapshotFromPayload()` para consumir esa metadata y generar `SolarSystemSnapshot` con sol+planetas completos (incluyendo órbitas y meta existente). Registrar el snapshot sintetizado en `PortalPersistenceService` conservando labels/pins.
- [ ] **Cobertura**: Añadir pruebas unitarias para `UniverseStateSnapshotService.replaceRuntimeWithPayload()` que validen el recuento de planetas/sol, y ampliar el harness de `GamePersistenceService` para asegurar que la carga vía payload mantiene múltiples planetas.
- [ ] **QA y cierre**: Validar manualmente Gate Rite → guardar → cargar (logs + inspección visual), actualizar wiki si el flujo cambia y correr `npm run test`, `npm run build` para cerrar la fase.

> Nota: Actualizar la wiki (`/wiki/game-rules` o `/wiki/cloud-saves`) si se modifica el comportamiento observable del guardado/carga.
