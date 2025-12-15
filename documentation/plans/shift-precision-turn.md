# Plan: Modo de rotación de precisión con Shift

## Contexto
- Inputs centralizados según `documentation/Input_Bindings.md`; el `GameInputHandler` solo reenvía teclas traducidas al `GameEngine`.
- La nave calcula la rotación en `Spaceship.handleInput()` usando `rotationSpeed` modulada por la velocidad.
- Requisito nuevo: presionar `Shift` debe reducir (½) la velocidad de rotación para maniobras finas.

## Pasos
- [x] 1. Propagar el estado de `Shift` hacia el motor.
  - Ajustar `GameInputHandler` para que `keydown/keyup` de `Shift` actualice `keyState['shift']` y llame a `GameEngine.handleKeyDown/Up('shift')`, manteniendo compatibilidad con combinaciones como `Shift+T`.
- [x] 2. Exponer en `Spaceship` un flag/factor de rotación de precisión.
  - Añadir propiedad (p.ej. `precisionRotationFactor`) y método público para activarla/desactivarla, aplicando el factor al calcular `currentRotationSpeed`.
- [x] 3. Integrar el flag en el motor.
  - Actualizar `GameEngine.updateShipControls()` para reaccionar a `shift` (set/unset precisión) respetando los locks de input.
- [x] 4. Documentar y comunicar.
  - Actualizar `documentation/Input_Bindings.md` y la página de la nave en la wiki (`src/app/wiki/pages/spaceship/`) para describir el modo de rotación precisa.
- [ ] 5. Validar y limpiar.
  - Ejecutar `npm run build`, revisar logs, y al completar el trabajo eliminar este plan.
