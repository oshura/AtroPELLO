# Plan: Reboot modo atmosférico ligero

## Objetivo
Volver a implementar el modo atmosférico apoyándonos en el motor espacial existente, limitando la escena a dos esferas estáticas (suelo y cielo) y reusando el comportamiento/controles del `GameEngine`. Solo añadiremos las reglas específicas de atmósfera (gravedad gradual, sonidos de aire, detección automática de aterrizaje/despegue) y las animaciones ya disponibles.

## Pasos
- [x] **Aislar prototipos anteriores**
  - [x] Copiar la versión actual de `src/app/game/modes` y cualquier documentación auxiliar a una carpeta de archivo (p. ej. `archive/atmosphere-prototype/`).
  - [x] Realizar rollback del resto del repositorio para volver al estado estable pre-prototipo.
- [x] **Escena atmosférica mínima**
  - [x] _Análisis_: revisar `GameEngine` (secciones landing/takeoff) y `CleanCode_Arquitectura.md` para confirmar los puntos de integración y las dependencias permitidas.
  - [x] Crear `src/app/game/atmosphere/AtmosphereSceneManager.ts` con la inicialización WebGL (buffers de dos esferas, shader simple con colores de planeta según `LandingApproachContext`).
  - [x] Introducir `AtmosphereSceneState` en `GameEngine` (bandera + payload) para activar/desactivar el render mínimo sin tocar HUD/inputs.
  - [x] Posicionar la nave según el contexto (`surfacePoint + normal * altitudeInicial`) y mantener todos los subsistemas activos.
  - [x] **MEJORA**: Añadir heightmap procedural al suelo con 3 octavas de noise (montes y valles visibles con ~8% de desplazamiento radial).
  - [x] Conectar activación automática tras fade out de `LandingSequenceAnimation` mediante `enterAtmosphereScene()`.
  - [x] Conectar limpieza automática al completar takeoff mediante `exitAtmosphereScene()`.
- [ ] **Reglas de vuelo y física**
  - [ ] Confirmar en `GameEngine` cómo se aplican actualmente thrust y frenado para enganchar ahí la detección de baja velocidad.
  - [ ] Añadir una rutina `applyAtmosphereGravity()` que solo actúe cuando el modo atmosférico esté activo y la velocidad sea inferior a los umbrales definidos en `Sistema_Landing_Narrativa.md`.
  - [ ] Integrar los SFX de aire/stall reutilizando el `AudioEngineService` existente y los IDs `sfx_passby_air` / `sfx_stall`.
- [ ] **Aterrizaje y despegue**
  - [ ] Exponer un detector de colisión simple entre la nave y la esfera de suelo (radio configurable) que reaproveche `handleLandingTouchdown` para abrir el diálogo.
  - [ ] Conectar el umbral de altura sobre la esfera del cielo con la animación de takeoff existente, restaurando el renderer del sistema solar y limpiando el estado atmosférico.
  - [ ] Añadir polvo/cámara fija usando los componentes ya presentes en la secuencia de aterrizaje (solo disparar cuando `landingContext.autoLand === true`).
- [ ] **Documentación y QA**
  - [ ] Actualizar Wiki (`/src/app/wiki/pages/spaceship` y `documentation/Resumen_Proyecto_y_Progreso.md`) describiendo el flujo simplificado.
  - [ ] Registrar las pruebas manuales (descenso, vuelo bajo, salida por cielo, aterrizaje manual y auto) en la bitácora QA.
  - [ ] Ejecutar `npm run build` tras cada fase completada.
