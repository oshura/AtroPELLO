# Plan: Estabilizar auto-landing atmosférico y orden del anclaje

## Contexto
- El auto-landing atmosférico vuelve a disparar la cinemática varias veces mientras el panel está abierto; la nave parece "volver a volar" tras concluir la primera animación.
- El usuario observa que el pico (anclaje frontal) se pliega antes de que el fuselaje termine de descender los últimos metros, revirtiendo el ajuste anterior donde primero se completaba la caída y luego el anclaje.
- Sospecha actual: el detector `detectAtmosphereGroundCollision()` está soltando el flag de contacto y relanza `handleLandingTouchdown()` tras la cinemática, lo que encadena animaciones y deja la nave sin estado "landed" estable.

## Pasos
1. **Diagnóstico profundo del detector y del estado de aterrizaje** ✅
   - [x] Revisar `detectAtmosphereGroundCollision()`, `onAtmosphereGroundCollision()` y `landingStatus` para confirmar cómo se relanza `handleLandingTouchdown()`.
   - [x] Verificar si `atmosphereGroundContactActive` u otra bandera se resetea tras la cinemática y permite nuevos triggers.
   - [x] Analizar `AtmosphereLandingAnimation` para entender el orden actual (descenso → rotación → anclaje) y documentar exactamente qué fase provoca la percepción de orden invertido.

2. **Diseñar y aplicar un bloqueo/histeresis para el auto-landing**
   - [x] Introducir un estado o lock que impida relanzar `handleLandingTouchdown(autoLand)` mientras la nave ya está en tierra.
   - [x] Definir condiciones claras para liberar el lock (despegue, abandonar la atmósfera o superar cierta altitud).
   - [x] Ajustar `onAtmosphereGroundCollision()` y flujos relacionados para respetar el nuevo lock sin perder impactos reales.

3. **Corregir la coreografía del pico/anclaje**
   - [x] Reordenar las fases de `AtmosphereLandingAnimation` para que el descenso (incluida la caída final) se complete antes de iniciar el plegado del pico/ancla.
   - [x] Asegurar que los nuevos tiempos no rompen el disparo de FX (polvo, cues) ni el `LandingPanel`.

4. **Fijar la nave durante el hold del panel**
   - [x] Revisar las fuerzas atmosféricas (auto-vector, drift, jitter) que se siguen aplicando con el panel de aterrizaje abierto.
   - [x] Añadir las salvaguardas necesarias para que, mientras el panel esté bloqueando la cámara, la nave permanezca anclada y sin influencias climáticas.

5. **QA técnica**
   - [ ] Validar manualmente (o con traces) que sólo se lanza una cinemática tras el contacto y que la nave permanece en estado landed hasta despegar.
   - [x] Ejecutar `npm run build`.
   - [x] Ejecutar `npm run test -- --watch=false --browsers=ChromeHeadless`.

6. **Documentación y wiki orientada al jugador**
   - [x] Actualizar `documentation/Resumen_Proyecto_y_Progreso.md` y/u otros documentos técnicos relevantes con el nuevo lock y la coreografía.
   - [x] Añadir nota en la wiki (sección de aterrizaje) describiendo que la animación sólo se ejecuta una vez y que el pico se pliega tras apoyar el fuselaje.
   - [ ] Cerrar el plan una vez que todo esté verificado.
