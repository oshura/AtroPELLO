# Plan — Marquee Event Refresh & Messaging Rules

## Contexto
- Documentos de referencia: `documentacion/CleanCode_Arquitectura.md` (guías de dependencias y enums fuertes), `documentacion/Resumen_Proyecto_y_Progreso.md` (estado general del HUD/warnings) y `documentacion/Wiki_System.md` (obligación de reflejar el comportamiento en la wiki).
- Código clave: `HUDManager` (cola/categorías del marquee), `GameEngine` (emisores actuales, aterrizaje, portales, daño, sanity), `lesser-being-spawner`/`registerLesserBeing` (spawns), `lesser-being-combat.service` (aura DoT), `landing-action.service` (costes de cordura fuera del engine).
- Objetivo: alinear todos los mensajes del Marquee con la lista solicitada por el usuario, asegurando que cada trigger se emita solo una vuelta, con textos exactos.

## Riesgos / Consideraciones
- Evitar spam: los mensajes de daño y de área DoT deben respetar throttling y cooldowns del HUD para que "una vuelta" siga siendo cierto.
- No romper el throttling global del `HUDManager`; usar `HudMarqueeEventType` existentes donde tenga sentido (`SYSTEM`, `SHIP_DAMAGE`, `WARNING`...).
- Necesario coordinar servicios externos (LandingActionService) para los costes de cordura y garantizar que todos los puntos de entrada emitan el mensaje.
- Portal traversal y start-up suceden durante inicialización/respawn: asegurarse de que el HUD ya existe antes de emitir mensajes y no duplicar al reiniciar.

## Trabajo planificado

1. **Secuencia de arranque del HUD**
   - [x] Añadir helper en `GameEngine` para emitir las cuatro líneas iniciales en orden cuando `HUDManager` se crea (guardar flag para evitar duplicados).  
   - [x] Actualizar plan de fallback si `hudManager` no existe (por ejemplo en build SSR no interactivo).

2. **Mensajes por spawn de lesser beings**
   - Instrumentar `GameEngine.registerLesserBeing` para emitir "Nueva amenaza detectada..." cada vez que se registra un nuevo being (incluye debug y revive).  
   - Revisar `lesser-being-spawner` para verificar que no hay emisiones redundantes.

3. **Entrada a áreas de daño por tiempo**
   - Crear helper en `GameEngine` que detecte primeras instancias de daño con razones `sun-radiation`, `aura` u otros DoT conocidos.  
   - Usar un cooldown `HAZARD_ENTRY_RESET_MS` para permitir reaviso cuando el jugador abandone la zona.  
   - Sustituir el texto actual de radiación por "Integridad comprometida. Sujerencia: alejarse de la amenza.".

4. **Daño recibido (texto unificado)**
   - Reemplazar todos los mensajes de daño existentes (incluidos los generados manualmente en colisiones) por `"Daño recibido: X."` (X redondeado).  
   - Asegurar que `applyShipDamage` emite este texto cuando no se pasa `suppressHud`, y actualizar los sitios que manejan su propio HUD para usar la misma cadena.

5. **Mensajes específicos de portales y aterrizajes**
   - Portal traversal: tras aplicar el snapshot de destino, emitir `"Sistema solar <Sol>"` usando el nombre del sol actual (o fallback al `systemId`).  
   - Aproximación a planetas: enlazar la lógica de `computeLandingStatus` o un helper derivado para detectar cuando la distancia superficial <300u y emitir `"Planeta X disponible..."` con cooldown por planeta.

6. **Cordura consumida**
   - Extender `GameEngine.applySpellSanityCost` y `LandingActionService.applyVitalsDelta` para llamar a un helper que emite `"Cordura: -X."` cuando el delta es negativo.  
   - Centralizar formateo y dedupe (p. ej. 500 ms) para evitar flood si varias fuentes descuentan cordura seguidas.

7. **Documentación y wiki**
   - Actualizar la sección técnica correspondiente (p. ej. `documentacion/Resumen_Proyecto_y_Progreso.md` y/o un addendum en `Respawn_Sistema.md` si aplica) describiendo la nueva tabla de eventos del marquee.  
   - Añadir en `wiki/pages/spaceship` (sección HUD) una subsección con la lista requerida de mensajes.

8. **Verificación**
   - Ejecutar `npm run build`.  
   - Documentar pasos de prueba manual: start-up, spawn de lesser, entrar en radiación solar o aura, recibir daño directo, atravesar portal, aproximarse a un planeta y consumir cordura (hechizo + acción de aterrizaje).

> El plan podrá eliminarse al cierre una vez actualizados código, documentación y wiki.
