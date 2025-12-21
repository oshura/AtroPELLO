# Plan — Panel de telemetría atmosférica en HUD

## Contexto
- Actualmente la telemetría atmosférica (visibilidad, turbulencia, drift, estabilidad) solo se expone en la brújula mediante `setAtmosphereTelemetry`, lo que limita la visibilidad y mezcla responsabilidades con el horizonte artificial.
- El panel de objetivos (`TargetPanel`) ocupa el bloque central inferior del HUD y muestra información del target seleccionado, pero al volar en atmósfera el usuario quiere dedicar todo ese espacio a la telemetría del planeta activo.
- Es necesario mover la telemetría a un nuevo elemento HUD de tamaño completo, siempre anclado al planeta de la escena atmosférica, y liberar a la brújula de esa carga.

## Objetivos
1. Crear un panel dedicado que muestre la telemetría atmosférica detallada del planeta activo (nombre, tipo, evento, visibilidad, turbulencias, drift, lift, estabilidad) usando el área del TargetPanel.
2. Integrar el nuevo panel en `HUDManager`: activar automáticamente cuando la escena atmosférica está activa y revertir al TargetPanel original fuera de atmósfera.
3. Simplificar `Compass`: eliminar almacenamiento/render de telemetría, manteniendo solo horizonte artificial y datos de orientación.
4. Actualizar documentación/wiki para reflejar el nuevo panel y ejecutar `npm run build` tras finalizar.

## Referencias
- `src/app/game/GameEngine.ts`
- `src/app/game/hud/HUDManager.ts`
- `src/app/game/hud/elements/TargetPanel.ts`
- `src/app/game/hud/elements/Compass.ts`
- `src/app/game/hud/types/hud.types.ts`
- `documentation/Wiki_System.md`, `src/app/wiki/pages/spaceship/spaceship.ts`
- `documentation/CleanCode_Arquitectura.md`

## Fases y checklist
1. **Análisis detallado del pipeline actual**
   - [ ] Revisar cómo `GameEngine` reúne datos de planeta/telemetría y cómo alimenta `HUDManager`/`TargetPanel`.
   - [ ] Identificar la información mínima necesaria del contexto planetario para renderizar el nuevo panel (nombre, tipo, intel, altitud, etc.).

2. **Diseño de datos y tipos**
   - [ ] Extender/crear tipos HUD para describir `AtmosphereTelemetryPanelState` (telemetría + datos de planeta).
   - [ ] Actualizar `GameEngine` para compilar el nuevo payload cuando `isAtmosphereSceneActive()` y propagarlo en `HUDManager.update`.

3. **Implementación del panel y routing en HUD**
   - [ ] Crear el nuevo elemento (p.ej. `AtmosphereTelemetryPanel`) con layout visual adaptado al área del TargetPanel.
   - [ ] Actualizar `HUDManager` para instanciar/renderizar el panel, alternando con `TargetPanel` según el modo (atmosfera vs espacio) y recibiendo datos mediante setters.
   - [ ] Ajustar `renderToTexture` para dibujar el panel correcto y asegurar que la altura/anchura del bloque central siguen alineadas con las barras de velocidad.

4. **Depuración de `Compass` y limpieza de telemetría antigua**
   - [ ] Eliminar `setAtmosphereTelemetry` y campos asociados en `Compass`; mover cualquier lógica de debug requerida al nuevo panel o a un servicio dedicado.
   - [ ] Revisar llamadas existentes para evitar referencias rotas.

5. **Documentación, wiki y pruebas**
   - [ ] Actualizar la wiki de la nave (sección HUD/atmósfera) y cualquier documentación relevante describiendo el nuevo panel.
   - [ ] Ejecutar `npm run build` y adjuntar resultado.
   - [ ] Marcar plan como completado (o eliminar) una vez entregado.
