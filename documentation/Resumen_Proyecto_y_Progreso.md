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
  - PortalPersistenceService ahora mantiene índices de portales y sistemas: cada snapshot guarda su `persistentSystemId` y, si se vuelve a capturar el mismo sistema, la versión anterior se elimina automáticamente. Así ningún portal puede apuntar a snapshots obsoletos tras Gate Rite, respawn o traversal.
  - El dios primigenio asignado a cada sistema deja de re-rollearse: `SolarSystemRuntimeSerializer` inyecta `meta.elderGod` en cada captura y PortalPersistenceService preserva ese dato en los snapshots, de modo que cualquier respawn, Sigillum o Gate Rite rehidrata la misma deidad que estaba presente cuando se capturó el sistema.
  - El snapshot del Sigillum sólo se refresca cuando sigues en el mismo sistema que el sello: `persistActiveSystemState()` pasa la captura recién clonada a `refreshRespawnAnchorSnapshot()`, que ahora valida `systemId/persistentSystemId` antes de sobrescribir `respawn-anchor-latest`. Así evitas que un Gate Rite o una muerte en otro sistema borren los portales que dejaste grabados en el Sigillum.
  - `LesserBeingController` compara cada frame la distancia real a la nave con la distancia a la superficie del planeta libre más cercano; Semillas Estelares y Vampiros de Fuego permanecen en `ENGAGING_SHIP` mientras la nave sea el objetivo más cercano y sólo se desvían a colonizar un planeta si éste está claramente más cerca y disponible.

- HUD y UI
  - `HUDManager`: genera el HUD en un canvas 2D y lo sube a una textura WebGL; incluye elementos como brújula, velocímetro, barras y panel de target.
  - Panel de marquee con scroll suavizado por delta-time y compensador automático para hardware de 32 FPS; cada mensaje completa su vuelta configurada y se elimina de la cola para evitar spam.
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

- Autenticación y Cloud Saves (nuevo en TO³)
  - `AuthService`, `AuthIntegrationService`, `AuthReturnService` y `SessionCookieService` fueron portados desde la landing. El header muestra el botón “Iniciar Sesión” real, badge con `displayName()` y opción de logout (`src/app/components/header`).
  - `CloudSettings` centraliza dominios, IDs de Cognito y URLs de retorno; ahora incluye `authLauncherUrl` (por defecto `https://www.atropello-games.es/auth/launch`) para delegar el login en la landing.
  - También define `sessionCookieDomain` (= `.atropello-games.es`) para que la landing escriba la cookie compartida con un dominio aceptado por `www` y cualquier subdominio del juego.
  - `SessionBridgeService` monta un iframe oculto a `https://www.atropello-games.es/bridge.html`, envía `session:ping/session:get`, valida el `postMessage` por `bridgeOrigin` y utiliza `AuthService.syncExternalSession()` para rehidratar el token cuando la landing devuelve el control. Refresca la sesión al recuperar el foco/visibilidad.
  - `CloudSavesSessionBridgeService` ya no toca cookies directamente: escucha las señales de `AuthService` (alimentadas por el bridge) y expone `getToken()`/`onSessionChange()` para el SDK, permitiendo firmar peticiones REST desde cualquier subdominio.
  - El componente `app-cloud-saves-panel` ahora vive dentro del diálogo de opciones (tab “Partidas”) y solo se renderiza cuando hay sesión Cognito. Desde ahí se exponen las acciones de QA (sync, load latest, save demo, delete) sobre `CloudSavesService`. Ruta rápida en la wiki: `/wiki/cloud-saves`.

## Próximos pasos inmediatos

- **FASE 6 COMPLETADA** ✅: Event handling extraído a `PanelEventCoordinator` service (ver `documentacion/FASE_6_PanelEventCoordinator.md`)
  - GameEngine reducido de 6,449 → 6,161 líneas (-288 líneas, -4.5%)
  - Event routing centralizado en service inyectable y testeable
  - 11 callbacks implementados (map/grimoire/3D/camera/ship controls)
  - Métodos legacy convertidos a stubs (updateMapClickBinding, updateGrimoirePointerBinding)

