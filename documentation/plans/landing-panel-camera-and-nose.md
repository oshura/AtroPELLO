# Plan: Corrección de anclaje de nariz y cámara tras landing/takeoff

**Fecha:** 2025-12-25  \
**Responsable:** GitHub Copilot (GPT-5.1-Codex)  \
**Contexto:** El usuario detectó que el anclaje de la nariz se anima en sentido inverso, que tras el landing atmosférico el juego fuerza la cámara 8 (cockpit) mientras está abierto el panel de aterrizaje, y que al finalizar el despegue la cámara vuelve al plano anterior en lugar de permanecer en la cabina.

## Referencias
- `src/app/game/game-objects/Spaceship.ts` — estado del `noseAnchorProgress` y utilidades relacionadas.
- `src/app/game/GameEngine.ts` — control de cámaras durante la cinemática de landing, panel y transición a takeoff.
- `src/app/game/services/animations/ground-takeoff.animation.ts` — secuencia de despegue desde suelo y restauración de cámaras.
- `documentation/Resumen_Proyecto_y_Progreso.md` y `public/wiki/spaceship/index.html` — comportamiento descrito para nose anchor, cámara del panel y takeoff.

## Objetivos
1. Invertir la rotación y desplazamiento del `noseAnchorProgress` para que la nariz se incline hacia abajo y se hunda en el suelo como describe la documentación.
2. Evitar que el panel de aterrizaje fuerce el modo cockpit: la cámara debe permanecer en la toma manual de la cinemática hasta que el jugador cierre el panel.
3. Mantener la cámara en modo cockpit (8) al completar la `GroundTakeoffAnimation`, de modo que no regrese al plano previo.
4. Validar si la documentación/wiki requiere ajustes tras los cambios y actualizarlos en caso necesario.
5. Ejecutar `npm run build` al terminar para garantizar que la build SSR sigue compilando.

## Plan de trabajo

- [ ] **Fase 1 – Diagnóstico detallado**
  - Revisar `renderSpaceshipNose()` para confirmar las transformadas aplicadas por `noseAnchorProgress`.
  - Localizar dónde se fuerza la cámara cockpit durante el panel (actualmente `enforceLandingPanelCamera`).
  - Confirmar que `GroundTakeoffAnimation.finish()` restaura la cámara previa y verificar si hay otros sitios que reinicien el modo.

- [ ] **Fase 2 – Ajustes de nariz**
  - Invertir la rotación y desplazamiento vertical utilizados cuando `anchorProgress > 0` para que la animación se mueva hacia abajo en lugar de hacia arriba.
  - Validar que la traslación frontal permanece intacta para conservar el "mordisco" al suelo.

- [ ] **Fase 3 – Cámara durante el panel de landing**
  - Eliminar el forzado a cockpit al abrir el panel, retirando el uso de `landingCinematicForcedCameraMode` para que la toma manual se mantenga fija.
  - Asegurar que `releaseLandingCinematicCameraHold()` vuelve a restaurar el modo previo sólo cuando corresponda y que no quedan referencias huérfanas.

- [ ] **Fase 4 – Cámara tras el takeoff**
  - Modificar `GroundTakeoffAnimation.finish()` para conservar `CameraMode.COCKPIT` al completar con éxito la animación (manteniendo la restauración original sólo en caso de aborto).
  - Revisar si `notifyTakeoffSequenceFinished()` u otros flujos necesitan ajustes adicionales.

- [ ] **Fase 5 – Documentación y validación**
  - Comprobar `documentation/Resumen_Proyecto_y_Progreso.md` y `/public/wiki/spaceship` para confirmar si el comportamiento descrito ya coincide (de ser así, documentar únicamente que se validó; si no, actualizar textos).
  - Ejecutar `npm run build` (y `npm run test -- --watch=false --browsers=ChromeHeadless` si es viable) y dejar constancia de los resultados.
  - Una vez completadas y verificadas todas las fases, eliminar este plan.

## Criterios de finalización
- Animación del nose anchor inclina y hunde la nariz hacia abajo siguiendo el mismo eje.
- El panel de aterrizaje no cambia a cámara 8; mantiene la toma manual de la cinemática hasta que se cierra.
- Tras cualquier despegue desde suelo, la cámara permanece en modo cockpit.
- Documentación/wiki sincronizadas o confirmadas como vigentes.
- Build completada sin errores.
