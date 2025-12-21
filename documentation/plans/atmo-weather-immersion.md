# Plan — Feedback visual y gravedad atmosférica

## Contexto
- En Marte (y otros biomas con atmósfera) el jugador solo percibe audio y un leve oscurecimiento cuando hay clima; no se ven gotas, arena ni rayos a pesar de que el `ParticleEffectsService` genera partículas mínimas.
- Tampoco existe un filtro cromático por evento, de modo que tormentas de polvo, lluvia o niebla se sienten idénticas salvo por la luz ambiente.
- La gravedad atmosférica actúa igual sin importar la velocidad de la nave; el usuario quiere una sensación de caída libre cuando está casi quieto y que la fuerza desaparezca gradualmente a partir de 3 u/s (0 a 5 u/s).

## Objetivos
1. Aumentar drásticamente la visibilidad de lluvia/polvo añadiendo más partículas, tamaños y trayectorias que crucen la cámara.
2. Añadir rayos visibles y flashes sincronizados con los eventos `thunderstorm`, junto con filtros de color/vignette por evento (dust, rain, thunder, fog, meteor).
3. Reescribir la gravedad atmosférica para que dependa de la velocidad actual de la nave (efecto casi nulo ≥5 u/s, aún perceptible pero suave en 3 u/s y total en reposo).
4. Documentar los cambios (wiki + resumen) y validar la build con `npm run build`.

## Referencias
- `documentation/CleanCode_Arquitectura.md`
- `documentation/Resumen_Proyecto_y_Progreso.md`
- `documentation/Wiki_System.md`
- `src/app/game/GameEngine.ts`
- `src/app/game/atmosphere/AtmosphereSceneManager.ts`
- `src/app/services/particle-effects.service.ts`
- `src/app/game/rendering/ScreenOverlayRenderer.ts`
- `src/app/wiki/pages/spaceship/spaceship.ts`

## Fases y checklist
1. **Análisis y pruebas actuales**
   - [x] Revisar pipeline de clima (`AtmosphereWeatherService`, `ParticleEffectsService`, overlays) y confirmar ausencia de filtros/rayos visibles.
   - [x] Revisar documentación relevante (Clean Code, Resumen) y validar restricciones de wiki/plan.

2. **Partículas de clima visibles**
   - [x] Incrementar densidad y tamaño de partículas de lluvia/polvo (spawn rate, colores, `maxWeatherParticles`).
   - [x] Ajustar trayectoria/orientación para que crucen la cabina y se noten aun con movimiento rápido.

3. **Rayos, filtros y flashes**
   - [x] Implementar rayos visuales + flasheo (nueva lógica en `ParticleEffectsService` + `GameEngine` para dispararlos al detectar `thunderstorm`).
   - [x] Añadir filtros/vignettes por evento atmosférico (polvo, lluvia, thunder, fog, meteor) usando `ScreenOverlayRenderer`, incluyendo flash blanco cuando cae un rayo.

4. **Gravedad dependiente de velocidad**
   - [x] Reescribir `applyAtmosphereGravity()` para mezclar altitud con la velocidad actual (1.0 a 0 u/s → 0.2 a 3 u/s → 0 a ≥5 u/s) y documentar la fórmula en comentarios.

5. **Documentación y verificación**
   - [x] Actualizar wiki (sección HUD/atmósfera + controles/gravedad si aplica) y `Resumen_Proyecto_y_Progreso` con el nuevo comportamiento.
   - [x] Ejecutar `npm run build` y adjuntar resultado.
   - [x] Revisar el plan, marcar completado o eliminar si corresponde.
