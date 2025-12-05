# Plan: Respawn Anchors por Defecto y Consolidación de Documentación

## Contexto y Motivación
- El `RespawnService` todavía depende de lógica de fallback que genera posiciones cercanas al sol si no existe sigillum (ver `Respawn_Sigillum_ImplementationPlan.md`).
- La nave debería reaparecer siempre en los anclajes iniciales situados en el inicio del trail terrestre definidos por `HumanSolarSystemService` / `GameEngine`.
- La documentación relacionada con supervivencia, inventarios/paneles, narrativa de aterrizaje y planes de respawn está fragmentada en varios archivos dentro de `documentacion/` y debe consolidarse para consulta rápida (ver `Resumen_Proyecto_y_Progreso.md`).

## Alcance
### Código
1. Crear anclas iniciales por defecto al arrancar la partida (Human Solar System) y almacenarlas en el `GameStateStore` para que el respawn jamás dependa de fallback.
2. Actualizar `RespawnService` (y servicios auxiliares) para consumir exclusivamente los anchors iniciales o los sigillum existentes, eliminando ramas de fallback y validando posiciones.

### Documentación
1. Reescribir `AgeAndSurvivability.md` para convertirlo en documentación definitiva (no en plan) con secciones claras sobre el sistema de envejecimiento / supervivencia.
2. Consolidar `PanelEventCoordinator.md`, `Inventario_Panel_Plan.md`, `Sistema_Cargo_Inventory.md` e `InventoryPanel.md` en un único documento maestro que describa el sistema de inventario y paneles.
3. Unificar `Landing_Menu_Narrative_Plan.md`, `Landing_Mission_Dialogues_Plan.md`, `Landing_Menu_Continuacion_Plan.md`, `LandingSequencePlan.md` y `Landing_Narrative_JSON_Schema.md` en una sola referencia narrativa de aterrizajes.
4. Integrar `Respawn_Fallback_Plan.md` y `Respawn_Sigillum_ImplementationPlan.md` en una guía consolidada de respawn/persistencia, manteniendo `Respawn_Sigillum_y_SaveSystem.md` como plan independiente para el sistema de guardado/carga.
5. Eliminar los documentos originales obsoletos tras la consolidación y actualizar la wiki en `/src/app/wiki` para reflejar los cambios.

## Entregables
- Código actualizado que garantice respawn consistente en el trail terrestre sin fallback.
- Documentación consolidada conforme a los puntos anteriores, preservando toda la información relevante y referencias cruzadas.

## Plan de Trabajo (Checklist)
- [ ] Revisar `GameEngine`, `HumanSolarSystemService` y `GameStateStore` para mapear puntos donde se definen/insertan anclas iniciales.
- [ ] Implementar creación de anchors por defecto al iniciar el sistema humano y persistirlos en el store (incluye validaciones y logs).
- [ ] Refactorizar `RespawnService` para consumir únicamente anchors existentes y eliminar cualquier fallback dinámico.
- [ ] Validar flujo completo ejecutando al menos `npm run build` tras los cambios de código.
- [ ] Redactar nueva versión de `AgeAndSurvivability.md` como documentación final.
- [ ] Consolidar documentación de inventario/paneles en un solo archivo y borrar los originales.
- [ ] Consolidar documentación narrativa de aterrizaje en un solo archivo y borrar los originales.
- [ ] Consolidar documentación de respawn en un solo archivo (excepto `Respawn_Sigillum_y_SaveSystem.md`, que permanece independiente) y borrar los originales involucrados.
- [ ] Actualizar la wiki (`/src/app/wiki`) con el comportamiento nuevo/ajustado.
- [ ] Ejecutar `npm run build` para verificar que el proyecto compila tras todas las modificaciones.

## Riesgos / Consideraciones
- Asegurarse de no sobrescribir anclas personalizados creados por el usuario (sigillum), solo definir defaults en ausencia de ellos.
- Verificar que la eliminación de documentos originales no afecta referencias internas (README, wiki, etc.).
- Mantener alineadas las instrucciones con `CleanCode_Arquitectura.md` y las notas de `Resumen_Proyecto_y_Progreso.md`.
- Preservar `Respawn_Sigillum_y_SaveSystem.md` como plan separado para futuras capacidades de guardado/carga y enlazarlo desde la nueva guía consolidada cuando corresponda.
