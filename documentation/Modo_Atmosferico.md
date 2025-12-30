# Informe — Reboot del modo atmosférico ligero

Este documento reemplaza al plan `documentation/plans/planet-atmosphere-reboot.md` como referencia operativa. Resume qué se implementó, dónde vive el código y qué dependencias deben considerarse antes de evolucionar el modo atmosférico.

## Resumen ejecutivo

| Área | Estado actual |
| --- | --- |
| Escena atmosférica mínima | `AtmosphereSceneManager` controla suelo/cielo, niebla volumétrica estratificada y doble capa de nubes con iluminación según clima/bioma. |
| Integración GameEngine | Hooks `enterAtmosphereScene()` / `exitAtmosphereScene()` controlan fade, impulso inicial y teardown (incluye limpiar partículas, filtros y audio). `AtmosphereSceneState` encapsula payload y HUD sigue activo. |
| Reglas de vuelo | Gravedad dependiente de altitud (base 10 u/s a 1000 u y 30 u/s pegado al suelo) que ahora se multiplica por el tipo de planeta: Dwarf ×1, Protoplanet ×0, Ringed ×5, Sun/Giant ×10, Tierra y Planetoid ×3 (default para el resto) + clamp por velocidad; impulso inicial fija la nave en `maxSpeed` (10 u) y mantiene el thruster en aceleración continua con swap `sfx_thruster` ↔ `sfx_thruster_atmo`. |
| Clima y turbulencias | `AtmosphereWeatherService` genera eventos por capas (superficie/baja/media/exósfera), actualiza HUD/partículas/audio y aplica drift/turbulencias + filtros/relámpagos en cabina. |
| HUD | Horizonte artificial con `calculateAtmosphereAttitude()`, altímetro real, telemetría QA, Compass interpolado y sky tint suavizado sin escalones. |
| Aterrizaje/Despegue | Cinemática rasante de 5 s (`LandingSequenceAnimation`) con fase extra que atraviesa la esfera del planeta antes del fade; la versión atmosférica (`AtmosphereLandingAnimation`) ahora ejecuta 7 s totales: 5 s de planeo controlado y 2 s finales con giro coreografiado de 90° sobre la normal, despliegue progresivo de alas y touchdown protegido, más 2 s de reposo. Cámara frontal fija, `Landing.wav` al segundo 2, polvo volumétrico anticipado y panel diferido ≥7 s. Detector físico de suelo, piloto verde persistente y auto-takeoff a 1000u se mantienen. |
| QA | Bitácora manual 2025 documenta descenso, vuelo bajo, salida por cielo, aterrizaje manual y auto; nueva sesión clima (dic 2025) cubre tormentas, absorción y relámpagos. Builds validados con `npm run build`. |

## Logros funcionales

### 0. Cinemática rasante del landing
- `LandingSequenceAnimation` ahora se apoya en una línea temporal fija de 5 s: reposiciona la nave detrás del punto de contacto, desacelera y desciende en línea recta hasta quedar a unas pocas unidades de la cámara.
- La cámara pasa a `CameraMode.MANUAL`, se coloca a ras del suelo frente a la nave y realiza un tracking ligero para que el fuselaje ocupe más de la mitad del encuadre mientras se acerca "de cara". El flare final usa una curva cúbica para rematar el gesto de touchdown.
- `AtmosphereLandingAnimation` se alargó a 7 s y reserva los últimos 2 s para un giro de 90° alrededor de la normal del planeta. Durante esa fase la nave mantiene la cámara frontal fija, suaviza el flare en función del giro y `GameEngine.setWingDeploymentProgress()` lleva las alas del 0 % al 100 % usando el nuevo hinge geométrico.
- `ParticleEffectsService` renderiza un rig dedicado de anclajes/escalera: `startLandingAnchorRig()` coloca la base en el punto de contacto, despliega rieles, peldaños y brazos laterales según `setLandingAnchorRigProgress()` y los limpia automáticamente al cerrar la cinemática. El rig usa billboards orientados al plano del suelo, con brazos que avanzan hacia delante y apoyan visualmente el touchdown.
- `ParticleEffectsService` renderiza un rig dedicado de anclajes/escalera: `startLandingAnchorRig()` coloca la base en el punto de contacto, despliega rieles, peldaños y brazos laterales según `setLandingAnchorRigProgress()` y los limpia automáticamente al cerrar la cinemática. El rig usa billboards orientados al plano del suelo, con brazos que avanzan hacia delante y apoyan visualmente el touchdown.
- Cada vez que `GameEngine.startLandingAnchorRig()` entra en escena se dispara el cue `sfx_anchor` (nuevo en `_manifest.json`), dando un golpe audible sincronizado con el despliegue de la escalera.
- El último 18 % del timeline traslada la nave por dentro del casco de la esfera planetaria para que el jugador vea la "entrada" antes del fade negro hacia la escena atmosférica.
- En el 96 % del timeline se invoca `GameEngine.playLandingCinematicTouchdownFx()`, que reutiliza `ParticleEffectsService.createDestructionDebris()` para levantar polvo y dispara `sfx_autoland_touchdown` (o `sfx_passby_air` como fallback) antes de ceder el control al modo atmosférico.

