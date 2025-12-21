# Plan: Respuesta de Impacto contra el Suelo Atmosférico

## Objetivo
Incorporar una respuesta física y de daño cuando la nave colisiona con el suelo dentro de una escena atmosférica, evitando que atraviese el terreno y manteniendo excepciones seguras para el auto-landing cinematográfico.

## Referencias Clave
- `documentation/CleanCode_Arquitectura.md` para mantener las prácticas de responsabilidad única dentro de `GameEngine`.
- `documentation/Resumen_Proyecto_y_Progreso.md` para alinear el alcance con el estado general del proyecto.
- `documentation/Wiki_System.md` para reflejar el nuevo comportamiento en la wiki del jugador.

## Checklist de Trabajo
- [x] **Análisis**: Revisar `GameEngine.detectAtmosphereGroundCollision`, `onAtmosphereGroundCollision`, `applyShipDamage` y los servicios de colisiones para entender restricciones actuales y dependencias.
- [x] **Diseño**:
  1. **Condiciones de auto-landing**: Mantener `shouldAutoLandFromCollision()` como guard. Si el impacto cumple el umbral vertical definido por `ATMOSPHERE_AUTO_LAND_VERTICAL_SPEED_MAX` (1u/s) y el `LandingStatus` está `ready`, se delega inmediatamente a `handleLandingTouchdown` para no aplicar daño.
  2. **Respuesta física**: Para impactos fuera del auto-landing, calcular la normal del suelo (contexto o vector centro→nave). Separar la nave colocando su posición en el radio `groundCollisionRadius + shipRadius + padding`. Recalcular la velocidad reflejando el componente vertical contra la normal con un coeficiente de restitución atmosférico `ATMOSPHERE_GROUND_RESTITUTION = 0.28` y amortiguando el componente lateral (multiplicador `ATMOSPHERE_GROUND_TANGENT_DAMPING = 0.65`). Si la velocidad resultante apunta hacia abajo, forzar un ligero impulso de despegue (`ATMOSPHERE_GROUND_MIN_REBOUND_SPEED = 0.75`).
  3. **Curva de daño**: Medir `impactSpeed = |dot(velocity, normal)|` justo antes del rebote. Traducirlo a daño con `damage = clamp(scale(impactSpeed, 1..10 => 1..100))`. Impactos <1u/s no aplican daño, >10u/s se saturan en 100u. Se reutiliza `applyShipDamage` con etiqueta `atmo-ground` y HUD silencioso (como colisiones) pero con mensaje personalizado si procede.
  4. **Efectos secundarios**: Registrar en el logger con categoría `GAME_LOOP`, disparar `impactVignette` y audio ligero (`sfx_collision_light`) reutilizando utilidades ya presentes. Preparar hook para polvo/partículas si la escena lo necesita en tareas futuras.
- [ ] **Implementación**: Actualizar `GameEngine.ts` para
  - Extraer `handleAtmosphereGroundImpact()` que aplique la separación, rebote y daño descritos.
  - Reposicionar la nave fuera del suelo, reflejar su velocidad y aplicar daño según la velocidad de impacto cuando no aplique auto-landing.
  - Registrar el evento y gatillar audio/vignette consistentes con otras colisiones.
- [ ] **Wiki & Documentación**: Añadir la nueva sección/entrada en la wiki del juego describiendo el comportamiento de rebote/daño en atmósferas y cualquier matiz relevante.
- [ ] **Verificación**: Ejecutar `npm run build` y realizar una prueba corta de entrada atmosférica para confirmar que no hay regresiones.

> Nota: Tras finalizar todas las fases y reflejar el resultado en la documentación, este plan puede eliminarse.
