# Plan: Ajuste final de plegado vertical de alas

**Fecha:** 2025-12-25  \
**Responsable:** GitHub Copilot (GPT-5.1-Codex)  \
**Contexto:** El usuario confirmó que las alas ya rotan alrededor del eje correcto pero necesitan dos ajustes adicionales: (1) el plegado no debe sobrepasar los 90° para que las alas queden completamente verticales, y (2) al llegar a la posición vertical las alas deben permanecer en contacto con el fuselaje aplanado, extendiéndose ligeramente hacia el interior para que no parezcan flotando.

## Referencias
- `src/app/game/game-objects/Spaceship.ts` (`createWingsGeometry`) — lógica completa de plegado.
- `documentation/Resumen_Proyecto_y_Progreso.md` — secciones de aterrizaje/despegue y descripción de las alas.
- `public/wiki/spaceship/index.html` — wiki orientada al jugador con la descripción del plegado.
- `documentation/CleanCode_Arquitectura.md` — mantener separación de responsabilidades (sin mover lógica de animaciones fuera de la clase de la nave).

## Objetivos
1. Limitar la rotación máxima al equivalente de 90° (π/2) para que las alas queden estrictamente verticales cuando `wingDeploymentProgress = 1`.
2. Ajustar la elevación y añadir una inserción progresiva en el fuselaje: el cubo plano del ala debe deslizarse hacia el interior cuando progresa el plegado, de modo que, aun estando vertical y elevada, su base siga tocando el cuerpo aplanado.
3. Mantener las alas desplegadas (progreso 0) exactamente igual a como estaban para no introducir regresiones durante el vuelo normal.
4. Actualizar documentación técnica y la wiki del jugador para reflejar que ahora el plegado termina a 90° y que el anclaje entra unos centímetros en el fuselaje.
5. Validar la build y la suite de tests (`npm run build`, `npm run test -- --watch=false --browsers=ChromeHeadless`).

## Plan de trabajo

- [ ] **Fase 1 – Geometría/animación del plegado**
  - Ajustar `maxFoldAngle` en `createWingsGeometry()` a π/2.
  - Rebalancear `verticalLift` y añadir un `bodyEmbedDepth` que se aplique gradualmente (según `wingDeploymentProgress` y la posición a lo largo del ala) para que la base se introduzca en el fuselaje cuando el plegado está avanzado.
  - Mantener el colapso lateral y el `forwardTuck` existentes para no romper la silueta tipo ave.

- [ ] **Fase 2 – Verificaciones rápidas**
  - Revisar mentalmente (y mediante logs si es necesario) que el plegado a 1.0 produce exactamente 90° y que las coordenadas Y máximas de la base estén próximas al radio vertical del fuselaje (~0.3).

- [ ] **Fase 3 – Documentación/Wiki**
  - Actualizar `documentation/Resumen_Proyecto_y_Progreso.md` en los apartados que describen las alas para mencionar que el plegado termina en vertical y que la base queda embebida en el fuselaje.
  - Ampliar la sección de la wiki `/wiki/spaceship` para que el jugador sepa que ahora las alas quedan totalmente verticales y se hunden ligeramente en el casco al bloquearse.

- [ ] **Fase 4 – Validación**
  - Ejecutar `npm run build`.
  - Ejecutar `npm run test -- --watch=false --browsers=ChromeHeadless`.
  - Tras confirmar ambos pasos, eliminar este plan.

## Criterios de finalización
- Plegado máximo = 90° exactos sin overshoot.
- Base de las alas visible como anclada al fuselaje en posición vertical (sin huecos).
- Documentación y wiki sincronizadas con el nuevo comportamiento.
- Build y test suite completados con éxito.