### 1. Entrada y posicionamiento
- Tras `LandingSequence`, `GameEngine.enterAtmosphereScene()` crea `AtmosphereSceneState`, activa overlay negro de 1.9 s (`ScreenOverlayRenderer`) y silencia la música mediante `MusicDirectorService.setScene('silence')`.
- La nave se posiciona en `surfacePoint + normal * altitudeInicial`, se aplica `applyAtmosphereLandingImpulse()` + `enforceAtmosphereMaxEntrySpeed()` para fijar `currentSpeed/targetSpeed` en el `maxSpeed` de la nave (10 u por defecto), se alinea el vector forward y se marca `stallWarning = false`.

### 2. Vuelo bajo y control continuo
	- Rozamiento continuo: `applyAtmosphereDragAndAcceleration()` degrada la `targetSpeed` cada frame cuando la escena atmosférica está activa. El arrastre parte de un valor fijo (0.28 u/s) y escala con la altitud y la turbulencia; el estabilizador vectorial reduce parcialmente la pérdida pero nunca la elimina. La misma rutina limita la ganancia del thruster cuando pulsas `+`, de modo que una tormenta severa puede recortar hasta el 35 % de la aceleración disponible y obliga al piloto a reinyectar empuje periódicamente.

### 3. HUD especializado
- `calculateAtmosphereAttitude()` (HUD Utils) usa normal planetaria exacta y vectores sanitizados para derivar pitch/roll desacoplados.
- `CompassComponent` interpola pitch/roll/altitud antes de renderizar, evitando saltos tras landing.
- `AtmosphereSceneManager.computeSkyTint()` reemplaza la cuantización anterior por una curva cúbica continua, así el domo del cielo se tiñe de azul bajo sin bandas visibles al descender.
- Debug HUD expone `atmosphereMode`, pitch, roll, altitud para sesiones QA.

### 4. Aterrizaje manual y asistido
- `GameEngine.computeLandingStatus()` detecta si la escena atmosférica está activa y delega en `computeAtmosphereLandingStatus()` para reutilizar los mismos márgenes del espacio (≤50u, ≤5u/s, ±60° con hold de 3 s). El piloto verde vuelve a aparecer y permite <kbd>Enter</kbd>.
- `GameEngine.detectAtmosphereGroundCollision()` compara distancia nave-centro vs `groundCollisionRadius` + `shipRadius` y dispara `onAtmosphereGroundCollision()` → `handleLandingTouchdown()`.
- Si la componente vertical <1u, se marca `landingContext.autoLand = true`, se intenta lanzar `AtmosphereLandingAnimation` (7 s totales con 5 s de descenso + 2 s de giro coreografiado y reposo). Durante esa ventana la nave permanece alineada con la normal, reduce el flare según el ángulo de giro y `setWingDeploymentProgress()` lleva las alas al 100 % justo cuando se despliega el rig visual de anclajes: una escalera lumínica cae desde el vientre de la nave, los rieles laterales abrazan la cámara y los brazos delanteros abrazan el suelo antes del toque. La animación asegura `sfx_passby_air` activo, dispara `Landing.wav` al segundo 2 mediante `playAtmosphereLandingApproachCue()`, reproduce `sfx_anchor` cuando se suelta la escalera y genera polvo volumétrico 1 s antes del touchdown (`spawnAtmosphereLandingDustSheets()` + `ParticleEffectsService.spawnLandingDustBillboards()` con depth test deshabilitado durante su render para garantizar que siempre se ve). Todo esto ocurre mientras se bloquean inputs/colisiones hasta completar la cola final. Si el cinemático no está disponible se cae al bloqueo clásico “locked to ground”.
- `openLandingPanelWithDelay()` aplica un retardo de 2 s para abrir el panel después del burst de polvo, manteniendo la cámara bloqueada hasta que la animación termine.
- Al abrir el panel tras la cinemática, `GameEngine` detiene loops atmosféricos (`stopAtmosphereAudio()`), arma un foco de audio dedicado y reproduce `sfx_passby_air` al 50 % en loop mediante `applyLandingPanelAudioFocus()`. El estado se libera cuando el panel se cierra o cuando arranca el despegue.

