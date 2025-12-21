# Plan — Ajustes de autoland, thruster y cielo

## Contexto
- El thruster cambió a `Airthrust.wav` globalmente y debe limitarse al modo atmosférico, manteniendo el `sfx_thruster.wav` clásico en el sistema solar.
- El autoland se está disparando automáticamente al volar bajo; debe activarse solo (a) cuando el piloto verde esté activo y el jugador pulse <kbd>Enter</kbd>, o (b) cuando exista colisión suave (<1u) con la superficie, igualmente con el piloto verde activo.
- El blending del color de cielo por altitud se percibe escalonado; se requiere una transición más suave.

## Referencias
- `src/app/game/GameEngine.ts`
- `src/app/game/atmosphere/AtmosphereSceneManager.ts`
- `src/app/assets/audio/_manifest.json`
- Documentación relacionada (`Resumen_Proyecto_y_Progreso.md`, `Informe_Reboot_Modo_Atmosferico.md`, `Audio_Assets_Guia.md`, wiki de la nave)

## Checklist
- [x] Restaurar `sfx_thruster.wav` como loop general y añadir un identificador específico para `Airthrust.wav` solo en modo atmósfera (manifest + lógica para alternar sample al entrar/salir de la escena atmosférica).
- [x] Ajustar la lógica de autoland para exigir piloto verde en ambos disparadores: tecla <kbd>Enter</kbd> (marcando el contexto como autoLand) y colisión suave (<1u) con la superficie; bloquear aterrizajes automáticos cuando el indicador esté rojo.
- [x] Suavizar el blending del cielo en `AtmosphereSceneManager.computeSkyTint()` eliminando la cuantización y aplicando una curva continua.
- [x] Añadir una espera de 2 segundos tras el contacto + FX de polvo antes de mostrar el diálogo de landing, manteniendo la cámara bloqueada durante la animación.
- [x] Actualizar documentación/wiki para reflejar el nuevo comportamiento (thruster dual, reglas del autoland, cielo suavizado y retardo del panel) y ejecutar `npm run build` para validar.
