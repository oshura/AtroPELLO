# Plan: Desplegar alas durante el despegue suelo → atmósfera

**Fecha:** 2025-12-25  \
**Responsable:** GitHub Copilot (GPT-5.1-Codex)  \
**Contexto:** Tras la eliminación del rig de anclaje, el juego ya pliega las alas tipo ave (progreso 0 → 1) durante la cinemática de aterrizaje atmosférico. El usuario solicita que, al despegar desde suelo/atmósfera, las alas se "desplieguen" de nuevo (1 → 0) mientras la nave asciende y antes de abandonar la atmósfera.

## Referencias
- `documentation/Resumen_Proyecto_y_Progreso.md` (sección de aterrizaje/despegue atmosférico).
- `documentation/CleanCode_Arquitectura.md` para mantener separación de responsabilidades y evitar lógica de animación en `GameEngine`.
- Código relevante:
  - `src/app/game/GameEngine.ts` (`startTakeoffSequence`, `notifyTakeoffSequence*`, `setWingDeploymentProgress`, `maybeTriggerAtmosphereAutoTakeoff`).
  - `src/app/game/services/animations/ground-takeoff.animation.ts`.
  - `src/app/game/services/animations/takeoff-sequence-animation.ts` (fase orbital) si se requiere sincronizar con el unfold.
  - `src/app/game/game-objects/Spaceship.ts` (setter `setWingDeploymentProgress`).

## Comportamiento actual
- El aterrizaje automático invoca `GameEngine.setWingDeploymentProgress()` desde `AtmosphereLandingAnimation` para llevar las alas a 100% (plegadas sobre el fuselaje) justo antes del touchdown.
- `GroundTakeoffAnimation` gestiona la fase suelo → 50u/5u·s pero no toca las alas.
- `startAtmosphereExitSequence()` (fase `atmo-exit`) reutiliza la misma animación modular para abandonar la atmósfera, pero tampoco controla las alas.
- Tras completar el despegue, ningún sistema restablece el progreso a 0, así que las alas permanecen plegadas.

## Objetivo funcional
1. **Timeline claro:** Mientras corre `GroundTakeoffAnimation`, las alas deben interpolar suavemente de 1 → 0. Idealmente el 60% del despliegue ocurre durante la fase de spool y el resto durante el ascenso para que el jugador perciba el "unfurl".
2. **Persistencia correcta:** Al terminar la fase "ground", las alas deben quedar en progreso 0 y permanecer así durante el vuelo atmosférico hasta que otra lógica (p.ej., nuevo aterrizaje) indique lo contrario.
3. **Compatibilidad Auto-Takeoff:** Si el juego inicia `startAtmosphereExitSequence()` automáticamente (al superar 1000u) mientras las alas ya están abiertas, no debe replegarlas hasta que una cinemática lo requiera.
4. **Sin jitter:** Evitar spam de `setWingDeploymentProgress` (respetar memoización de `Spaceship.setWingDeploymentProgress`).
5. **Documentación/Wiki:** El manual del jugador debe reflejar que el despegue despliega las alas antes de recuperar el control.

## Riesgos
- Animación y lógica mezcladas en `GameEngine`. Solución: encapsular la interpolación dentro de `GroundTakeoffAnimation` (y, si aplica, en la animación de fase orbital) usando solo la API pública del engine.
- Condiciones de carrera con aterrizaje automático si el jugador cancela/aborta el despegue. Necesitaremos resets defensivos en `cleanup()`.
- Auto-takeoff iniciado sin haber corrido la animación de fase suelo (p.ej., teletransporte). Debemos asegurar valores por defecto razonables (progress=0) para esos casos.

## Plan de implementación

- [ ] **Fase 1 – Telemetría y helpers en `GroundTakeoffAnimation`:**
  - Añadir estado local `wingProgressStart`/`wingProgressEnd`, timeline (spool vs ascenso) y llamada segura a `engine.setWingDeploymentProgress()` en `start()`/`update()`.
  - Si la animación se aborta, restaurar el progreso previo (consultar `ship.getWingDeploymentProgress()` al iniciar) para no dejar alas semiabiertas.

- [ ] **Fase 2 – Estado posterior y fase orbital:**
  - Tras `GroundTakeoffAnimation.finish()` (no abortada) forzar `engine.setWingDeploymentProgress(0)` y registrar que las alas quedaron abiertas.
  - Revisar `startAtmosphereExitSequence`/`TakeoffSequenceAnimation` para decidir si necesitan mantener las alas abiertas o iniciar un nuevo timeline (p.ej., plegado gradual al salir al espacio). Para este sprint basta con garantizar que ninguna fase posterior vuelva a 1 automáticamente.

- [ ] **Fase 3 – Documentación y wiki del jugador:**
  - Actualizar `documentation/Resumen_Proyecto_y_Progreso.md` en la sección del flujo de aterrizaje/despegue para describir el despliegue durante `GroundTakeoffAnimation`.
  - Extender la página wiki correspondiente (ruta `/wiki/spaceship`) explicando visualmente que, al despegar, las alas se abren progresivamente antes de ceder el control.

- [ ] **Fase 4 – Validación:**
  - Ejecutar `npm run build` y `npm run test -- --watch=false --browsers=ChromeHeadless` al completar el desarrollo.
  - Verificar visualmente (si es posible) o mediante logging que el progreso sigue 1 → 0 durante la animación y permanece en 0 en atmósfera.

## Criterios de finalización
- Las alas están desplegadas (progreso 0) al concluir la fase de despegue desde suelo, sin importar si fue manual o auto-triggered.
- No existe regresión en el aterrizaje: la cinemática sigue pudiendo llevar el progreso a 1.
- Documentación y wiki sincronizadas.
- Build y pruebas unitarias pasando en Node 25 + Angular 20 conforme a la guía del proyecto.
