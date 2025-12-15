# Plan: Precisión con Bloq Mayús + indicador HUD

## Contexto
- Shift ya activa `setPrecisionRotationActive()` directamente desde `GameEngine.updateShipControls()`.
- El input system (`GameInputHandler`) no detecta Caps Lock y el HUD no muestra el estado de precisión.
- La brújula ya renderiza un overlay para timers mediante `Compass.setCountdown()`.

## Pasos
- [ ] 1. Pipeline de input y estado
  - Detectar `CapsLock` en `GameInputHandler`, obtener su estado con `event.getModifierState('CapsLock')` y reenviar al motor.
  - En `GameEngine` llevar el control de dos flags (`precisionHold`, `precisionLatch`) y derivar el estado final desde ambos.
- [ ] 2. Integración con la nave
  - Ajustar `updateShipControls()` para delegar en helpers (`setPrecisionHoldActive`, `applyPrecisionMode`).
  - Añadir getter en `Spaceship` para consultar si la rotación precisa está activa (el HUD la necesita).
- [ ] 3. HUD y brújula
  - Extender el payload `gameData` para incluir `precisionModeActive` y propagarlo a `HUDManager` → `Compass`.
  - Implementar en `Compass` un overlay “PRECISION” bajo el timer, con fuente fina y `scaleY = 1.33`.
- [ ] 4. Documentación/UI
  - Actualizar `documentation/Input_Bindings.md` y la wiki de la nave con la nueva opción Bloq Mayús + etiqueta HUD.
- [ ] 5. Validación
  - Ejecutar `npm run build`, revisar logs y eliminar este plan una vez completado.
