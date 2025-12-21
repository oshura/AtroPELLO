# Plan — Cinemática de auto-landing atmosférico

## Contexto
- El documento operativo [`documentation/Informe_Reboot_Modo_Atmosferico.md`](../Informe_Reboot_Modo_Atmosferico.md) asegura que el auto-landing debe reproducir polvo, swell y cámara bloqueada mientras la nave completa el descenso físico.
- Actualmente, al pulsar <kbd>Enter</kbd> en atmósfera (`GameEngine.tryTriggerAtmosphereAutoLandingFromInput()`), el motor llama a `handleLandingTouchdown()` con `autoLand = true`, arranca la cámara bloqueada y reproduce el audio, pero **no existe una animación física** que descienda la nave hasta el punto de contacto antes de abrir el panel.
- Resultado: la cámara se ancla detrás de la nave, se escucha el swell, pero la nave mantiene velocidad/residuos y el `LandingPanel` aparece antes de ver el touchdown real.

## Objetivos
1. Ordenar la secuencia de eventos para que la cámara se sitúe donde la nave va a tocar suelo y siga un descenso guiado.
2. Añadir un controlador de trayectoria que reduzca la velocidad y lleve a la nave físicamente hasta el punto de contacto antes de disparar polvo/audio y el panel.
3. Garantizar los 2 s de aire cinematográfico **después** de que la nave quede inmóvil.
4. Reflejar los cambios en documentación/wiki y validar con `npm run build`.

## Checklist
- [ ] Analizar `GameEngine` y `AtmosphereSceneManager` para definir cómo obtener punto/normal de contacto y cómo interferir con `Spaceship.update()` sin romper físicas.
- [ ] Diseñar e implementar un "auto-landing trajectory controller":
  - [ ] Registrar estado (inicio, destino, duración, easing) cuando `autoLand` se activa.
  - [ ] Forzar la nave a reducir velocidad y trasladarse a lo largo de la normal del planeta hasta el punto objetivo, actualizando `position`, `velocity` y `thrusterState`.
- [ ] Ajustar la cámara y los FX:
  - [ ] Reposicionar la cámara inicial sobre el punto previsto, no sobre la posición actual.
  - [ ] Disparar polvo/audio al alcanzar el contacto (no antes) y asegurar que la cámara sigue a la nave durante la frenada completa.
- [ ] Reordenar la apertura del panel:
  - [ ] Iniciar el temporizador de 2 s justo después de confirmar el touchdown físico y la detención de la nave.
  - [ ] Asegurar que `openLandingPanelWithDelay()` respeta este nuevo disparador incluso si la entrada vino por tecla o colisión.
- [ ] Documentar el flujo actualizado en `Informe_Reboot_Modo_Atmosferico.md`, `Resumen_Proyecto_y_Progreso.md` y la wiki de la nave.
- [ ] Ejecutar `npm run build` y adjuntar evidencias.
