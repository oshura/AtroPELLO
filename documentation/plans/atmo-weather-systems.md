# Plan — Clima dinámico, visibilidad y turbulencias en modo atmósfera

## Contexto
- El informe operativo [`documentation/Informe_Reboot_Modo_Atmosferico.md`](../Informe_Reboot_Modo_Atmosferico.md) y la wiki de la nave documentan el modo atmosférico actual (cámara bloqueada, auto-landing, piloto verde persistente) pero **no** incluyen fenómenos meteorológicos ni control de visibilidad.
- La conversación reciente identifica la necesidad de: niebla/fog con iluminación adaptativa, múltiples capas de nubes, eventos de baja visibilidad (lluvia, tormentas, rayos) que afecten a la nave (vibraciones, desvíos progresivos), mezcla de audio contextual y variaciones de daños/impactos durante turbulencias.
- Este plan se coordina con el plan activo `atmo-autoland-cinematic.md` (controlador de trayectoria para la secuencia Enter), ya que la cámara y los sensores atmosféricos compartirán datos del mismo estado.

## Objetivos
1. Añadir un sistema de clima dinámico por bioma que pueda generar eventos aleatorios (niebla, lluvia, tormentas eléctricas, ráfagas de polvo, micro meteoritos) con probabilidad configurable.
2. Implementar mejoras visuales: fog volumétrico, layers de nubes, iluminación atmosférica dependiente de clima y reducción de visibilidad.
3. Aplicar efectos físicos sobre la nave durante turbulencias (vibración, drift progresivo si el jugador no compensa, limitaciones de thruster) y modificar audio (impactos a 25% de volumen durante turbulencias, cues específicos de lluvia/tormenta).
4. Inyectar feedback en HUD y cámara (temblores, overlay de gotas, advertencias) para que el jugador comprenda el estado del clima.
5. Documentar completamente los cambios (informe, wiki, guías de audio) y validar con `npm run build` tras cada fase.

## Referencias
- `src/app/game/GameEngine.ts`
- `src/app/game/atmosphere/AtmosphereSceneManager.ts`
- `documentation/Informe_Reboot_Modo_Atmosferico.md`
- `documentation/Resumen_Proyecto_y_Progreso.md`
- `documentation/Audio_Assets_Guia.md`
- `src/app/wiki/pages/spaceship/spaceship.ts`
- Plan relacionado: `documentation/plans/atmo-autoland-cinematic.md`

## Fases y checklist
### Fase 0 — Correcciones críticas previas
- [x] Garantizar que al entrar en atmósfera la nave arranca con 3u de velocidad mínima y conserva control manual de aceleración/frenado.
- [x] Ajustar la gravedad atmosférica para que genere caídas de ~1u/s a 1000u de altura y hasta 3u/s cerca del suelo (1u de altura).

### Fase 1 — Investigación y arquitectura
- [ ] Revisar documentación existente y anotar dependencias (HUD, audio, partículas, cámara manual).
- [x] Definir estructura del "WeatherController" (estado por escena atmosférica, timers, seeds por planeta, persistencia durante aterrizajes repetidos).
- [x] Diseñar catálogo de eventos meteorológicos con parámetros: probabilidad por bioma, duración, intensidades de viento, efectos visuales/audio.

### Fase 2 — Rendering: fog + nubes
- [ ] Extender `AtmosphereSceneManager` con niebla volumétrica (curva configurable por altitud + densidad extra según clima).
- [ ] Implementar múltiples capas de nubes: 
  - [ ] Capa alta (procedural + desplazamiento lento) proyectada en el sky dome.
  - [ ] Capa baja (sprites/billboards o shell intermedio) para dar sensación de profundidad.
- [ ] Agregar parámetros de iluminación (tintado del sol, occlusion) que dependan del evento actual.
- [ ] Instrumentar toggles para QA (activar/desactivar fog/nubes por consola).

### Fase 3 — Simulación de clima y eventos
- [x] Crear `AtmosphereWeatherService` (o módulo equivalente) que gestione eventos activos: lluvia, tormenta eléctrica, lluvia ácida/polvo, turbulencia seca.
- [x] Implementar scheduler pseudo-aleatorio (semilla por planeta) que dispare eventos con cooldown mínimo y transiciones suaves.
- [ ] Conectar cada evento con payload: visibilidad target, fuerza turbulencia, drift vector, partículas requeridas, cambios de audio.
- [x] Registrar hooks para pausar eventos al salir de la escena y reanudarlos si se vuelve a entrar rápidamente.

### Fase 4 — Gameplay & física
- [ ] Turbulencias: aplicar jitter controlado a la cámara y a la nave (modificando `GameEngine.update()`), con posibilidad de escalonar intensidad.
- [ ] Drift progresivo: mientras dure una tormenta fuerte, añadir una fuerza lateral/lift que empuje la nave; si el jugador no corrige, el rumbo se desvía.
- [ ] Impactos atenuados: durante turbulencia, reducir a 25% el volumen de `sfx_collision_*` y mostrar aviso HUD de "absorción atmosférica".
- [ ] Integrar controles manuales para cancelar autopilot/turbulencias (p.ej., pulsar una tecla para estabilizar temporalmente).

### Fase 5 — Audio & feedback sensorial
- [ ] Actualizar `Audio_Assets_Guia.md` y el manifiesto con nuevos loops/cues (lluvia, viento, truenos, alerta de turbulencia).
- [ ] Enseñar a `AudioEngineService` a mezclar un bus "weather" o sub-loop que se activa con el clima.
- [ ] Introducir ducking: rayos/impactos reducen música, turbulencias reducen efectos de impacto a 0.25x, etc.
- [ ] Añadir overlays HUD/cabina: gotas en cámara (ScreenOverlayRenderer), relámpagos iluminando momentáneamente el cockpit, mensajes QA.

### Fase 6 — Documentación y QA
- [ ] Actualizar `Informe_Reboot_Modo_Atmosferico.md` con la nueva sección de clima y ejemplos.
- [ ] Extender `Resumen_Proyecto_y_Progreso.md` y la wiki de la nave (sección atmósfera) con tablas de eventos, controles y recomendaciones.
- [ ] Detallar nuevas entradas en la wiki (p.ej. `/wiki/weather` si procede) y en `Audio_Assets_Guia.md`.
- [ ] Añadir casos de prueba QA (visibilidad mínima, evento combinado lluvia+rayos, turbulencia + meteorito) y registrarlos en la bitácora.
- [ ] Ejecutar `npm run build` tras finalizar cada fase importante y adjuntar logs.

## Consideraciones
- Mantener sincronizado el estado del clima con el plan `atmo-autoland-cinematic`: la cámara de auto-landing debe respetar la visibilidad/clima activo.
- Reutilizar servicios existentes (ParticleEffectsService, ScreenOverlayRenderer) para evitar duplicar pipelines.
- Documentar cualquier nuevo ajuste en bindings/inputs (`KeyBindingsService`) si añadimos controles para estabilizar la nave.
- Validar performance: medir impacto de nubes/fog y permitir degradación (desactivar capas altas en hardware limitado).
