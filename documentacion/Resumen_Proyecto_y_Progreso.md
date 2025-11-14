# AtroPELLO — Resumen para Agentes de Desarrollo

Este documento resume el estado actual del juego, los sistemas fundamentales ya implementados, y las decisiones clave tomadas en esta sesión para que otro agente pueda retomar el hilo de trabajo con rapidez.

## Visión general del juego

- Tecnología: Angular 20 (SPA con SSR y zoneless), WebGL2 para renderizado 3D, Canvas 2D para HUD proyectado a textura.
- Núcleo: `GameEngine` orquesta el bucle de update/render, administra objetos (nave, asteroides, planetas), shaders, texturas y la UI de cabina.
 

## Sistemas principales implementados

- Motor 3D y escena
  - `GameEngine`: render loop, iluminación, gestión de VAOs/VBOs, instancing opcional para asteroides, culling por distancia/LOD de clústeres.
  - Objetos clave: `Spaceship`, `Asteroid`, `SuperAsteroid`, `Planet` y variantes (Gaseous/Giant/Ringed/EarthSplit), `Sun`, `Portal`, `MegaAsteroid`.
  - Shaders y texturas: `ShaderManager` con servicios especializados (HUD/Outline/etc.) y `TextureManager` con texturas procedurales y cargadas.

- Sistema de Salud y Destrucción Reactivo
  - Arquitectura reactiva: `GameObject` base tiene getter/setter para `healthCurrent` con callback automático cuando salud <= 0.
  - Registro universal: Todo objeto que herede de `GameObject` puede registrar callback de destrucción vía `setDestroyedCallback()`.
  - GameEngine centraliza: Método `registerDestructionCallback()` registra callback para cada objeto al crearlo (planetas, asteroides, portales, debris).
  - Flujo automático: Cualquier modificación de salud (`obj.healthCurrent -= damage`) dispara verificación; si <= 0 → `destroyObject()` automáticamente.
  - Limpieza completa: `destroyObject()` elimina objeto de arrays apropiados (según tipo), limpia targeting (ReticleManager + AdaptiveTargeting), limpia HUD, marca como inactivo.
  - Sin verificaciones manuales: El código de colisiones solo aplica daño; la destrucción es manejada reactivamente por el setter.

- Colisiones y Daño
  - `checkCollisions()`: Detecta colisiones nave vs objetos espaciales (asteroides, planetas, sol, portales, debris).
  - Agregación de fuentes: Incluye clusters (objects), ephemeral asteroids, independent asteroids, planets, sun, portals, mega asteroids en planetDebris.
  - Filtrado por `isActive()`: Solo objetos activos son considerados para colisiones.
  - Algoritmo de daño masivo: Calcula masa relativa; objeto menor recibe más daño (distribución 70/30).
  - Cooldown de colisión: `collisionDamageCooldown` (Map) previene daño repetitivo del mismo par de objetos.
  - Independización de asteroides: Al recibir daño en cluster, el asteroide se independiza (`makeAsteroidIndependent()`) con velocidad propia.
  - Feedback visual: Viñeta de impacto, slide de cámara, mensajes de marquesina en HUD.

