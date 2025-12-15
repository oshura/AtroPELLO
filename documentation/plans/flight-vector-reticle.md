# Plan: Retícula de dirección de la nave

## Contexto y alcance
- Añadir una retícula discreta en el HUD que marque el punto de fuga de la dirección real de la nave para facilitar el pilotaje actual. Más adelante podrá evolucionar a un punto de mira cuando existan armas activas.
- La retícula debe seguir siempre el vector forward de la nave, respetando los cambios de orientación de la cámara y manteniéndose alineada con el HUD en cockpit.
- Referencias revisadas antes de este plan: `documentation/CleanCode_Arquitectura.md`, `documentation/Resumen_Proyecto_y_Progreso.md`, `documentation/Layout.md`, además del código en `src/app/game/GameEngine.ts`, `src/app/game/hud/HUDManager.ts`, `src/app/game/Camera.ts` y elementos del HUD (`NavigationSphere`, `Compass`).

## Pasos
- [x] Analizar documentación (CleanCode, Resumen, Layout) y revisar la arquitectura actual del HUD/cámara para detectar el punto de inserción del nuevo overlay.
- [x] Definir el contrato de datos: proyectar el vector forward de la nave al espacio 2D del HUD (normalizado 0..1), decidir heurísticas de visibilidad/clamp y exponer la estructura necesaria desde `GameEngine` a `HUDManager`.
- [x] Implementar la retícula:
  - Agregar helper en `GameEngine` para convertir un punto en el espacio a coordenadas HUD (multiplicar view/projection, normalizar y mapear a canvas 1024x768) y enviar el payload en `hudManager.update()`.
  - Crear un nuevo elemento HUD (`FlightVectorReticle`) responsable de renderizar la cruz discreta, con estados para modo "nave actual" (sutil) y "armas" (preparado para futuro), e integrarlo en `HUDManager.renderToTexture()`.
  - Asegurar que la retícula se oculta si el punto proyectado sale de pantalla o si la cámara no está inicializada.
- [x] Actualizar documentación y wiki: describir el nuevo indicador en `documentation/Resumen_Proyecto_y_Progreso.md` (sección HUD) y en la wiki del juego (página de reglas/HUD). Ejecutar `npm run test -- --watch=false --browsers=ChromeHeadless` y `npm run build` para validar la fase y luego cerrar este plan.
