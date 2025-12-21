# Plan: Refinar Entrada Atmosférica y Clima por Capas

## Contexto
La entrada actual a la atmósfera fuerza la velocidad de la nave a ~3u, los eventos meteorológicos no respetan capas de altitud ni ventanas temporales claras y las partículas (lluvia, polvo, meteoros) siguen siendo poco visibles. Además, aunque ahora existen destellos de rayos, el trazo del rayo no se percibe y el panel HUD AtmosphereTelemetry muestra los datos de la columna derecha desalineados.

## Objetivos
1. Mantener la velocidad real de la nave al cruzar a la escena atmosférica y ajustar efectos asociados sin clamps arbitrarios.
2. Dar coherencia física al clima (capas de altura, periodos temporales finitos, posibilidad de estado en calma) y reforzar la visibilidad/variedad de partículas y eventos (lluvia, polvo, meteoros, rayos visibles).
3. Corregir la presentación del HUD atmosférico para que los datos estén alineados con sus contenedores.
4. Actualizar documentación/wiki y asegurar compilación exitosa tras los cambios.

## Checklist de fases
- [ ] **Análisis & ajustes de entrada**: Revisar `GameEngine` para eliminar la fuerza a 3u y garantizar que la transición conserve la velocidad actual y suavice fuerzas relacionadas.
- [ ] **Sistema meteorológico por capas**:
  - [ ] Introducir definición de capas de altitud con eventos plausibles por rango.
  - [ ] Agregar ventanas temporales (~2 min) por capa con estado "calma" posible.
  - [ ] Integrar nuevo snapshot para que `GameEngine` pueda consultar la capa activa.
- [ ] **Partículas y rayos visibles**:
  - [ ] Reajustar `ParticleEffectsService` para aumentar densidad, tamaños, colores y agregar meteoros visibles; forzar renderizado claro del rayo (geometría, brillo, vida).
  - [ ] Alinear generación de eventos (lluvia/polvo/meteoritos) con capas y snapshots.
- [ ] **HUD AtmosphereTelemetry**: Corregir cálculos de columnas/centrado de textos para remover el desplazamiento hacia la izquierda y revisar tipografías/anchos.
- [ ] **Documentación & build**:
  - [ ] Actualizar wiki (/wiki) y documentación relevante (Resumen + cualquier doc meteorológico) con el nuevo comportamiento.
  - [ ] Ejecutar `npm run build` y registrar resultado.
