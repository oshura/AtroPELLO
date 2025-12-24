# Plan — Sincronizar cinemáticas de aterrizaje

## Objetivo
Alinear la experiencia visual entre las dos transiciones actuales:
1. **Espacio → atmósfera:** extender la cinemática para que la nave atraviese la esfera planetaria antes del fade a negro.
2. **Atmósfera → suelo:** reemplazar la cámara estática actual por una animación con el mismo tracking/dolly que la secuencia espacial, manteniendo la sensación "rasante" antes del touchdown.

## Contexto y referencias
- [documentation/Resumen_Proyecto_y_Progreso.md](../Resumen_Proyecto_y_Progreso.md): comportamiento vigente de las secuencias y requisitos de QA.
- [documentation/Modo_Atmosferico.md](../Modo_Atmosferico.md): reglas de cámara y transiciones en modo atmósfera.
- [documentation/Sistema_Landing_Narrativa.md](../Sistema_Landing_Narrativa.md): dependencias con panel UI y timings de audio.
- Código relevante: [src/app/game/services/animations/landing-sequence.animation.ts](../../src/app/game/services/animations/landing-sequence.animation.ts), [src/app/game/GameEngine.ts](../../src/app/game/GameEngine.ts) (`startAtmosphereAutoLandingCamera`, `handleLandingTouchdown`).

## Alcance
- Crear/utilizar un timeline compartido para el tracking de cámara y posicionamiento de la nave en aterrizajes atmosféricos.
- Añadir el efecto visual de "entrada en esfera" en la transición espacio → atmósfera antes del fade.
- Mantener integridad de HUD/audio/controles descritos en la documentación y la wiki.

Fuera de alcance: cambios al panel de aterrizaje, ajustes de clima, nuevos efectos de partículas no relacionados con la entrada/salida.

## Plan de trabajo
1. [x] **Auditoría técnica:**
	- `LandingSequenceAnimation` (ver [src/app/game/services/animations/landing-sequence.animation.ts](../../src/app/game/services/animations/landing-sequence.animation.ts#L1-L240)) usa timeline de 5 s con easing `smoothstep`, offsets `cameraForwardOffset=6.5`, `cameraDollyRange=4.5`, flare máx 10° y posiciones inicial/final calculadas con `startOffset≈0.05*radius` y `settleHeight≈0.004*radius`. Control total vía `GameAnimation` mantiene pose manual y bloquea input global.
	- `startAtmosphereAutoLandingCamera` (ver [src/app/game/GameEngine.ts](../../src/app/game/GameEngine.ts#L2890-L3095)) sólo se ejecuta tras touchdown, fuerza `CameraMode.MANUAL` pero fija offsets constantes (`back=14u`, `up=5.5u`, `targetLift=1.6u`), sin timeline ni easing. Usa velocidad lateral para liberar cámara tras `ATMOSPHERE_AUTO_LAND_CAMERA_MIN_HOLD_MS` y dispara polvo a través de `triggerAtmosphereAutoLandingDust` (mismos FX que la secuencia espacial pero sin flare/corrección de forward).
	- Diferencias clave: el cinematico espacial controla la nave (posición/orientación) y la cámara simultáneamente antes del touchdown; el modo atmosférico sólo mueve la cámara tras el contacto y no reposiciona la nave según un spline, por lo que no refleja la aproximación rasante. Además, el fade se dispara inmediatamente al final del timeline espacial sin mostrar la intersección con la esfera planetaria.
2. [x] **Timeline gemelo para atmósfera → suelo:** nuevo `AtmosphereLandingAnimation` ([src/app/game/services/animations/atmosphere-landing.animation.ts](../../src/app/game/services/animations/atmosphere-landing.animation.ts)) replica el tracking rasante (smoothstep, flare, dust FX) pero con parámetros propios (duración 3.6 s, offsets reducidos). Se invoca desde `handleLandingTouchdown()` sólo cuando `autoLand=true` y mantiene la cámara independiente del `LandingSequence` original.
3. [x] **Añadir crossing sphere fade:** `LandingSequenceAnimation` ahora incluye una segunda fase (progreso ≥0.82) que interpola de `shipEnd` hacia un nuevo `shipEntry` dentro de la esfera planetaria, desencadenando el FX de polvo al entrar y permitiendo que el fade a atmósfera ocurra sólo después de cruzar el casco. Detalles en [src/app/game/services/animations/landing-sequence.animation.ts](../../src/app/game/services/animations/landing-sequence.animation.ts).
4. [ ] **Documentación, wiki y QA:** actualizar la wiki de la nave (sección clima/aterrizajes) y cualquier doc impactada, ejecutar `npm run build` + `npm run test -- --watch=false --browsers=ChromeHeadless` para validar.

## Riesgos y mitigaciones
- **Desfase con HUD/Panel:** mantener los mismos eventos (`notifyLandingSequenceStarted/Finished`) y retardos antes de abrir el panel.
- **Efectos de partículas duplicados:** asegurarse de no disparar dos veces `createDestructionDebris` al compartir helpers; encapsularlos tras flags.
- **Rendimiento en cargas lentas:** evaluar cacheo de los nuevos helpers/timelines para no introducir cálculos costosos por frame.
