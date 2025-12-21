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
  - Canvas adaptativo: `GameEngine.applyCanvasResize()` escucha `webgl-resize` del `WebGLService` y recalcula aspect ratio, viewport y retícula diferenciando píxeles físicos (viewport) y dimensiones CSS (UI). `GameInitializer.updateCanvasSize()` invoca el mismo flujo como respaldo manual, así el HUD, la cámara y el targeting permanecen alineados al redimensionar la ventana o mover el canvas.

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
  - El HUD conserva una pila LIFO con las 10 alertas más recientes y permite reinyectar la última con <kbd>Backspace</kbd>; la repetición se muestra una sola vuelta y vuelve a la pila automáticamente.
  - Cooldown unificado para paneles diegéticos: `PANEL_REOPEN_COOLDOWN_MS = 500 ms` en `GameEngine` reemplaza los literales anteriores y aplica la misma ventana para volver a abrir mapa, grimorio e inventario sin bloquear al usuario más de medio segundo.
  - Sistema de retícula: `ReticleManager` (detección 3D→2D, estados y rendering), se actualiza y renderiza en cada frame.
  - Retícula de vector de vuelo: el `GameEngine` proyecta el vector forward real de la nave sobre el viewport y entrega el estado a un overlay Canvas2D independiente del HUD. `FlightVectorReticle` se reutiliza para pintar la cruz directamente sobre la pantalla principal, se oculta al abrir paneles diegéticos (mapa/grimorio/inventario), se atenúa cerca de los bordes y escala con la velocidad actual; cuando existan armas pasará automáticamente al modo "combat" para servir como punto de mira.
  - Overlays/Paneles: `SolarSystemPanel` (mapa top-down), sistema de diálogos modales (`src/app/components/modal/`).
  - Debug: Overlay de datos de la nave (F1) vía servicios en `services/debug`. Tecla F1 mapea al toggle del overlay desde `components/game/game.ts`.
  - El footer expone ahora «Third Party Licenses», que abre `/third-party-licenses/` (estático en `public/third-party-licenses`) con la tabla de dependencias y enlaces directos a los textos MIT/Apache/0BSD almacenados en `public/third-party-licenses/licenses/`.
  - Horizonte artificial atmosférico: `calculateAtmosphereAttitude()` (util nuevo en `game/utils`) deriva pitch/roll usando la normal planetaria y alimenta al `Compass` cuando `atmosphereMode` está activo. El instrumento muestra cielo/suelo correctos, altímetro digital (altura sobre el radio terrestre) y expone `atmosphereMode/pitch/roll/altitude` en `getDebugInfo()` para QA.

