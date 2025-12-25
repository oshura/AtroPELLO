# Plan — Rediseño del plegado de alas

## Contexto
- La cinemática atmosférica sigue desplegando alas mediante `setWingDeploymentProgress()` y dispara el rig visual `startLandingAnchorRig()` para mostrar la escalera luminosa.
- El usuario solicitó retirar por completo el rig/anchor y rediseñar la animación de alas para que roten como alas de ave alrededor del eje nariz→thruster, plegándose sobre el fuselaje.
- El sistema de partículas y audio actualmente refuerza el rig, por lo que también deben desaparecer sus llamadas.

## Referencias consultadas
- `documentation/Resumen_Proyecto_y_Progreso.md` (estado del flujo atmosférico y de la wiki estática).
- `documentation/CleanCode_Arquitectura.md` (lineamientos de tipos y centralización de lógica).
- `documentation/Wiki_System.md` (proceso para actualizar la wiki orientada al jugador).
- Código fuente: `GameEngine.ts`, `Spaceship.ts`, `services/particle-effects.service.ts`.

## Objetivos
1. Las alas deben rotar hacia arriba alrededor del eje longitudinal para encontrarse por encima del fuselaje, sin desplazar su raíz.
2. El rig/anchor luminoso y su audio asociado se eliminan por completo.
3. El HUD/cinemática sigue controlando `setWingDeploymentProgress()` sin dependencias nuevas.
4. La wiki del piloto describe el nuevo comportamiento y ya no menciona el rig anterior.

## Plan de trabajo
1. **[ ] Retirar rig y dependencias**
   - Eliminar `startLandingAnchorRig`, `setLandingAnchorRigProgress`, `clearLandingAnchorRig` y llamadas relacionadas en `GameEngine`.
   - Podar la implementación del rig en `ParticleEffectsService` (estado, actualización, render y audio).
   - Revisar build para garantizar que no quedan referencias huérfanas.

2. **[ ] Replantear la geometría de alas**
   - Ajustar `Spaceship.createWingsGeometry()` para que cada ala rote sobre el eje nariz→thruster (aprox. eje Z local) haciendo un movimiento de abanico hacia arriba.
   - Mantener compatibilidad con `wingDeploymentProgress` (0 = desplegado lateral, 1 = plegado sobre fuselaje) y recalcular normales/índices según sea necesario.
   - Revisar si se requieren utilidades auxiliares (p.ej., matrices de rotación) para mantener el código legible según Clean Code.

3. **[ ] Integración y validación visual**
   - Confirmar que `renderSpaceshipWings()` solo depende de la nueva geometría y marca `wingGeometryDirty` al cambiar la progresión.
   - Probar la transición durante la cinemática atmosférica y en vuelo (si los controles manipulan las alas) para asegurar que no se generan solapes o jitter.

4. **[ ] Documentación para el jugador y verificación**
   - Actualizar la página wiki pertinente (probablemente `public/wiki/spaceship/index.html`) describiendo el nuevo plegado tipo ave y eliminando referencias al rig.
   - Ejecutar `npm run build` y `npm run test -- --watch=false --browsers=ChromeHeadless --code-coverage=false` para validar el proyecto.
   - Documentar en `Resumen_Proyecto_y_Progreso.md` si el cambio afecta al flujo descrito.

> Tras completar todos los pasos y actualizar la wiki, eliminar este plan.
