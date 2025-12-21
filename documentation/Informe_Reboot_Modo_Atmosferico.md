# Informe — Reboot del modo atmosférico ligero

Este documento reemplaza al plan `documentation/plans/planet-atmosphere-reboot.md` como referencia operativa. Resume qué se implementó, dónde vive el código y qué dependencias deben considerarse antes de evolucionar el modo atmosférico.

## Resumen ejecutivo

| Área | Estado actual |
| --- | --- |
| Escena atmosférica mínima | Dos esferas (suelo/cielo) manejadas por `AtmosphereSceneManager`, heightmap procedural (3 octavas) y paleta por bioma. |
| Integración GameEngine | Hooks `enterAtmosphereScene()` / `exitAtmosphereScene()` controlan fade, impulso inicial y limpieza. `AtmosphereSceneState` encapsula payload y HUD sigue activo. |
| Reglas de vuelo | Gravedad gradual, impulso inicial de 3u tras el fade, detección de stall, swap automático de loops `sfx_thruster` ↔ `sfx_thruster_atmo` y SFX de aire reutilizando `AudioEngineService`. |
| HUD | Horizonte artificial con `calculateAtmosphereAttitude()`, altímetro real, telemetría QA, Compass interpolado y sky tint suavizado sin escalones. |
| Aterrizaje/Despegue | Detector físico de suelo, autoland suave, piloto verde persistente, cámara bloqueada con polvo, panel diferido 2s tras el touchdown auto y auto-takeoff a 1000u. |
| QA | Bitácora manual 2025 documenta descenso, vuelo bajo, salida por cielo, aterrizaje manual y auto. Builds validados con `npm run build`. |

## Logros funcionales

### 1. Entrada y posicionamiento
- Tras `LandingSequence`, `GameEngine.enterAtmosphereScene()` crea `AtmosphereSceneState`, activa overlay negro de 1.9 s (`ScreenOverlayRenderer`) y silencia la música mediante `MusicDirectorService.setScene('silence')`.
- La nave se posiciona en `surfacePoint + normal * altitudeInicial`, se aplica `applyAtmosphereLandingImpulse()` para fijar `currentSpeed/targetSpeed` en 3u y se marca `stallWarning = false`.

### 2. Vuelo bajo y control continuo
- `applyAtmosphereGravity()` actúa solo en modo atmosférico y ajusta la velocidad cuando cae por debajo de los umbrales de `Sistema_Landing_Narrativa.md`.
- Todos los subsistemas (HUD, targeting, inputs) permanecen activos; no hay modo “mini juego” separado.
- `GameEngine.requestThrusterClip()` conmuta el loop del thruster: `sfx_thruster` en espacio y `sfx_thruster_atmo` (Airthrust) dentro de la escena atmosférica, reutilizando el mismo controlador y fades para que el cambio sea inaudible.

### 3. HUD especializado
- `calculateAtmosphereAttitude()` (HUD Utils) usa normal planetaria exacta y vectores sanitizados para derivar pitch/roll desacoplados.
- `CompassComponent` interpola pitch/roll/altitud antes de renderizar, evitando saltos tras landing.
- `AtmosphereSceneManager.computeSkyTint()` reemplaza la cuantización anterior por una curva cúbica continua, así el domo del cielo se tiñe de azul bajo sin bandas visibles al descender.
- Debug HUD expone `atmosphereMode`, pitch, roll, altitud para sesiones QA.

### 4. Aterrizaje manual y asistido
- `GameEngine.computeLandingStatus()` detecta si la escena atmosférica está activa y delega en `computeAtmosphereLandingStatus()` para reutilizar los mismos márgenes del espacio (≤50u, ≤5u/s, ±60° con hold de 3 s). El piloto verde vuelve a aparecer y permite <kbd>Enter</kbd>.
- `GameEngine.detectAtmosphereGroundCollision()` compara distancia nave-centro vs `groundCollisionRadius` + `shipRadius` y dispara `onAtmosphereGroundCollision()` → `handleLandingTouchdown()`.
- Si la componente vertical <1u, se marca `landingContext.autoLand = true`, se bloquea la cámara (“locked to ground”), se generan partículas de polvo (`ParticleEffectsService`) y se reproduce SFX suave.
- `openLandingPanelWithDelay()` aplica un retardo de 2 s para abrir el panel después del burst de polvo, manteniendo la cámara bloqueada hasta que la animación termine.

