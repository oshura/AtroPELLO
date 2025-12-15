# Plan: Restaurar layout del grimorio tras cargar partida

## Contexto
- El usuario reporta que las posiciones de los sellos (glifos) del panel del grimorio no permanecen tras guardar/cargar.
- El serializer parece capturar y aplicar `grimoireLayout`, pero el `GrimoirePanel` no refleja esos datos después de un `load`/`restart`.
- Necesitamos verificar la ruta de persistencia y asegurar que la UI se sincroniza con el estado cargado del `GameStateStore`.

## Alcance
1. Confirmar que el serializer guarda/restaura correctamente el layout en `GameStateStore`.
2. Identificar por qué el `GrimoirePanel` no muestra el layout restaurado.
3. Implementar la sincronización del panel tras cargas/reinicios (y siempre que el layout cambie desde persistencia).
4. Validar el fix (tests + build) y documentar el comportamiento en la wiki.

## Checklist
- [x] **Auditoría de persistencia**: Revisar `PlayerStateSerializer`/`GameStateStore` para confirmar que el layout se captura y aplica durante save/load.
- [x] **Sincronización UI**: Actualizar `GameEngine` para que el `GrimoirePanel` aplique el layout almacenado tras `restartWithContext` (y reutilizar helper para el arranque inicial).
- [x] **Validación**: Ejecutar `npm run test -- --watch=false --browsers=ChromeHeadless` y `npm run build` confirmando que no hay regresiones.
- [x] **Wiki/Plan**: Documentar el comportamiento de persistencia del grimorio en la wiki y cerrar este plan al completar los pasos.
