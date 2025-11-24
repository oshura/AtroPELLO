# Planet Landing & Takeoff Documentation

This document describes the current implementation of the manual landing and takeoff experience: HUD cues, eligibility logic, cinematic sequences, UI, and system safeguards.

## Estado actual (24 nov 2025)

- ✅ Indicadores HUD `Landing/Threat` visibles junto al marquee y actualizados desde `hudManager.setLandingIndicators`.
- ✅ Detección de elegibilidad y amenazas embebida en `GameEngine` con entrada `Enter` para iniciar la secuencia.
- ✅ Animaciones completas de aterrizaje y despegue gestionadas por `AnimationManager` (incluye enfoque de cámara, bloqueos de input y fades).
- ✅ Panel de aterrizaje Angular con contexto del planeta y acciones `Despegar` / permanecer.
- ✅ Supresión de daños (colisiones + sol) durante landing, estado landed y takeoff hasta recuperar control del jugador.

## 1. HUD Indicators Next to the Marquee Panel

| Indicator | Visuals | Location | Activation |
| --- | --- | --- | --- |
| **Landing** | Circular pilot light (off = dark green rim, on = bright lime core + soft glow) with a small "Landing" label underneath. | Left of the marquee panel, vertically centered with it. | Lit when landing requirements (section 2) are satisfied for any nearby planet. Otherwise dimmed. |
| **Threat** | Identical geometry but red palette. Label text should read `Threat` (user typed "Thread" but clarified it represents amenaza). | Immediately to the right of the Landing pilot to create a compact pair on the marquee's left gutter. | Lit when hostile/heavy-risk conditions exist (see section 5). |

Implementation notes:
- `HUDManager` reserva ~70px a la izquierda del marquee para renderizar ambos pilotos antes de `marqueePanel.render(...)`.
- `hudManager.setLandingIndicators({ landingReady, threatActive })` se invoca desde `GameEngine.updateLandingTelemetry` y mantiene cache interno.
- El helper de pilotos acepta `{ onColor, offColor, label }` para reutilización futura.

## 2. Landing Eligibility Detection

`GameEngine.computeLandingStatus` corre cada frame (post física de la nave) y produce `{ ready, context }`:

1. Busca el planeta más cercano calculando `centerDist` y `surfaceDistance = centerDist - radius`.
2. Requisitos actuales: `surfaceDistance <= 50`, `ship.currentSpeed <= 5`, y `|dot(forward, normal)| <= 0.5` (ángulo ≈ 90° ±30°).
3. Mantiene un temporizador `LANDING_READY_HOLD_MS` (250ms) para evitar parpadeos al entrar/salir de tolerancias.
4. Cuando todo se cumple, almacena `LandingApproachContext` (id, nombre, punto en superficie, normal, radio, métricas) y muestra luz verde.
5. Cuando falla algún requisito, reinicia el temporizador y apaga el indicador.

## 3. Player Input & State Machine

- `GameEngine.handleKeyDown` verifica `Enter` cuando `landingStatus.ready` es true, no hay amenazas activas y `AnimationManager` está libre.
- Al iniciar, `AnimationManager.startLandingSequence` activa `landingSequenceActive`, bloquea inputs (via animation) y suprime daños (`setLandingDamageSuppressed(true)`).
- Después de touchdown, `landingTouchdownContext` queda disponible para la UI y futuros despegues.

## 4. Landing Cinematic Flow

La clase `LandingSequenceAnimation` ejecuta la coreografía cuando el jugador presiona Enter:

1. **Setup**: guarda dinámica original del ship, fuerza cámara en modo cockpit, resetea controles, pausa consumo de void energy y desactiva colisiones.
2. **Approach (≈2.4s)**: interpola desde la posición actual hasta un punto seguro sobre la superficie manteniendo la orientación tangencial.
3. **Glide (≈3s)**: desplaza lateralmente usando una tangente calculada y aplica “flare” progresivo (hasta 12°).
4. **Fade (≈1s)**: overlay negro aumenta hasta 100%, velocidad cero, thrusters en idle.
5. **Finish**: mantiene `collisionsDisabled=true`, notifica a `GameEngine` (`notifyLandingSequenceFinished('landed')`) y desencadena el panel.

## 5. Threat Indicator Logic

`GameEngine.computeLandingThreat` activa la luz roja cuando:

1. Cualquier enemigo (según `RelationService`) está dentro de 500u del ship.
2. La integridad del casco cae por debajo de 25%.
3. La energía del vacío es <10u.

Si `threatActive` es true, `tryStartLandingSequence` rechaza la petición y muestra marquee “Amenaza detectada…”.

## 6. Landed Panel

- `LandingPanelComponent` se monta sobre la vista del game component cuando `GameEngine` llama `openLandingPanel(context)`.
- Muestra nombre, tipo, radio, distancia, y datos adicionales del planeta (`LandingApproachContext`).
- Acciones: `Despegar` delega a `GameEngine.startTakeoffSequence()`; `Permanecer` simplemente cierra el panel y mantiene controles deshabilitados.
- Mientras está abierto, `GameInputHandler` permanece bloqueado y la supresión de daños sigue activa.

## 7. Takeoff Sequence

`TakeoffSequenceAnimation` arranca al pulsar “Despegar”:

1. **Preparación (≈1s)**: inserta la nave levemente bajo la superficie, anula velocidades y bloquea inputs.
2. **Ascenso (≈4s)**: se desplaza desde la cavidad hasta un punto elevado siguiendo la normal del planeta y manteniendo un flare suave.
3. **Salida (≈2s)**: genera deriva tangencial para reingresar al espacio y aumenta la velocidad hacia el `maxSpeed` original.
4. **Finalización**: restaura dinámica guardada, devuelve modo de cámara previo, reactiva controles y audio, limpia overlay y notifica a `GameEngine` (`notifyTakeoffSequenceFinished`). La supresión de daños se desactiva solo tras completar el despegue.

## 8. Notas de mantenimiento

- `AnimationManagerService` precarga ambas animaciones para minimizar saltos la primera vez.
- El motor utiliza `collisionsDisabled` y `landingDamageSuppressed` para garantizar que la nave no reciba daño por el terreno/sol desde el aterrizaje hasta un despegue exitoso.
- Los mensajes y logs (`GameLogger`) ayudan a depurar transiciones: buscar categorías `GAME_LOOP` y `HUD` para revisar cada fase.
- Pendiente: balancear duraciones, pulir cámaras alternativas y añadir más feedback durante la fase “landed” según próximos refinamientos.
