# Plan: Ajuste de aterrizaje atmosférico al relieve real

## Contexto
- El `LandingApproachContext` que alimenta `AtmosphereLandingAnimation` usa un radio esférico (`groundRadius`) en lugar del relieve real que provee el sampler procedimental.
- La cámara y la trayectoria de la animación aterrizan en ese radio simplificado, de modo que la nave termina dentro de montañas o bajo el relieve cuando se reactiva el control/despegue.
- Necesitamos asegurar que tanto la nave como la cámara usen la misma referencia que emplea el sampler de colisiones/altímetro para que "altura 0" equivalga al polígono superior real.

## Pasos
1. **Analizar y localizar los puntos de entrada del contexto** ✅
   - [x] Revisar `handleLandingTouchdown`, `enterAtmosphereScene` y `startAtmosphereLandingCinematic` para entender cuándo se guarda el `LandingApproachContext` y qué datos se derivan (`surfacePoint`, `radius`, `surfaceNormal`).
   - [x] Confirmar qué valores necesitamos para reconstruir la superficie real (centro del planeta, normal, groundRadius, detailFactor actual).

2. **Crear un helper para muestrear la superficie real** ✅
   - [x] Implementar un método en `GameEngine` que use `sampleAtmosphereSurfaceRadiusAlongNormal` + `computeAtmosphereDetailFactor` para obtener el radio correcto bajo una normal dada.
   - [x] El helper debe actualizar `surfacePoint`, `radius`, `planetCenter` y normal normalizada, retornando un nuevo `LandingApproachContext`.
   - [x] Debe ser resiliente cuando no haya escena atmosférica o falte información (caer al comportamiento actual).

3. **Aplicar el helper antes de lanzar la animación y al guardar el contexto** ✅
   - [x] Invocar el helper justo después de `enrichLandingContext` dentro de `handleLandingTouchdown` para que `landingTouchdownContext` y la animación reciban el punto real.
   - [x] Asegurar que cualquier otro flujo que consuma `landingTouchdownContext` (por ejemplo, cámara asistida, takeoff) se beneficie automáticamente del nuevo dato.

4. **QA + documentación** ✅
   - [x] Ejecutar `npm run build`.
   - [x] Ejecutar `npm run test -- --watch=false --browsers=ChromeHeadless`.
   - [x] Actualizar `documentation/Resumen_Proyecto_y_Progreso.md` describiendo que la cinemática de landing ahora usa el relieve sampleado.
   - [x] Actualizar la wiki de usuario para reflejar que la maniobra de aterrizaje sigue la cresta visible sin hundirse.

> Pendiente: esperar aprobación del plan antes de tocar el código.