- SEO e indexación
  - `src/index.html` ahora incluye título semántico, descripción, canonical `https://to3.atropello-games.es/`, etiquetas Open Graph/Twitter y JSON-LD (`VideoGame` + `SoftwareApplication`) apuntando a la build WebGL.
  - Servicio `SeoService` (`src/app/services/seo/seo.service.ts`) coordina `<title>`, `<meta>`, canonical dinámico y structured data; se activa desde `AppComponent` al reaccionar a cada `NavigationEnd`.
  - Todas las rutas de la wiki exponen `data.seo` (título, descripción, URL absoluta e imagen) en `wiki.routes.ts`, de modo que cada página overlay empuja sus propios metadatos cuando se visita `/wiki/...` sin romper el canvas del juego.
  - `public/robots.txt` y `public/sitemap.xml` apuntan al dominio to3.atropello-games.es, listan todas las secciones activas de la wiki y declaran `xmlns:xhtml` para evitar errores al añadir `xhtml:link` en el futuro.

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
  - `CloudSettings` centraliza dominios, IDs de Cognito y URLs de retorno; `authLauncherUrl` (`https://www.atropello-games.es/auth/launch`) y `logoutLauncherUrl` (`https://www.atropello-games.es/auth/logout`) se normalizan aunque la configuración sólo entregue el dominio base, y `logoutReturnAllowlist` (por defecto `["https://www.atropello-games.es/"]`) garantiza que el launcher únicamente use destinos aceptados.
  - `SessionCookieService` ahora entiende el valor `payload.signature`: extrae el primer segmento base64, mapea `profile → identity` y sólo usa la firma HMAC si está disponible, manteniendo la cookie `atropello-session` accesible en `.atropello-games.es` sin iframes.
  - `AuthService.loginWithRedirect()` ahora es un wrapper directo que abre `/auth/launch?return=...` y espera a que la landing reescriba la cookie. Al volver al juego se ejecuta `AuthReturnService` y, si no llega callback, el bootstrap lee la cookie compartida.
  - `AuthService.logoutWithRedirect()` limpia el estado local y hoy redirige a `/auth/logout?return=...`, pantalla recientemente añadida en la landing que muestra el estado del sign-out y delega en su propio `AuthService.logoutWithRedirect()` (Hosted UI). Si el launcher fallara, el servicio cae automáticamente al Hosted UI directo.
  - `CloudSavesSessionBridgeService` sigue reflejando `auth.token()`/`auth.identity()` al panel, pero ahora se alimenta exclusivamente de la cookie compartida (o del callback clásico) — no existe handshake.
  - El componente `app-cloud-saves-panel` ahora vive dentro del diálogo de opciones (tab “Partidas”) y solo se renderiza cuando hay sesión Cognito. Desde ahí se exponen las acciones de QA (sync, load latest, save demo, delete) sobre `CloudSavesService`. Ruta rápida en la wiki: `/wiki/cloud-saves`.
  - `GamePersistenceService.saveGame()` ya produce el `SaveGamePayload` v1 real: pausa el loop, serializa jugador, `GameStateStore` y universo, añade metadata (`schemaVersion`, `savedAt`, `elapsedPlayTimeMs`, `systemId`, label del ancla y `userId` vía `CloudSavesSessionBridgeService`) y registra en `LogCategory.SAVE_SYSTEM` el tamaño exacto del JSON para monitorear regresiones.
  - `GamePersistenceService.loadGame()` quedó simétrico: normaliza el payload con `SaveGameMigrationService.ensureLatestSchema()`, crea snapshots completos, hidrata jugador (`PlayerStateSerializer.apply()`), `GameStateStore` (`GameStateSnapshotAdapter.restore()`) y universo (`UniverseStateSnapshotAdapter.ensureRuntimeState()`), y reinicia el engine con `GameEngine.restartWithContext()`. Todos los pasos emiten trazas `LogCategory.SAVE_SYSTEM` con IDs de sistema/ancla para facilitar QA. La verificación manual in-game está pendiente hasta contar con capturas reales.
  - La metadata incluye ahora `snapshotLabel` y `snapshotId` del sistema activo, de modo que Gate Rite + guardado remoto siempre puede localizar el snapshot correcto incluso si el anchor por defecto sigue apuntando al trail humano.
  - Cuando `UniverseStateSnapshotService.ensureSystemState()` no consigue aplicar el snapshot solicitado (por ejemplo justo después de abrir un Gate Rite y antes de persistir el sistema), el cargador detecta el desfase y rehidrata directamente el sistema con el payload incrustado en `SaveGamePayload.universe` antes de reiniciar el engine, garantizando que reaparezcas en el sistema correcto aunque falte la etiqueta.
  - Tras pausar para guardar o cargar, el `GameEngine` ahora cancela explícitamente el `requestAnimationFrame` pendiente y registra checkpoints `LogCategory.GAME_LOOP` (`scheduleNextFrame`/`cancelPendingFrame`) para detectar solapes. Así evitamos que `saveGame()` deje dos bucles activos y provoque la caída a ~5 FPS que se observaba tras usar el CTA o el panel.
  - `CloudSavesService.saveCurrentGame()`/`loadGameFromSlot()` ahora delegan en `GamePersistenceService` para serializar el payload v1 real, agregan metadata específica del slot (sistema, anchor, build label, `playTimeMs`) antes de invocar la API REST y usan una capa común de `describeError()` para mapear expiraciones de token, esquemas inválidos o fallos de red a mensajes en castellano que consumen tanto el panel como el nuevo CTA del header.
  - El tab “Partidas” ya interactúa con slots reales: `CloudSavesPanelComponent` muestra metadata formateada, confirma cargas antes de llamar a `loadGameFromSlot()` y mantiene un log del último resultado; el header ofrece el botón “Guardar partida” que dispara `saveCurrentGame(0)` y refleja feedback inline sin abrir el diálogo. Ambos puntos de entrada comparten el flag `saving()` para evitar capturas concurrentes y restauran automáticamente el estado del loop si ocurre un error.
  - Documentación ampliada en `documentacion/SaveGame_Serializacion_Cloud.md`, que traza de extremo a extremo cómo se captura, envía, migra y rehidrata un payload guardado en la nube (incluye pausa del loop, tokens Cognito y reinicio del engine).

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

Nota: las pruebas manuales de carga desde la UI se programaron para la próxima sesión con payloads reales, una vez concluida la actualización de documentación y wiki.

Actualizado: Febrero 2025.

## Bitácora QA global (pendiente)

- [ ] **Fase 2** — reproducir órbita prolongada, aterrizaje completo y Gate Rite después de cargar un payload migrado para validar que `GamePersistenceService.loadGame()` deja el runtime consistente.
- [ ] **CTA del header** — iniciar sesión, guardar mediante el botón "Guardar partida", comprobar en la API que el slot 0 contiene metadata completa y que los logs `Cloud save uploaded` muestran `systemId/anchorLabel` reales.
- [ ] **Panel “Partidas”** — ejecutar `Sync slots → Save slot 0 → Load latest`, confirmar que el bloque “Last load” muestra sistema/ancla/build y que `durationMs` coincide con los logs.
- [ ] **Errores resilientes** — forzar expiración de token y corte de red; validar que el CTA y el panel muestran el mismo mensaje mapeado por `describeError()` y que el loop queda reanudado tras cada fallo.
