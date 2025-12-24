# Plan — Atmosphere landing: giro de 90° y anclajes

## Objetivo
Potenciar la cinemática de auto-aterrizaje añadiendo un giro orquestado de 90° previo al toque, desplegando las alas en vertical y mostrando anclajes/escalera que se fijan al suelo durante los últimos segundos de la secuencia.

## Referencias clave
- `documentation/Modo_Atmosferico.md`
- `documentation/Sistema_Landing_Narrativa.md`
- `src/app/game/services/animations/atmosphere-landing.animation.ts`
- `src/app/game/game-objects/Spaceship.ts`
- `src/app/game/GameEngine.ts` (render módulos nave, hook de cinemática)

## Pasos
- [x] **Análisis**: revisar documentación atmosférica/cinemática y las clases `AtmosphereLandingAnimation`, `Spaceship` y render de alas para entender los puntos de inserción disponibles.
- [ ] **Infraestructura de alas articuladas**: añadir un estado `wingDeploymentProgress` en `Spaceship` + utilidades en `GameEngine` para regenerar la geometría/VAO cuando cambie, de forma que podamos rotar las alas hasta 90° sin tocar el resto de la nave.
- [ ] **Timeline de giro**: extender `AtmosphereLandingAnimation` para alargar el descenso total de 5 s a 7 s, reservando los últimos 2 s para el giro de 90° + touchdown y manteniendo la cola de espera de 2 s. Durante esa fase final el `wingDeploymentProgress` debe llegar al 100 %, la orientación debe permanecer alineada con la normal y el flare adaptarse a la rotación.
- [ ] **Rig visual de anclajes y escalera**: crear un pequeño rig (mallas simples o billboards dedicados) gestionado por `GameEngine`/`ParticleEffectsService`, con progresión de despliegue, posicionamiento respecto al punto de contacto y limpieza automática al terminar la cinemática.
- [ ] **Integración + QA**: orquestar los nuevos cues desde `AtmosphereLandingAnimation` (inicio/fin del despliegue), actualizar documentación/wiki, ejecutar `npm run build` y `npm run test -- --watch=false --browsers=ChromeHeadless`, y retirar el plan.
