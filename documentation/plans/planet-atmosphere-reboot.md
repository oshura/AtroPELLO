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
- [x] **Reglas de vuelo y física**
  - [x] Confirmar en `GameEngine` cómo se aplican actualmente thrust y frenado para enganchar ahí la detección de baja velocidad.
  - [x] Añadir una rutina `applyAtmosphereGravity()` que solo actúe cuando el modo atmosférico esté activo y la velocidad sea inferior a los umbrales definidos en `Sistema_Landing_Narrativa.md`.
  - [x] Integrar los SFX de aire/stall reutilizando el `AudioEngineService` existente y los IDs `sfx_passby_air` / `sfx_stall`.
- [x] **Instrumentación HUD atmosférica**
  - [x] Revisar `calculateAtmosphereAttitude()` y `Compass` midiendo derivadas de pitch/roll en vuelo real para identificar por qué el horizonte artificial sigue desfasado.
  - [x] Ajustar el pipeline (normal planetaria → actitud → shader) garantizando interpolaciones suaves y sin offsets; documentar el cálculo final en `Wiki_System.md`.
  - [x] Reejecutar/actualizar las pruebas unitarias del horizonte y añadir un caso de regresión que cubra banking agresivo + transición a vuelo nivelado.
- [ ] **Texturizado procedimental del suelo atmosférico**
  - [ ] Definir la paleta y patrones base tomando como referencia el contexto del planeta (`LandingApproachContext`) y documentar el shading esperado.
  - [ ] Implementar sampling procedimental (noise en 2 capas + máscara de biomas) dentro de `AtmosphereSceneManager` para que el suelo deje de ser un color plano.
  - [ ] Sincronizar la textura del suelo con el horizonte artificial para evitar popping visual y validar el resultado en QA visual (capturas WebGL).
- [ ] **Impulso inicial tras landing fade-out**
  - [ ] Añadir hook en `enterAtmosphereScene()` (o equivalente) que aplique una aceleración inicial de 3u justo tras el fade-out de la animación de aterrizaje.
  - [ ] Confirmar que el impulso respeta los límites actuales de `thrust`/`maxSpeed` y que el HUD no dispara alarmas de stall.
  - [ ] Registrar la nueva regla en `Resumen_Proyecto_y_Progreso.md` y en la wiki para que QA la tenga presente.
- [ ] **Aterrizaje y despegue**
  - [ ] Exponer un detector de colisión simple entre la nave y la esfera de suelo (radio configurable) que reaproveche `handleLandingTouchdown` para abrir el diálogo.
  - [ ] Conectar el umbral de altura sobre la esfera del cielo con la animación de takeoff existente, restaurando el renderer del sistema solar y limpiando el estado atmosférico.
  - [ ] Añadir polvo/cámara fija usando los componentes ya presentes en la secuencia de aterrizaje (solo disparar cuando `landingContext.autoLand === true`).
- [ ] **Documentación y QA**
  - [ ] Actualizar Wiki (`/src/app/wiki/pages/spaceship` y `documentation/Resumen_Proyecto_y_Progreso.md`) describiendo el flujo simplificado.
  - [ ] Registrar las pruebas manuales (descenso, vuelo bajo, salida por cielo, aterrizaje manual y auto) en la bitácora QA.
  - [ ] Ejecutar `npm run build` tras cada fase completada.
