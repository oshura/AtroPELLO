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
   - [x] Revisar cómo `GameEngine` reúne datos de planeta/telemetría y cómo alimenta `HUDManager`/`TargetPanel`.
   - [x] Identificar la información mínima necesaria del contexto planetario para renderizar el nuevo panel (nombre, tipo, intel, altitud, etc.).

   **Notas 21-dic-2025**
   - `GameEngine.update()` empaqueta la telemetría atmosférica en `atmosphereTelemetrySnapshot` (visibilidad, turbulencia, drift vector, lift, estabilidad, evento) y la envía a `HUDManager.update()` como `gameData.atmosphereTelemetry`. El `HUDManager` simplemente reenvía esta carga a `Compass.setAtmosphereTelemetry()`, que la dibuja en el horizonte artificial; el `TargetPanel` ocupa todo el bloque central inferior y se alimenta con `hudManager.updateTargetPanel()` cada vez que `AdaptiveTargeting` cambia de objetivo.
   - Para un panel dedicado necesitamos combinar: (a) `LandingApproachContext` de `atmosphereSceneState.context` (nombre/tipo/visitas/intel y radios para derivados), (b) `AtmosphereWeatherSnapshot` para describir el evento activo (tipo, intensidad, ETA, precipitación, lightning chance) y (c) `atmosphereTelemetrySnapshot` para los números en vivo (visibilidad normalizada, turbulencia ajustada por altitud, drift vector/magnitud, estabilidad resultante, liftPerSecond). Ese payload será la base de un nuevo tipo `AtmosphereTelemetryPanelState` que incluya metainformación adicional útil en HUD: altitud actual sobre suelo, distancia a superficie capturada por landing context y las etiquetas de bioma/evento.

2. **Diseño de datos y tipos**
   - [x] Extender/crear tipos HUD para describir `AtmosphereTelemetryPanelState` (telemetría + datos de planeta).
   - [x] Actualizar `GameEngine` para compilar el nuevo payload cuando `isAtmosphereSceneActive()` y propagarlo en `HUDManager.update`.

3. **Implementación del panel y routing en HUD**
   - [x] Crear el nuevo elemento (p.ej. `AtmosphereTelemetryPanel`) con layout visual adaptado al área del TargetPanel.
   - [x] Actualizar `HUDManager` para instanciar/renderizar el panel, alternando con `TargetPanel` según el modo (atmosfera vs espacio) y recibiendo datos mediante setters.
   - [x] Ajustar `renderToTexture` para dibujar el panel correcto y asegurar que la altura/anchura del bloque central siguen alineadas con las barras de velocidad.

4. **Depuración de `Compass` y limpieza de telemetría antigua**
   - [x] Eliminar `setAtmosphereTelemetry` y campos asociados en `Compass`; mover cualquier lógica de debug requerida al nuevo panel o a un servicio dedicado.
   - [x] Revisar llamadas existentes para evitar referencias rotas.

5. **Documentación, wiki y pruebas**
   - [x] Actualizar la wiki de la nave (sección HUD/atmósfera) y cualquier documentación relevante describiendo el nuevo panel.
   - [x] Ejecutar `npm run build` y adjuntar resultado.
   - [x] Marcar plan como completado (o eliminar) una vez entregado.
