# Plan — Marquee Scroll Smoothing & Low-FPS Compensation

## Contexto
- Referencias: `documentation/CleanCode_Arquitectura.md` para mantener dependencias contenidas en HUD, `documentation/Resumen_Proyecto_y_Progreso.md` para reportar mejoras de UX y `documentation/Wiki_System.md` para reflejar el nuevo comportamiento visual.
- Código implicado: `HUDManager` (ciclo de actualización/render del HUD) y `hud/elements/MarqueePanel` (lógica de scroll). El loop corre estable a 32 FPS en hardware objetivo, provocando saltos visibles en el marquee.
- Objetivo: suavizar la animación del marquee sin elevar demasiado el costo de render, introduciendo compensación por bajo FPS y eliminando saltos bruscos al rotar mensajes.

## Riesgos / Consideraciones
- No debemos incrementar la frecuencia del render completo del HUD para evitar costo en WebGL. Las mejoras deben ser matemáticas (delta-time + amortiguación) dentro del mismo frame budget.
- Cualquier interpolación debe mantener mensajes sincronizados con la cola y respetar throttling existente.
- Cambios en `MarqueePanel` deben seguir siendo SSR-safe (sin acceso directo a `window`/`document` en constructor).
- Recordar actualizar la wiki/HUD docs para mantener paridad con la experiencia real.

## Trabajo planificado
1. **Instrumentar delta-time en HUD → Marquee**
   - [x] Añadir tracking de `lastMarqueeUpdateMs` en `HUDManager` y pasar `deltaMs` a `MarqueePanel.update(deltaMs)`.
   - [x] Garantizar fallback cuando `performance` no existe (SSR/testing).

2. **Smoothing interno del Marquee**
   - [x] Reescribir `MarqueePanel.update` para usar `scrollSpeedPxPerSec` y acumuladores, eliminando reinicios bruscos (restar el ancho consumido en vez de resetear a 0).
   - [x] Incorporar amortiguación para bajo FPS: limitar desplazamiento máximo por frame y distribuir el excedente en frames siguientes.
   - [x] Ajustar render para soportar offsets fraccionales y mantener la concatenación contínua de mensajes (sin parpadeos).

3. **Configuración y pruebas**
   - [x] Exponer `setLowFpsCompensation()` o derivar automáticamente de la media de FPS dentro de `MarqueePanel`.
   - [x] Añadir logs de depuración mínimos (desactivados por defecto) para validar que el compensador se activa a 32 FPS.

4. **Documentación y verificación**
   - [x] Actualizar `documentation/Resumen_Proyecto_y_Progreso.md` y la wiki (`/wiki/pages/spaceship`) con nota de la nueva suavidad/compensación.
   - [x] Ejecutar `npm run build` para validar que no se rompe la compilación.
