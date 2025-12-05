# Plan — Void Energy Respawn & HUD Marquee Reactivation

## Contexto
- **Documentos base**: `documentacion/Respawn_Sistema.md`, `documentacion/CleanCode_Arquitectura.md`, `documentacion/Resumen_Proyecto_y_Progreso.md`, `documentacion/Wiki_System.md`.
- **Código clave**: `RespawnService` (player reset stats), `GameEngine.applyPlayerResetState` (aplica stats), `Spaceship.updateVoidEnergy` (consumo), `HUDManager` + `MarqueePanel` (render + queue) y emisores en `GameEngine` (daños, portales, lesser beings, sanity/polución).
- **Objetivo**: (1) Garantizar que cada respawn restaura al máximo la Void Energy y evita consumos espurios durante el reacomodo. (2) Restaurar el Marquee Panel visible, pero limitando los mensajes a los eventos solicitados por el usuario, con throttling para evitar spam.

## Riesgos / Consideraciones
- Mantener compatibilidad con snapshots del respawn y el pipeline SSR/zoneless (revisar `npm run build`).
- No degradar rendimiento del HUD: la cola del marquee debe seguir acotada.
- Evitar mensajes duplicados o fuera de contexto (ej. daño repetido por colisiones continuas).
- Documentar los cambios (wiki + documentación técnica) y actualizar la lista de eventos soportados.

## Plan de trabajo propuesto

### 1. Void Energy en respawn
- [x] Revisar cómo `RespawnService.buildPlayerResetState()` calcula `voidEnergy` y asegurar que utiliza siempre `voidEnergyMax` (independiente del estado previo al morir).
- [x] Ajustar `GameEngine.applyPlayerResetState()`/`Spaceship` para que después del respawn la nave arranque con `voidEnergyCurrent = max` y pausar el consumo hasta que el loop confirme posicionamiento estable (`voidEnergyPaused` o flag temporal).
- [x] Añadir logging/HUD message opcional que confirme la restauración (sin saturar marquee) y cubrir edge cases (respawn causado por daño de vacío o falta de cordura).

### 2. Reactivar Marquee Panel con eventos acotados
- [x] **Auditoría de emisores actuales** (`GameEngine.ts` líneas 680‑830, 1180‑1280, 3420‑3530, 3650‑3800, 3930‑4020, 7680‑7735, 7970‑8010 y 8240‑8270) para clasificar cada `addMarqueeMessage()` existente y decidir si entra en el set permitido.
- [x] **Modelo de eventos**: definir `HudMarqueeEventType` + metadatos (cooldown mínimo, prioridad, si permite stack) y un `HudMarqueeEvent` que encapsule texto/generador y tipo.
- [x] **Gestor en HUDManager**: reescribir el API a `emitMarqueeEvent(type, payload)` que valida contra el catálogo permitido, aplica throttling/deduplicación por tipo y limita la cola activa (máx. N mensajes). Mantener `MarqueePanel` como renderer pero permitir que reciba la cola filtrada.
- [x] **Rewire de emisores**: actualizar únicamente los puntos autorizados (respawn, aterrizajes/despegues, daño por colisiones y DoT, recompensas por lesser beings, carga/void rite, portales Concordia y eventos introductorios) para usar el nuevo API, eliminando llamadas redundantes.
- [x] **Flood protection**: añadir métricas de depuración y un `Map<type, timestamp>` para cortar spam intra‑segundo y reordenar por prioridad en cada `HUDManager.update()` antes de pasar al panel.

### 3. Documentación & Wiki
- [x] Actualizar la documentación técnica del sistema de respawn (sección de energía) describiendo que las reapariciones rellenan Void Energy y pausan consumo temporalmente.
- [x] Modificar `documentacion/Wiki_System.md` o la página relevante de la wiki para detallar el nuevo comportamiento del Marquee Panel (eventos visibles) y cómo se comunica al jugador.
- [x] Registrar en la página wiki correspondiente (probablemente `game-rules` o `spaceship`) una subsección "Marquesina del HUD" con la lista de eventos actuales.

### 4. Verificación
- [x] Ejecutar `npm run build` y revisar que no existan errores SSR/zoneless.
- [x] Validar manualmente (o describir pasos) la secuencia de respawn y los disparadores de marquee para asegurarse de que coinciden con los requisitos del usuario. _Checklist rápido: (1) Forzar muerte y confirmar vía logs que el respawn rellena `voidEnergy` y pausa 1.2s; (2) Disparar eventos permitidos (respawn, landing/takeoff, hazard tick, portal traversal) y verificar que el panel permanece visible, sin texto cuando la cola queda vacía._

## Incidencias pendientes para revisar después del plan
- [ ] Portal generado vía Gate Rite desaparece tras respawn y la cola de clusters de asteroides de la Tierra no reaparece.

> Una vez completadas todas las tareas, eliminar este plan conforme a las pautas del repositorio.
