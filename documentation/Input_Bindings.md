# Sistema de Key Bindings e Inputs Globales

## Resumen rápido
- El componente `app-game` captura todos los `window:keydown/keyup/wheel` y los delega al servicio `GameInputHandler` cuando el juego está en estado RUNNING.
- `GameInputHandler` consulta `KeyBindingsService`, normaliza la tecla pulsada y traduce la acción al valor por defecto esperado por el motor (por ahora la lógica central sigue escuchando las teclas legado como `w`, `m`, `g`, `i`, etc.).
- `KeyBindingsService` almacena el mapeo acción→tecla, permite rebinding desde el diálogo de controles y persiste la configuración en `localStorage`.
- El `GameEngine` decide qué hacer con cada tecla traducida (mover la nave, abrir paneles, ejecutar hechizos, etc.) y también gestiona cooldowns y exclusiones entre paneles.
- Subsistemas especializados (paneles HUD, targeting canvas, coordinador de eventos de panel) se suscriben al estado del motor para saber cuándo bloquear punteros o sincronizar el cursor.

## Cadena de entrada (tecla → acción)
1. **HostListener global** – `Game` (`src/app/components/game/game.ts`) posee `@HostListener('window:keydown')` y `@HostListener('window:keyup')`. Estos listeners hacen dos cosas antes de delegar:
   - Cancelan el input si el usuario está con la wiki en primer plano o si el foco está en campos editables.
   - Manejan atajos reservados del shell (p. ej. `Escape` para cerrar paneles vía `gameEngine.handleKeyDown('escape')`, `P` para pause/resume, `Space` y `Enter` para diálogos, `F1` y `ñ` para overlays).
2. **Delegación al `GameInputHandler`** – el resto de teclas pasan a `GameInputHandler` (`src/app/services/game/game-input.service.ts`), que sólo procesa eventos cuando `setInputEnabled(true)` (el componente lo enciende en estado RUNNING y lo apaga al pausar o abrir la wiki).
3. **Normalización y búsqueda de acción** – `GameInputHandler` usa `KeyBindingsService.findActionForKey(composite)` donde `composite` incluye prefijos como `shift+`. Si encuentra una acción configurable, obtiene la tecla legacy equivalente mediante `getDefaultKey(action)` y delega hacia `GameEngine.handleKeyDown(translated)`.
4. **Estados especiales** – el handler intercepta acciones de targeting (`target_next`, `target_prev`, `clear_target`) para invocar directamente utilidades expuestas por el motor sin requerir teclas legacy. También mantiene un `keyState` para las teclas de movimiento/velocidad que el motor consulta en cada frame.
5. **Motor del juego** – `GameEngine.handleKeyDown` contiene todo el comportamiento contextual. Algunos ejemplos relevantes:
   - `'m'` abre/cierra el mapa y bloquea el grimorio/inventario mientras está visible.
   - `'g'` controla el grimorio y sincroniza la selección de hechizos.
   - `'i'` (nueva acción `inventory`) abre el panel de inventario, gestiona cooldowns y limpia la selección si se cierra.
   - `'h'` dispara hechizos, `'escape'` cierra paneles o limpia el target, `'t'` cicla objetivos, etc.
6. **Sync de puntero/paneles** – Tras abrir/cerrar paneles, el motor actualiza `PanelEventCoordinator` (`updateMapClickBinding`, `updateGrimoirePointerBinding`, `updateInventoryPointerBinding`) para que el canvas sólo escuche clicks/rueda cuando corresponde y así evitar conflictos con inputs 3D.

## Servicio de key bindings
- Definido en `src/app/services/key-bindings.service.ts`.
- Declara el tipo `GameAction` con todas las acciones configurables (movimiento, cámara, UI, targeting) e incluye la nueva acción `inventory` asociada por defecto a `i`.
- `DEFAULT_BINDINGS` sirve como tabla de verdad; `getDefaultKey(action)` siempre devuelve el valor legacy esperado por el motor sin importar el rebinding actual. Si no existe información en `localStorage`, estos valores (por ejemplo `book: 'g'`) se usan como fuente única.
- `set(action, key)` normaliza la entrada (`shift+a` → `shift+a`), evita duplicados limpiando acciones anteriores y persiste el estado.
- `resetToDefaults()` se usa desde el diálogo de controles para restaurar todo.