### 5. Despegue y salida
- El piloto puede iniciar `startTakeoffSequence()` desde el panel tradicional. Ahora dispara una animación dedicada de despegue suave (`GroundTakeoffAnimation`) que levanta la nave unos 50u sobre la superficie, fija la velocidad objetivo en ~5 u/s y desbloquea los controles sin abandonar la escena atmosférica.
- `GameEngine.maybeTriggerAtmosphereAutoTakeoff()` monitoriza `computeAltitudeAboveGround()`; al superar 1000u (o el clearance configurado) invoca `startAtmosphereExitSequence()` para lanzar la fase orbital (`TakeoffSequenceAnimation`) que arranca en el borde de la esfera, ejecuta el drift fuera de la atmósfera y restablece el renderer espacial + música vía `restoreMusicAfterAtmosphere()`.

### 6. QA y documentación
- La bitácora “Sesión atmósfera ligera — Feb 2025” en `Resumen_Proyecto_y_Progreso.md` cubre los flujos completos (descenso, vuelo bajo, salida, landing manual, auto-landing).
- La wiki de la nave (`src/app/wiki/pages/spaceship/spaceship.ts`) documenta: impulso automático, cámara bloqueada, piloto verde persistente, auto-takeoff y flujo simplificado en atmósfera.

### Telemetría HUD/Atmósfera (QA)
1. Abre la consola de debug en el juego y ejecuta `Debug.enableLog('TEXTURE')` para activar el volcado de mezclas en tiempo real.
2. Ejecuta `Debug.Atmosphere.setTextureDebug(true)` para que `AtmosphereSceneManager` regenere el color buffer con estadísticas por muestreo.
3. Vuela sobre Marte durante al menos 20 s manteniendo altitudes entre 50 u y 350 u; el motor imprimirá cada recálculo tanto en consola como en `logs/logs.log`.
4. Verifica que los mensajes muestren `avgMix` entre 0.28 y 0.32, `texturedRatio = 1` y `contrastRange[1] ≥ 0.25`. También debe aparecer `HUDTexture updated` sin errores WebGL.

Si cualquiera de los valores sale de rango, repite la pasada reduciendo la altitud o revisando que el debug siga habilitado; para revertir el tracing basta con volver a llamar a `Debug.enableLog('TEXTURE', false)` y `Debug.Atmosphere.setTextureDebug(false)`.

### 7. Clima estratificado y feedback sensorial
- `AtmosphereWeatherService` mantiene cuatro capas (superficie/baja/media/exósfera) con estados "calma" y eventos dedicados (niebla, lluvia, tormenta eléctrica, polvo, meteoros). Cada evento expone `AtmosphereWeatherSnapshot` con `layerId`, drift, turbulencia, visibilidad objetivo y cues de audio.
- `GameEngine` consume el snapshot para actualizar `AtmosphereWeatherEffectsState`: aplica drift progresivo (`applyAtmosphereProgressiveDrift()`), jitter en nave/cámara, modula gravedad, atenúa impactos (HUD lanza «Absorción atmosférica») y calcula filtros (`renderWeatherCameraFilters()`) + flash de relámpago.
- `ParticleEffectsService.updateWeatherPrecipitation()` pinta lluvia/polvo/meteoros en primer plano tras la escena atmosférica, alineando deriva + velocidad de la nave.
- Audio: `updateWeatherAudioLoop()` reproduce `sfx_weather_*` en el bus `weather`, ajusta volumen según intensidad y sincroniza relámpagos (`sfx_weather_thunder`). El manifiesto `_manifest.json` ya contiene los placeholders.
- Documentación: la wiki sección “Clima volumétrico” y el `Resumen_Proyecto_y_Progreso.md` (apartado HUD/Clima) describen capas, partículas y controles QA. La bitácora incluye ahora la sesión “Clima dinámico — Dic 2025” con pruebas de tormentas, absorción y relámpagos.

