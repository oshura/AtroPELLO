# Plan — Arrastre atmosférico y aceleración con turbulencias

## Contexto
- El modo atmosférico actualmente mantiene la velocidad objetivo (`targetSpeed`) estable cuando no hay input.
- Se solicita simular pérdida gradual de velocidad por rozamiento y que las turbulencias atenúen la capacidad de acelerar.
- La respuesta sobre el aumento de velocidad con la tecla `+` se documentará en la wiki/fichas para mantener trazabilidad.

## Alcance
1. Añadir un sistema de arrastre que reduzca progresivamente la `targetSpeed` de la nave mientras esté activa la escena atmosférica.
2. Hacer que la turbulencia incremente dicho arrastre y penalice la aceleración efectiva cuando el piloto mantiene presionado `+`.
3. Documentar el nuevo comportamiento en la wiki (página de la nave) y en `Modo_Atmosferico.md` / `Resumen_Proyecto_y_Progreso.md`.
4. Validar que la compilación (`npm run build`) sigue siendo exitosa.

## Plan de trabajo
- [x] **Revisión técnica**: confirmar parámetros actuales del control de velocidad (`+/-`), exposición en HUD/wiki y dependencias (`GameEngine`, `Spaceship`).
- [x] **Arrastre atmosférico**: implementar un método dedicado en `GameEngine` que degrade `targetSpeed` según altitud y estado de estabilidad.
- [x] **Penalización por turbulencia**: escalar el arrastre con `turbulenceCurrent` y aplicar una pérdida adicional cuando el piloto acelera, con telemetría mínima para futuras tunings.
- [x] **Documentación**: actualizar wiki, `Modo_Atmosferico.md` y `Resumen_Proyecto_y_Progreso.md` con el nuevo comportamiento y la aclaración sobre la tecla `+`.
- [x] **Build**: ejecutar `npm run build`, adjuntar el resumen del resultado y limpiar el plan una vez completado.
