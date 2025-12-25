# Plan: Mantener cámara manual fija tras landing atmosférico

**Fecha:** 2025-12-25  \
**Responsable:** GitHub Copilot (GPT-5.1-Codex)  \
**Contexto:** Después de la cinemática de landing atmosférico, la cámara debería permanecer inmóvil en la toma manual, pero actualmente vuelve a recibir jitter/turbulencias y se desplaza mientras el panel está abierto. El usuario quiere que siga fija mirando a la nave hasta que otra cámara tome el control (despegue o acción explícita).

## Referencias
- `src/app/game/services/animations/atmosphere-landing.animation.ts` — emite `holdLandingCinematicCamera()` al terminar la animación.
- `src/app/game/GameEngine.ts` — controla el hold de cámara (`landingCinematicCameraHold`), la cámara auto-landing y las fuerzas atmosféricas.
- `AtmosphereSceneManager` / funciones `applyAtmosphereCameraJitter`, `startAtmosphereAutoLandingCamera` para descartar interferencias.
- Documentación relevante: `documentation/Resumen_Proyecto_y_Progreso.md` (sección de cinemática) y wiki `/public/wiki/spaceship`.

## Objetivos
1. Congelar la cámara manual al finalizar la cinemática de landing hasta que `releaseLandingCinematicCameraHold()` la libere.
2. Evitar que jitter, drift u otras fuerzas modifiquen la cámara mientras el hold esté activo y el panel siga abierto.
3. Garantizar que la cámara auto-landing no tome el control hasta que el hold se libere (ya ocurre en parte, pero revisaremos que se aplique todo el tiempo).
4. Actualizar documentación/wiki si el comportamiento documentado no coincide.
5. Ejecutar `npm run build` para validar.

## Plan

- [ ] **Fase 1 – Análisis del flujo de cámaras**
  - Revisar `holdLandingCinematicCamera` y `releaseLandingCinematicCameraHold` para entender cuándo se restablece la cámara previa.
  - Ubicar dónde se aplica jitter/turbulencia a la cámara (p.ej. `applyAtmosphereCameraJitter`).
  - Verificar que `startAtmosphereAutoLandingCamera` queda en cola hasta que se libere el hold.

- [ ] **Fase 2 – Congelar la cámara manual**
  - Introducir un estado que indique que la cámara manual está "congelada" mientras exista hold.
  - Desactivar cualquier actualización automática (jitter, drift, auto cam) en ese periodo.

- [ ] **Fase 3 – Validaciones y señalización**
  - Asegurar que al cerrar el panel o iniciar un despegue el hold se libera y las fuerzas vuelven a aplicarse.
  - Añadir logs si es necesario para verificar que no hay jitter durante el hold.

- [ ] **Fase 4 – Documentación y build**
  - Confirmar que la documentación ya indica que la cámara queda fija; si no, actualizarla.
  - Ejecutar `npm run build` y registrar el resultado.
  - Eliminar este plan tras completar las tareas.

## Criterios de finalización
- Durante el hold de la cinemática la cámara permanece inmóvil y no recibe jitter ni drift.
- La cámara solo vuelve a moverse cuando el jugador cierra el panel o arranca la siguiente secuencia.
- Build exitosa.
