# Plan — Precipitaciones estilo Void Jump

## Contexto
- Los eventos de clima (`rain`, `dust`, `meteor`) ya generan partículas visibles, pero siguen trayectorias verticales tradicionales.
- El piloto solicitó imitar los "stripes" del Void Jump: trazos que se originan frente a la nave/cámara y la acompañan para reforzar la sensación de velocidad aun cuando la nave está casi estática.
- El servicio `ParticleEffectsService.updateWeatherPrecipitation()` controla el spawn y el render de estas partículas; debemos rediseñarlo sin romper la integración con `AtmosphereWeatherService` ni con el HUD QA.

## Objetivos
1. Convertir lluvia, arena y mini meteoros en estelas ancladas al forward vector de la nave, similares a los streaks usados durante el Void Jump.
2. Ajustar spawn/densidad para que las estelas sigan visibles alrededor de la cabina aunque la nave cambie de rumbo o se mueva lentamente.
3. Personalizar colores, grosor y desenfoque por variante, inspirados en los stripes existentes pero manteniendo la identidad de cada fenómeno.
4. Mantener rendimiento (reutilizar partículas/seeds en lugar de recrearlas cada frame) y respetar los parámetros de intensidad y drift que llegan desde `AtmosphereWeatherService`.
5. Documentar el nuevo comportamiento en la wiki (sección atmósfera / HUD) y validar la build.

## Referencias
- `documentation/Informe_Reboot_Modo_Atmosferico.md`
- `documentation/CleanCode_Arquitectura.md`
- `documentation/Resumen_Proyecto_y_Progreso.md`
- `documentation/Wiki_System.md`
- `src/app/game/GameEngine.ts`
- `src/app/services/particle-effects.service.ts`
- `src/app/game/services/animations/void-jump.animation.ts`

## Fases y checklist
### Fase 1 — Diseño y groundwork
- [ ] Revisar la lógica de streaks en `VoidJumpAnimation` y trazar el paralelismo con `WeatherParticle` (persistencia, seed volumes, respawn).
- [ ] Definir la nueva estructura de datos para estelas atmosféricas (reuse de `WeatherParticle` o nueva colección) y documentar cómo se anclará al forward de la nave/cámara.

### Fase 2 — Implementación del motor de estelas
- [ ] Refactorizar `updateWeatherPrecipitation()` para soportar un modo "streak" que interpola seeds alrededor de la nave, reusa partículas activos y responde al `driftVector`.
- [ ] Ajustar `spawnWeatherParticle()` (o nuevo generador) para posicionar las estelas a distancias variables frente a la nave y alinearlas con forward/right/up, similar al Void Jump pero con controles por intensidad.
- [ ] Incorporar factores dependientes de la velocidad de la nave/cámara para modular la longitud/densidad del streak.

### Fase 3 — Tuning por tipo de precipitación
- [ ] Calibrar colores, brillo y grosor de lluvia, arena y meteoros para que cada fenómeno sea reconocible (incluyendo glow para meteoros y polvo cálido).
- [ ] Incluir jitter lateral y reaparición suave cuando una estela cruza la nave, evitando popping.
- [ ] Validar que la densidad respete `maxWeatherParticles` y los límites de rendimiento existentes.

### Fase 4 — QA, documentación y build
- [ ] Probar en escena atmosférica real (lluvia, polvo, meteoros) y ajustar parámetros tras observación visual.
- [ ] Actualizar la wiki / documentación afectada describiendo el nuevo comportamiento de precipitaciones.
- [ ] Ejecutar `npm run build` y adjuntar el resultado.
- [ ] Cerrar o eliminar el plan tras completar todas las fases.
