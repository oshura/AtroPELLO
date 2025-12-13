# Plan · Caída de FPS tras `saveGame`

> Contexto: `documentation/SaveGame_Serializacion_Cloud.md`, `src/app/services/game/game-persistence.service.ts`, `src/app/game/GameEngine.ts`, `documentation/CleanCode_Arquitectura.md`.

## Antecedentes
- Al guardar una partida (CTA del header o panel), `GamePersistenceService.saveGame()` pausa el loop llamando a `withLoopPaused()` para ejecutar los serializadores.
- `withLoopPaused()` usa `GameEngine.stop()` / `start()`; actualmente `stop()` solo pone `isRunning = false` y no cancela el `requestAnimationFrame` pendiente.
- El usuario observa que, tras guardar, el juego vuelve con ~5 FPS hasta que abre/cierra la wiki (lo que recrea el componente del juego y reinicializa el motor).
- Hipótesis: si el serializado termina antes de que se ejecute el `requestAnimationFrame` ya programado, reanudamos (`start()`) con el loop antiguo aún en cola. Cuando ese frame pendiente corre ve `isRunning=true`, así que continúa y programa otro RAF. Terminamos con dos loops concurrentes (`old` + `new`) y el render cae en picado.

## Objetivo
Eliminar los loops duplicados al pausar/reanudar el motor durante guardados manuales y garantizar que el FPS se mantiene estable tras cada `saveGame()`.

## Checklist
1. **Instrumentación / verificación**
   - [x] Añadir un log temporal o contador en `GameEngine.gameLoop()` que permita detectar cuántos RAF quedan activos antes/después de pausar para validar la hipótesis (solo mientras dure la investigación). _(Nuevos helpers `scheduleNextFrame`/`cancelPendingFrame` registran checkpoints DEBUG y warn por solapes.)_
   - [x] Confirmar que tras un `saveGame` rápido aparecen múltiples callbacks activos en consola (o descartarlo si la hipótesis no se cumple). _(Los primeros guardados mostraron `Cancelled pending RAF` antes de `start()`, confirmando la hipótesis; desde entonces no vuelven a aparecer warnings de solape.)_

2. **Gestión explícita de RAF**
   - [x] Introducir un manejador (`rafHandle`) en `GameEngine` que almacene el id devuelto por `requestAnimationFrame` en cada programación (incluyendo `startLoopAfterRestart`).
   - [x] Actualizar `gameLoop` para guardar ese id y limpiarlo cuando `isRunning` se ponga en `false` o cuando el callback entra con `isRunning=false`.
   - [x] Cambiar `stop()` / `resetLoopStateForRestart()` para cancelar cualquier RAF pendiente (`cancelAnimationFrame`) antes de permitir un `start()` posterior. _(Se agregó `cancelPendingFrame(origin)` y se reutiliza en `start()`, `stop()`, respawn y restart.)_

3. **Cobertura / regresión**
   - [x] Añadir una prueba pequeña (por ejemplo en `GameEngine` usando un `requestAnimationFrame` mock) o, si no es viable, dejar traces explícitas en `LoggingService` bajo `LogCategory.GAME_LOOP` que indiquen la creación/cancelación del RAF para facilitar QA. _(Optamos por trazas periódicas “RAF scheduled checkpoint” + “Cancelled pending RAF”.)_

4. **Documentación y wiki**
   - [x] Documentar en `/src/app/wiki/pages/cloud-saves/cloud-saves.ts` (o sección relevante) que el guardado ahora pausa el loop cancelando el frame pendiente para mantener FPS estable.
   - [x] Anotar en `documentation/Resumen_Proyecto_y_Progreso.md` el fix/regresión resuelta.

5. **Validación final**
   - [x] Ejecutar `npm run test -- --watch=false --include src/app/services/game/game-persistence.service.spec.ts` para asegurar que los tests de persistencia siguen pasando.
   - [x] Ejecutar `npm run build` para cerrar la fase, como exige la guía.

> El plan se considera completado cuando el guardado manual no introduce loops duplicados (verificado mediante logs/instrumentación) y la wiki refleja la nueva salvaguarda del loop.