### 8. Lectura del relieve y texturas runtime
- `AtmosphereSceneManager` ahora calcula un mapa de curvatura (`ridgeMask`) directamente sobre la esfera del suelo. Las crestas convexas levantan un tinte ámbar casi blanco y los valles permanecen oscuros, de modo que cualquier pico que mire al cielo se ilumina incluso antes de tocar el suelo. Los parámetros (`ridgeIntensity`, `ridgeHeightGate`, `textureInfluence`) se pueden ajustar en caliente mediante `updateSurfaceReadabilityOptions()` para QA.
- Las bandas cromáticas por altura se endurecieron: los valles basálticos quedan muy oscuros (<0.3 de relieve) y los picos pasan a crema brillante (>0.72). Incluso con clima neutro ahora se leen como un mapa topográfico, porque las planicies tienen un tinte intermedio y las crestas reciben un glow permanente derivado de la máscara de curvatura.
- Las paletas por bioma se redefinieron con saltos agresivos por altura: ≤10 u quedan en tonos basalto, 10‑50 u en verdes o óxidos saturados y >80 u pasa a ocres/neveados. El cambio es progresivo (curvas cúbicas), pero las bandas son muy contrastadas para que el jugador lea distancias con solo mirar el color.
- El heightmap base volvió a usar todo el rango 0‑1: `terrainNoise()` ya no recorta los valores bajos y mantiene la curva completa (‑1..1 → 0..1). Gracias a eso los valles activan la banda basáltica <0.25 y el sampler de cráteres/dunas entra en acción sin depender de tweaks QA.
- `AtmosphereTextureFactory` (`src/app/game/atmosphere/AtmosphereTextureFactory.ts`) genera en runtime tres patrones tileables (cráter, roca fracturada, dunas) usando Canvas 2D/OffscreenCanvas. `AtmosphereSceneManager` amuestra cada vértice con coordenadas UV esféricas y recolorea el resultado con la paleta activa, así todas las biomas comparten los mismos detalles pero conservan su tinte.
- Los patrones ahora tienen multiplicadores específicos: los cráteres mezclan hasta 35 % extra y su contraste se duplica en valles, las vetas rocosas ganan un 25 % adicional y las dunas suben cuando rozas la estratósfera. El resultado es un mapa tonal con sombras circulares profundas y crestas claras incluso sin filtros QA.
- Cada patrón se repite dinámicamente según altura/detalle: los cráteres azulean entre 4× y 13× sobre la esfera, las vetas rocosas entre 5× y 9× y las dunas hasta 10× cerca de la cota alta. Así evitamos que una única textura cubra todo el planeta y garantizamos “parches” visibles desde cualquier ángulo.
- Las texturas procedurales ahora tienen mayor peso: el sampler mezcla cada patrón con un 40‑90 % de su energía según la altura y el detalle disponible, y eleva el contraste local. En la práctica los cráteres aparecen como sombras circulares, las vetas de roca son diagonales marcadas y las dunas muestran ondulaciones claras incluso a 400 u del suelo.
- El sampler decide qué patrón aplicar según la altura/latitud: cráteres para vales, roca para medias laderas y arena/polen para dunas y cumbres. Además, las muestras desplazan ligeramente el brillo, creando “parches” que se abren cuando te acercas y funcionan como referencia de escala.
- Para QA se añadió un toggle de telemetría: habilita `Debug.enableLog('TEXTURE')` + `Debug.Atmosphere.setTextureDebug(true)` en consola y el motor volcará un resumen de mezcla/contraste por patrón cada vez que regenere colores del suelo.
- `GameEngine.deriveAtmospherePalette()` define ahora rampas muy separadas por tipo de planeta: los rocosos pasan de verdes oscuros a nieve, los gigantes cálidos usan cobre→ámbar→marfil y los enanos basálticos combinan negro/piedra con crestas incandescentes. Esto se refleja también en la wiki para que QA y jugadores sepan interpretar los colores.
- Las capas volumétricas (niebla baja, niebla alta y nubes) detectan cuando el realce de superficie está activo y reducen su densidad en consecuencia, mezclando el mismo brillo ámbar de las crestas en la parte superior del filtro. Aunque la visibilidad meteorológica caiga, siempre queda una silueta cálida o fría que marca dónde están las crestas y hacia dónde desciende el terreno.
- El overlay 2D que tiñe la cámara durante tormentas/dust storms ya no puede tapar por completo el terreno: `renderWeatherCameraFilters()` atenúa la opacidad máxima a ~0.65 cuando hay énfasis en el relieve y recolorea el filtro con el blanco cálido de las crestas. Así, incluso en niebla densa sigues viendo los brillos de los picos y puedes estimar distancias sin apagar el filtro manualmente.

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
6. **Autoland suave** — `GameEngine.onAtmosphereGroundCollision()`, `AnimationManager.startAtmosphereLandingCinematic()` y `startAtmosphereAutoLandingCamera()` (fallback/hold).
7. **Auto-takeoff** — `GameEngine.maybeTriggerAtmosphereAutoTakeoff()`.
8. **Render suelo/cielo** — `AtmosphereSceneManager.initializeScene()` y `updatePlanetPalette()`.
9. **HUD** — `calculateAtmosphereAttitude()` + `CompassComponent`.
10. **Wiki/QA** — `src/app/wiki/pages/spaceship/spaceship.ts`, `documentation/Resumen_Proyecto_y_Progreso.md`.

## Recomendaciones para mejoras futuras

- Revisar `AtmosphereSceneManager` para soportar sombras proyectadas o niebla volumétrica sin perder el pipeline minimalista.
- Extraer la lógica de cámara bloqueada a un servicio reutilizable para futuras cinemáticas.
- Ampliar la bitácora QA con capturas automáticas (logs + screenshots) para aterrizajes extremos (tormentas, templos, etc.).
- Mantener sincronizados los controles documentados en la wiki y la implementación de `Input_Bindings.md` cuando se añadan nuevas acciones específicas de atmósfera.
