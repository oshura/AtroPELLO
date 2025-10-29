# AtroPELLO — Resumen para Agentes de Desarrollo

Este documento resume el estado actual del juego, los sistemas fundamentales ya implementados, y las decisiones clave tomadas en esta sesión para que otro agente pueda retomar el hilo de trabajo con rapidez.

## Visión general del juego

- Tecnología: Angular 20 (SPA con SSR y zoneless), WebGL2 para renderizado 3D, Canvas 2D para HUD proyectado a textura.
- Núcleo: `GameEngine` orquesta el bucle de update/render, administra objetos (nave, asteroides, planetas), shaders, texturas y la UI de cabina.
- Objetivo jugable en curso: minijuego de aterrizaje sobre planetas mediante “ventanas” en la superficie.

## Sistemas principales implementados

- Motor 3D y escena
  - `GameEngine`: render loop, iluminación, gestión de VAOs/VBOs, instancing opcional para asteroides, culling por distancia/LOD de clústeres.
  - Objetos clave: `Spaceship`, `Asteroid`, `SuperAsteroid`, `Planet` y variantes (Gaseous/Giant/Ringed/EarthSplit), `Sun`.
  - Shaders y texturas: `ShaderManager` con servicios especializados (HUD/Outline/etc.) y `TextureManager` con texturas procedurales y cargadas.

- HUD y UI
  - `HUDManager`: genera el HUD en un canvas 2D y lo sube a una textura WebGL; incluye elementos como brújula, velocímetro, barras y panel de target.
  - Sistema de retícula: `ReticleManager` (detección 3D→2D, estados y rendering), se actualiza y renderiza en cada frame.
  - Overlays/Paneles: `SolarSystemPanel` (mapa top-down), sistema de diálogos modales (`src/app/components/modal/`).
  - Debug: Overlay de datos de la nave (F1) vía servicios en `services/debug`. Tecla F1 mapea al toggle del overlay desde `components/game/game.ts`.

- Targeting y outlines (Fase 4)
  - `OutlineRenderer` (en `game/targeting/rendering/`): pipeline de dos pasadas con framebuffer offscreen y post-proceso para resaltar objetivos.
  - Tipos: SOLID, GLOW, PULSE, SCAN, DANGER con opciones (grosor, intensidad, frecuencia, color RGBA).
  - Integración: `ReticleManager` gestiona add/remove/update y llama a `renderOutlines`; `ShaderManager` provee los programas necesarios (vía `OutlineShaderService`).

## Minijuego de aterrizaje (estado actual)

Requisitos acordados:
- Dos “ventanas” en la superficie del planeta visible en HUD:
  1) Ventana de impacto actual (dirección de avance de la nave).
  2) Ventana “ideal”, desplazada +30° a lo largo de la tangente.
- Activación de ventanas solo cuando la nave está a ≤ 250u de la superficie del planeta.
- Aterrizaje válido: cruzar de fuera→dentro del planeta atravesando la ventana ideal con velocidad relativa ≤ 5u. Si no, se considera choque y respawn.
- Color de la ventana ideal: verde (≤ 5u) o roja (> 5u).

Implementación:
- Cálculo en `GameEngine.updateLandingSystem(...)`:
  - Intersección rayo-esfera para encontrar el punto de impacto frontal.
  - Base tangente en la superficie (t1: proyección de la dirección hacia delante; t2: n × t1).
  - Centro ideal a +30° con respecto a la normal n en la dirección t1.
  - Quads de las dos ventanas, proyectados a NDC con `worldToNDC`, enviados al HUD para su dibujo.
  - Validación de entrada al cruzar el radio del planeta: proyección del punto de cruce sobre la base de la ventana ideal y verificación de límites + velocidad.
- Visualización en HUD: actualmente se dibuja sobre el HUD principal. Próximo paso es moverlo a una capa “background HUD” a pantalla completa detrás del HUD de cabina para que siempre sean visibles al mirar al planeta.
- Tamaños: se acordó hacer ambas ventanas más pequeñas y que la “ideal” sea mayor que la de impacto. Los factores están en ajuste fino.

## Próximos pasos inmediatos

- Capa HUD de fondo a pantalla completa
  - Objetivo: mantener visibles las ventanas incluso cuando el HUD de cabina cubre parte de la vista.
  - En curso: creación de `LandingOverlay` (Canvas2D → textura WebGL) y uso de `ScreenOverlayRenderer` para dibujarla fullscreen detrás del HUD. Falta completar el “cableado” en `GameEngine` para usarla en lugar de `HUDManager.setLandingWindows(...)`.

- Tuning de tamaños de ventanas
  - Hacer ambas ventanas más pequeñas en general y que la ventana ideal sea más grande que la de impacto. Ajustar clamps/escala por radio del planeta.

- Afinar validación de velocidad (opcional)
  - Si se desea, medir la componente tangencial relativa a la ventana en lugar de la magnitud completa.

## Verificación de documentación existente

- `documentacion/DebugOverlay.md`: Correcto respecto al toggle con F1 y al servicio de overlay. Mantener.
- `documentacion/Dialog.md`: Alineado con el componente modal actual y su uso. Mantener.
- `documentacion/Layout.md`: Coherente con la estructura de componentes (header/main/footer) y el enfoque Flexbox. Mantener.
- `documentacion/OutlineShaders.md`: Describe fielmente la Fase 4 (OutlineRenderer, dos pasadas, tipos y pipeline). Se han suavizado las cifras de rendimiento en este repo para evitar métricas no verificadas.

## Referencias rápidas

- Bucle y sistemas: `src/app/game/GameEngine.ts`
- HUD: `src/app/game/hud/HUDManager.ts`
- Retícula y outlines: `src/app/game/targeting/core/ReticleManager.ts`, `src/app/game/targeting/rendering/OutlineRenderer.ts`
- Shaders: `src/app/game/shaders/*`
- Minijuego aterrizaje: lógica en `GameEngine.updateLandingSystem(...)`

## Notas de implementación

- Angular zoneless y SSR configurados en el proyecto; el juego corre en canvas WebGL2 y renderiza overlays con texturas.
- El sistema de clústeres de asteroides usa LOD y opciones de instanciado para rendimiento.
- Los servicios de debug pueden activarse/desactivarse en tiempo real; el overlay de nave se actualiza con telemetría cada frame.

Actualizado: Octubre 2025.
