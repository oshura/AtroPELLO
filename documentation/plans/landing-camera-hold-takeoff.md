# Plan — Persistencia de cámara cinematográfica al iniciar despegue

Contexto: Tras la cinemática de aterrizaje atmosférico, la cámara queda retenida mientras el panel está abierto. Al pulsar "Despegar" la vista vuelve inmediatamente al modo 8 (cabina), sin respetar los 5 segundos solicitados. Sospecha principal: el cierre del panel libera la retención antes de que `GroundTakeoffAnimation` pueda gestionarla.

## Pasos
- [x] Revisar el flujo actual de retención/liberación (`holdLandingCinematicCamera`, `notifyLandingPanelClosed`, `startTakeoffSequence`) para confirmar en qué punto se está soltando la cámara.
- [x] Modificar `GameEngine` para permitir diferir la liberación cuando el despegue terrestre esté en curso (bandera + método público).
- [x] Ajustar `GroundTakeoffAnimation` para liberar explícitamente la retención diferida tras los 5 s o en abortos, despejando la bandera.
- [x] Ejecutar `npm run build` y `npm run test -- --watch=false --browsers=ChromeHeadless` para validar.
