# Plan — Pulido de audio en auto-landing atmosférico

## Contexto
- Solicitud: enlazar la cinemática de auto-landing (cámara bloqueada + ráfaga de polvo) con un cue dedicado `Landing.wav` y reemplazar el loop actual de thruster por `Airthrust.wav`.
- Objetivo: reforzar la atmósfera auditiva durante aterrizajes suaves y asegurar que el empuje atmosférico use el nuevo timbre.
- Dependencias clave: `GameEngine` (ganchos de cámara/polvo/audio), `AudioEngineService` (controlador de thruster), manifiesto `_manifest.json`, documentación de audio/wiki/resumen.

## Referencias
- `documentacion/Audio_Assets_Guia.md`
- `documentacion/Resumen_Proyecto_y_Progreso.md`
- `src/app/game/GameEngine.ts`
- `src/app/services/audio/audio-engine.service.ts`
- Wiki: `src/app/wiki/pages/spaceship/spaceship.ts`

## Checklist
- [x] **Manifiesto y assets:** Registrar `Landing.wav` y `Airthrust.wav` en `src/app/assets/audio/_manifest.json`, verificando rutas y naming consistente con placeholders reales.
- [x] **Cue de auto-landing:** Actualizar `GameEngine` para precargar/reproducir el nuevo clip durante `startAtmosphereAutoLandingCamera()` y `triggerAtmosphereAutoLandingDust()`, sincronizando con la activación de la cámara y evitando duplicidad.
- [x] **Loop de thruster:** Ajustar `createGameObjects()`/`enableAudio()` para que el controlador use `Airthrust.wav`, asegurando desbloqueo/pausa/resume del loop.
- [x] **Documentación y wiki:** Reflejar los nuevos sonidos en `Audio_Assets_Guia.md`, `Resumen_Proyecto_y_Progreso.md` y la página de la nave (sección Thruster / flujo atmosférico).
- [ ] **Validación:** Ejecutar `npm run build` y anotar cualquier hallazgo relevante antes de cerrar la fase; eliminar el plan al concluir.
