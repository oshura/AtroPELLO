# Plan — Terreno fractal y colisiones de precisión

## Contexto
- El terreno atmosférico actual usa un heightmap procedural basado en ruido simple y paletas estratificadas, pero carece de detalle fractal y transiciones finas por altitud.
- Las colisiones siguen un modelo esférico aproximado para planetas/suelo; necesitamos fidelidad acorde al relieve para aterrizajes y vuelo rasante.
- Se investigaron técnicas de ruido fractal (Red Blob Games — fBm/multifractales), generación planetaria procedural (Game Developer, Sean O'Neil) y LOD con clipmaps (GPU Gems 2, capítulo 2). Para colisiones precisas se revisó Swept AABB + ordenación por tiempo de impacto (GameDev.net) como escalón intermedio antes de SAT/GJK.
- El trabajo debe alinearse con `CleanCode_Arquitectura.md`, actualizar la wiki (`/src/app/wiki`) y ejecutar `npm run build` al cierre de cada fase mayor.

## Objetivos
1. Ampliar el generador de relieve atmosférico con pilas fractales (fBm, multifractal híbrido y microdetalle dependiente de latitud) compatibles con WebGL.
2. Implementar LOD progresivo (clipmaps o anillos concéntricos) que mantenga detalle cerca de la cámara sin penalizar FPS.
3. Recalibrar el shading del suelo con gradientes multizona y oclusión ambiental ligera derivada del heightmap.
4. Sustituir el modelo de colisión esférico por uno compuesto (broad-phase + malla local) que soporte vuelo rasante y eventos físicos coherentes.
5. Documentar cada avance, actualizar la wiki y garantizar builds limpias tras cada fase completada.

## Referencias
- Código: `src/app/game/GameEngine.ts`, `src/app/game/atmosphere/AtmosphereSceneManager.ts`, `src/app/game/shaders`, `src/app/game/collision`, `GameStateStore`.
- Documentación: `documentation/Generacion_Sistemas_Solares.md`, `documentation/Sistema_Colisiones.md`, `documentation/Sistema_Colisiones_v2.md`, `documentation/Analisis_Refactor_Fisica_Colisiones.md`, `documentation/Layout.md`, `documentation/Wiki_System.md`.
- Guías externas:
  - Red Blob Games — Noise/Fractional Brownian Motion.
  - Sean O'Neil, "Real-Time Atmospheric Effects in Games" (Game Developer).
  - GPU Gems 2, Cap. 2 — Geometry Clipmaps.
  - GameDev.net — "Swept AABB Collision Detection and Response".

## Fases y checklist
### Fase 0 — Consolidar investigación
- [ ] Registrar en `/documentation/landing-requests/` un resumen técnico de las fuentes (fBm, multifractal, clipmaps, swept AABB) con parámetros sugeridos para AtroPELLO.
- [ ] Definir métricas de aceptación (FPS mínimo, densidad de vértices máxima, tolerancia de penetración < 0.25u).
- [ ] Ejecutar `npm run build` para garantizar baseline limpia antes de tocar el pipeline.

### Fase 1 — Auditoría del pipeline actual
- [ ] Mapear cómo `AtmosphereSceneManager` genera heightmaps y buffers (shader, ruidos, clamps).
- [ ] Documentar la ruta del color (paletas, estratos, mezclas) y localizar puntos de extensión.
- [ ] Inventariar usos de colisiones atmosféricas en `GameEngine` (auto-landing, drift, impactos) y en servicios dependientes.

### Fase 2 — Núcleo fractal de relieve
- [ ] Implementar servicio `FractalNoiseStack` reutilizable con configuraciones (octavas, ganancia, lacunaridad, seed per planeta/bioma).
- [ ] Integrar la pila en `AtmosphereSceneManager` para generar heightmaps multi-escala (base ridged + detalle fBm + micro ruido direccional).
- [ ] Añadir controles de QA (console toggles) para activar/desactivar capas de ruido en runtime.
- [ ] Ejecutar `npm run build` y adjuntar logs al completar la fase.

### Fase 3 — LOD adaptativo (clipmaps/anillos)
- [ ] Diseñar estructura de buffers concéntricos (clipmaps) que se actualicen cerca de la cámara, limitando actualizaciones por frame.
- [ ] Adaptar shaders para combinar clipmaps con desplazamientos locales y stitching sin costuras.
- [ ] Medir impacto en FPS y ajustar tamaños/anillos según objetivos de rendimiento.
- [ ] `npm run build` + QA manual (vuelo rasante Marte/Tierra) tras finalizar.

### Fase 4 — Shading y gradientes avanzados
- [ ] Introducir curvas de color dependientes de altura y latitud (≥6 estratos) con microvariaciones dependientes de pendiente.
- [ ] Aplicar oclusión ambiental ligera derivada del gradient del heightmap y normal perturbada.
- [ ] Revisar iluminación atmosférica para que reaccione a los nuevos datos (tints, dusk/dawn, eventos meteorológicos).
- [ ] Validar en HUD/Telemetry que los nuevos parámetros se publican para QA; `npm run build` al cierre.

### Fase 5 — Colisiones de precisión
- [ ] Implementar broad-phase volumétrica (AABB/OBB) alineada con los anillos/clipmaps cercanos.
- [ ] Aplicar Swept AABB como primer paso para naves rápidas y detectar tiempo de impacto; ordenar eventos por TOI.
- [ ] Diseñar mallas de colisión locales (patches) generadas desde el mismo heightmap para respuesta fina, con fallback al modelo esférico lejos del suelo.
- [ ] Integrar respuestas (deflect, slide) en `GameEngine` respetando `spaceship.externalForces` y turbulencias.
- [ ] `npm run build` y pruebas de vuelo/impacto registradas en bitácora QA.

### Fase 6 — Integración, telemetría y herramientas
- [ ] Añadir métricas (LOD level activo, densidad de vértices, colisiones detectadas) al overlay de debug y a los snapshots de HUD.
- [ ] Crear comandos QA para forzar seeds, teletransportar cámara a zonas críticas y capturar heightmaps.
- [ ] Validar compatibilidad con eventos atmosféricos (drift/turbulencia) y autopilot/auto-landing.
- [ ] `npm run build` + smoke test completo (descenso, aterrizaje, take-off) en dos planetas.

### Fase 7 — Documentación y wiki
- [ ] Actualizar `documentation/Generacion_Sistemas_Solares.md` y `Sistema_Colisiones_v2.md` con el nuevo pipeline.
- [ ] Añadir página en la wiki (`/wiki/terrain`) explicando el relieve fractal y recomendaciones para pilotos.
- [ ] Registrar resultados/QC en `documentation/Resumen_Proyecto_y_Progreso.md` y cerrar el plan si todos los checkboxes están completos.
- [ ] Ejecutar `npm run build` final y adjuntar log en la bitácora.