### 5. Despegue y salida
- El piloto puede iniciar `startTakeoffSequence()` desde el panel tradicional.
- `GameEngine.maybeTriggerAtmosphereAutoTakeoff()` monitoriza `computeAltitudeAboveGround()`; al superar 1000u lanza la secuencia existente, restaura renderer espacial y música original via `restoreMusicAfterAtmosphere()`.

### 6. QA y documentación
- La bitácora “Sesión atmósfera ligera — Feb 2025” en `Resumen_Proyecto_y_Progreso.md` cubre los flujos completos (descenso, vuelo bajo, salida, landing manual, auto-landing).
- La wiki de la nave (`src/app/wiki/pages/spaceship/spaceship.ts`) documenta: impulso automático, cámara bloqueada, piloto verde persistente, auto-takeoff y flujo simplificado en atmósfera.

## Decisiones arquitectónicas clave

1. **Estado único del engine**: No existe un sub-engine separado. Se reutiliza `GameEngine` y se añaden flags (`atmosphereSceneActive`, `landingContext.autoLand`) para habilitar reglas específicas sin duplicar subsistemas.
2. **Reutilización de pipelines**: HUD, audio, targeting y paneles continuan funcionando porque `AtmosphereSceneState` solo añade datos (normal, surface point, palette) en lugar de reemplazarlos.
3. **Condiciones de aterrizaje centralizadas**: `computeLandingStatus()` sigue siendo la única fuente de verdad; el nuevo método atmosférico usa la misma métrica de alineación y velocidad, garantizando coherencia entre modos.
4. **Cámara y FX compartidos**: Los assets de polvo y la cámara bloqueada reutilizan los componentes existentes de la `LandingSequence` para evitar duplicación de shaders/animaciones.
5. **Callbacks simétricos**: `notifyLandingSequenceStarted/Finished` y `notifyTakeoffSequenceStarted/Finished` manipulan los mismos flags y supresiones de daño en ambos modos, evitando ramas condicionales dispersas.

## Dependencias y puntos de extensión

| Componente | Rol | Archivos relevantes |
| --- | --- | --- |
| `AtmosphereSceneManager` | Render de suelo/cielo, heightmap, paleta por bioma | `src/app/game/atmosphere/AtmosphereSceneManager.ts` |
| `GameEngine` | Hooks de entrada/salida, impulso, gravedad, landing/takeoff, HUD y QA | `src/app/game/GameEngine.ts` |
| HUD (Compass + debug) | Horizonte artificial y telemetría | `src/app/game/hud/components/compass/*`, `calculateAtmosphereAttitude()` |
| Audio | Silencio dirigido y SFX de aire | `src/app/services/audio/audio-engine.service.ts`, `MusicDirectorService` |
| Wiki + documentación | Transferencia de conocimiento | `src/app/wiki/pages/spaceship/spaceship.ts`, `documentation/Resumen_Proyecto_y_Progreso.md` |

## Referencias rápidas de código

1. **Activación escena** — `GameEngine.enterAtmosphereScene()` (crea estado, overlay, impulso, audio).
2. **Desactivación escena** — `GameEngine.exitAtmosphereScene()` (restaura renderer, música y flags).
3. **Impulso inicial** — `GameEngine.applyAtmosphereLandingImpulse()`.
4. **Gravedad y velocidad** — `GameEngine.applyAtmosphereGravity()`.
5. **Landing ready en atmósfera** — `GameEngine.computeAtmosphereLandingStatus()`.
6. **Autoland suave** — `GameEngine.onAtmosphereGroundCollision()` y `startAtmosphereAutoLandingCamera()`.
7. **Auto-takeoff** — `GameEngine.maybeTriggerAtmosphereAutoTakeoff()`.
8. **Render suelo/cielo** — `AtmosphereSceneManager.initializeScene()` y `updatePlanetPalette()`.
9. **HUD** — `calculateAtmosphereAttitude()` + `CompassComponent`.
10. **Wiki/QA** — `src/app/wiki/pages/spaceship/spaceship.ts`, `documentation/Resumen_Proyecto_y_Progreso.md`.

## Recomendaciones para mejoras futuras

- Revisar `AtmosphereSceneManager` para soportar sombras proyectadas o niebla volumétrica sin perder el pipeline minimalista.
- Extraer la lógica de cámara bloqueada a un servicio reutilizable para futuras cinemáticas.
- Ampliar la bitácora QA con capturas automáticas (logs + screenshots) para aterrizajes extremos (tormentas, templos, etc.).
- Mantener sincronizados los controles documentados en la wiki y la implementación de `Input_Bindings.md` cuando se añadan nuevas acciones específicas de atmósfera.
