# Plan — Reordenar final de AtmosphereLandingAnimation

## Contexto
Durante la cinemática de aterrizaje atmosférico, el jugador observa que la nave gira 90°, pliega las alas y rota el pico antes de terminar de descender los últimos centímetros hacia el suelo. Se busca invertir el orden final para que la nave toque el suelo primero y, una vez asentada, ejecute el movimiento del pico/anclaje. Esto debe respetar las directrices de `Sistema_Landing_Narrativa.md` y no romper la cámara ni las protecciones de la secuencia.

## Pasos
- [ ] Revisar `AtmosphereLandingAnimation` para definir una fase "settle" real que traslade la nave desde la altura de seguridad (`touchdownClearance`) hasta el punto de contacto antes de activar el anclaje de la nariz.
- [ ] Ajustar el cálculo de posiciones, FX (polvo, touchdown cue) y cinemática de cámara para que el descenso adicional ocurra antes de iniciar `setNoseAnchorProgress()`.
- [ ] Actualizar documentación y wiki (sección de aterrizaje en `Resumen_Proyecto_y_Progreso.md` y página de nave en `public/wiki/spaceship/index.html`) para reflejar el nuevo orden de eventos.
- [ ] Ejecutar `npm run build` y, si aplica, `npm run test -- --watch=false --browsers=ChromeHeadless` para validar.
