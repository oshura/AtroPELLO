# Research: Planet Atmosphere Mode

## Referencias visuales
- NASA Earth Observatory – fotografías de cúmulos nubosos y tormentas de arena.
- ESA Mars Express – imágenes de dunas y mesetas para presets rojizos.
- Concept art de No Man's Sky y Starfield para paletas saturadas.

## Shaders / Escena base
- Sky dome tintable con gradiente vertical + ruido animado para nubes.
- Luz direccional cálida/fría según tipo de planeta y ambient occlusion suave.
- `AtmosphereSceneSnapshot` se alimenta del planeta activo en `GameStateStore`: mezcla `baseColor` con los presets de referencia y genera `horizon/zenith/haze` + luz primaria.
- La mezcla se ejecuta en `PlanetAtmosphereEngine.refreshSceneSnapshot()` y se empuja a `SharedGameContext` + `AtmosphereLightNode`, que normaliza dirección, color e intensidad para uniforms WebGL.
- El shader ahora recibe `u_lightColor`, `u_lightDirection` y `u_lightIntensity` para simular un glow solar sobre el gradiente base.

## Física
- Rebote sobre superficie con daño proporcional al ángulo y velocidad.
- Stall progresivo según velocidad (<1u +2u/s, 1–2u +1u/s, 2–3u +0.5u/s).

## Audio / HUD cues (dic 2025)
- `sfx_passby_air` funciona como preaviso sonoro cuando la velocidad cae debajo del umbral de sustentación.
- `sfx_stall` reemplaza al cue anterior durante el stall y fuerza el borde rojo brillante de la brújula hasta recuperar control o aterrizar.
- `PlanetAtmosphereEngine` debe exponer un evento `atmosphere:flight-state` para alternar ambos cues y resetearlos en `landing:touchdown`.

## HUD / Scene Context (feb 2026)
- `HUDManager.setSceneContext(snapshot)` se invoca en cada refresco atmosférico; evita fades residuales y guarda la última etiqueta del planeta.
- El HUD reutiliza la marquesina espacial para anunciar "Atmósfera · {planeta}" con prioridad media y una sola vuelta, confirmando que el canvas compartido sigue activo.
- El snapshot también queda disponible en `SharedGameContext.atmosphereScene` para futuros overlays (iluminación de cabina, instrumentos planetarios, etc.).

## Eventos de vuelo y aterrizaje (mar 2026)
- `PlanetAtmosphereEngine` fuerza la aceleración adicional devuelta por `computeStallAcceleration()` y emite `landing:pilot-warning` tras 1.5 s de stall o al anticipar daño; el HUD usa prioridad WARNING y recicla los cues `sfx_passby_air` / `sfx_stall`.
- En colisiones suaves con `landingPilotGreen` + velocidad normal <1u/s se emite `landing:auto-finalize`, se reactiva el piloto verde en `GameStateStore` y se lanza la marquesina "Auto-landing completado".
- Los snapshots `atmospherePhysicsSnapshot` conservan `stallWarning`, `stallActive`, `projectedAltitude` y `impactAngle` para que HUD, Audio y QA puedan correlacionar métricas sin consultar al motor principal.
- Cada `landing:auto-finalize` reenvía el evento vía `SharedGameContext.emitModeEvent`, notificando a `GameModeOrchestrator` y al modo espacial para mantener telemetría compartida.

## Orquestación de modos y métricas (mar 2026)
- `GameModeOrchestrator` registra cada transición (`space ↔ atmosphere`), actualiza `GameStateStore.setActiveGameMode()` y broadcast `mode:changed` para que motores y paneles ajusten audio, partículas y controles.
- El HUD muestra "Modo atmosférico activo" o "Modo espacial activo" con prioridad de sistema (ttl ≈ 4.2 s, `dedupeKey` `mode-{next}`) para que los pilotos sepan qué lógica de controles está vigente.
- `SharedGameContext.activeMode` y `GameStateStore.getModeTransitionHistory()` ofrecen una API directa para spells/paneles que necesitan saber el contexto (ej. grimorio planetario).
- Cada refresco atmosférico vuelve a registrar el planeta activo mediante `setActiveLandingPlanet()`, evitando que hechizos planetarios pierdan referencia durante la transición.