## GameInputHandler en detalle
- Inicializa `keyState` con todas las teclas legacy que el motor necesita (`w`, `a`, …, `m`, `l`, `i`, `+`, etc.). Al recibir `keydown` traduce la acción y marca el estado `true`; `keyup` lo revierte.
- `hasMovementInput()` y `hasSpeedInput()` devuelven flags que el motor usa para efectos (p. ej. activar sonidos de thrusters).
- `handleWheel` convierte la rueda del mouse en `handleZoom(delta)`.
- `handleSpecialKeys` preserva comportamientos legacy que no pasan por bindings (actualmente `Escape` y `F11`).

## Paneles HUD y coordinación de cursor
- `PanelEventCoordinator` (`src/app/game/services/ui/panel-event-coordinator.service.ts`) y `SpellIOCoordinator` bloquean eventos cuando el motor lo requiere (por ejemplo durante cantos de hechizos o mientras un panel UI toma control del puntero).
- Cuando el inventario abre, el motor llama a `updateInventoryPointerBinding()` y `updateCanvasCursor()` para mostrar el cursor del sistema y asegurar que la rueda/clicks se enrutan al panel.

## Targeting y otros listeners
- El sistema de targeting (`src/app/game/targeting/core/InputHandler.ts`) instala listeners **sobre el canvas** (no globales) para capturar movimientos del mouse, clicks y teclas personalizadas (por defecto `Escape` para soltar target y `T` con/ sin `Shift` para ciclar). También agrega un listener global para `cycleNextKey` para que la navegación continúe aunque el canvas pierda foco.
- Estas teclas conviven con los bindings principales porque el motor deshabilita inputs sólo cuando `GameInputHandler` está apagado o cuando `SpellIOCoordinator` marca `panelInputsLocked`.

## Cómo extender o depurar
1. **Agregar una acción nueva** – añadirla al union `GameAction`, declararla en `DEFAULT_BINDINGS`, extender `GameInputHandler.initializeKeyState()` si debe trackear estado continuo y manejarla en `GameEngine.handleKeyDown/Up`.
2. **Seguir una tecla** – confirmar que `Game` no la consume, usar `KeyBindingsService.getAll()` para ver su mapeo actual y verificar si `findActionForKey` la encuentra. Si no hay acción registrada, `GameInputHandler` no reenviará el evento al motor (esto fue el origen del bug de la tecla `I`).
3. **Diagnosticar bloqueos** – revisar `GameEngine.areSpellGameplayInputsLocked()` y `panelInputsLocked`; ambos pueden impedir toggles de paneles aunque el binding sea correcto.

## Guía práctica para añadir nuevos bindings con seguridad
1. **Diseñar la acción**
   - Define el comportamiento en términos de `GameAction` (ej. `aux_ability_5`).
   - Decide si necesita estado continuo (`keyState`) o sólo eventos discretos.
2. **Actualizar la capa de bindings**
   - Añade la acción al union `GameAction` y a `DEFAULT_BINDINGS` con una tecla única.
   - Si la acción requiere detectar `keyup`, extiende `GameInputHandler.initializeKeyState()` con la tecla legacy.
   - Usa `KeyBindingsService.set` para inicializar valores en migraciones o comandos de depuración.
3. **Propagar al GameEngine**
   - Implementa la rama correspondiente en `GameEngine.handleKeyDown/Up` usando la tecla legacy devuelta por `getDefaultKey`.
   - Actualiza cooldowns, bloqueos y coordinadores (`update*PointerBinding`) si el nuevo panel modifica el puntero.
4. **Exponer en UI**
   - Añade la acción al diálogo de controles (Angular) para permitir rebinding y reflejar el valor actual.
   - Revisa diálogos informativos (p.ej. `controls-dialog`) para que los textos coincidan con los defaults.
5. **Validar la ruta completa**
   - Juego en modo privado para confirmar que `DEFAULT_BINDINGS` cubre perfiles sin `localStorage`.
   - Reasigna la acción en la UI y verifica que `GameInputHandler` loguea la acción correcta (usar `LogLevel.TRACE`).
   - Comprueba que el motor responde tanto con valores por defecto como personalizados.
6. **Checklist de regresión**
   - El nuevo binding no entra en conflicto con otros (el servicio limpia duplicados).
   - El `Game` component no captura la tecla antes de delegar.
   - No quedan strings literalizados en otros subsistemas (HUD, tutoriales) apuntando al valor antiguo.

Con esta cadena documentada es más fácil detectar dónde se rompe un binding (componente, handler, servicio o motor) y qué subsistema adicional puede estar consumiendo la entrada.