- **FASE 7a-7b COMPLETADAS** ✅: GameStateStore implementado (ver `documentacion/Analisis_GameStateStore.md`)
  - Servicio `GameStateStore` creado con todas las colecciones del juego (500+ líneas)
  - GameEngine refactorizado para usar gameState en lugar de arrays privados
  - 15+ propiedades de GameEngine hechas públicas para acceso tipado
  - Type safety mejorado: eliminados TODOS los `(engine as any)` casts (0 restantes)
  - GameEngine reducido de 6,493 → 6,493 líneas (simplificado internamente)
  - Archivos actualizados: void-jump, gate-rite, speed-rite, disruption-rite, solar-system.service
  - Camera.ts: añadido getter `fov` para acceso tipado desde targeting system
  - **Propiedades GameEngine públicas**: textureManager, hudManager, adaptiveTargeting, planetDebris, voidJumpActive, collisionsDisabled, portalRenderer, _targetDetailsCache, applySpeedRite(), showPlaceholderText(), startDisruptionBeam()

- **FASE 6b PENDIENTE**: Extraer `PanelStateManager` (cooldowns, mutual exclusivity, panel lifecycle)
- **FASE 6c PENDIENTE**: Centralizar UI audio en `UIAudioService` (event-driven audio triggers)
- **FASE 6d PENDIENTE**: Opcional `CursorManager` para styling de cursor
- **FASE 7c PENDIENTE**: Migrar servicios restantes a GameStateStore (CollisionManager, AsteroidCluster si necesario)
- **FASE 7d PENDIENTE**: Testing completo de GameStateStore + GameEngine

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
    - **Salto al Vacío**: requiere objetivo válido (> 4000u) y ya no consume energía del vacío; aborta con placeholder si la distancia o el objetivo no cumplen las condiciones.
    - **Gate Rite**: Requiere planeta seleccionado y distancia ≤50u a superficie; crea portal arcano bidireccional para viajar entre sistemas solares.
    - **Eternal Rite**: Ritual de suicidio. Reduce salud de nave a 0, disparando sistema de muerte reactivo. Útil para testing y narrativa.
    - **Quimio Sigillum**: Rito de rejuvenecimiento que devuelve +5% de supervivencia (cap 100%) con feedback instantáneo en HUD; no gasta recursos si ya estás al máximo.
  - Glifos bloqueados: `ignis`, `lux`, `vinculum`, `tempus` (futuros hechizos).
  - Recursos: Energía del Vacío `max=100`, `actual=100` al inicio.

## Verificación de documentación existente

- `documentacion/DebugOverlay.md`: Correcto respecto al toggle con F1 y al servicio de overlay. Mantener.
- `documentacion/Dialog.md`: Alineado con el componente modal actual y su uso. Mantener.
- `documentacion/Layout.md`: Coherente con la estructura de componentes (header/main/footer) y el enfoque Flexbox. Mantener.
- `documentacion/OutlineShaders.md`: Describe fielmente la Fase 4 (OutlineRenderer, dos pasadas, tipos y pipeline). Se han suavizado las cifras de rendimiento en este repo para evitar métricas no verificadas.
- `documentacion/Grimorio_y_Hechizos.md`: NUEVO. Añadido para centralizar la documentación del libro del grimorio y los hechizos (flujo de casteo, HUD/Brújula y recursos). Coherente con el estado actual del código.
- `documentacion/FASE_6_PanelEventCoordinator.md`: **NUEVO**. Documenta la extracción de event handling de GameEngine a servicio dedicado. Incluye arquitectura, decisiones de diseño, métricas de impacto y roadmap de fases 6b-6d.

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
- **Event handling**: `src/app/services/ui/panel-event-coordinator.service.ts`, documentación en `documentacion/FASE_6_PanelEventCoordinator.md`

## Notas de implementación

- Angular zoneless y SSR configurados en el proyecto; el juego corre en canvas WebGL2 y renderiza overlays con texturas.
- El sistema de clústeres de asteroides usa LOD y opciones de instanciado para rendimiento.
- Los servicios de debug pueden activarse/desactivarse en tiempo real; el overlay de nave se actualiza con telemetría cada frame.
- **Patrón reactivo universal**: Todos los GameObjects usan getter/setter de `healthCurrent` para destrucción automática. El GameEngine registra callbacks al crear objetos.
- **Spaceship tiene doble callback**: uno para cambios de salud (logging, efectos) y otro para muerte (death dialog). Ambos se disparan desde el setter override.
- **Independización de asteroides**: Cuando un asteroide en cluster recibe daño, se independiza con velocidad propia y se registra callback de destrucción.

Actualizado: Noviembre 2025.
