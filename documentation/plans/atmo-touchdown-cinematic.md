# Plan — Cinemática Atmosférica Touchdown 2.0

## Objetivo
Rediseñar la animación autoLand (atmósfera → suelo) para que reproduzca una aproximación controlada de 5 s con cámara fija frontal, frenado progresivo, dust avanzado y cola de espera antes de ceder input.

## Requisitos clave
- Duración principal: 5 s para el descenso autónomo hasta altura 0 y velocidad 0.
- Inputs y colisiones desactivadas durante la animación; se reactivan tras la cola final.
- Audio: `sfx_passby_air.wav` presente todo el tiempo (si no estaba ya), `Landing.wav` se reproduce una vez al cumplirse el segundo 2.
- Dust FX: ráfaga 1 s antes del segundo 5 (justo previo al touchdown), con mayor volumen visual tipo "planos con alpha" para dar sensación volumétrica.
- Cámara: fija frente a la zona de touchdown, mirando siempre a la nave. Tracking suave (lookAt) pero sin moverse de su posición calculada.
- Cola post-touchdown: mantener nave posada durante 2 s antes de liberar control/panel.

## Pasos
1. [x] **Análisis técnico detallado**
   - `AtmosphereLandingAnimation` dura 3.6 s, reposiciona la nave en spline corto y usa cámara dolly/height animada; libera polvo al 90% y devuelve control inmediatamente al terminar. No hay cola de espera ni audio dedicado.
   - `handleLandingTouchdown()` sólo arma la animación cuando `autoLand=true`, pero igualmente aplica `applyAtmosphereLandingImpulse()` (reacelera), desactiva `landingDamageSuppressed` y abre el panel pasados 2 s (o 3.6 s si la animación estaba activa).
   - `notifyAtmosphereLandingCinematicStarted/Finished` únicamente prenden flags y reactivan la cámara autoLand al terminar; no hay bloqueo extra de colisiones/inputs ni control sobre audio. `sfx_passby_air` se maneja desde `enterAtmosphereScene()` pero no se garantiza durante la cinemática.
   - Polvo actual usa `ParticleEffectsService.createDestructionDebris()` (única ráfaga); no existen planos volumétricos específicos.
2. [x] **Timeline y dinámica de la nave**
   - Ajustar la interpolación para cubrir 5 s de descenso lineal (posición y velocidad).
   - Garantizar `currentSpeed/targetSpeed` → 0 y altura → 0 exacto.
   - Mantener snapshot para restaurar tras la animación si se aborta.
3. [x] **Cinemática de cámara**
   - Calcular punto frontal fijo respecto al contacto y orientar la cámara hacia la nave durante toda la secuencia + cola de 2 s.
   - Integrar tracking continuo (lookAt) sin cambios de posición.
4. [x] **Audio y partículas avanzadas**
   - Verificar `sfx_passby_air` loop permanente.
   - Disparar `Landing.wav` al segundo 2.
   - Generar nuevo dust volumétrico multi-billboard 1 s antes del touchdown, considerar reutilizar `ParticleEffectsService` o crear helper temporal.
5. [x] **Colisión, inputs y panel delay**
   - Bloquear colisiones/controles desde el inicio hasta el final de la cola de 2 s.
   - Ajustar `handleLandingTouchdown()` para esperar los 7 s totales antes de abrir panel/activar auto camera fallback.
6. [x] **Documentación, wiki, build/tests**
   - Actualizar `Resumen_Proyecto_y_Progreso.md`, `Modo_Atmosferico.md`, wiki de nave.
   - Ejecutar `npm run build` y `npm run test -- --watch=false --browsers=ChromeHeadless`.

## Riesgos
- Desincronización audio/animación → anotar timestamps exactos.
- Dust volumétrico puede impactar rendimiento → usar número limitado de planos y reciclar instancias.
- Bloqueo prolongado sin control → comunicarlo en HUD si fuese necesario (fuera de alcance por ahora, pero monitorear UX).
