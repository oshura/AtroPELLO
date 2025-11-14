# AtroPELLO — Resumen para Agentes de Desarrollo

Este documento resume el estado actual del juego, los sistemas fundamentales ya implementados, y las decisiones clave tomadas en esta sesión para que otro agente pueda retomar el hilo de trabajo con rapidez.

## Visión general del juego

- Tecnología: Angular 20 (SPA con SSR y zoneless), WebGL2 para renderizado 3D, Canvas 2D para HUD proyectado a textura.
- Núcleo: `GameEngine` orquesta el bucle de update/render, administra objetos (nave, asteroides, planetas), shaders, texturas y la UI de cabina.
 

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

- Audio y música (fundación)
  - `AudioEngineService`: contexto Web Audio, buses (music/sfx/voice/ui), carga/decodificación, reproducción (one‑shot/loop), panner 3D, pose del oyente, utilidades (thruster/doppler).
  - `MusicDirectorService`: escenas musicales con crossfades y ducking temporal.
  - Integración: `GameEngine.enableAudio()` desbloquea audio en el primer gesto y arranca música; por frame se actualiza el oyente a partir de la cámara y el thruster se modula con el estado de la nave.

## Próximos pasos inmediatos

- Redefinir presentación de salud en HUD (diseño eliminado; nueva propuesta pendiente).
- Eliminar definitivamente overlay de portal (ya retirado) y evaluar si se necesita indicador textual de cooldown.
- Outliner adaptativo según FPS para subir texturas 2D.
- Revisión adicional Gate Rite (ya sin partículas de colapso ni elementos oculares): validar estabilidad y tiempos.

## Grimorio y Hechizos

- Documentación dedicada: ver `documentacion/Grimorio_y_Hechizos.md`.
- Estado actual:
  - Grimorio a pantalla completa con tooltips diegéticos (volteo en página derecha), selección única sin glow duplicado ni cintas.
  - Flujo de casteo estandarizado para tecla rápida “h”: cámara 0 → pre‑cast 2s con bloqueo de controles → placeholder → efecto.
  - Hechizos:
    - Rito Doble de Tiempo: duplica `maxSpeed`/aceleración/freno durante 120s; contador MM:SS carmesí centrado en brújula; restauración y clamp al expirar; recasteo refresca.
    - Salto al Vacío: requiere objetivo válido y consume 50u de energía del vacío; aborta con placeholder si no hay recursos o condiciones.
  - Recursos: Energía del Vacío `max=100`, `actual=100` al inicio.

## Verificación de documentación existente

- `documentacion/DebugOverlay.md`: Correcto respecto al toggle con F1 y al servicio de overlay. Mantener.
- `documentacion/Dialog.md`: Alineado con el componente modal actual y su uso. Mantener.
- `documentacion/Layout.md`: Coherente con la estructura de componentes (header/main/footer) y el enfoque Flexbox. Mantener.
- `documentacion/OutlineShaders.md`: Describe fielmente la Fase 4 (OutlineRenderer, dos pasadas, tipos y pipeline). Se han suavizado las cifras de rendimiento en este repo para evitar métricas no verificadas.
- `documentacion/Grimorio_y_Hechizos.md`: NUEVO. Añadido para centralizar la documentación del libro del grimorio y los hechizos (flujo de casteo, HUD/Brújula y recursos). Coherente con el estado actual del código.

## Referencias rápidas

- Bucle y sistemas: `src/app/game/GameEngine.ts`
- HUD: `src/app/game/hud/HUDManager.ts`
- Retícula y outlines: `src/app/game/targeting/core/ReticleManager.ts`, `src/app/game/targeting/rendering/OutlineRenderer.ts`
- Shaders: `src/app/game/shaders/*`
- Audio (arquitectura): `documentacion/Audio_Sistema_Arquitectura.md`
- Audio (assets y formatos): `documentacion/Audio_Assets_Guia.md`

## Notas de implementación

- Angular zoneless y SSR configurados en el proyecto; el juego corre en canvas WebGL2 y renderiza overlays con texturas.
- El sistema de clústeres de asteroides usa LOD y opciones de instanciado para rendimiento.
- Los servicios de debug pueden activarse/desactivarse en tiempo real; el overlay de nave se actualiza con telemetría cada frame.

Actualizado: Octubre 2025.