- Muerte y Respawn del Jugador
  - Callback reactivo de nave: `Spaceship` registra callback específico para muerte que dispara `triggerDeathDialog()`.
  - Death Dialog: Modal "The Old & Only One" con cita de Lovecraft, ofrece dos opciones:
    1. **Reiniciar Sistema**: `respawnGame()` regenera sistema solar completo, limpia objetos, recrea geometría, limpia targets, reinicia game loop.
    2. **Cargar Partida**: `loadSaveAfterDeath()` posiciona nave cerca de portal más cercano, restaura salud/energía completas, limpia targets, reinicia game loop.
  - Autenticación: "Cargar Partida" solo visible si usuario autenticado (AuthService con sessionStorage).
  - Limpieza de targets: Ambos métodos llaman `clearTargetSelection()` para limpiar HUD, outliner, adaptive targeting y reticle.

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
  - Flujo de casteo estandarizado para tecla rápida "h": cámara 0 → pre‑cast 2s con bloqueo de controles → placeholder → efecto.
  - Hechizos disponibles:
    - **Rito Doble de Tiempo**: duplica `maxSpeed`/aceleración/freno durante 120s; contador MM:SS carmesí centrado en brújula; restauración y clamp al expirar; recasteo refresca.
    - **Salto al Vacío**: requiere objetivo válido y consume 50u de energía del vacío; aborta con placeholder si no hay recursos o condiciones.
    - **Gate Rite**: Requiere planeta seleccionado y distancia ≤50u a superficie; crea portal arcano bidireccional para viajar entre sistemas solares.
    - **Eternal Rite**: Ritual de suicidio. Reduce salud de nave a 0, disparando sistema de muerte reactivo. Útil para testing y narrativa.
  - Glifos bloqueados: `ignis`, `lux`, `vinculum`, `tempus` (futuros hechizos).
  - Recursos: Energía del Vacío `max=100`, `actual=100` al inicio.

## Verificación de documentación existente

- `documentacion/DebugOverlay.md`: Correcto respecto al toggle con F1 y al servicio de overlay. Mantener.
- `documentacion/Dialog.md`: Alineado con el componente modal actual y su uso. Mantener.
- `documentacion/Layout.md`: Coherente con la estructura de componentes (header/main/footer) y el enfoque Flexbox. Mantener.
- `documentacion/OutlineShaders.md`: Describe fielmente la Fase 4 (OutlineRenderer, dos pasadas, tipos y pipeline). Se han suavizado las cifras de rendimiento en este repo para evitar métricas no verificadas.
- `documentacion/Grimorio_y_Hechizos.md`: NUEVO. Añadido para centralizar la documentación del libro del grimorio y los hechizos (flujo de casteo, HUD/Brújula y recursos). Coherente con el estado actual del código.

## Referencias rápidas

- Bucle y sistemas: `src/app/game/GameEngine.ts`
- Sistema de salud reactivo: `src/app/game/GameObject.ts` (setter de `healthCurrent`), `src/app/game/Spaceship.ts` (override con callbacks duales)
- Colisiones y daño: `GameEngine.checkCollisions()`, `applyDamageToObject()`, `destroyObject()`
- Respawn y muerte: `GameEngine.triggerDeathDialog()`, `respawnGame()`, `loadSaveAfterDeath()`; `src/app/components/dialogs/death-dialog/`
- HUD: `src/app/game/hud/HUDManager.ts`
- Retícula y outlines: `src/app/game/targeting/core/ReticleManager.ts`, `src/app/game/targeting/rendering/OutlineRenderer.ts`
- Shaders: `src/app/game/shaders/*`
- Audio (arquitectura): `documentacion/Audio_Sistema_Arquitectura.md`
- Audio (assets y formatos): `documentacion/Audio_Assets_Guia.md`
- Grimorio: `src/app/game/hud/GrimoirePanel.ts`, hechizos en `GameEngine.handleKeyDown()` (tecla 'h')

## Notas de implementación

- Angular zoneless y SSR configurados en el proyecto; el juego corre en canvas WebGL2 y renderiza overlays con texturas.
- El sistema de clústeres de asteroides usa LOD y opciones de instanciado para rendimiento.
- Los servicios de debug pueden activarse/desactivarse en tiempo real; el overlay de nave se actualiza con telemetría cada frame.
- **Patrón reactivo universal**: Todos los GameObjects usan getter/setter de `healthCurrent` para destrucción automática. El GameEngine registra callbacks al crear objetos.
- **Spaceship tiene doble callback**: uno para cambios de salud (logging, efectos) y otro para muerte (death dialog). Ambos se disparan desde el setter override.
- **Independización de asteroides**: Cuando un asteroide en cluster recibe daño, se independiza con velocidad propia y se registra callback de destrucción.

Actualizado: Noviembre 2025.
